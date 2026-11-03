import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { formatDateTime } from "@/lib/formatDate";

export type SupplierApprovalStatus = "not_required" | "pending" | "approved" | "rejected";

export interface BookingEditRecord {
  id: string;
  reason: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  customer_charge_amount: number | null;
  supplier_adjustment_amount: number | null;
  supplier_approval_status: SupplierApprovalStatus;
  supplier_responded_at: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
  /** Set automatically if the supplier rejected this edit after already being paid — see rejectAmendedAllocationAction. Empty for every other amendment. */
  job_allocation_adjustments: { amount: number; reason: string | null; created_at: string }[];
}

function money(amount: number | null, currency: string) {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

const APPROVAL_BADGE: Record<Exclude<SupplierApprovalStatus, "not_required">, { label: string; style: string }> = {
  pending: { label: "Awaiting supplier re-approval", style: "bg-orange-50 text-orange-700" },
  approved: { label: "Supplier approved", style: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Supplier rejected — reopened for dispatch", style: "bg-red-50 text-red-700" },
};

/**
 * Every past edit to a booking — via amendBookingAction (see
 * EditBookingButton) — with who made it, why, and a field-level diff.
 * Shared between the Quote detail page and the Dispatch job detail page,
 * since a booking can be edited from either place.
 */
export function BookingEditHistory({ amendments, currency }: { amendments: BookingEditRecord[]; currency: string }) {
  if (amendments.length === 0) return null;

  return (
    <Panel>
      <SectionTitle title="Edit history" sub="Every post-acceptance edit, with the reason given" />
      <ol className="mt-4 space-y-3">
        {amendments.map((a) => {
          const fieldChanges = Object.entries(a.changes).filter(([key]) => key !== "selling_price");
          return (
            <li key={a.id} className="rounded-xl border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="font-semibold">{a.profiles?.full_name ?? "Staff"}</span>
                <span className="text-xs text-slate-400">{formatDateTime(a.created_at)}</span>
              </div>
              <p className="mt-1 text-slate-600">{a.reason}</p>
              {a.supplier_approval_status !== "not_required" && (
                <div className="mt-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${APPROVAL_BADGE[a.supplier_approval_status].style}`}>
                    {APPROVAL_BADGE[a.supplier_approval_status].label}
                  </span>
                  {a.supplier_responded_at && (
                    <span className="ml-2 text-xs text-slate-400">{formatDateTime(a.supplier_responded_at)}</span>
                  )}
                </div>
              )}
              {a.job_allocation_adjustments.map((adj, i) => (
                <p key={i} className="mt-1 text-xs font-bold text-red-600">
                  {adj.amount < 0 ? "Refund owed from supplier: " : "Supplier payout adjustment: "}
                  {adj.amount > 0 ? "+" : ""}
                  {money(adj.amount, currency)} — see Supplier Payments to record it.
                </p>
              ))}
              {fieldChanges.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
                  {fieldChanges.map(([key, { from, to }]) => (
                    <li key={key}>
                      <span className="capitalize">{key.replaceAll("_", " ")}</span>: {String(from ?? "—")} →{" "}
                      <b className="text-slate-700">{String(to ?? "—")}</b>
                    </li>
                  ))}
                </ul>
              )}
              {(a.customer_charge_amount || a.supplier_adjustment_amount) && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {!!a.customer_charge_amount && (
                    <span className="font-bold text-primary-600">
                      Customer: {a.customer_charge_amount > 0 ? "+" : ""}
                      {money(a.customer_charge_amount, currency)}
                    </span>
                  )}
                  {!!a.supplier_adjustment_amount && (
                    <span className="font-bold text-slate-600">
                      Supplier: {a.supplier_adjustment_amount > 0 ? "+" : ""}
                      {money(a.supplier_adjustment_amount, currency)}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
