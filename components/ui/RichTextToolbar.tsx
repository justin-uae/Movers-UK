"use client";

import { Bold, List } from "lucide-react";
import type { MouseEvent, RefObject } from "react";

/**
 * A couple of formatting buttons for a plain `<textarea>` holding free-text
 * notes (see lib/richText.ts for what gets parsed back out of this on
 * display) — Bold wraps the current selection in double asterisks, Bullet
 * toggles "- " at the start of every selected line. No rich-text editor
 * involved: these just insert/remove plain markers in the textarea's own
 * value, same as a user typing them by hand, so the underlying data stays
 * plain text and every other consumer (PDF, email, public quote page)
 * keeps working unchanged.
 *
 * Handlers run on mousedown, not click, with preventDefault() — a native
 * <button> steals focus from the textarea on mousedown by default, which
 * collapses/clears whatever selection the user had made *before* a click
 * handler ever gets to read it. That's what made clicking either button
 * seem to randomly apply the wrong formatting (or always the same one) —
 * both handlers were reading a selection the browser had already wiped.
 * Blocking that default keeps focus (and the real selection) on the
 * textarea the whole time, so each button sees exactly what the user had
 * selected.
 */
export function RichTextToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  function setSelectionAfterUpdate(start: number, end: number) {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.setSelectionRange(start, end);
    });
  }

  function toggleBold(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);

    // Toggle off if the selection is already wrapped in ** — lets the same
    // button un-bold text that's already bold instead of double-wrapping it.
    const alreadyBold = selected.startsWith("**") && selected.endsWith("**") && selected.length >= 4;
    if (alreadyBold) {
      const inner = selected.slice(2, -2);
      onChange(value.slice(0, start) + inner + value.slice(end));
      setSelectionAfterUpdate(start, start + inner.length);
      return;
    }

    const text = selected || "bold text";
    const next = value.slice(0, start) + "**" + text + "**" + value.slice(end);
    onChange(next);
    setSelectionAfterUpdate(start + 2, start + 2 + text.length);
  }

  function toggleBullets(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = value.indexOf("\n", end > start ? end - 1 : end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;

    const block = value.slice(lineStart, lineEnd);
    const lines = block.split("\n");
    const nonBlank = lines.filter((l) => l.trim() !== "");
    const allBulleted = nonBlank.length > 0 && nonBlank.every((l) => /^\s*-\s/.test(l));

    const newLines = lines.map((line) => {
      if (line.trim() === "") return line;
      return allBulleted ? line.replace(/^(\s*)-\s?/, "$1") : `- ${line}`;
    });
    const newBlock = newLines.join("\n");

    onChange(value.slice(0, lineStart) + newBlock + value.slice(lineEnd));
    setSelectionAfterUpdate(lineStart, lineStart + newBlock.length);
  }

  return (
    <div className="flex gap-1 rounded-t-xl border border-b-0 bg-slate-50 p-1.5">
      <button
        type="button"
        onMouseDown={toggleBold}
        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
        title="Bold (wrap selected text in **)"
      >
        <Bold size={14} />
      </button>
      <button
        type="button"
        onMouseDown={toggleBullets}
        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
        title="Bullet list"
      >
        <List size={14} />
      </button>
    </div>
  );
}
