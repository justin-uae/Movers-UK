import "server-only";
import { runAiStructuredTask, type AiModelChoice } from "@/lib/aiProviders";

// AI-driven replacement for the old fixed-step WhatsApp Q&A
// (app/api/webhooks/360dialog/route.ts). Each inbound message is answered
// by an AI call (provider/model configurable per-tenant, Settings -> AI
// Models — see lib/aiProviders.ts) that both carries on a natural
// conversation and extracts the cumulative trip details gathered so far —
// the webhook then decides, deterministically (not by trusting the model
// alone), whether enough is known to create a lead.

export interface CollectedTrip {
  name: string | null;
  email: string | null;
  pickup: string | null;
  destination: string | null;
  passenger_count: number | null;
  travel_date: string | null;
  notes: string | null;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiTurnResult {
  reply: string;
  collected: CollectedTrip;
  ready: boolean;
}

const EMPTY_COLLECTED: CollectedTrip = {
  name: null,
  email: null,
  pickup: null,
  destination: null,
  passenger_count: null,
  travel_date: null,
  notes: null,
};

/** Circuit breaker on both cost and customer experience — a conversation
    that's gone this long without completing is handed off to staff
    (app/(staff)/whatsapp) rather than looping the AI forever. Sized well
    above what a real intake conversation needs (a normal one completes in
    well under 20 messages) now that webhook redeliveries are de-duplicated
    (migration 0083_whatsapp_message_dedup.sql) rather than each counting
    twice against this cap. */
export const MAX_INTAKE_MESSAGES = 40;

const POST_DONE_SCHEMA = {
  type: "object",
  properties: {
    is_new_trip_request: {
      type: "boolean",
      description:
        "True only if this message is actually describing or requesting a NEW or different trip (mentions a place, a date, wants to book again, etc.). False for anything that's just a casual reply with no new trip information — \"thanks\", \"ok\", \"okey\", \"cool\", \"👍\", small talk, or a quick question about what happens next.",
    },
    reply: {
      type: "string",
      description:
        "Only used when is_new_trip_request is false. A short (1 sentence, occasionally 2), warm WhatsApp reply from a real person on the team responding naturally to what the customer just said. Never ask about pickup, destination, travel date, passengers, or anything else — their trip is already confirmed and being handled, so nothing further needs asking.",
    },
  },
  required: ["is_new_trip_request", "reply"],
  additionalProperties: false,
} as const;

/** Runs once a contact messages again after their last conversation was
    already marked "done" — decides whether this is a genuine new trip
    request (which should start a brand new intake) or just a trivial
    follow-up ("thanks", "okey", "👍", a quick question, ...), which gets one
    warm human reply and nothing else. Replaces an earlier plain-regex
    version: a hardcoded word list ("thanks|ok|...") reliably misses real
    variants customers actually type — e.g. "okey" wasn't in the list, so it
    fell through to a brand new intake and re-asked for the pickup address
    that had just been confirmed two messages earlier. An AI classification
    call handles arbitrary phrasing instead of an ever-growing word list. */
export async function handlePostDoneMessage(
  brandName: string,
  customerName: string | null,
  text: string,
  aiModel: AiModelChoice,
): Promise<{ isNewTripRequest: boolean; reply: string }> {
  const name = customerName?.trim();
  try {
    const parsed = await runAiStructuredTask<{ is_new_trip_request: boolean; reply: string }>({
      provider: aiModel.provider,
      model: aiModel.model,
      instructions:
        `You're texting on WhatsApp for ${brandName}, a coach and transport hire company. A customer's trip request was ` +
        `already fully confirmed and closed out${name ? ` (their name is ${name})` : ""}. They've now sent one more ` +
        `message. Work out whether it's a new/different trip request or just a casual follow-up, and reply accordingly ` +
        `per the schema. If it's a follow-up, sound like a real person on the team, not a bot — brief, warm, natural.`,
      content: [{ type: "text", text }],
      schema: POST_DONE_SCHEMA,
      schemaName: "whatsapp_post_done_reply",
      // maxRetries: 0 (set inside each provider adapter) — this is a live
      // WhatsApp conversation; a retry-stacked multi-minute wait (the bug
      // fixed in lib/aiAutoQuote.ts) would be far worse here than the
      // existing fail-open fallback below.
      timeoutMs: 20000,
    });
    return { isNewTripRequest: Boolean(parsed.is_new_trip_request), reply: parsed.reply };
  } catch (err) {
    console.error("handlePostDoneMessage failed — failing open toward a fresh intake:", err);
    // Fail open toward treating it as a new trip request rather than
    // silently swallowing a message we couldn't classify — worse case is an
    // unnecessary re-ask, not a dropped enquiry.
    return { isNewTripRequest: true, reply: "" };
  }
}

const TURN_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description:
        "Your next WhatsApp message to the customer. Short and conversational — 1-3 sentences, no markdown, no bullet lists.",
    },
    collected: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        email: {
          type: ["string", "null"],
          description:
            "The customer's email address — always ask for it once. If they say they don't have one or don't want to give it, set this to \"None\" rather than leaving it null or asking again — null means you haven't asked yet, not that they declined.",
        },
        pickup: { type: ["string", "null"], description: "Pickup location, in the customer's own words" },
        destination: { type: ["string", "null"], description: "Destination, in the customer's own words" },
        passenger_count: { type: ["integer", "null"], description: "How many passengers are travelling. Required — always ask for a number, never leave it unasked." },
        travel_date: {
          type: ["string", "null"],
          description:
            "The travel date, resolved to an explicit calendar date (e.g. \"2026-10-06\") whenever you can work it out from what the customer said plus today's date given in your instructions — including relative phrases like \"next Friday\" or \"6th of next month\". Only fall back to their raw wording if it's genuinely too vague to resolve to a specific date (e.g. \"sometime in the new year\").",
        },
        notes: {
          type: ["string", "null"],
          description:
            "Any further/special requirements the customer mentions when you ask (e.g. wheelchair access, luggage, child seats, a specific pickup time). This must always be explicitly asked about once the trip basics are known. If the customer says they have nothing else to add, set this to \"None\" rather than leaving it null — null means you haven't asked yet. If there's more than one distinct requirement, put each on its own line starting with \"- \" rather than running them together in one sentence.",
        },
      },
      required: ["name", "email", "pickup", "destination", "passenger_count", "travel_date", "notes"],
      additionalProperties: false,
      description:
        "The COMPLETE, cumulative set of trip details known so far across the whole conversation — not just this message. Carry forward every previously known value; only change one if the customer corrects it.",
    },
    ready: {
      type: "boolean",
      description:
        "True only once name, pickup, destination, travel_date, passenger_count are all known AND email and notes have each been explicitly asked about — email set to \"None\" if the customer has no/won't give one, notes set to \"None\" if they had nothing to add. All seven fields are required to have been ASKED, none may be silently skipped — but email and notes alone may resolve to \"None\" rather than a real answer.",
    },
  },
  required: ["reply", "collected", "ready"],
  additionalProperties: false,
} as const;

