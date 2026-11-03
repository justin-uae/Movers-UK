import "server-only";
import { readFileSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { parseRichText, type RichTextRun } from "./richText";

// Shared pdfkit primitives used by every generated document in this app
// (lib/quotePdf.ts, lib/invoicePdf.ts) — factored out so the tricky
// font/ligature/page-break workarounds below exist in exactly one place.

export const INK = "#1e293b";
export const MUTED = "#64748b";
export const PAGE_MARGIN = 50;
export const FALLBACK_COLOR = "#f97316";

// Fixed names this file's own font(...) calls use — never "Helvetica"
// directly (see resolveFontSources below for why).
export const FONT_REGULAR = "Regular";
export const FONT_BOLD = "Bold";

/**
 * pdfkit's built-in "Helvetica"/"Helvetica-Bold" names aren't real embedded
 * fonts — selecting them makes pdfkit read glyph-width metrics from an .afm
 * file under node_modules/pdfkit/js/data/ at render time. That file has
 * been observed missing in at least one production deployment (Next.js'
 * bundler doesn't reliably carry a dependency's non-JS data files into a
 * trimmed build), which crashes PDF generation entirely.
 *
 * Embedding a real font file sidesteps this: pdfkit reads metrics straight
 * out of the font's own tables, no separate data file involved. Next.js
 * ships one for its own OG-image feature (Geist, permissively licensed),
 * which is about as reliably present as any file can be in a Next.js
 * deployment — so it doubles as our unconditional fallback here. It only
 * ships a single weight, so "Bold" reuses the same buffer (no true bold,
 * per the request that a plain default font is fine) rather than fail.
 * If even that read fails, fall back to the plain named fonts, which is
 * exactly what worked before this file existed.
 */
function resolveFontSources(): { regular: string | Buffer; bold: string | Buffer } {
  try {
    const buffer = readFileSync(
      path.join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"),
    );
    return { regular: buffer, bold: buffer };
  } catch {
    return { regular: "Helvetica", bold: "Helvetica-Bold" };
  }
}

// Geist (and most fonts with any OpenType typography) substitutes "fi",
// "ff", "ffi" etc. with a single ligature glyph. That renders fine visually,
// but pdfkit/fontkit doesn't always map the ligature glyph back to its full
// multi-character text in the PDF's extractable text layer — copy/paste and
// search then silently drop letters ("confirm" -> "confrm", "traffic" ->
// "trafic"). Disabling the ligature features avoids the substitution
// entirely, which is the safe tradeoff for a document whose text needs to
// stay correct when copied, searched, or read by a screen reader.
const NO_LIGATURE_FEATURES = { liga: false, clig: false, calt: false, rclt: false };

function disableLigatures(doc: PDFKit.PDFDocument) {
  const original = doc.text.bind(doc) as (...args: unknown[]) => PDFKit.PDFDocument;
  const patched = (str: string, ...rest: unknown[]) => {
    if (rest.length === 0) {
      return original(str, { features: NO_LIGATURE_FEATURES });
    }
    if (rest.length === 1) {
      const opts = (rest[0] as Record<string, unknown> | undefined) ?? {};
      return original(str, { ...opts, features: NO_LIGATURE_FEATURES });
    }
    if (rest.length === 2) {
      return original(str, rest[0], rest[1], { features: NO_LIGATURE_FEATURES });
    }
    const opts = (rest[2] as Record<string, unknown> | undefined) ?? {};
    return original(str, rest[0], rest[1], { ...opts, features: NO_LIGATURE_FEATURES });
  };
  (doc as unknown as { text: typeof patched }).text = patched;
}

/**
 * Constructs an A4 pdfkit document with the app's embedded font already
 * registered and ligatures disabled, and wires up the data/end listeners
 * that collect the finished buffer. Returns null (rather than throwing) if
 * even the Helvetica fallback fails to register, so callers can degrade to
 * "no PDF this time" instead of a 500.
 */
export function createPdfDocument(logLabel: string): { doc: PDFKit.PDFDocument; done: Promise<Buffer> } | null {
  // font: false skips pdfkit's automatic "Helvetica" load at construction
  // time — that happens before we'd get a chance to register our own safe
  // fallback below, so it would crash regardless of resolveFontSources().
  // @types/pdfkit only declares `font` as `string | undefined`, but pdfkit
  // itself (`if (defaultFont) { this.font(...) }`) happily treats `false`
  // as "skip" at runtime — the type is just incomplete here.
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true,
    font: false as unknown as string,
  });
  const { regular, bold } = resolveFontSources();
  try {
    doc.registerFont(FONT_REGULAR, regular);
    doc.registerFont(FONT_BOLD, bold);
    doc.font(FONT_REGULAR);
  } catch (err) {
    console.error(`${logLabel}: could not initialize a font: ${err instanceof Error ? err.message : err}`);
    return null;
  }
  disableLigatures(doc);
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  return { doc, done };
}

