import "server-only";
import { htmlToText } from "html-to-text";

/**
 * Builds the plain-text alternative part for every email this CRM sends.
 * Every outgoing email used to be HTML-only (no multipart/alternative) —
 * harmless as long as the recipient's client renders HTML, but the moment
 * anyone needed a plain-text fallback for it (a non-HTML client, a preview,
 * or — the case that actually surfaced this — quoting it back to us in a
 * reply) something downstream had to synthesize one on the fly, and did a
 * poor job of it: the signature's <img> became literal "![](url)" markdown
 * and its <table>/<div> layout got flattened into a run-on line with no
 * spacing. Generating a clean version ourselves and sending it as the
 * `text` part means any such fallback uses *this* instead of improvising a
 * worse one.
 */
export function htmlToPlainText(html: string): string {
  return htmlToText(html, {
    wordwrap: 100,
    selectors: [
      // A signature logo conveys nothing in a plain-text reading — skip it
      // outright rather than rendering the usual "![](url)" markdown, which
      // reads as broken syntax to anyone not expecting it.
      { selector: "img", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
    ],
  }).trim();
}
