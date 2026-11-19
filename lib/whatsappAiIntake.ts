import "server-only";
import { runAiStructuredTask, type AiModelChoice } from "@/lib/aiProviders";
import { MOVE_DETAILS_EXTRACTION_KEYS, MOVE_DETAILS_EXTRACTION_PROPERTIES, type MoveDetails } from "@/lib/moveDetails";

// AI-driven replacement for the old fixed-step WhatsApp Q&A
// (app/api/webhooks/360dialog/route.ts). Each inbound message is answered
// by an AI call (provider/model configurable per-tenant, Settings -> AI
// Models — see lib/aiProviders.ts) that both carries on a natural
// conversation and extracts the cumulative move details gathered so far —
// the webhook then decides, deterministically (not by trusting the model
// alone), whether enough is known to create a lead.

export interface CollectedMove extends MoveDetails {
  name: string | null;
  email: string | null;
  pickup: string | null;
  destination: string | null;
  move_date: string | null;
  notes: string | null;
  /** Set once the customer confirms the recap summary — the last gate before a lead is created. */
  summary_confirmed: boolean | null;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiTurnResult {
  reply: string;
  /** Tap-to-reply buttons for this message (0-3, sanitised by the webhook before sending). */
  quickReplies: string[];
  collected: CollectedMove;
  ready: boolean;
}

const EMPTY_COLLECTED: CollectedMove = {
  name: null,
  email: null,
  pickup: null,
  destination: null,
  move_date: null,
  move_type: null,
  property_type: null,
  rooms: null,
  estimated_boxes: null,
  pickup_floor: null,
  destination_floor: null,
  lift_available: null,
  packing_needed: null,
  dismantling_needed: null,
  assembly_needed: null,
  storage_needed: null,
  fragile_items: null,
  notes: null,
  summary_confirmed: null,
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
    is_new_move_request: {
      type: "boolean",
      description:
        "True only if this message is actually describing or requesting a NEW or different move (mentions an address, a date, wants to book again, etc.). False for anything that's just a casual reply with no new move information — \"thanks\", \"ok\", \"okey\", \"cool\", \"👍\", small talk, or a quick question about what happens next.",
    },
    reply: {
      type: "string",
      description:
        "Only used when is_new_move_request is false. A short (1 sentence, occasionally 2), warm WhatsApp reply from a real person on the team responding naturally to what the customer just said. Never ask about addresses, the move date, property size, or anything else — their move request is already confirmed and being handled, so nothing further needs asking.",
    },
  },
  required: ["is_new_move_request", "reply"],
  additionalProperties: false,
} as const;

