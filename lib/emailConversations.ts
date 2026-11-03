import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EmailMessage, QuoteEventType, QuoteStatus } from "./supabase/database.types";

type Supabase = SupabaseClient<Database>;

/** The CRM record a conversation is about — Email Centre's right-hand panel. */
export interface EmailCrmContext {
  quote: {
    id: string;
    quote_number: string;
    status: QuoteStatus;
    currency: string;
    selling_price: number | null;
    expiry_at: string | null;
    lead_id: string | null;
  } | null;
  trip: {
    pickup: string;
    destination: string;
    date: string | null;
    time: string | null;
    passengers: number | null;
    vehicle: string | null;
    legCount: number;
  } | null;
  customer: { id: string; name: string; company: string | null } | null;
  supplier: { id: string; name: string } | null;
  /** Most recent first, at most 4. */
  events: { event: QuoteEventType; created_at: string }[];
}

/** One email thread — the unit Email Centre lists, reads and acts on. */
export interface EmailConversation {
  key: string;
  /** Oldest first. */
  messageIds: string[];
  subject: string;
  counterpartName: string;
  counterpartAddress: string;
  latestAt: string;
  snippet: string;
  unread: boolean;
  starred: boolean;
  /** Some message in it was received and isn't archived — it belongs in the Inbox. */
  inInbox: boolean;
  hasSent: boolean;
  /** Every message in it is archived. */
  archived: boolean;
  /** Whoever wrote last — "outbound" means we're waiting on them. */
  lastDirection: "inbound" | "outbound";
  hasAttachments: boolean;
  context: EmailCrmContext;
}

const QUOTE_NUMBER_RE = /\bQT-\d{3,}\b/i;
const OPEN_QUOTE_STATUSES = new Set<QuoteStatus>(["draft", "sent", "viewed", "accepted", "partially_paid"]);
const QUOTE_SELECT =
  "id, quote_number, status, currency, expiry_at, customer_id, created_at, enquiries(lead_id, enquiry_legs(sequence, pickup_address, destination_address, pickup_date, pickup_time, passenger_count, vehicle_types(name))), quote_versions!quotes_current_version_id_fkey(selling_price, vehicle_description)";

interface QuoteRow {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  expiry_at: string | null;
  customer_id: string;
  created_at: string;
  enquiries: {
    lead_id: string | null;
    enquiry_legs: {
      sequence: number;
      pickup_address: string;
      destination_address: string;
      pickup_date: string | null;
      pickup_time: string | null;
      passenger_count: number | null;
      vehicle_types: { name: string } | null;
    }[];
  } | null;
  quote_versions: { selling_price: number; vehicle_description: string | null } | null;
}

/**
 * Groups messages into threads. Mail threads are linked through Message-ID
 * headers, but inconsistently: synced inbound mail keys on References[0],
 * our own replies on In-Reply-To, fresh sends on their own Message-ID. So
 * every message is joined (union-find) with every id it mentions — its own
 * message_id, in_reply_to and thread_key — and anything sharing one ends up
 * in the same conversation.
 */
function groupThreads(messages: EmailMessage[]): EmailMessage[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let node = x;
    while (parent.get(node) !== root) {
      const next = parent.get(node)!;
      parent.set(node, root);
      node = next;
    }
    return root;
  };
  const add = (x: string) => {
    if (!parent.has(x)) parent.set(x, x);
  };
  const union = (a: string, b: string) => {
    add(a);
    add(b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const m of messages) {
    const self = `row:${m.id}`;
    add(self);
    for (const ref of [m.message_id, m.in_reply_to, m.thread_key]) {
      if (ref) union(self, `mid:${ref.trim()}`);
    }
  }

  const groups = new Map<string, EmailMessage[]>();
  for (const m of messages) {
    const root = find(`row:${m.id}`);
    const list = groups.get(root) ?? [];
    list.push(m);
    groups.set(root, list);
  }
  return [...groups.values()].map((list) => list.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)));
}

function counterpart(thread: EmailMessage[], ownAddress: string) {
  const own = ownAddress.toLowerCase();
  const lastInbound = [...thread].reverse().find((m) => m.direction === "inbound" && m.from_address.toLowerCase() !== own);
  if (lastInbound) return { name: lastInbound.from_name || lastInbound.from_address, address: lastInbound.from_address };
  const firstOutbound = thread.find((m) => m.direction === "outbound");
  const to = firstOutbound?.to_addresses[0] ?? thread[0]!.from_address;
  return { name: to, address: to };
}