export function money(amount: number | null | undefined, currency: string) {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

const BARE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "10 Aug 2026". A bare date value ("2026-08-10", no time-of-day) is read
 * literally — converting a value with no time component through a timezone
 * could shift the calendar date depending on where the server process runs.
 * Anything else (a real timestamp, e.g. quote.expiry_at) is rendered in UK
 * time — matches lib/formatDate.ts's convention, so a PDF and the app UI
 * never disagree on what day something happened, regardless of the Node
 * process's own local timezone.
 */
export function formatDate(value: string | null) {
  if (!value) return "—";
  if (BARE_DATE_RE.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/London" });
}

export async function fetchLogoBuffer(logoUrl: string | null): Promise<Buffer | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    // A broken/unreachable logo URL should never stop generation — fall
    // back to a text-only header.
    return null;
  }
}

export function sectionHeading(doc: PDFKit.PDFDocument, title: string, color: string, width: number) {
  doc.font(FONT_BOLD).fontSize(13).fillColor(color).text(title, PAGE_MARGIN, doc.y, { width });
  doc.moveDown(0.4);
  doc.fillColor(INK);
}

/**
 * Forces a fresh page first if `height` of content wouldn't fit in what's
 * left of the current one. Needed before anything (a background rect, a
 * tight label+value pair) that draws using explicit y-coordinates computed
 * from doc.y and then manually advances doc.y by a fixed amount afterward —
 * pdfkit's own per-line auto page-break can still silently fire mid-way
 * through such a block (each .text() call checks the bottom margin on its
 * own), and once that happens the manual doc.y math after it is left
 * pointing at a stale position from the old page instead of the new one.
 */
export function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > doc.page.maxY()) {
    doc.addPage();
  }
}

/** A light grey box of label/value rows — the workhorse layout for travel + pricing details. */
export function drawKeyValueBox(doc: PDFKit.PDFDocument, rows: [string, string][], width: number) {
  const padding = 10;
  const labelWidth = width * 0.4 - padding;
  const valueWidth = width * 0.6 - padding;

  // Measure every row's wrapped height up front so the background box can be
  // drawn once, before any text — filling it after the fact would sit on
  // top of (and fade) the text.
  let boxHeight = padding;
  for (const [, value] of rows) {
    boxHeight += Math.max(doc.heightOfString(value, { width: valueWidth }), 12) + 8;
  }
  ensureSpace(doc, boxHeight);
  const startY = doc.y;
  doc.rect(PAGE_MARGIN, startY, width, boxHeight).fillOpacity(0.04).fill(INK).fillOpacity(1);

  let y = startY + padding;
  for (const [label, value] of rows) {
    const valueHeight = doc.heightOfString(value, { width: valueWidth });
    doc.font(FONT_REGULAR).fontSize(9).fillColor(MUTED).text(label, PAGE_MARGIN + padding, y, { width: labelWidth });
    doc
      .font(FONT_BOLD)
      .fontSize(10)
      .fillColor(INK)
      .text(value, PAGE_MARGIN + padding + labelWidth, y, { width: valueWidth });
    y += Math.max(valueHeight, 12) + 8;
  }
  doc.y = startY + boxHeight + 4;
}

/**
 * Draws "Page X of Y", centered, inside the bottom margin of every
 * already-buffered page. Call this last, right before doc.end().
 */
