import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { sendWhatsAppText } from "@/lib/whatsapp360";
import { reverseGeocode } from "@/lib/reverseGeocode";
import {
  runIntakeTurn,
  hasRequiredTripFields,
  mergeCollected,
  handlePostDoneMessage,
  MAX_INTAKE_MESSAGES,
  type CollectedTrip,
  type ConversationMessage,
} from "@/lib/whatsappAiIntake";
import { createAndSendQuote, getAiProfileId, LEAD_FOR_SWEEP_COLUMNS, type LeadForSweep } from "@/lib/aiAutoQuote";
import { getAiModelSetting } from "@/lib/aiProviders";
import { touchConversationOnInbound } from "@/lib/whatsappConversations";

// Inbound WhatsApp -> lead creation via 360dialog (a WhatsApp Business
// Solution Provider built directly on Meta's Cloud API — same webhook
// payload shape as Meta's own docs). Authenticated by the same
// brand-slug + webhook_secret pair the website lead intake route uses
// (app/api/leads/website/route.ts, visible to an admin in
// Settings -> Brands via BrandCredentials.tsx) — since WhatsApp's payload
// schema is fixed by Meta and can't carry our own auth fields in the body,
// the credentials travel as query params on the URL registered with
// 360dialog instead: POST https://<app>/api/webhooks/360dialog?brand=<slug>&secret=<secret>
// proxy.ts allows this path through PUBLIC_PATHS (no Supabase session exists
// for an inbound webhook call).
//
// Rather than a fixed name/email/pickup/destination/date question sequence,
// this now runs a free-form AI conversation (lib/whatsappAiIntake.ts, one
// OpenAI call per inbound message) — the model both replies naturally and
// extracts the cumulative trip details from the whole transcript
// (whatsapp_intake_sessions.messages/collected, migration
// 0082_whatsapp_ai_intake.sql). A lead is only ever created once our own
// server-side check (hasRequiredTripFields), not the model's say-so alone,
// confirms all seven fields (name, email, pickup, destination, travel date,
// passenger count, notes) are present.

type AdminClient = ReturnType<typeof createAdminClient>;

interface WhatsAppContact {
  profile?: { name?: string };
  wa_id: string;
}

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

interface WhatsAppValue {
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
}

interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

interface WhatsAppWebhookBody {
  object?: string;
  entry?: WhatsAppEntry[];
}

interface Brand {
  id: string;
  tenant_id: string;
  name: string;
}

type IntakeStep = "active" | "done" | "handed_off";

interface IntakeSession {
  id: string;
  step: IntakeStep;
  messages: ConversationMessage[];
  collected: CollectedTrip;
  lead_id: string | null;
  created_at: string;
}

async function resolveBrand(admin: AdminClient, brandSlug: string, secret: string): Promise<Brand | null> {
  if (!brandSlug || !secret) return null;
  const { data: brand } = await admin.from("brands").select("id, tenant_id, name, webhook_secret").eq("slug", brandSlug).single();
  if (!brand || brand.webhook_secret !== secret) return null;
  return brand;
}

/** Turns whatever the contact sent into plain text for the AI and for the
    conversation log — a shared pin is reverse-geocoded into a readable
    address (falling back to raw coordinates) rather than left as
    latitude/longitude the model can't usefully read. */
async function resolveInboundText(message: WhatsAppMessage): Promise<string> {
  if (message.type === "text" && message.text?.body) return message.text.body;
  if (message.type === "location" && message.location) {
    const loc = message.location;
    if (loc.address) return `Shared location: ${loc.address}`;
    if (loc.name) return `Shared location: ${loc.name}`;
    const geocoded = await reverseGeocode(loc.latitude, loc.longitude);
    if (geocoded) return `Shared location: ${geocoded}`;
    return `Shared location: ${loc.latitude}, ${loc.longitude}`;
  }
  return `[Sent a ${message.type} message, which isn't readable yet — ask them to describe it in text.]`;
}

/** Records one row in the WhatsApp conversation log (app/(staff)/whatsapp) —
    every inbound message and every outbound send, automated or staff-typed. */
