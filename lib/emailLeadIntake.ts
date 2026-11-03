import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { htmlToText } from "html-to-text";
import mammoth from "mammoth";
import type { Database } from "./supabase/database.types";
import { runAiStructuredTask, getAiModelSetting, AI_PROVIDER_REGISTRY, type AiModelChoice, type AiContentPart } from "./aiProviders";
import { recordAudit } from "./audit";
import { resolveCustomerId, notifyIfAutoAssigned } from "./leadIntake";
import { formatDateAndTime } from "./formatDate";
import { instantAutoQuoteNewLead } from "./aiAutoQuote";

type Admin = SupabaseClient<Database>;

/** ImapFlow throws a bare `new Error("Command failed")` for a NO/BAD server response, with the server's actual human-readable reason stashed on `err.responseText` instead of the message itself — surface that, or the caller only ever sees the useless generic text. */
function describeImapError(err: unknown): string {
  if (!(err instanceof Error)) return "Unknown IMAP error.";
  const responseText = (err as { responseText?: string }).responseText;
  const responseStatus = (err as { responseStatus?: string }).responseStatus;
  return [err.message, responseStatus, responseText].filter(Boolean).join(" — ");
}

// Email Lead Intake — 300+ transport-hire websites forward their contact-
// form enquiries into one shared inbox (not per-site, not per-brand). This
// sweep (runEmailLeadIntakeSweep, called hourly by
// app/api/cron/email-lead-intake/route.ts) polls that inbox over IMAP
// (imapflow + mailparser — same mechanism as the per-user Email Centre sync,
// app/api/cron/email-sync/route.ts), has AI decide whether each message
// is a genuine travel/transport enquiry, and creates a `leads` row for the
// genuine ones. Spam/irrelevant mail is neither turned into a lead nor
// stored anywhere beyond a one-line dedup/audit entry (per the user's
// explicit choice) — every message is logged once by its Message-ID so a
// re-scanned inbox never processes the same email twice.
//
// A genuine enquiry's trip details sometimes live in an attached file
// rather than (or in addition to) the email body — a forwarded itinerary,
// a screenshot of a booking form, a quote-request PDF/Word doc. Real
// (non-inline) image/PDF/.docx attachments are read the same way Complex
// Booking reads an uploaded document (lib/complexBookingExtraction.ts) and
// handed to the AI alongside the body text, so those details make it into
// the lead too instead of only whatever the forwarding email itself says.
//
// Every lead created here lands on the tenant's fixed
// default_lead_inbox_brand_id (Settings/DB — no reliable way to tell which
// of 300+ sites a given forwarded email came from without knowing this
// inbox's actual forwarding setup) rather than trying to guess a brand.
//
// This inbox carries 8000+ messages of history across 300+ sites — the IMAP
// search window is hard-capped at MAX_LOOKBACK_DAYS regardless of what the
// synced_since cursor says, so a stale/reset cursor (or a first run before
// the cursor exists) can never trigger a scan of the entire mailbox.

const MAX_LOOKBACK_DAYS = 7;

// A loose but sufficient check that the model actually returned an email
// address rather than a stray phrase — e.g. "my name is Justin Email" has
// led the model to extract email: "Justin Email" (no @ at all) instead of
// leaving it null, silently discarding the real address in the From header.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const asPgTime = (value: string | null) => (value && /^\d{2}:\d{2}(:\d{2})?$/.test(value) ? value : null);

