import type { JobAllocationOfferView } from "@/lib/supabase/database.types";

/**
 * Collapses (offer_status, allocation_status) into one status a supplier
 * actually cares about — shared by the job list pages, the landing overview
 * and the detail page so the label/badge/filtering logic isn't copy-pasted
 * per page.
 */
export type SupplierJobStatusKey =
  | "new"
  | "accepted"
  | "changes_pending"
  | "confirmed"
  | "completed"
  | "rejected"
  | "withdrawn"
  | "cancelled";

export function jobStatusKey(job: JobAllocationOfferView): SupplierJobStatusKey {
  // Checked before offer_status — a job pulled back for re-approval keeps
  // whatever its original (now stale) offer_status was, but the allocation
  // status is what actually needs the supplier's attention here.
  if (job.allocation_status === "pending_reapproval") return "changes_pending";
  if (job.offer_status === "withdrawn") return "withdrawn";
  if (job.offer_status === "rejected") return "rejected";
  if (job.offer_status === "sent") return "new";
  switch (job.allocation_status) {
    case "confirmed":
      return "confirmed";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "accepted_by_supplier":
    default:
      return "accepted";
  }
}

/** Short label for badges/pills in lists. */
const STATUS_LABEL: Record<SupplierJobStatusKey, string> = {
  new: "New offer",
  accepted: "Accepted",
  changes_pending: "Changes pending",
  confirmed: "Confirmed",
  completed: "Completed",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
};

/** Longer sentence used on the job detail page header. */
const STATUS_DETAIL_TEXT: Record<SupplierJobStatusKey, string> = {
  new: "New offer — view details, then accept or reject",
  accepted: "Accepted — confirm to proceed",
  changes_pending: "The office edited this job — review and approve or reject",
  confirmed: "Confirmed",
  completed: "Completed",
  rejected: "You rejected this job",
  withdrawn: "Offer withdrawn — assigned to another supplier",
  cancelled: "Cancelled",
};

export function statusLabel(job: JobAllocationOfferView): string {
  return STATUS_LABEL[jobStatusKey(job)];
}

export function statusDetailText(job: JobAllocationOfferView): string {
  return STATUS_DETAIL_TEXT[jobStatusKey(job)];
}

export const STATUS_BADGE_STYLE: Record<SupplierJobStatusKey, string> = {
  new: "bg-blue-50 text-blue-700",
  accepted: "bg-amber-50 text-amber-700",
  changes_pending: "bg-orange-50 text-orange-700",
  confirmed: "bg-primary-50 text-primary-700",
  completed: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  withdrawn: "bg-slate-100 text-slate-500",
  cancelled: "bg-slate-100 text-slate-500",
};

export function statusBadgeStyle(job: JobAllocationOfferView): string {
  return STATUS_BADGE_STYLE[jobStatusKey(job)];
}

export function isNewOffer(job: JobAllocationOfferView): boolean {
  return job.offer_status === "sent";
}

export function isActiveJob(job: JobAllocationOfferView): boolean {
  if (job.allocation_status === "pending_reapproval") return true;
  return job.offer_status === "accepted" && (job.allocation_status === "accepted_by_supplier" || job.allocation_status === "confirmed");
}

export function isClosed(job: JobAllocationOfferView): boolean {
  return job.allocation_status === "completed" || job.offer_status === "rejected" || job.offer_status === "withdrawn";
}
