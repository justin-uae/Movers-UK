import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Inbound email HTML comes from arbitrary external senders and must never be
 * rendered as-is in the reading pane — an attacker-controlled <script> or
 * onerror= handler would otherwise execute inside this app's own page
 * (stored XSS). Runs server-side (app/(staff)/email/page.tsx) so the
 * sanitizer never ships to the client bundle.
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "div", "span", "b", "i", "u", "strong", "em", "a", "ul", "ol", "li",
      "blockquote", "img", "table", "thead", "tbody", "tr", "td", "th", "h1", "h2",
      "h3", "h4", "h5", "h6", "hr", "pre", "code",
    ],
    allowedAttributes: {
      a: ["href", "title", "target"],
      img: ["src", "alt", "title", "width", "height"],
      "*": ["style"],
    },
    allowedStyles: {
      "*": {
        color: [/.*/],
        "background-color": [/.*/],
        "text-align": [/.*/],
        "font-weight": [/.*/],
        // Gmail (and others) wrap a quoted plain-text reply in a div with
        // this instead of real <br> tags — stripping it collapses every
        // line break and bullet in the quoted block into one run-on
        // paragraph via the browser's default whitespace handling, even
        // though the original line breaks are still right there in the
        // markup.
        "white-space": [/^(pre|pre-wrap|pre-line|normal|nowrap)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });
}