interface EnquiryExtraction {
  is_travel_enquiry: boolean;
  name: string | null;
  email: string | null;
  phone: string | null;
  pickup: string | null;
  destination: string | null;
  travel_date: string | null;
  pickup_time: string | null;
  return_trip: boolean;
  return_date: string | null;
  return_time: string | null;
  passenger_count: number | null;
  notes: string | null;
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    is_travel_enquiry: {
      type: "boolean",
      description:
        "True only if this email is a genuine customer enquiry about hiring a coach, minibus or other private transport. False for spam, marketing/newsletters, automated bounces/out-of-office replies, phishing, job applications, supplier/vendor pitches, or any other email that isn't a transport-hire enquiry from a customer.",
    },
    name: { type: ["string", "null"], description: "The enquirer's name, if given." },
    email: { type: ["string", "null"], description: "The enquirer's own email address to reply to — read this from the message body/signature if the visible \"From\" header looks like a forwarding/no-reply address rather than the actual customer." },
    phone: { type: ["string", "null"] },
    pickup: { type: ["string", "null"], description: "Pickup location, in the customer's own words." },
    destination: { type: ["string", "null"], description: "Destination, in the customer's own words." },
    travel_date: {
      type: ["string", "null"],
      description:
        "The travel date, resolved to an explicit calendar date if you can work it out from the email's own date (given in your instructions) plus what the customer wrote — otherwise their raw wording.",
    },
    pickup_time: {
      type: ["string", "null"],
      description: "The outbound departure time, resolved to 24-hour HH:MM if the customer gave one (e.g. \"19:00\" for \"approximately 7pm\"). Null if no time was mentioned.",
    },
    return_trip: { type: "boolean", description: "True if a return leg is mentioned at all." },
    return_date: { type: ["string", "null"] },
    return_time: {
      type: ["string", "null"],
      description: "The return leg's departure time, resolved to 24-hour HH:MM the same way as pickup_time. Null if there's no return leg or no time was given for it.",
    },
    passenger_count: {
      type: ["integer", "null"],
      description:
        "How many passengers. If the customer asks for pricing across several possible group/coach sizes (e.g. \"30, 40, or 54 passengers\", \"either a 30 or 40 seater\"), use the LARGEST one here — that's the safer number for vehicle-sizing and pricing — and list every size they asked about in notes so nothing is lost.",
    },
    notes: {
      type: ["string", "null"],
      description:
        "Anything else relevant that doesn't fit the other fields — vehicle type/size options (list ALL of them if several were requested, not just the one in passenger_count), intermediate stops/waypoints along the route, occasion, and any special requirements. Preserve real detail rather than summarizing it away — for a detailed enquiry, err on the side of including too much rather than too little, since this is the only place that detail survives. Format for readability: short lead-in sentence(s) first, then — whenever you're listing more than one distinct item (vehicle options, stops, requirements) — put each on its own line starting with \"- \", with a blank line before the list. Never run several items together in one long sentence.",
    },
  },
  required: [
    "is_travel_enquiry",
    "name",
    "email",
    "phone",
    "pickup",
    "destination",
    "travel_date",
    "pickup_time",
    "return_trip",
    "return_date",
    "return_time",
    "passenger_count",
    "notes",
  ],
  additionalProperties: false,
} as const;