async function logWhatsAppMessage(
  admin: AdminClient,
  brand: Brand,
  waId: string,
  customerId: string | null,
  direction: "inbound" | "outbound",
  body: string,
  messageType = "text",
) {
  await admin.from("whatsapp_messages").insert({
    tenant_id: brand.tenant_id,
    brand_id: brand.id,
    customer_id: customerId,
    wa_id: waId,
    direction,
    message_type: messageType,
    body,
  });
}

/** Detects a redelivered webhook (360dialog/Meta is at-least-once, not
    exactly-once) before any OpenAI call happens — a unique index on
    (brand_id, wa_message_id) for inbound rows (migration
    0083_whatsapp_message_dedup.sql) turns this insert itself into the dedup
    check. Any other insert failure fails OPEN (treated as new) rather than
    silently dropping a real customer message over a transient DB hiccup. */
async function logInboundIfNew(
  admin: AdminClient,
  brand: Brand,
  waId: string,
  customerId: string,
  body: string,
  messageType: string,
  waMessageId: string,
): Promise<boolean> {
  const { error } = await admin.from("whatsapp_messages").insert({
    tenant_id: brand.tenant_id,
    brand_id: brand.id,
    customer_id: customerId,
    wa_id: waId,
    direction: "inbound",
    message_type: messageType,
    body,
    wa_message_id: waMessageId,
  });
  if (error) {
    if (error.code === "23505") return false;
    console.error(`360dialog webhook: could not log inbound message for ${waId}: ${error.message}`);
  }
  return true;
}

/** Every message exchanged with this contact since the intake session began,
    oldest first, as model turns — inbound -> user, any outbound (AI or a
    sales user's reply) -> assistant. Excludes the message being answered
    now (passed to the model separately) and sends WhatsApp rejected. Null
    on a read error, so the caller falls back to the session's own turns. */
async function loadSessionTranscript(
  admin: AdminClient,
  brand: Brand,
  waId: string,
  sinceIso: string,
  currentWaMessageId: string,
): Promise<ConversationMessage[] | null> {
  const { data, error } = await admin
    .from("whatsapp_messages")
    .select("direction, body, wa_message_id, delivery_status, created_at")
    .eq("tenant_id", brand.tenant_id)
    .eq("wa_id", waId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(MAX_INTAKE_MESSAGES * 3);
  if (error || !data) return null;
  return (data as { direction: string; body: string; wa_message_id: string | null; delivery_status: string | null }[])
    .filter((m) => m.wa_message_id !== currentWaMessageId && m.delivery_status !== "failed")
    .map((m) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: m.body }));
}

/** Matches the "I don't have one" sentinel the AI records for a declined
    field (email or notes, see lib/whatsappAiIntake.ts's system prompt) —
    shared so both fields strip it back to a real null the same way before
    it ever reaches the customer/lead record. */
const NONE_LIKE_RE = /^(none|no|n\/a|nil|nothing)\.?$/i;

/** Best-effort only — an unparseable date is kept as the raw text the
    contact typed (in the lead's notes/raw_payload) rather than guessed at or
    rejected; staff can correct it on the lead like any other manually-
    entered date. */
