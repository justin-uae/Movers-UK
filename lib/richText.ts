export interface RichTextRun {
  text: string;
  bold: boolean;
}

export type RichTextBlock = { type: "paragraph"; lines: RichTextRun[][] } | { type: "bullet"; items: RichTextRun[][] };

// Mirrors the bullet-glyph handling in lib/pdfDocument.ts's sanitizePdfText
// (Word/Google Docs often paste a bullet from a symbol font whose codepoint
// has no glyph in a normal font) — duplicated rather than imported so this
// module has no "server-only" dependency and can run in a client
// component's live preview as well as on the server.
const LEADING_BULLET_RE = /^(\s*)[-*•●▪‣◦∙◆■\u{E000}-\u{F8FF}](\s+)/u;

function stripPrivateUseGlyphs(line: string): string {
  return line.replace(/[\u{E000}-\u{F8FF}]/gu, "");
}

function parseInlineBold(text: string): RichTextRun[] {
  const runs: RichTextRun[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > lastIndex) runs.push({ text: text.slice(lastIndex, match.index), bold: false });
    runs.push({ text: match[1] ?? "", bold: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) runs.push({ text: text.slice(lastIndex), bold: false });
  return runs.length > 0 ? runs : [{ text, bold: false }];
}

/**
 * Lightweight markdown-ish parsing for free-typed/pasted notes (e.g. a
 * sales rep pasting ChatGPT-authored text into "Notes to customer") —
 * double-asterisk bold markers and "- "/"* "/"• " bullet lines, everything
 * else kept as plain paragraphs with line breaks preserved exactly as
 * typed. Not a general markdown parser (no headings, links, nesting) —
 * just the handful of things this kind of pasted text actually uses.
 */
export function parseRichText(raw: string): RichTextBlock[] {
  const blocks: RichTextBlock[] = [];
  const lines = raw.replace(/\r\n/g, "\n").split("\n").map(stripPrivateUseGlyphs);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (LEADING_BULLET_RE.test(line)) {
      const items: RichTextRun[][] = [];
      while (i < lines.length) {
        const current = lines[i] ?? "";
        const match = current.match(LEADING_BULLET_RE);
        if (!match) break;
        items.push(parseInlineBold(current.slice(match[0].length)));
        i++;
      }
      blocks.push({ type: "bullet", items });
      continue;
    }
    const paraLines: RichTextRun[][] = [];
    while (i < lines.length) {
      const current = lines[i] ?? "";
      if (current.trim() === "" || LEADING_BULLET_RE.test(current)) break;
      paraLines.push(parseInlineBold(current));
      i++;
    }
    blocks.push({ type: "paragraph", lines: paraLines });
  }
  return blocks;
}