interface EmailAttachment {
  data: Buffer;
  mimeType: string;
  fileName: string;
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// Bounds how many attachments get sent to the AI per email — a forwarded
// thread can carry a dozen inline logos/signature images alongside the one
// real itinerary file; this is plenty for the realistic case (one quote
// request document, maybe a couple of photos) without one unusual email
// blowing up a single AI call's cost/latency.
const MAX_SCANNED_ATTACHMENTS = 3;

/** Turns whichever of an email's real (non-inline) attachments are actually readable into AiContentParts — images and PDFs go through as-is (PDFs only when the configured provider supports them, see AI_PROVIDER_REGISTRY), a .docx is converted to plain text locally first (mirrors lib/complexBookingExtraction.ts). Anything else, or anything that fails to read, is silently skipped rather than failing the whole email — anonymous "transport_quote.xlsx" or a corrupt attachment shouldn't cost a genuine enquiry its lead. */
async function attachmentsToContentParts(attachments: EmailAttachment[], aiModel: AiModelChoice): Promise<AiContentPart[]> {
  const parts: AiContentPart[] = [];
  for (const att of attachments.slice(0, MAX_SCANNED_ATTACHMENTS)) {
    if (att.mimeType.startsWith("image/")) {
      parts.push({ type: "image", data: att.data, mimeType: att.mimeType });
    } else if (att.mimeType === "application/pdf") {
      if (AI_PROVIDER_REGISTRY[aiModel.provider].supportsPdf) {
        parts.push({ type: "pdf", data: att.data, fileName: att.fileName });
      }
    } else if (att.mimeType === DOCX_MIME || att.fileName.toLowerCase().endsWith(".docx")) {
      try {
        const { value: text } = await mammoth.extractRawText({ buffer: att.data });
        if (text.trim()) parts.push({ type: "text", text: `Attachment "${att.fileName}":\n${text.slice(0, 8000)}` });
      } catch {
        // Unreadable/corrupt .docx — skip it, body text alone still gets classified.
      }
    }
  }
  return parts;
}

/** One-shot classification — unlike the WhatsApp/AI-auto-quote flows, there's no back-and-forth: whatever the email (and any attachment) says is all there'll ever be, so missing fields are expected and fine as long as is_travel_enquiry and a way to reach the sender are present. */
async function classifyEnquiryEmail(
  subject: string,
  bodyText: string,
  emailDateIso: string,
  aiModel: AiModelChoice,
  attachments: EmailAttachment[],
): Promise<EnquiryExtraction> {
  const attachmentParts = await attachmentsToContentParts(attachments, aiModel);
  return runAiStructuredTask<EnquiryExtraction>({
    provider: aiModel.provider,
    model: aiModel.model,
    instructions:
      `You are screening inbound emails forwarded from company transport-hire websites into one shared inbox. This ` +
      `email's own date is ${emailDateIso} — use that as "today" when resolving relative dates. Decide whether it's a ` +
      `genuine customer enquiry, and if so extract whatever trip details are actually present — from the email text ` +
      `AND from any attached image/document included below, which may be where the real itinerary or quote request ` +
      `actually lives (the email body itself is sometimes just "see attached"). Never invent a value that isn't ` +
      `there — leave a field null rather than guess, since there's no way to ask this sender a follow-up question.`,
    content: [{ type: "text", text: `Subject: ${subject}\n\n${bodyText}`.slice(0, 8000) }, ...attachmentParts],
    schema: EXTRACTION_SCHEMA,
    schemaName: "email_lead_intake_extraction",
    // maxRetries: 0 (set inside each provider adapter) — a timed-out/failed
    // call retrying up to 2 more times by default could stack several
    // minutes of delay into one email in the middle of a sweep over many
    // messages, same bug fixed in lib/aiAutoQuote.ts. A clear failure for
    // this one message (counted in SweepResult.failed, retried on the next
    // hourly run) beats that. A document/image attachment gets more headroom
    // than a plain text-only email, same reasoning as Complex Booking's own
    // 90s (lib/complexBookingExtraction.ts).
    timeoutMs: attachmentParts.length > 0 ? 60000 : 30000,
  });
}

interface ProcessResult {
  decision: "lead_created" | "discarded_not_travel" | "discarded_no_contact" | "discarded_duplicate" | "error";
  leadId?: string;
  detail?: string;
}

const DUPLICATE_LOOKBACK_HOURS = 48;

/** Case-insensitive, either-direction substring containment — "Kasaragod" (website's structured field) should match "Kasaragod, Kerala" (AI's free-text read of the same place from an email), not just an exact string. */
function looksLikeSamePlace(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}

/**
 * A site's own contact-form webhook (app/api/leads/website/route.ts) already
 * creates a lead the moment a visitor submits — but the same form submission
 * is often *also* emailed to that site's info@ address, which forwards into
 * the one shared inbox this sweep polls. Without this check, that forwarded
 * copy would create a second lead for the same enquiry.
 *
 * Deliberately NOT scoped by brand_id — a website-sourced lead gets its
 * site's actual brand (from the webhook's brandSlug), while its forwarded-
 * email counterpart always lands on the tenant's fixed
 * default_lead_inbox_brand_id (there's no reliable way to tell which of
 * 300+ sites a forwarded email came from), so the two NEVER share a
 * brand_id. Filtering on it here would guarantee this exact website+email
 * pair — the main case this function exists for — could never match.
 *
 * Matched on the SAME customer (resolveCustomerId already dedupes identity
 * by email/phone across every channel) plus overlapping trip details (same
 * travel date, or either pickup/destination looking like the same place) —
 * customer alone isn't enough, since a repeat customer asking about a
 * genuinely different trip within the lookback window must still get its
 * own lead.
 */
async function findRecentDuplicateLead(
  admin: Admin,
  tenantId: string,
  customerId: string,
  extraction: EnquiryExtraction,
): Promise<string | null> {
  const since = new Date(Date.now() - DUPLICATE_LOOKBACK_HOURS * 3600000).toISOString();
  const { data: candidates } = await admin
    .from("leads")
    .select("id, pickup_text, destination_text, travel_date")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .gte("created_at", since);

  for (const lead of candidates ?? []) {
    const sameDate = Boolean(extraction.travel_date && lead.travel_date && extraction.travel_date === lead.travel_date);
    if (sameDate || looksLikeSamePlace(extraction.pickup, lead.pickup_text) || looksLikeSamePlace(extraction.destination, lead.destination_text)) {
      return lead.id;
    }
  }
  return null;
}

async function processMessage(
  admin: Admin,
  tenantId: string,
  brand: { id: string; name: string },
  parsed: {
    subject: string | null;
    text: string | null;
    html: string | null;
    date: Date | null;
    fromAddress: string | null;
    fromName: string | null;
    attachments: EmailAttachment[];
  },
  aiModel: AiModelChoice,
): Promise<ProcessResult> {
  const subject = parsed.subject ?? "(no subject)";
  // mailparser only fills in `.text` from the HTML part when there's no
  // separate text/plain alternative AND the HTML node is the literal root of
  // the message tree — a plain multipart/alternative message with just a
  // text/html part (iPhone Mail does this) doesn't qualify, so `.text` comes
  // back empty even though the email clearly has real content. Fall back to
  // converting `.html` ourselves rather than discarding a genuine enquiry as
  // "empty" just because it only came with an HTML body.
  const bodyText = parsed.text?.trim() || (parsed.html ? htmlToText(parsed.html, { wordwrap: false }).trim() : "");
  // An email that's genuinely just "see attached" (near-empty body, real
  // content in the attachment) must still be scanned rather than discarded
  // here as "empty" — only bail out early when there's neither.
  if (!bodyText && parsed.attachments.length === 0) return { decision: "discarded_not_travel", detail: "Empty body." };

  const extraction = await classifyEnquiryEmail(subject, bodyText, (parsed.date ?? new Date()).toISOString(), aiModel, parsed.attachments);
  if (!extraction.is_travel_enquiry) return { decision: "discarded_not_travel" };

  // The forwarded "From" header is often the forwarding service or a
  // no-reply address, not the actual customer — prefer whatever the AI read
  // out of the body/signature, and only fall back to the header when the
  // email genuinely didn't restate the sender's own contact details, or when
  // what the model extracted isn't trustworthy: EMAIL_RE alone isn't enough
  // — a well-FORMED but fabricated guess (e.g. a customer named "Daniel
  // Email" led the model to invent "daniel.email@example.com" out of thin
  // air, despite being told never to) still passes a format check. A genuine
  // email the customer actually typed will literally appear in the body —
  // one they didn't type won't, so that's the real test.
  const extractedEmail =
    extraction.email && EMAIL_RE.test(extraction.email) && bodyText.toLowerCase().includes(extraction.email.toLowerCase())
      ? extraction.email
      : null;
  const email = extractedEmail ?? parsed.fromAddress;
  const phone = extraction.phone;
  if (!email && !phone) return { decision: "discarded_no_contact" };
  const name = extraction.name ?? parsed.fromName ?? email ?? "Website enquiry";

  const customerId = await resolveCustomerId(admin, tenantId, brand.id, { name, email, phone });
  if (!customerId) return { decision: "error", detail: "Could not resolve/create a customer." };

  const duplicateLeadId = await findRecentDuplicateLead(admin, tenantId, customerId, extraction);
  if (duplicateLeadId) return { decision: "discarded_duplicate", leadId: duplicateLeadId, detail: `Matches existing lead ${duplicateLeadId}` };

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      tenant_id: tenantId,
      brand_id: brand.id,
      source: "email",
      status: "new",
      customer_id: customerId,
      pickup_text: extraction.pickup,
      destination_text: extraction.destination,
      travel_date: /^\d{4}-\d{2}-\d{2}$/.test(extraction.travel_date ?? "") ? extraction.travel_date : null,
      pickup_time: asPgTime(extraction.pickup_time),
      return_trip: extraction.return_trip,
      return_date: /^\d{4}-\d{2}-\d{2}$/.test(extraction.return_date ?? "") ? extraction.return_date : null,
      return_time: asPgTime(extraction.return_time),
      passenger_count: extraction.passenger_count,
      notes:
        [extraction.notes, !extraction.travel_date ? null : /^\d{4}-\d{2}-\d{2}$/.test(extraction.travel_date) ? null : `Requested date (as written): ${extraction.travel_date}`]
          .filter(Boolean)
          .join(" | ") || null,
      raw_payload: { subject, fromAddress: parsed.fromAddress, extraction },
    })
    .select("id, status, assigned_user_id")
    .single();

  if (leadError || !lead) return { decision: "error", detail: leadError?.message ?? "Lead insert failed." };

  await recordAudit({
    client: admin,
    tenantId,
    actorId: null,
    action: "lead_created_email_intake",
    entityType: "lead",
    entityId: lead.id,
    newValue: { source: "email", subject },
  });

  await notifyIfAutoAssigned(admin, lead, tenantId, brand.name, {
    source: "Email enquiry",
    pickup: extraction.pickup ?? "Not specified",
    destination: extraction.destination ?? "Not specified",
    // extraction.travel_date is only a clean ISO date when the AI could resolve
    // one — otherwise it's the customer's raw wording (e.g. "next Friday"),
    // same distinction the lead's own `notes` field already preserves above
    // — so only run the ISO case through the date formatter, not free text.
    travel_date: extraction.travel_date
      ? /^\d{4}-\d{2}-\d{2}$/.test(extraction.travel_date)
        ? formatDateAndTime(extraction.travel_date, extraction.pickup_time)
        : extraction.travel_date
      : "Not specified",
    passenger_count: extraction.passenger_count ? String(extraction.passenger_count) : "Not specified",
    vehicle_requested: "Not specified",
    notes: extraction.notes ?? "",
  });

  // Optional instant AI quote (Settings -> AI Assistant -> "Instant quote for
  // new email leads", off by default) — same as a WhatsApp lead. Never
  // throws; a lead it can't quote (no clean pickup/destination, a past
  // date) just stays for a human like before.
  await instantAutoQuoteNewLead(admin, lead.id, "email");

  return { decision: "lead_created", leadId: lead.id };
}

