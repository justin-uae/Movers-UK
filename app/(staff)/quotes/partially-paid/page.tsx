import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getAssignableSalesUsers } from "@/lib/leadAssignees";
import { PartiallyPaidQuotesPage, type PartiallyPaidQuoteRow, type PartiallyPaidSortKey } from "@/components/pages/PartiallyPaidQuotesPage";
import { BRAND } from "@/lib/brandConfig";

const PAGE_SIZE = 25;

const SORT_KEYS: PartiallyPaidSortKey[] = ["created_desc", "created_asc", "remaining_desc", "remaining_asc", "paid_desc", "paid_asc"];

interface Payment {
  amount: number;
  verification_status: string;
}

/** Verified payments only (PAY-04 — a pending bank transfer doesn't count toward the balance yet), same rule used everywhere else money is totalled in this app. */
function verifiedPaid(payments: Payment[] | null): number {
  return (payments ?? []).filter((p) => p.verification_status === "verified").reduce((sum, p) => sum + Number(p.amount), 0);
}

function time(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

function comparatorFor(sort: PartiallyPaidSortKey): (a: PartiallyPaidQuoteRow, b: PartiallyPaidQuoteRow) => number {
  switch (sort) {
    case "created_asc":
      return (a, b) => time(a.created_at) - time(b.created_at);
    case "remaining_desc":
      return (a, b) => b.remaining - a.remaining;
    case "remaining_asc":
      return (a, b) => a.remaining - b.remaining;
    case "paid_desc":
      return (a, b) => b.paid - a.paid;
    case "paid_asc":
      return (a, b) => a.paid - b.paid;
    case "created_desc":
    default:
      return (a, b) => time(b.created_at) - time(a.created_at);
  }
}

/**
 * Split out of Pending Quotes (app/(staff)/quotes/page.tsx) so a quote that's
 * had a partial payment doesn't sit mixed in with ones still awaiting any
 * payment at all. No manual "mine vs everyone's" filtering needed here —
 * quotes_select's RLS (can_view_assignment, 0002_sales_crm.sql) already
 * scopes the query to just the viewer's own quotes for a plain Sales User
 * (enquiries.view_own) and to every quote tenant-wide for anyone holding
 * enquiries.view_all (Master Admin, Sales Manager) — the exact split asked
 * for, already enforced at the database layer.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; sort?: string }> }) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const sort: PartiallyPaidSortKey = (SORT_KEYS as string[]).includes(params.sort ?? "") ? (params.sort as PartiallyPaidSortKey) : "created_desc";

  const canAssign = await hasPermission(profile, PERMISSIONS.ENQUIRIES_REASSIGN);
  const assignableUsers = canAssign ? await getAssignableSalesUsers(supabase) : [];

  let listQuery = supabase
    .from("quotes")
    .select(
      "id, quote_number, currency, invoice_number, created_at, customers(company_name, contact_name, email), enquiries(assigned_user_id, leads(source), enquiry_legs(pickup_address, destination_address)), quote_versions!quotes_current_version_id_fkey(selling_price), profiles!quotes_created_by_fkey(full_name), customer_payments(amount, verification_status)",
    )
    .eq("status", "partially_paid");
  if (q) {
    listQuery = listQuery.or(`quote_number.ilike.%${q}%,invoice_number.ilike.%${q}%`);
  }

  // One unpaginated fetch (this set is already bounded to status =
  // 'partially_paid', not the whole quotes table) instead of a page-sized
  // query plus a separate all-rows query just for the KPI total — paid/
  // remaining and the "Outstanding balance" KPI are both derived from the
  // same array, and sorting/pagination both happen in JS below since
  // "remaining"/"paid" aren't real DB columns to order by.
  const { data: rows } = await listQuery;

  const allQuotes: PartiallyPaidQuoteRow[] = (rows ?? []).map((r) => {
    const paid = verifiedPaid(r.customer_payments);
    const sellingPrice = (r.quote_versions as unknown as { selling_price: number } | null)?.selling_price ?? 0;
    return {
      id: r.id,
      quote_number: r.quote_number,
      currency: r.currency,
      invoice_number: r.invoice_number,
      created_at: r.created_at,
      customers: r.customers as unknown as PartiallyPaidQuoteRow["customers"],
      enquiries: r.enquiries as unknown as PartiallyPaidQuoteRow["enquiries"],
      quote_versions: r.quote_versions as unknown as PartiallyPaidQuoteRow["quote_versions"],
      profiles: r.profiles as unknown as PartiallyPaidQuoteRow["profiles"],
      paid,
      remaining: Math.max(0, sellingPrice - paid),
    };
  });

  const outstandingTotal = allQuotes.reduce((sum, r) => sum + r.remaining, 0);
  const outstandingCurrency = allQuotes[0]?.currency ?? BRAND.defaultCurrency;

  const sorted = allQuotes.slice().sort(comparatorFor(sort));
  const total = sorted.length;
  const quotes = sorted.slice(from, from + PAGE_SIZE);

  return (
    <PartiallyPaidQuotesPage
      quotes={quotes}
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
      outstandingTotal={outstandingTotal}
      outstandingCurrency={outstandingCurrency}
      canAssign={canAssign}
      assignableUsers={assignableUsers}
    />
  );
}