function systemPrompt(brandName: string, todayIso: string): string {
  return (
    `You're texting on WhatsApp for ${brandName}, a coach and transport hire company, helping a customer book a trip. ` +
    `You're a real person on the team, not a bot or an AI — never say or imply otherwise, never break character, and never ` +
    `use stiff, robotic, or "customer service script" phrasing. Text the way a helpful, friendly staff member actually would: ` +
    `casual, warm, brief reactions before a question are good ("Perfect, thanks!", "Got it.", "Nice, okay.") but keep every ` +
    `message short — 1-3 sentences, contractions, no markdown, no bullet lists, no corporate tone. Today's date is ${todayIso}.\n\n` +
    `THE MOST IMPORTANT RULE — READ THIS FIRST: your instructions include a "Data already collected" block with the ` +
    `cumulative trip details known so far. Treat every non-null value in that block as settled fact, permanently — never ` +
    `re-ask a question whose field is already non-null there, even if the transcript looks incomplete, confusing, or you're ` +
    `unsure. Silently skip straight to the next field that's still null. Asking someone something they already told you is ` +
    `the single worst thing you can do here — it reads as broken, not human.\n\n` +
    `Goals:\n` +
    `- These SEVEN fields must ALL be explicitly ASKED about, every single time, with no exceptions — never skip one, never decide a customer "seems like" they don't need to answer one: full name, email address, pickup location, destination, travel date, number of passengers, and any further/special requirements (notes). Two of them — email and notes — are allowed to resolve to "None" if the customer declines/has nothing to add; the other five need a real answer.\n` +
    `- Some of these may already be known before the conversation even starts (a returning contact's name/email can be pre-filled in the "Data already collected" block) — if so, don't ask for them again, just move on to the first missing field.\n` +
    `- Ask for ONLY ONE field per message — never combine two questions in the same message. In particular, name and email are two separate questions asked one after another, never in the same message. The same applies to every other field.\n` +
    `- Suggested order: name, then email, then pickup, then destination, then travel date, then number of passengers, then finally ask "Anything else we should know, or any special requirements for the trip?" as its own separate message.\n` +
    `- Email: ask for it once, the same as any other field. If the customer says they don't have one, don't want to share it, or just ignores the question and moves on to something else, record email as "None" and continue — never ask for it a second time or stall the conversation waiting on it. WhatsApp itself is always a working way to reach them regardless.\n` +
    `- Notes: if the customer says no/none when you ask "anything else?", record notes as "None" — do not leave notes null, since null means you haven't asked yet, not that the answer was empty.\n` +
    `- Never invent or guess a value the customer hasn't actually told you. Leave a field null until they've actually answered that specific question.\n` +
    `- When the customer gives a travel date, work out the actual calendar date yourself using today's date above — resolve relative phrases like "next Friday" or "6th of next month" into an explicit date rather than leaving them as vague wording.\n` +
    `- If the customer volunteers several fields unprompted in one message (e.g. they type their whole trip in one go), that's fine — extract everything they gave you, then continue by asking for whichever of the seven fields is still missing, one at a time.\n` +
    `- If the customer shares a location pin, it will already be described to you as text (e.g. "Shared location: ...") — treat it as their answer for whichever question you just asked.\n` +
    `- If the customer asks something unrelated to booking a trip, answer briefly and helpfully like a real person would, then steer the conversation back to finishing their request.\n` +
    `- Once you have all seven fields — name, email ("None" is fine), pickup, destination, travel date, passenger count, and notes ("None" is fine) — set ready to true. Make your final reply feel like a genuine, warm sign-off: thank them by name, briefly confirm the trip in your own words, and let them know the team will follow up shortly. Do not ask anything further after this point.\n` +
    `- Never set ready to true until every field has genuinely been asked about — don't rush the customer, and don't skip asking for email, passenger count, or the "anything else" question just because you have some of the others. This must behave the exact same way for every conversation — always ask every field, even the ones that may end up "None".`
  );
}

