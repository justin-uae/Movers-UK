"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { JourneyLegDetail } from "@/components/pages/JourneyLegDetail";
import { InvoiceUploadForm } from "@/app/supplier/dashboard/InvoiceUploadForm";
import {
  acceptJobAllocationOfferAction,
  rejectJobAllocationOfferAction,
  confirmAllocationAction,
  completeAllocationAction,
  approveAmendedAllocationAction,
  rejectAmendedAllocationAction,
} from "@/app/supplier/dashboard/actions";
import { statusDetailText } from "@/lib/supplierJobStatus";
import { formatDateAndTime, formatDateTime } from "@/lib/formatDate";
import type { JobAllocationOfferView, JobSupplierInvoice, SupplierPaymentStatus } from "@/lib/supabase/database.types";
import type { RouteDistance } from "@/lib/tripDistance";

const PAYMENT_STATUS_STYLE: Record<SupplierPaymentStatus, string> = {
  unpaid: "bg-blue-50 text-blue-700",
  partially_paid: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
};

const PAYMENT_STATUS_LABEL: Record<SupplierPaymentStatus, string> = {
  unpaid: "Invoice submitted — awaiting payment",
  partially_paid: "Partially paid",
  paid: "Paid in full",
};

function money(amount: number | null, currency: string) {
  if (amount == null) return null;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

/**
 * Full-page equivalent of the staff-side job/quote/supplier detail pages —
 * a supplier reaches this via "View Details" from their job list, reads the
 * route/rate here, and takes whichever action applies (accept/reject,
 * confirm, complete, invoice) from this same page rather than a list-row
 * button, so nothing is actioned without having actually opened the detail.
 */
export function SupplierJobDetail({
  job,
  legDistances,
  invoice,
  invoiceUrl,
  supplierId,
  pendingAmendment,
  payments,
  adjustments,
  refunds,
}: {
  job: JobAllocationOfferView;
  /** Stop-by-stop route distance per leg, index-aligned with `job.legs`. */
  legDistances: RouteDistance[];
  invoice: JobSupplierInvoice | null;
  invoiceUrl: string | null;
  supplierId: string;
  pendingAmendment: { reason: string; changes: Record<string, { from: unknown; to: unknown }> } | null;
  payments: { id: string; amount: number; bank_reference: string | null; paid_at: string }[];
  adjustments: { id: string; amount: number; reason: string | null; created_at: string }[];
  refunds: { id: string; amount: number; bank_reference: string | null; received_at: string }[];
}) {
  const notify = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<"accept" | "reject" | "confirm" | "complete" | "approveChanges" | "rejectChanges" | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  function closeModal() {
    setModal(null);
    setModalError(null);
    setRejectReason("");
  }

  function accept() {
    setModalError(null);
    startTransition(async () => {
      try {
        await acceptJobAllocationOfferAction(job.job_allocation_id);
        closeModal();
        notify("Accepted — please confirm to proceed");
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not accept this job.");
      }
    });
  }

  function reject() {
    if (!rejectReason.trim()) {
      setModalError("Please give a reason for rejecting this job.");
      return;
    }
    setModalError(null);
    startTransition(async () => {
      try {
        await rejectJobAllocationOfferAction(job.job_allocation_id, rejectReason);
        closeModal();
        notify("Job rejected");
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not reject this job.");
      }
    });
  }

  function approveChanges() {
    setModalError(null);
    startTransition(async () => {
      try {
        await approveAmendedAllocationAction(job.job_allocation_id);
        closeModal();
        notify("Changes approved — the job carries on as before");
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not approve these changes.");
      }
    });
  }

  function rejectChanges() {
    if (!rejectReason.trim()) {
      setModalError("Please give a reason for rejecting this job.");
      return;
    }
    setModalError(null);
    startTransition(async () => {
      try {
        await rejectAmendedAllocationAction(job.job_allocation_id, rejectReason);
        closeModal();
        notify("Job rejected — it's been taken off your schedule");
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not reject this job.");
      }
    });
  }

  function confirm() {
    setModalError(null);
    startTransition(async () => {
      try {
        await confirmAllocationAction(job.job_allocation_id);
        closeModal();
        notify("Job confirmed");
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not confirm this job.");
      }
    });
  }

  function complete() {
    setModalError(null);
    startTransition(async () => {
      try {
        await completeAllocationAction(job.job_allocation_id);
        closeModal();
        notify("Job marked as completed");
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not complete this job.");
      }
    });
  }

  const rate = money(job.agreed_cost, job.quote_currency);
  const journeyDetails = [
    { label: "Region", value: job.region ?? "—" },
    { label: "Date & time", value: job.pickup_date ? formatDateAndTime(job.pickup_date, job.pickup_time) : "TBC" },
    { label: "Passengers", value: job.passenger_count ?? "—" },
    ...(rate ? [{ label: "Your rate", value: rate }] : []),
  ];

  return (
    <div>
      <PageHead
        eyebrow="Supplier Portal"
        title={job.region ?? "Job details"}
        text={statusDetailText(job)}
        action={
          <Link href="/supplier/dashboard" className="flex items-center gap-2 text-sm font-bold text-slate-500">
            <ArrowLeft size={16} />
            Back to dashboard
          </Link>
        }
      />

      {job.allocation_status === "pending_reapproval" && (
        <div className="mb-5 rounded-3xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 rounded-full bg-orange-100 p-2 text-orange-700">
              <AlertTriangle size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="font-black text-orange-900">This job has changed</h3>
              <p className="mt-1 text-sm text-orange-800">
                You already accepted this job, but the office has since edited it. Review what changed below, then
                approve to carry on as before, or reject to take it off your schedule (you'll be asked for a reason).
              </p>
              {pendingAmendment && (
                <div className="mt-3 rounded-xl bg-white/70 p-3 text-sm">
                  <p className="font-bold text-slate-700">Reason given: {pendingAmendment.reason}</p>
                  {Object.entries(pendingAmendment.changes).filter(([key]) => key !== "selling_price").length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                      {Object.entries(pendingAmendment.changes)
                        .filter(([key]) => key !== "selling_price")
                        .map(([key, { from, to }]) => (
                          <li key={key}>
                            <span className="capitalize">{key.replaceAll("_", " ")}</span>: {String(from ?? "—")} →{" "}
                            <b className="text-slate-800">{String(to ?? "—")}</b>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setModal("approveChanges")}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white"
                >
                  Approve changes
                </button>
                <button
                  onClick={() => setModal("rejectChanges")}
                  className="rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-bold text-red-600"
                >
                  Reject job
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Panel>
        <SectionTitle
          title="Journey"
          sub={job.legs && job.legs.length > 1 ? "Every leg of this multi-day booking" : "Pickup, destination and passenger details"}
        />
        {job.legs && job.legs.length > 0 ? (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
            {job.legs.map((leg, i) => (
              <JourneyLegDetail key={i} leg={leg} index={i} total={job.legs!.length} distance={legDistances[i]} />
            ))}
          </div>
        ) : (
          <dl className="mt-4 flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
            <div className="sm:col-span-2">
              <dt className="text-xs font-bold uppercase text-slate-400">Pickup</dt>
              <dd className="mt-0.5 font-semibold">{job.pickup_address ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-bold uppercase text-slate-400">Destination</dt>
              <dd className="mt-0.5 font-semibold">{job.destination_address ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase text-slate-400">Date &amp; time</dt>
              <dd className="mt-0.5 font-semibold">{job.pickup_date ? formatDateAndTime(job.pickup_date, job.pickup_time) : "TBC"}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase text-slate-400">Passengers</dt>
              <dd className="mt-0.5 font-semibold">{job.passenger_count ?? "—"}</dd>
            </div>
          </dl>
        )}
        {(rate || job.customer_name || job.customer_phone) && (
          <dl className="mt-3 flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
            {rate && (
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Your rate</dt>
                <dd className="mt-0.5 text-base font-black text-primary-600">{rate}</dd>
              </div>
            )}
            {job.customer_name && (
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Customer</dt>
                <dd className="mt-0.5 font-semibold">{job.customer_name}</dd>
              </div>
            )}
            {job.customer_phone && (
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Phone</dt>
                <dd className="mt-0.5 flex items-center gap-2 font-semibold">
                  {job.customer_phone}
                  <WhatsAppLink number={job.customer_phone} />
                </dd>
              </div>
            )}
          </dl>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {job.offer_status === "sent" && (
            <>
              <button
                onClick={() => setModal("accept")}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white"
              >
                Accept job
              </button>
              <button
                onClick={() => setModal("reject")}
                className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-bold text-red-600"
              >
                Reject
              </button>
            </>
          )}
          {job.offer_status === "accepted" && job.allocation_status === "accepted_by_supplier" && (
            <button onClick={() => setModal("confirm")} className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white">
              Confirm this job
            </button>
          )}
          {job.allocation_status === "confirmed" && job.supplier_payment_status === "paid" && (
            <button onClick={() => setModal("complete")} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white">
              Mark Completed
            </button>
          )}
        </div>
      </Panel>

      <ConfirmDetailModal
        open={modal === "accept"}
        onClose={closeModal}
        title="Accept this job?"
        description="You're committing to carry out this journey — the office will be notified."
        details={journeyDetails}
        pending={pending}
        error={modalError}
        confirmLabel="Accept job"
        onConfirm={accept}
      />

      <ConfirmDetailModal
        open={modal === "reject"}
        onClose={closeModal}
        title="Reject this job offer?"
        description="This offer will go back to the office so they can send it to another supplier."
        details={journeyDetails}
        pending={pending}
        error={modalError}
        destructive
        confirmLabel="Reject offer"
        onConfirm={reject}
      >
        <label className="block text-xs font-bold uppercase text-slate-400" htmlFor="reject-reason">
          Reason for rejecting
        </label>
        <textarea
          id="reject-reason"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          placeholder="e.g. Not available on this date, vehicle already booked…"
          className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"
        />
      </ConfirmDetailModal>

      <ConfirmDetailModal
        open={modal === "confirm"}
        onClose={closeModal}
        title="Confirm this job?"
        description="Confirm once you're set to carry out this journey as scheduled."
        details={journeyDetails}
        pending={pending}
        error={modalError}
        confirmLabel="Confirm job"
        onConfirm={confirm}
      />

      <ConfirmDetailModal
        open={modal === "complete"}
        onClose={closeModal}
        title="Mark this job as completed?"
        description="Your invoice for this job has been settled — mark it completed to close it out."
        details={journeyDetails}
        pending={pending}
        error={modalError}
        confirmLabel="Mark completed"
        onConfirm={complete}
      />

      <ConfirmDetailModal
        open={modal === "approveChanges"}
        onClose={closeModal}
        title="Approve these changes?"
        description="The job carries on exactly as it already would have — nothing else changes."
        details={journeyDetails}
        pending={pending}
        error={modalError}
        confirmLabel="Approve changes"
        onConfirm={approveChanges}
      />

      <ConfirmDetailModal
        open={modal === "rejectChanges"}
        onClose={closeModal}
        title="Reject this job?"
        description="It's taken off your schedule entirely and goes back to the office to offer to another supplier."
        details={journeyDetails}
        pending={pending}
        error={modalError}
        destructive
        confirmLabel="Reject job"
        onConfirm={rejectChanges}
      >
        <label className="block text-xs font-bold uppercase text-slate-400" htmlFor="reject-changes-reason">
          Reason for rejecting
        </label>
        <textarea
          id="reject-changes-reason"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          placeholder="e.g. Can no longer accommodate the new pickup time…"
          className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"
        />
      </ConfirmDetailModal>

      {job.allocation_status === "completed" && (job.manual_invoice_note || job.manual_invoice_url) && (
        <div className="mt-5">
          <Panel>
            <SectionTitle title="Payment reference from admin" />
            <div className="mt-3 text-sm">
              {job.manual_invoice_note && <p>{job.manual_invoice_note}</p>}
              {job.manual_invoice_url && (
                <a href={job.manual_invoice_url} target="_blank" rel="noreferrer" className="mt-1 block font-bold text-primary-600">
                  View invoice
                </a>
              )}
            </div>
          </Panel>
        </div>
      )}

      {(job.allocation_status === "confirmed" ||
        job.allocation_status === "completed" ||
        payments.length > 0 ||
        adjustments.length > 0 ||
        refunds.length > 0) && (
        <div className="mt-5">
          <Panel>
            <SectionTitle title="Invoice" />
            {invoice?.status === "forwarded_to_accounting" ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
                  <div>
                    <b>
                      {invoice.currency} {invoice.amount.toFixed(2)}
                    </b>
                    <div className="text-xs text-slate-400">{invoice.file_name}</div>
                  </div>
                  {invoiceUrl && (
                    <a href={invoiceUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600">
                      View invoice
                    </a>
                  )}
                </div>
                <div className={`rounded-xl px-4 py-3 text-sm font-bold ${PAYMENT_STATUS_STYLE[job.supplier_payment_status]}`}>
                  {PAYMENT_STATUS_LABEL[job.supplier_payment_status]}
                </div>
              </div>
            ) : (
              <InvoiceUploadForm
                allocationId={job.job_allocation_id}
                supplierId={supplierId}
                invoice={invoice}
                prefillAmount={job.agreed_cost}
                prefillCurrency={job.quote_currency}
              />
            )}

            {(payments.length > 0 || adjustments.length > 0 || refunds.length > 0) && (
              <div className="mt-4 space-y-1.5 border-t pt-4 text-xs text-slate-500">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Payment history</div>
                {payments.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span>
                      Paid {money(p.amount, job.quote_currency)} · {formatDateTime(p.paid_at)}
                      {p.bank_reference && ` · ${p.bank_reference}`}
                    </span>
                  </div>
                ))}
                {adjustments.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span>{a.reason ?? "Adjustment"} · {formatDateTime(a.created_at)}</span>
                    <b className={a.amount < 0 ? "text-red-600" : "text-slate-700"}>
                      {a.amount > 0 ? "+" : ""}
                      {money(a.amount, job.quote_currency)}
                    </b>
                  </div>
                ))}
                {refunds.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span>
                      Refund sent {money(r.amount, job.quote_currency)} · {formatDateTime(r.received_at)}
                      {r.bank_reference && ` · ${r.bank_reference}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
