import type { ReactNode } from "react";

const BULLET_RE = /^[•◦‣▪●*-]\s+/;
const NUMBERED_RE = /^\d+[.)]\s+/;
// An itinerary-style line the AI wrote inline, e.g. "2026-11-10 09:00
// transfer from X to Y" — common enough in lead notes (one line per leg)
// that it's worth recognising as a list item even without an explicit
// "- " marker. Content is kept as-is (the date is the useful part), only
// the type is treated as a bullet so consecutive legs group into one <ul>.
const DATE_LEAD_RE = /^\d{4}-\d{2}-\d{2}(\s+\d{1,2}:\d{2})?\s+\S/;

/**
 * Forces bullet-like markers onto their own line even when the source ran
 * them inline with no real line break before each one:
 *  - a glyph bullet (•◦‣▪●), e.g. an email body with
 *    "...arrangements • Seven disposal days: ... • Final airport transfer: ...".
 *  - a markdown "- **Label:**" item chained after another with just a
 *    " - " separator, e.g. an AI note like
 *    "**Pickup:** X - **Drop-off:** Y - **Passengers:** 15" — common from
 *    the complex-booking AI extraction, which writes a label/value list as
 *    one run-on line instead of real bullets. Only triggers when the dash
 *    is immediately followed by a bold marker, so it never fires on an
 *    ordinary mid-sentence dash ("9am - 5pm").
 *  - a "**Heading:**" bold label glued straight onto the end of the
 *    previous sentence with no punctuation at all before it (the same AI
 *    extraction does this between sections, e.g.
 *    "...5 backpacks **Requested Stops:** 1. **Aluva, Kochi**..."). Only
 *    triggers right after an ordinary word (a letter immediately before the
 *    space) — never after "- " or a numbered marker like "1. ", both of
 *    which end in punctuation, not a letter — so it can't split a bullet's
 *    or numbered item's own "**Label:**" opening away from its marker.
 */
function breakInlineBullets(text: string): string {
  return text
    .replace(/([^\n])\s*(?=[•◦‣▪●])/g, "$1\n")
    .replace(/ - (?=\*\*)/g, "\n- ")
    .replace(/(?<=[a-zA-Z])[ \t]+(?=\*\*)/g, "\n\n");
}

/**
 * Many AI-written summaries (email/WhatsApp lead intake) come back as one
 * grammatically continuous paragraph with no line breaks at all — a model
 * doesn't reliably follow a "use line breaks" instruction for a sequence of
 * sentences. This turns sentence boundaries that are still on the same line
 * (". Capital", "; Capital", etc.) into paragraph breaks, so a run-on
 * paragraph still ends up with visible gaps even when the source has zero
 * structure to begin with.
 *
 * Deliberately conservative about what counts as a sentence boundary: a
 * semicolon always breaks, but a period only breaks when the word right
 * before it isn't a short all-letters token — guards against splitting
 * "St. Mary's", "Mr. Smith", "Rd." etc. mid-name/address, while still
 * breaking after longer words and after number/time-like tokens (dates,
 * amounts, "12:25") where a trailing period is never an abbreviation.
 */
function splitRunOnSentences(text: string): string {
  return text.replace(/([^\s.;!?]+)([.;!?])[ \t]+(?=[A-Z0-9])/g, (match, token: string, punct: string) => {
    if (punct !== ".") return `${token}${punct}\n\n`;
    const alnum = token.replace(/[^A-Za-z0-9]/g, "");
    const looksLikeAbbreviation = /^[A-Za-z]{1,3}$/.test(alnum);
    return looksLikeAbbreviation ? match : `${token}${punct}\n\n`;
  });
}

interface Block {
  type: "p" | "ul";
  lines: string[];
}

function toBlocks(text: string): Block[] {
  const normalized = breakInlineBullets(splitRunOnSentences(text.replace(/\r\n/g, "\n")));
  const rawLines = normalized.split("\n").map((l) => l.trim());
  const blocks: Block[] = [];
  // A blank line always starts a fresh block, even if the next line is the
  // same type as the one before it — otherwise two genuinely separate
  // paragraphs that happen to both be plain prose would silently merge into
  // one, with only a <br/> between them instead of real paragraph spacing.
  let sawBlankLine = false;

  for (const line of rawLines) {
    if (line === "") {
      sawBlankLine = true;
      continue;
    }
    const isMarkedBullet = BULLET_RE.test(line) || NUMBERED_RE.test(line);
    const isBullet = isMarkedBullet || DATE_LEAD_RE.test(line);
    const stripped = isMarkedBullet ? line.replace(BULLET_RE, "").replace(NUMBERED_RE, "") : line;
    const last = blocks[blocks.length - 1];
    const type = isBullet ? "ul" : "p";

    // Bullet/itinerary lines always merge into the same list regardless of a
    // blank line between them — splitRunOnSentences inserts one after every
    // sentence (including after each bulleted line), which would otherwise
    // fracture one obvious list into several single-item ones. A blank line
    // only forces a fresh block for plain prose, where it actually signals a
    // new paragraph.
    if (last?.type === type && (type === "ul" || !sawBlankLine)) {
      last.lines.push(stripped);
    } else {
      blocks.push({ type, lines: [stripped] });
    }
    sawBlankLine = false;
  }

  return blocks;
}

/** Renders markdown-style "**bold**" spans as real <strong> text instead of showing the literal asterisks — the AI extraction prompts (complex-booking, email intake) write notes in loose markdown, not plain prose. */
function renderInline(text: string, keyPrefix: string): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={`${keyPrefix}-${i}`}>{part}</strong> : part));
}

/**
 * Renders free text (lead notes/messages, special requirements, email
 * bodies, ...) as real paragraphs and bullet lists instead of one flat
 * block — the single shared way every staff-facing page shows this kind of
 * text, so a long AI-summarized note or a quoted email reads properly
 * instead of running every sentence together.
 *
 * Existing line breaks in the source are respected as-is (a blank line
 * starts a new paragraph, a single line break stays a soft break within the
 * same paragraph); lines starting with a bullet marker (•, -, *), a number
 * ("1.", "2)"), or a date ("2026-11-10 09:00 transfer...") become a real
 * <ul>/<li> list. A run of sentences with no line breaks at all — the most
 * common shape for AI-generated notes — still gets broken into separate
 * paragraphs by sentence boundary, bullet glyphs or "- **Label:**" items
 * chained inline with no break between them are pulled onto their own
 * line, and "**bold**" markdown renders as actual bold text.
 */
export function FormattedText({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text || !text.trim()) return <>—</>;

  const blocks = toBlocks(text);

  return (
    <div className={className}>
      {blocks.map((block, i) =>
        block.type === "ul" ? (
          <ul key={i} className={i > 0 ? "mt-2 list-disc space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
            {block.lines.map((line, j) => (
              <li key={j}>{renderInline(line, `${i}-${j}`)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className={i > 0 ? "mt-2" : undefined}>
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {renderInline(line, `${i}-${j}`)}
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