/** Combines what the model just extracted with what was already known,
    field by field — a later turn's null/empty value never erases a
    previously-known one. This is the actual fix for the "keeps asking the
    same question" bug: gpt-4o-mini occasionally drops a value when
    re-summarizing a long transcript from scratch every turn, and without
    this guard that dropped value gets persisted, making a field that was
    already answered look unasked again on the very next turn. Only a
    genuine new non-null value (the customer correcting themselves) can
    change an already-known field. */
export function mergeCollected(previous: CollectedTrip, next: CollectedTrip): CollectedTrip {
  const merged = { ...EMPTY_COLLECTED } as CollectedTrip;
  (Object.keys(EMPTY_COLLECTED) as (keyof CollectedTrip)[]).forEach((key) => {
    const nextVal = next[key];
    const isEmpty = nextVal === null || nextVal === undefined || (typeof nextVal === "string" && nextVal.trim() === "");
    (merged[key] as unknown) = isEmpty ? (previous[key] ?? null) : nextVal;
  });
  return merged;
}

/** Every OpenAI call gets the full transcript plus a reminder of what's been
    gathered so far (belt-and-braces alongside asking the model to return the
    cumulative state itself — long conversations can otherwise drift). */
export async function runIntakeTurn(
  brandName: string,
  history: ConversationMessage[],
  collectedSoFar: CollectedTrip,
  latestUserText: string,
  aiModel: AiModelChoice,
): Promise<AiTurnResult> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const parsed = await runAiStructuredTask<AiTurnResult>({
    provider: aiModel.provider,
    model: aiModel.model,
    instructions: `${systemPrompt(brandName, todayIso)}\n\nData already collected (do not drop a value unless the customer corrects it): ${JSON.stringify(
      collectedSoFar,
    )}`,
    history,
    content: [{ type: "text", text: latestUserText }],
    schema: TURN_SCHEMA,
    schemaName: "whatsapp_intake_turn",
    // maxRetries: 0 (set inside each provider adapter) — same reasoning as
    // handlePostDoneMessage above: this is a live conversation, not
    // something that should silently retry into a multi-minute wait before
    // the customer gets a reply.
    timeoutMs: 20000,
  });

  return { reply: parsed.reply, collected: { ...EMPTY_COLLECTED, ...parsed.collected }, ready: Boolean(parsed.ready) };
}

/** The deterministic gate the webhook actually trusts — the model's `ready`
    flag is a signal, not the decision, so a hallucinated true (or a false
    despite everything being present) can't create a broken lead or stall a
    finished one. All seven fields are required to be non-null — email and
    notes just need to have been explicitly set (even to "None"), since null
    in either means the model never actually asked. createLeadFromSession
    (app/api/webhooks/360dialog/route.ts) is what turns a literal "None" back
    into a real null before it ever reaches the customer/lead record — this
    check only cares that the question was asked, not what the answer was. */
export function hasRequiredTripFields(collected: CollectedTrip): boolean {
  return Boolean(
    collected.name?.trim() &&
      collected.email?.trim() &&
      collected.pickup?.trim() &&
      collected.destination?.trim() &&
      collected.travel_date?.trim() &&
      collected.passenger_count !== null &&
      collected.passenger_count > 0 &&
      collected.notes !== null &&
      collected.notes.trim() !== "",
  );
}
