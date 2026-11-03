import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { formatDateTime } from "@/lib/formatDate";

export interface LeadEditRecord {
  id: string;
  reason: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
  profiles: { full_name: string } | null;
}

/**
 * Every past edit to a lead's journey/intake details (see editLeadAction),
 * with who made it, why, and a field-level diff — shown on the Lead detail
 * page underneath the edit form.
 */
export function LeadEditHistory({ edits }: { edits: LeadEditRecord[] }) {
  if (edits.length === 0) return null;

  return (
    <Panel>
      <SectionTitle title="Edit history" sub="Every change made to this lead, with the reason given" />
      <ol className="mt-4 space-y-3">
        {edits.map((e) => (
          <li key={e.id} className="rounded-xl border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="font-semibold">{e.profiles?.full_name ?? "Staff"}</span>
              <span className="text-xs text-slate-400">{formatDateTime(e.created_at)}</span>
            </div>
            <p className="mt-1 text-slate-600">{e.reason}</p>
            {Object.keys(e.changes).length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
                {Object.entries(e.changes).map(([key, { from, to }]) => (
                  <li key={key}>
                    <span className="capitalize">{key.replaceAll("_", " ")}</span>: {String(from ?? "—")} →{" "}
                    <b className="text-slate-700">{String(to ?? "—")}</b>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