/** Runs once a contact messages again after their last conversation was
    already marked "done" — decides whether this is a genuine new move
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
): Promise<{ isNewMoveRequest: boolean; reply: string }> {
  const name = customerName?.trim();
  try {
    const parsed = await runAiStructuredTask<{ is_new_move_request: boolean; reply: string }>({
      provider: aiModel.provider,
      model: aiModel.model,
      instructions:
        `You're texting on WhatsApp for ${brandName}, a UK removals company. A customer's moving request was ` +
        `already fully confirmed and closed out${name ? ` (their name is ${name})` : ""}. They've now sent one more ` +
        `message. Work out whether it's a new/different move request or just a casual follow-up, and reply accordingly ` +
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
    return { isNewMoveRequest: Boolean(parsed.is_new_move_request), reply: parsed.reply };
  } catch (err) {
    console.error("handlePostDoneMessage failed — failing open toward a fresh intake:", err);
    // Fail open toward treating it as a new move request rather than
    // silently swallowing a message we couldn't classify — worse case is an
    // unnecessary re-ask, not a dropped enquiry.
    return { isNewMoveRequest: true, reply: "" };
  }
}

const TURN_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description:
        "Your next WhatsApp message to the customer. Short and conversational — 1-3 sentences, no markdown headings or bullet lists. The ONE exception is the confirmation summary, which uses one line per detail with WhatsApp *bold* labels (see instructions).",
    },
    quick_replies: {
      type: "array",
      items: { type: "string" },
      description:
        "0-3 tap-to-reply buttons shown under your message, each at most 20 characters (e.g. \"Yes, that's me\", \"Skip\", \"Yes, all correct\", \"Change something\", \"No extras\"). Only for yes/no or short-choice questions — always an empty array when you're asking for free text such as an address, email, date or name.",
    },
    collected: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        email: {
          type: ["string", "null"],
          description:
            "The customer's email address — always ask for it once. If they say they don't have one or don't want to give it (or tap \"Skip\"), set this to \"None\" rather than leaving it null or asking again — null means you haven't asked yet, not that they declined. Only record something that looks like a real email address; if what they typed clearly isn't one (no @, an obvious typo like gmail,com), keep it null and ask them to double-check it once.",
        },
        pickup: { type: ["string", "null"], description: "The address or postcode being moved FROM, in the customer's own words" },
        destination: { type: ["string", "null"], description: "The address or postcode being moved TO, in the customer's own words" },
        move_date: {
          type: ["string", "null"],
          description:
            "The move date, resolved to an explicit calendar date (e.g. \"2026-10-06\") whenever you can work it out from what the customer said plus today's date given in your instructions — including relative phrases like \"next Friday\" or \"25th november\". Only fall back to their raw wording if it's genuinely too vague to resolve to a specific date (e.g. \"sometime in the new year\", \"flexible\").",
        },
        ...MOVE_DETAILS_EXTRACTION_PROPERTIES,
        notes: {
          type: ["string", "null"],
          description:
            "Any further/special requirements the customer mentions when you ask (e.g. large items like a piano or American fridge-freezer, parking or access restrictions, a preferred start time, wanting a phone call back). This must always be explicitly asked about once the move basics are known. If the customer says they have nothing else to add, set this to \"None\" rather than leaving it null — null means you haven't asked yet. If there's more than one distinct requirement, put each on its own line starting with \"- \" rather than running them together in one sentence.",
        },
        summary_confirmed: {
          type: ["boolean", "null"],
          description:
            "True ONLY when the customer has replied to your confirmation summary saying it's correct (\"yes\", \"correct\", \"looks good\", tapped \"Yes, all correct\"). Null until then. If they ask to change something, apply the correction and keep this null until they confirm the updated summary.",
        },
      },
      required: ["name", "email", "pickup", "destination", "move_date", ...MOVE_DETAILS_EXTRACTION_KEYS, "notes", "summary_confirmed"],
      additionalProperties: false,
      description:
        "The COMPLETE, cumulative set of move details known so far across the whole conversation — not just this message. Carry forward every previously known value; only change one if the customer corrects it.",
    },
    ready: {
      type: "boolean",
      description:
        "True only once the customer has confirmed your summary (summary_confirmed is true) — which in turn requires name, pickup, destination, move_date and rooms to be known AND email and notes each explicitly asked (\"None\" is fine for those two).",
    },
  },
  required: ["reply", "quick_replies", "collected", "ready"],
  additionalProperties: false,
} as const;

function systemPrompt(brandName: string, todayIso: string, profileName: string | null): string {
  const greeting = `Hi! 👋 Thanks for getting in touch with ${brandName} — I can get a free quote sorted for you in a couple of minutes.`;
  const nameStep = profileName
    ? `Their WhatsApp profile name is "${profileName}" — if it looks like a real person's name, open with a warm welcome and confirm it rather than asking cold (e.g. "${greeting} Is it ${profileName} I'm speaking to?") with quick replies like "Yes, that's me" / "No". If they confirm, record that name; if not, ask for their name. If the profile name doesn't look like a real name (a business, emoji, nickname), just ask for their name.`
    : `Open with a warm welcome and ask for their name (e.g. "${greeting} Who am I speaking to?").`;
  return (
    `You're texting on WhatsApp for ${brandName}, a UK removals company, helping a customer get a free quote for their move. ` +
    `Write like a friendly, switched-on member of the team: warm, relaxed, brief. A short natural reaction before each question ` +
    `is good ("Lovely, thanks!", "Got it.", "Ah nice, Leeds is a great spot.") — vary it, don't open every message the same way. ` +
    `Keep every message short (1-3 sentences), use contractions, no corporate tone, no bullet lists, at most one emoji now and then. ` +
    `If the customer writes in another language, reply in that language. If they sincerely ask whether they're talking to a bot, ` +
    `don't lie — say you're ${brandName}'s WhatsApp assistant, and that the team reviews every enquiry personally and can take over any time. ` +
    `Today's date is ${todayIso}.\n\n` +
    `THE MOST IMPORTANT RULE — READ THIS FIRST: your instructions include a "Data already collected" block with the ` +
    `cumulative move details known so far. Treat every non-null value in that block as settled fact, permanently — never ` +
    `re-ask a question whose field is already non-null there, even if the transcript looks incomplete, confusing, or you're ` +
    `unsure. Silently skip straight to the next thing that's still missing. Asking someone something they already told you is ` +
    `the single worst thing you can do here.\n\n` +
    `The conversation, in this order (skip anything already known):\n` +
    `1. Name. ${nameStep} Use their first name naturally (not in every message) from then on.\n` +
    `2. Email — so the quote can be emailed to them too. Offer a "Skip" quick reply; if they skip or decline, record "None" and move on — never ask twice.\n` +
    `3. Moving from — ask for the full address or at least the postcode. If they only give a town or city, ask ONCE for the postcode or area ("Do you have the postcode? It helps us get the price spot on"); if they don't have it, accept what they gave.\n` +
    `4. Moving to — same as above.\n` +
    `5. Move date. A rough or flexible date is fine — record what they say. If the date they give has already passed, gently check whether they meant next year.\n` +
    `6. Property — ask it naturally in ONE message, e.g. "Is it a house or a flat, and how many bedrooms?" (record property_type and rooms). For an office or commercial move, ask roughly how many desks or rooms instead. Never use the stiff wording "bedrooms or rooms".\n` +
    `7. Access — ONLY if either end is a flat/apartment or an upper floor has come up: ask which floor it's on and whether there's a lift (one message; ask about the other end as well if relevant). Skip this entirely for houses and bungalows.\n` +
    `8. Extras — one message asking whether they'd like any help with packing, taking furniture apart and putting it back together, or storage (a "No extras" quick reply is handy). Record packing_needed / dismantling_needed / assembly_needed / storage_needed; if they want none, set those to false.\n` +
    `9. Anything else — e.g. "Anything else we should know — big or fragile items like a piano, or any parking or access issues?" Record the answer in notes (and fragile_items if relevant); "None" if there's nothing.\n` +
    `10. Summary — once all of the above is done, send ONE message recapping everything for them to check, one detail per line with WhatsApp bold labels, like:\n` +
    `"Great, here's what I've got:\n*Name:* Jane Smith\n*Email:* jane@example.com\n*From:* 14 Elm Grove, M20 6RL\n*To:* 9 Navigation Walk, LS10 1JJ\n*Date:* Fri 5 Dec 2026\n*Property:* 3-bed house\n*Extras:* Packing, storage\n*Notes:* Upright piano\n\nDoes that all look right?"\n` +
    `with quick replies "Yes, all correct" and "Change something". Leave out lines for things that are empty or "None" (write "*Extras:* None" if they want no extras). Write the date in a friendly format.\n` +
    `11. If they want to change something, ask what, update it, and send the corrected summary again. When they confirm, set summary_confirmed and ready to true, and send a warm sign-off: thank them by first name and say the team will put their quote together and send it here on WhatsApp (and by email, if they gave one) shortly. Don't ask anything else after that.\n\n` +
    `Other rules:\n` +
    `- Ask ONE question per message (steps 6 and 7 each count as one). If the customer volunteers several details at once, record all of them and carry on with whatever is still missing.\n` +
    `- Some details may already be known before the conversation starts (a returning contact's name or email) — don't ask for those again.\n` +
    `- The other move details (move type, boxes, etc.) aren't asked one by one — record any the customer mentions, otherwise leave them null.\n` +
    `- Never invent or guess a value the customer hasn't actually told you.\n` +
    `- Resolve dates yourself using today's date ("next Friday", "25th November" → an explicit date).\n` +
    `- A shared location pin arrives as text ("Shared location: ...") — treat it as the answer to the address question you just asked.\n` +
    `- Prices: if they ask how much it'll cost, explain the quote is free and tailored to their move, and they'll have it shortly once you've got the details — never give or guess a price, a range, or availability.\n` +
    `- If they'd rather talk on the phone, say that's no problem, add "Prefers a phone call" to notes, and either carry on if they're happy to or go straight to the summary with what you have.\n` +
    `- If they ask something unrelated, answer briefly and kindly, then steer back to their quote.\n` +
    `- Quick replies: only for yes/no or short-choice questions, max 3, each at most 20 characters; an empty array otherwise.\n` +
    `- Never set ready to true before the customer has confirmed the summary.`
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
export function mergeCollected(previous: CollectedMove, next: CollectedMove): CollectedMove {
  const merged = { ...EMPTY_COLLECTED } as CollectedMove;
  (Object.keys(EMPTY_COLLECTED) as (keyof CollectedMove)[]).forEach((key) => {
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
  collectedSoFar: CollectedMove,
  latestUserText: string,
  aiModel: AiModelChoice,
  /** The contact's WhatsApp profile name — lets the opener confirm it instead of asking cold. */
  profileName: string | null = null,
): Promise<AiTurnResult> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const parsed = await runAiStructuredTask<{ reply: string; quick_replies?: string[]; collected: CollectedMove; ready: boolean }>({
    provider: aiModel.provider,
    model: aiModel.model,
    instructions: `${systemPrompt(brandName, todayIso, profileName?.trim() || null)}\n\nData already collected (do not drop a value unless the customer corrects it): ${JSON.stringify(
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

  return {
    reply: parsed.reply,
    quickReplies: Array.isArray(parsed.quick_replies) ? parsed.quick_replies : [],
    collected: { ...EMPTY_COLLECTED, ...parsed.collected },
    ready: Boolean(parsed.ready),
  };
}

/** The deterministic gate the webhook actually trusts — the model's `ready`
    flag is a signal, not the decision, so a hallucinated true (or a false
    despite everything being present) can't create a broken lead or stall a
    finished one. All seven fields are required to be non-null — email and
    notes just need to have been explicitly set (even to "None"), since null
    in either means the model never actually asked. createLeadFromSession
    (app/api/webhooks/360dialog/route.ts) is what turns a literal "None" back
    into a real null before it ever reaches the customer/lead record — this
    check only cares that the question was asked, not what the answer was.
    On top of that, the customer must have confirmed the recap summary. */
export function hasRequiredMoveFields(collected: CollectedMove): boolean {
  return Boolean(
    collected.summary_confirmed === true &&
    collected.name?.trim() &&
      collected.email?.trim() &&
      collected.pickup?.trim() &&
      collected.destination?.trim() &&
      collected.move_date?.trim() &&
      collected.rooms?.trim() &&
      collected.notes !== null &&
      collected.notes.trim() !== "",
  );
}