function parseLenientDate(text: string): string | null {
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

async function createLeadFromSession(admin: AdminClient, brand: Brand, waId: string, customerId: string, sessionId: string, collected: CollectedTrip) {
  const travelDate = collected.travel_date ? parseLenientDate(collected.travel_date) : null;
  const name = collected.name?.trim() || waId;
  // A customer who declines to give an email is recorded as "None" (see
  // lib/whatsappAiIntake.ts) so the bot knows it already asked rather than
  // asking again — that sentinel is never worth keeping as the actual
  // contact email, so it's stripped back to null here, same as "None" notes
  // below. WhatsApp itself (waId) is always a working contact either way.
  const emailRaw = collected.email?.trim();
  const email = emailRaw && !NONE_LIKE_RE.test(emailRaw) ? emailRaw : null;

  // Merge the customer's own "anything else?" answer with the unparsed-date
  // fallback (both, one, or neither may apply) rather than one clobbering
  // the other — "None" isn't worth keeping on the lead, so it's dropped.
  const noteParts: string[] = [];
  const customerNotes = collected.notes?.trim();
  if (customerNotes && !NONE_LIKE_RE.test(customerNotes)) noteParts.push(customerNotes);
  if (!travelDate && collected.travel_date) noteParts.push(`Requested date (as typed via WhatsApp): ${collected.travel_date}`);
  const notes = noteParts.length ? noteParts.join(" | ") : null;

  await admin.from("customers").update({ contact_name: name, phone: waId, ...(email ? { email } : {}) }).eq("id", customerId);

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      tenant_id: brand.tenant_id,
      brand_id: brand.id,
      source: "whatsapp",
      status: "new",
      customer_id: customerId,
      pickup_text: collected.pickup,
      destination_text: collected.destination,
      passenger_count: collected.passenger_count,
      travel_date: travelDate,
      notes,
      raw_payload: { waId, ...collected },
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    console.error(`360dialog webhook: could not create lead for ${waId}: ${leadError?.message}`);
    return;
  }

  await admin
    .from("whatsapp_intake_sessions")
    .update({ step: "done", lead_id: lead.id, updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  await recordAudit({
    client: admin,
    tenantId: brand.tenant_id,
    actorId: null,
    action: "lead_created_webhook",
    entityType: "lead",
    entityId: lead.id,
    newValue: { source: "whatsapp", waId },
  });

  // Optional instant auto-quote (Settings -> AI Assistant -> "Instant quote
  // for new WhatsApp leads", off by default) — everything below is
  // best-effort: any failure here is logged and swallowed rather than
  // thrown, since the WhatsApp conversation itself already completed
  // successfully and the lead already exists normally either way. A human
  // can always quote it manually if this doesn't go through.
  const { data: tenant } = await admin.from("tenants").select("whatsapp_auto_quote_enabled").eq("id", brand.tenant_id).maybeSingle();
  if (tenant?.whatsapp_auto_quote_enabled) {
    // Same guard as the SLA sweep — a trip whose date has already passed
    // can't be served, so it's left for a human rather than auto-quoted for
    // a date that's gone.
    const today = new Date().toISOString().slice(0, 10);
    if (!travelDate || travelDate >= today) {
      const { data: fullLead } = await admin.from("leads").select(LEAD_FOR_SWEEP_COLUMNS).eq("id", lead.id).single();
      if (fullLead) {
        // A heads-up before the (real, multi-second) pricing/PDF/send
        // pipeline below — without this the customer just sees nothing
        // happen for a while and then a quote appear out of nowhere. Free-
        // form text is fine here (not a template): this fires seconds after
        // their own inbound message, well inside WhatsApp's 24h window.
        // First-name only, and only if a real name was actually captured —
        // collected.name can otherwise just be the raw wa_id.
        const firstName = collected.name?.trim()?.split(/\s+/)[0];
        const headsUp = firstName
          ? `Perfect, ${firstName}! I'm putting together your official quote now — you'll have it right here on WhatsApp in just a few minutes. 🙂`
          : "Perfect! I'm putting together your official quote now — you'll have it right here on WhatsApp in just a few minutes. 🙂";
        await sendWhatsAppText(waId, headsUp);
        await logWhatsAppMessage(admin, brand, waId, customerId, "outbound", headsUp);

        try {
          const aiProfileId = await getAiProfileId(admin, brand.tenant_id);
          await createAndSendQuote(admin, fullLead as LeadForSweep, aiProfileId, { trigger: "whatsapp_lead", alsoSendWhatsApp: true });
        } catch (err) {
          console.error(`360dialog webhook: instant WhatsApp auto-quote failed for lead ${lead.id}:`, err);
        }
      }
    }
  }
}

/** Runs one AI turn for a single inbound message: starts a fresh conversation
    if the last one is finished (or handed off), otherwise continues it. Every
    completed conversation always produces its own new lead — a contact who
    messages again later about a second trip gets a second lead, not one
    folded into the first's notes. */
async function handleInboundMessage(admin: AdminClient, brand: Brand, waId: string, contactName: string, message: WhatsAppMessage) {
  const inboundText = await resolveInboundText(message);

  const { data: existingCustomer } = await admin
    .from("customers")
    .select("id, contact_name, email")
    .eq("tenant_id", brand.tenant_id)
    .eq("whatsapp", waId)
    .maybeSingle();

  let customerId = existingCustomer?.id ?? null;
  if (!customerId) {
    const { data: created } = await admin
      .from("customers")
      .insert({ tenant_id: brand.tenant_id, contact_name: contactName, whatsapp: waId, phone: waId, default_brand_id: brand.id })
      .select("id")
      .single();
    customerId = created?.id ?? null;
  }
  if (!customerId) return;

  const isNewMessage = await logInboundIfNew(admin, brand, waId, customerId, inboundText, message.type, message.id);
  if (!isNewMessage) return; // redelivered webhook for a message we've already answered

  // Refreshing the conversation row is also what pops the "take over" alert
  // for sales users (realtime), and auto-assigns a chat to whoever already
  // quoted this number. While a sales user has taken the chat over, the AI
  // stays silent — the message is logged above and the human replies from
  // the WhatsApp tab.
  const conversation = await touchConversationOnInbound(admin, {
    tenantId: brand.tenant_id,
    brandId: brand.id,
    customerId,
    waId,
    contactName: existingCustomer?.contact_name || contactName,
    preview: inboundText,
  });
  if (conversation?.ai_paused) return;

  const aiModel = await getAiModelSetting(admin, brand.tenant_id, "whatsapp_intake");

  const { data: lastSession } = await admin
    .from("whatsapp_intake_sessions")
    .select("id, step, messages, collected, lead_id, created_at")
    .eq("brand_id", brand.id)
    .eq("wa_id", waId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let session = lastSession as IntakeSession | null;

  // A returning contact's name/email is often already on file from a
  // previous completed booking. Guarded against the placeholder case where
  // contact_name was only ever set to the raw wa_id (no real name was ever
  // actually captured) — that's not a known name, it's a fallback.
  const knownName = existingCustomer?.contact_name && existingCustomer.contact_name !== waId ? existingCustomer.contact_name : null;
  const knownEmail = existingCustomer?.email?.trim() || null;

  // A finished or handed-off conversation never continues automatically —
  // "done" always starts a brand new enquiry, and "handed_off" means a human
  // is already handling this contact, so the bot stays quiet rather than
  // stepping on a staff reply typed from app/(staff)/whatsapp.
  if (session?.step === "handed_off") return;

  // A trivial "thanks"/"okey"/👍/etc. reply to an already-finished
  // conversation gets a warm one-line reply instead of spinning up a whole
  // new intake around it — that's what made the bot feel broken ("I said
  // okey and it asked for my pickup address again"). An AI classification
  // call decides this (see handlePostDoneMessage's doc comment for why a
  // plain word-list regex wasn't reliable enough). Anything that's actually
  // a new trip request falls through to start a fresh enquiry below.
  if (session?.step === "done") {
    const postDone = await handlePostDoneMessage(brand.name, knownName, inboundText, aiModel);
    if (!postDone.isNewTripRequest) {
      await sendWhatsAppText(waId, postDone.reply);
      await logWhatsAppMessage(admin, brand, waId, customerId, "outbound", postDone.reply);
      return;
    }
  }

  if (!session || session.step === "done") {
    // Seed the returning contact's known name/email into the new session so
    // the AI doesn't re-ask for them on this second trip.
    const seedCollected: Partial<CollectedTrip> = {};
    if (knownName) seedCollected.name = knownName;
    if (knownEmail) seedCollected.email = knownEmail;

    const { data: created } = await admin
      .from("whatsapp_intake_sessions")
      .insert({
        tenant_id: brand.tenant_id,
        brand_id: brand.id,
        wa_id: waId,
        customer_id: customerId,
        step: "active",
        messages: [],
        collected: seedCollected,
      })
      .select("id, step, messages, collected, lead_id, created_at")
      .single();
    session = created as IntakeSession | null;
  }
  if (!session) return;

  const history = session.messages ?? [];

  if (history.length >= MAX_INTAKE_MESSAGES) {
    await admin.from("whatsapp_intake_sessions").update({ step: "handed_off", updated_at: new Date().toISOString() }).eq("id", session.id);
    const handoff = "Let me get one of our team to take it from here — they'll follow up with you shortly to finish arranging your trip.";
    await sendWhatsAppText(waId, handoff);
    await logWhatsAppMessage(admin, brand, waId, customerId, "outbound", handoff);
    return;
  }

  // The model reads the real WhatsApp log for this session, not just its own
  // stored turns, so anything a sales user said while they had the chat taken
  // over (and the customer's answers to them) is in context once the chat is
  // handed back to the AI — it won't re-ask what a human already covered.
  const transcript = (await loadSessionTranscript(admin, brand, waId, session.created_at, message.id)) ?? history;

  let result;
  try {
    result = await runIntakeTurn(brand.name, transcript, session.collected ?? {}, inboundText, aiModel);
  } catch (err) {
    console.error(`360dialog webhook: AI intake turn failed for ${waId}:`, err);
    const fallback = "Sorry, I'm having trouble replying right now — someone from our team will follow up with you shortly.";
    await sendWhatsAppText(waId, fallback);
    await logWhatsAppMessage(admin, brand, waId, customerId, "outbound", fallback);
    return;
  }

  const updatedMessages: ConversationMessage[] = [...history, { role: "user", content: inboundText }, { role: "assistant", content: result.reply }];
  // Merged, not the model's raw output — a field the model already nailed
  // down on an earlier turn must never silently revert to null just because
  // this turn's re-summarize of the whole transcript missed it.
  const mergedCollected = mergeCollected(session.collected ?? {}, result.collected);
  const readyForLead = result.ready && hasRequiredTripFields(mergedCollected);

  await admin
    .from("whatsapp_intake_sessions")
    .update({ messages: updatedMessages, collected: mergedCollected, updated_at: new Date().toISOString() })
    .eq("id", session.id);

  // Sent before createLeadFromSession, not after — that call can run the
  // full instant auto-quote pipeline (AI pricing, PDF, email, WhatsApp
  // template) inline when enabled, which takes a few real seconds. Sending
  // the conversational closing reply first keeps the messages in the order
  // the customer actually experiences them: "thanks, here's what I've got"
  // arrives right away, then (if auto-quote fires) a heads-up, then the
  // quote itself once it's actually ready — not the quote appearing first
  // with a "thanks" arriving confusingly after it.
  await sendWhatsAppText(waId, result.reply);
  await logWhatsAppMessage(admin, brand, waId, customerId, "outbound", result.reply);

  if (readyForLead) {
    await createLeadFromSession(admin, brand, waId, customerId, session.id, mergedCollected);
  }
}

export async function POST(request: NextRequest) {
  const brandSlug = request.nextUrl.searchParams.get("brand") ?? "";
  const secret = request.nextUrl.searchParams.get("secret") ?? "";

  const admin = createAdminClient();
  const brand = await resolveBrand(admin, brandSlug, secret);
  if (!brand) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as WhatsAppWebhookBody | null;
  // Ack with 200 even on an unparseable/empty body — 360dialog (like Meta)
  // retries a webhook that doesn't return 2xx, and there's nothing to retry
  // here since the payload itself was the problem, not a transient failure.
  if (!body?.entry) return NextResponse.json({ ok: true });

  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      const messages = change.value.messages ?? [];
      if (messages.length === 0) continue; // delivery/read status updates, not a new message

      const contact = change.value.contacts?.[0];
      const waId = contact?.wa_id ?? messages[0]?.from;
      if (!waId) continue;
      const name = contact?.profile?.name?.trim() || waId;

      for (const message of messages) {
        await handleInboundMessage(admin, brand, waId, name, message);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
