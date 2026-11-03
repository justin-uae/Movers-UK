import { parseRichText, type RichTextRun } from "@/lib/richText";

function Runs({ runs }: { runs: RichTextRun[] }) {
  return (
    <>
      {runs.map((run, i) => (run.bold ? <strong key={i}>{run.text}</strong> : <span key={i}>{run.text}</span>))}
    </>
  );
}

/**
 * Renders free-typed/pasted notes (e.g. quote_versions.customer_notes) with
 * line breaks, **bold**, and "- " bullet lists preserved — see
 * lib/richText.ts. A plain `<p>{text}</p>` collapses every newline to a
 * single space (default CSS white-space), which is what made pasted,
 * carefully-formatted text look like one run-on paragraph.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseRichText(text);
  return (
    <div className={className}>
      {blocks.map((block, i) =>
        block.type === "bullet" ? (
          <ul key={i} className="mt-2 list-disc space-y-0.5 pl-5 first:mt-0">
            {block.items.map((runs, j) => (
              <li key={j}>
                <Runs runs={runs} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="mt-2 first:mt-0">
            {block.lines.map((runs, j) => (
              <span key={j}>
                <Runs runs={runs} />
                {j < block.lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