interface SweepResult {
  checked: number;
  leadsCreated: number;
  discarded: number;
  failed: number;
  /** IMAP-connection-level failures (wrong host/port/credentials, network issue) — these used to only go to console.error, which lives on the web service's own logs, not the cron job's, making a silent connection failure indistinguishable from "nothing new to process." Surfaced here instead so the cron run's own JSON response tells the whole story. */
  errors: string[];
}

/** The cron entry point (app/api/cron/email-lead-intake/route.ts). Reports (rather than silently no-ops) if the shared inbox's IMAP credentials aren't configured yet, so that's visible in the cron run's own output instead of looking identical to "ran fine, nothing new." */
export async function runEmailLeadIntakeSweep(admin: Admin): Promise<SweepResult> {
  const result: SweepResult = { checked: 0, leadsCreated: 0, discarded: 0, failed: 0, errors: [] };

  const host = process.env.LEADS_INBOX_IMAP_HOST;
  const port = process.env.LEADS_INBOX_IMAP_PORT;
  const user = process.env.LEADS_INBOX_IMAP_USER;
  const pass = process.env.LEADS_INBOX_IMAP_PASS;
  if (!host || !port || !user || !pass) {
    result.errors.push("LEADS_INBOX_IMAP_HOST/PORT/USER/PASS are not fully configured — the sweep did not run.");
    return result;
  }

  const { data: tenants } = await admin
    .from("tenants")
    .select("id, default_lead_inbox_brand_id, email_lead_inbox_synced_since")
    .not("default_lead_inbox_brand_id", "is", null);

  if (!tenants || tenants.length === 0) {
    result.errors.push("No tenant has default_lead_inbox_brand_id set — nothing to sweep (see 0088_email_lead_intake.sql).");
    return result;
  }

  for (const tenant of tenants) {
    const { data: brand } = await admin.from("brands").select("id, name").eq("id", tenant.default_lead_inbox_brand_id!).maybeSingle();
    if (!brand) continue;

    const aiModel = await getAiModelSetting(admin, tenant.id, "email_intake");

    const maxLookback = new Date(Date.now() - MAX_LOOKBACK_DAYS * 86400000);
    const cursor = tenant.email_lead_inbox_synced_since ? new Date(tenant.email_lead_inbox_synced_since) : maxLookback;
    const since = cursor > maxLookback ? cursor : maxLookback;

    const client = new ImapFlow({
      host,
      port: Number(port),
      secure: process.env.LEADS_INBOX_IMAP_SECURE !== "false",
      auth: { user, pass },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = await client.search({ since }, { uid: true });
        for await (const msg of uids && uids.length > 0 ? client.fetch(uids, { source: true, uid: true }, { uid: true }) : []) {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const messageId = parsed.messageId ?? `no-message-id-${msg.uid}`;

          // Insert-first dedup: if this exact message has already been
          // logged for this tenant, skip it (and the OpenAI call) entirely
          // — safe against the same email surfacing in an overlapping
          // `since` window on a later run.
          const { error: dupError } = await admin
            .from("email_lead_intake_log")
            .insert({ tenant_id: tenant.id, message_id: messageId, from_address: parsed.from?.text ?? null, subject: parsed.subject ?? null, decision: "error" });
          if (dupError) continue; // unique violation == already processed

          result.checked++;
          let outcome: ProcessResult;
          try {
            outcome = await processMessage(
              admin,
              tenant.id,
              brand,
              {
                subject: parsed.subject ?? null,
                text: parsed.text ?? null,
                html: parsed.html || null,
                date: parsed.date ?? null,
                fromAddress: parsed.from?.value?.[0]?.address ?? null,
                fromName: parsed.from?.value?.[0]?.name ?? null,
                // Real attachments only — "inline" ones are embedded images
                // the HTML body itself references (signature logos, tracking
                // pixels), never the actual enquiry content.
                attachments: (parsed.attachments ?? [])
                  .filter((a) => a.contentDisposition === "attachment" && a.content)
                  .map((a) => ({ data: a.content as Buffer, mimeType: a.contentType, fileName: a.filename ?? "attachment" })),
              },
              aiModel,
            );
          } catch (err) {
            outcome = { decision: "error", detail: describeImapError(err) };
          }

          await admin
            .from("email_lead_intake_log")
            .update({ decision: outcome.decision, lead_id: outcome.leadId ?? null, detail: outcome.detail ?? null })
            .eq("tenant_id", tenant.id)
            .eq("message_id", messageId);

          if (outcome.decision === "lead_created") result.leadsCreated++;
          else if (outcome.decision === "error") result.failed++;
          else result.discarded++;
        }
      } finally {
        lock.release();
      }
      await admin.from("tenants").update({ email_lead_inbox_synced_since: new Date().toISOString() }).eq("id", tenant.id);
    } catch (err) {
      const message = describeImapError(err);
      console.error(`emailLeadIntake: IMAP sweep failed for tenant ${tenant.id}:`, message);
      result.errors.push(`Tenant ${tenant.id}: ${message}`);
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  return result;
}