/**
 * Turns the mailbox's recent messages into conversations, each linked to
 * the CRM record it's about — an explicit quote link on a message, else a
 * quote number (QT-…) in the subject, else the customer (by link or by
 * email address) and their most recent open quote, else a supplier. Every
 * lookup runs through the caller's RLS client, so staff only ever see
 * records they're allowed to.
 */
export async function buildEmailConversations(supabase: Supabase, messages: EmailMessage[], ownAddress: string): Promise<EmailConversation[]> {
  const threads = groupThreads(messages);

  const drafts = threads.map((thread) => {
    const who = counterpart(thread, ownAddress);
    const quoteId = thread.find((m) => m.quote_id)?.quote_id ?? null;
    const quoteNumber = thread.map((m) => m.subject?.match(QUOTE_NUMBER_RE)?.[0]?.toUpperCase()).find(Boolean) ?? null;
    const customerId = thread.find((m) => m.customer_id)?.customer_id ?? null;
    const supplierId = thread.find((m) => m.supplier_id)?.supplier_id ?? null;
    return { thread, who, quoteId, quoteNumber, customerId, supplierId };
  });

  const uniq = <T,>(values: (T | null | undefined)[]) => [...new Set(values.filter((v): v is T => v != null))];
  const addresses = uniq(drafts.map((d) => d.who.address.toLowerCase()));

  const [quotesById, quotesByNumber, customersById, customersByEmail, suppliersById, suppliersByEmail] = await Promise.all([
    inChunks(uniq(drafts.map((d) => d.quoteId)), (ids) => supabase.from("quotes").select(QUOTE_SELECT).in("id", ids)),
    inChunks(uniq(drafts.map((d) => d.quoteNumber)), (nums) => supabase.from("quotes").select(QUOTE_SELECT).in("quote_number", nums)),
    inChunks(uniq(drafts.map((d) => d.customerId)), (ids) => supabase.from("customers").select("id, contact_name, company_name, email").in("id", ids)),
    inChunks(addresses, (emails) => supabase.from("customers").select("id, contact_name, company_name, email").in("email", emails)),
    inChunks(uniq(drafts.map((d) => d.supplierId)), (ids) => supabase.from("suppliers").select("id, name, email").in("id", ids)),
    inChunks(addresses, (emails) => supabase.from("suppliers").select("id, name, email").in("email", emails)),
  ]);

  const customers = new Map<string, { id: string; contact_name: string; company_name: string | null; email: string | null }>();
  for (const c of [...customersById, ...customersByEmail]) customers.set(c.id, c);
  const customerByEmail = new Map([...customers.values()].filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c]));
  const suppliers = new Map<string, { id: string; name: string; email: string }>();
  for (const s of [...suppliersById, ...suppliersByEmail]) suppliers.set(s.id, s);
  const supplierByEmail = new Map([...suppliers.values()].map((s) => [s.email.toLowerCase(), s]));

  const quotes = new Map<string, QuoteRow>();
  for (const q of [...quotesById, ...quotesByNumber] as unknown as QuoteRow[]) quotes.set(q.id, q);
  const quoteByNumber = new Map([...quotes.values()].map((q) => [q.quote_number.toUpperCase(), q]));

  // Customers with no quote named in the thread — fall back to their most
  // recent open quote (or most recent at all).
  const resolved = drafts.map((d) => {
    const customer = (d.customerId && customers.get(d.customerId)) || customerByEmail.get(d.who.address.toLowerCase()) || null;
    const supplier = (d.supplierId && suppliers.get(d.supplierId)) || supplierByEmail.get(d.who.address.toLowerCase()) || null;
    const quote = (d.quoteId && quotes.get(d.quoteId)) || (d.quoteNumber && quoteByNumber.get(d.quoteNumber)) || null;
    return { ...d, customer, supplier, quote };
  });
  const needLatest = uniq(resolved.filter((r) => !r.quote && r.customer).map((r) => r.customer!.id));
  const latestRows = (await inChunks(needLatest, (ids) =>
    supabase.from("quotes").select(QUOTE_SELECT).in("customer_id", ids).order("created_at", { ascending: false }).limit(500),
  )) as unknown as QuoteRow[];
  const latestByCustomer = new Map<string, QuoteRow>();
  for (const q of latestRows) {
    const current = latestByCustomer.get(q.customer_id);
    if (!current || (!OPEN_QUOTE_STATUSES.has(current.status) && OPEN_QUOTE_STATUSES.has(q.status))) latestByCustomer.set(q.customer_id, q);
  }
  for (const r of resolved) {
    if (!r.quote && r.customer) r.quote = latestByCustomer.get(r.customer.id) ?? null;
  }

  const finalQuoteIds = uniq(resolved.map((r) => r.quote?.id));
  const eventRows = await inChunks(finalQuoteIds, (ids) =>
    supabase.from("quote_events").select("quote_id, event, created_at").in("quote_id", ids).order("created_at", { ascending: false }).limit(1000),
  );
  const eventsByQuote = new Map<string, { event: QuoteEventType; created_at: string }[]>();
  for (const e of eventRows) {
    const list = eventsByQuote.get(e.quote_id) ?? [];
    if (list.length < 4) list.push({ event: e.event, created_at: e.created_at });
    eventsByQuote.set(e.quote_id, list);
  }

  // A quote found through its number can name a customer the email didn't.
  const quoteCustomerIds = uniq(resolved.filter((r) => r.quote && !r.customer).map((r) => r.quote!.customer_id));
  const extraCustomers = await inChunks(quoteCustomerIds, (ids) => supabase.from("customers").select("id, contact_name, company_name, email").in("id", ids));
  for (const c of extraCustomers) customers.set(c.id, c);

  return resolved
    .map(({ thread, who, quote, customer: emailCustomer, supplier }) => {
      const latest = thread[thread.length - 1]!;
      const customer = emailCustomer ?? (quote ? customers.get(quote.customer_id) ?? null : null);
      const legs = [...(quote?.enquiries?.enquiry_legs ?? [])].sort((a, b) => a.sequence - b.sequence);
      const firstLeg = legs[0];
      const lastLeg = legs[legs.length - 1];
      const context: EmailCrmContext = {
        quote: quote
          ? {
              id: quote.id,
              quote_number: quote.quote_number,
              status: quote.status,
              currency: quote.currency,
              selling_price: quote.quote_versions?.selling_price ?? null,
              expiry_at: quote.expiry_at,
              lead_id: quote.enquiries?.lead_id ?? null,
            }
          : null,
        trip: firstLeg
          ? {
              pickup: firstLeg.pickup_address,
              destination: lastLeg!.destination_address,
              date: firstLeg.pickup_date,
              time: firstLeg.pickup_time,
              passengers: firstLeg.passenger_count,
              vehicle: firstLeg.vehicle_types?.name ?? quote?.quote_versions?.vehicle_description ?? null,
              legCount: legs.length,
            }
          : null,
        customer: customer ? { id: customer.id, name: customer.contact_name, company: customer.company_name } : null,
        supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
        events: quote ? eventsByQuote.get(quote.id) ?? [] : [],
      };
      const subjectSource = thread.find((m) => m.subject)?.subject ?? "";
      return {
        key: thread[0]!.id,
        messageIds: thread.map((m) => m.id),
        subject: subjectSource.replace(/^((re|fwd?|aw|sv):\s*)+/i, "") || "(no subject)",
        counterpartName: who.name,
        counterpartAddress: who.address,
        latestAt: latest.occurred_at,
        snippet: (latest.snippet ?? "").replace(/\s+/g, " ").trim(),
        unread: thread.some((m) => m.direction === "inbound" && !m.is_read && !m.archived_at),
        starred: thread.some((m) => m.is_starred),
        inInbox: thread.some((m) => m.direction === "inbound" && !m.archived_at),
        hasSent: thread.some((m) => m.direction === "outbound"),
        archived: thread.every((m) => m.archived_at),
        lastDirection: latest.direction,
        hasAttachments: thread.some((m) => m.has_attachments),
        context,
      } satisfies EmailConversation;
    })
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

/** `.in()` with a long list makes a very long URL — split it, run the pieces in parallel, and drop failures (a missing panel beats a broken inbox). */
async function inChunks<T>(
  values: string[],
  query: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  if (values.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < values.length; i += 100) chunks.push(values.slice(i, i + 100));
  const results = await Promise.all(chunks.map((c) => Promise.resolve(query(c)).then((r) => (r.error ? [] : (r.data ?? [])), () => [])));
  return results.flat();
}