export function drawFooterOnEveryPage(doc: PDFKit.PDFDocument, contentWidth: number) {
  const pageRange = doc.bufferedPageRange();
  for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
    doc.switchToPage(i);
    const footerY = doc.page.height - 40;
    // Writing at this y sits inside the page's bottom margin, which PDFKit
    // treats as an overflow — normally that's exactly what triggers the
    // *next* page, but here it would silently addPage() a blank page and
    // draw the footer there instead of on page i. Dropping the bottom
    // margin to 0 for this call disables that check.
    const restoreBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font(FONT_REGULAR)
      .fontSize(8)
      .fillColor(MUTED)
      .text(`Page ${i - pageRange.start + 1} of ${pageRange.count}`, PAGE_MARGIN, footerY, {
        width: contentWidth,
        align: "center",
        lineBreak: false,
      });
    doc.page.margins.bottom = restoreBottomMargin;
  }
}

// Word/Google Docs bullet lists often paste their bullet glyph from a
// symbol font (e.g. Wingdings' bullet sits at the Private Use Area
// codepoint U+F0B7) — that codepoint has no glyph in a normal Unicode font,
// so it renders as an empty/missing-glyph box wherever it lands. Swapping
// any such leading marker for a plain hyphen keeps the text a bulleted
// list without depending on a glyph our embedded font doesn't have.
const LEADING_BULLET_RE = /^(\s*)[•●▪‣◦∙◆■\u{E000}-\u{F8FF}]\s*/u;

/** Strips characters known to render as a missing-glyph box in the embedded PDF font. */
export function sanitizePdfText(text: string): string {
  return text
    .split("\n")
    .map((line) => (LEADING_BULLET_RE.test(line) ? line.replace(LEADING_BULLET_RE, "$1- ") : line))
    .join("\n")
    .replace(/[\u{E000}-\u{F8FF}]/gu, "");
}

// A faux-bold stroke width proportional to the font size (PDF units == pt),
// tuned by eye against 9-11pt body text — thick enough to read as bold,
// thin enough not to clog small glyphs like "e"/"a" into blobs.
const BOLD_STROKE_RATIO = 0.028;

function writeRuns(doc: PDFKit.PDFDocument, runs: RichTextRun[], x: number, width: number, fontSize: number) {
  runs.forEach((run, i) => {
    // No real bold weight of the embedded font exists to register (see
    // resolveFontSources above — only one Geist weight ships, "Bold" just
    // reuses the Regular buffer) — filling AND stroking the same glyph
    // outlines thickens them enough to read as bold without one, the
    // standard trick for a single-weight font. `stroke`/`lineWidth` are a
    // no-op on a plain (non-bold) run since doc.lineWidth(0) draws nothing.
    doc.font(FONT_REGULAR).lineWidth(run.bold ? fontSize * BOLD_STROKE_RATIO : 0);
    const opts = { width, continued: i < runs.length - 1, fill: true, stroke: run.bold };
    if (i === 0) {
      doc.text(run.text, x, doc.y, opts);
    } else {
      doc.text(run.text, opts);
    }
  });
}

/**
 * Writes bold-and-bullet-aware text (lib/richText.ts — double-asterisk
 * markers for bold, leading dash for a bullet line) at the current pdfkit
 * cursor — the same parsing used for the web/customer-facing render of the
 * same field, so a note reads consistently everywhere it's shown, visual
 * bold weight included (see writeRuns' fill+stroke trick above). Every
 * line/bullet item is explicitly re-positioned at `x` (not left to
 * pdfkit's cursor after the previous call) so left alignment stays correct
 * regardless of what was drawn before; only an inline bold/plain run
 * transition mid-line continues without repositioning. Restores
 * FONT_REGULAR and a 0 line width when done.
 */
export function writeRichText(doc: PDFKit.PDFDocument, text: string, options: { x: number; width: number; fontSize?: number; color?: string }) {
  const blocks = parseRichText(sanitizePdfText(text));
  const fontSize = options.fontSize ?? 10;
  const color = options.color ?? MUTED;
  doc.fontSize(fontSize).fillColor(color).strokeColor(color);
  for (const block of blocks) {
    if (block.type === "bullet") {
      for (const runs of block.items) {
        writeRuns(doc, [{ text: "•  ", bold: false }, ...runs], options.x, options.width, fontSize);
      }
    } else {
      for (const lineRuns of block.lines) {
        writeRuns(doc, lineRuns, options.x, options.width, fontSize);
      }
    }
  }
  doc.font(FONT_REGULAR).lineWidth(0);
}
