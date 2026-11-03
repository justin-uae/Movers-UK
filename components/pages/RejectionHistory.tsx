import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { formatDateTime } from "@/lib/formatDate";

export interface JobRejectionRecord {
  id: string;
  job_allocation_id: string;
  context: "initial_offer" | "post_edit_reapproval";
  reason: string;
  rejected_at: string;
  suppliers: { name: string } | null;
}

const CONTEXT_LABEL: Record<JobRejectionRecord["context"], string> = {
  initial_offer: "Turned down the offer",
  post_edit_reapproval: "Rejected after the booking was edited",
};

/**
 * Every time a supplier has rejected this job — either a fresh offer they
 * never accepted, or an already-accepted job pulled back for re-approval
 * after an edit (see rejectJobAllocationOfferAction / rejectAmendedAllocationAction) —
 * with the reason they gave. Shown on the Dispatch job detail page so staff
 * redispatching to a new supplier can see why the last one turned it down.
 */
export function RejectionHistory({ rejections }: { rejections: JobRejectionRecord[] }) {
  if (rejections.length === 0) return null;

  return (
    <Panel>
      <SectionTitle title="Rejection history" sub="Why a supplier turned this job down" />
      <ol className="mt-4 space-y-3">
        {rejections.map((r) => (
          <li key={r.id} className="rounded-xl border border-red-100 bg-red-50/40 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="font-semibold">{r.suppliers?.name ?? "Supplier"}</span>
              <span className="text-xs text-slate-400">{formatDateTime(r.rejected_at)}</span>
            </div>
            <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
              {CONTEXT_LABEL[r.context]}
            </span>
            <p className="mt-2 text-slate-600">{r.reason}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
