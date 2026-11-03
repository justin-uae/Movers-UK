"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import {
  resendQuoteEmailAction,
  resendQuoteWhatsAppAction,
  resendInvoiceEmailAction,
  cancelBookingAction,
  processRefundAction,
} from "@/app/(staff)/quotes/actions";
import { EditBookingButton, type EditableLeg } from "@/components/pages/EditBookingButton";
import { formatDateTime } from "@/lib/formatDate";
import type { QuoteStatus, JobStatus, Refund } from "@/lib/supabase/database.types";

export interface QuoteRefund extends Refund {
  requested_by_profile: { full_name: string } | null;
  processed_by_profile: { full_name: string } | null;
}

const REFUND_STATUS_STYLE: Record<Refund["status"], string> = {
  pending: "bg-amber-50 text-amber-700",
  processed: "bg-emerald-50 text-emerald-700",
};

interface QuoteSummary {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  public_token: string;
  invoice_number: string | null;
  customerLabel: string;
  sellingPrice: number | null;
}

export type AmendableLeg = EditableLeg;

function money(amount: number | null, currency: string) {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

const EMAILABLE: QuoteStatus[] = ["sent", "viewed", "accepted", "partially_paid", "paid"];
const CANCELLABLE: QuoteStatus[] = ["accepted", "partially_paid", "paid"];
// Dead-end statuses — the quote itself can't go any further, but the
// underlying enquiry is still perfectly requotable (e.g. rejected as "too
// expensive" just needs a fresh, cheaper quote against the same journey).
const REQUOTABLE: QuoteStatus[] = ["rejected", "expired", "cancelled"];

/**
 * Marking a quote as paid now happens exclusively on the Customer Payments
 * page (it requires an attached proof of payment) — this component only
 * offers the non-mutating link-copy actions plus resending the quote email,
 * plus (OPS-01) cancelling an already-confirmed booking and, for Finance,
 * marking any resulting refund as processed.
 */
export function QuoteDetailActions({
  quote,
  canCancel,
  canProcessRefunds,
  canAmend,
  canCreateQuote,
  enquiryId,
  legs,
  jobStatus,
  refunds,
}: {
  quote: QuoteSummary;
  canCancel: boolean;
  canProcessRefunds: boolean;
  canAmend: boolean;
  canCreateQuote: boolean;
  enquiryId: string | null;
  legs: AmendableLeg[];
  jobStatus: JobStatus | null;
  refunds: QuoteRefund[];
}) {
  const notify = useToast();
  const [resendOpen, setResendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmRefund, setConfirmRefund] = useState<QuoteRefund | null>(null);
  const [pending, startTransition] = useTransition();
  const [refundPending, startRefundTransition] = useTransition();

  function copyLink(label: string) {
    const link = `${window.location.origin}/q/${quote.public_token}`;
    navigator.clipboard.writeText(link).then(() => notify(`${label} link copied`));
  }

  function resendEmail() {
    startTransition(async () => {
      const result = await resendQuoteEmailAction(quote.id);
      notify(result?.error ? `Could not send email: ${result.error}` : "Quote email resent");
    });
  }

  function resendWhatsApp() {
    startTransition(async () => {
      const result = await resendQuoteWhatsAppAction(quote.id);
      notify(result?.error ? `Could not send WhatsApp: ${result.error}` : "Quote resent via WhatsApp");
    });
  }

  function resendInvoice() {
    startTransition(async () => {
      const result = await resendInvoiceEmailAction(quote.id);
      notify(result?.error ? `Could not send invoice: ${result.error}` : "Invoice emailed to the customer");
      setResendOpen(false);
    });
  }

  function cancelBooking() {
    startTransition(async () => {
      const result = await cancelBookingAction(quote.id, cancelReason);
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("Booking cancelled");
      setCancelOpen(false);
      setCancelReason("");
    });
  }

  function processRefund() {
    if (!confirmRefund) return;
    startRefundTransition(async () => {
      const result = await processRefundAction(confirmRefund.id);
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("Refund marked as processed");
      setConfirmRefund(null);
    });
  }

  return (
    <>
      {canCreateQuote && enquiryId && REQUOTABLE.includes(quote.status) && (
        <Link
          href={`/quotes/new?enquiryId=${enquiryId}`}
          className="block w-full rounded-xl bg-primary-500 px-4 py-2.5 text-center text-sm font-bold text-white"
        >
          Create New Quote
        </Link>
      )}
      {quote.status === "paid" && (
        <>
          <a
            href={`/api/quotes/${quote.id}/invoice-pdf`}
            target="_blank"
            rel="noreferrer"
            className="block w-full rounded-xl border px-4 py-2.5 text-center text-sm font-bold"
          >
            Preview Invoice
          </a>
          <a
            href={`/api/quotes/${quote.id}/invoice-pdf?download=1`}
            className="mt-2 block w-full rounded-xl border px-4 py-2.5 text-center text-sm font-bold"
          >
            Download Invoice
          </a>
          <button
            onClick={() => setResendOpen(true)}
            className="mt-2 w-full rounded-xl border px-4 py-2.5 text-sm font-bold"
          >
            Resend Invoice
          </button>
        </>
      )}
      {(quote.status === "sent" || quote.status === "viewed") && (
        <button onClick={() => copyLink("Quote")} className="mt-2 w-full rounded-xl border px-4 py-2.5 text-sm font-bold">
          Copy Link
        </button>
      )}
      {EMAILABLE.includes(quote.status) && (
        <button
          onClick={resendEmail}
          disabled={pending}
          className="mt-2 w-full rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-60"
        >
          {pending ? "Sending…" : "Resend Quote Email"}
        </button>
      )}
      {EMAILABLE.includes(quote.status) && (
        <button
          onClick={resendWhatsApp}
          disabled={pending}
          className="mt-2 w-full rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-60"
        >
          {pending ? "Sending…" : "Resend Quote WhatsApp"}
        </button>
      )}
      <EditBookingButton
        quoteId={quote.id}
        quoteStatus={quote.status}
        jobStatus={jobStatus}
        currency={quote.currency}
        canEdit={canAmend}
        legs={legs}
      />
      {canCancel && CANCELLABLE.includes(quote.status) && (
        <button
          onClick={() => setCancelOpen(true)}
          className="mt-2 w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"
        >
          Cancel Booking
        </button>
      )}

      {refunds.length > 0 && (
        <div className="mt-4 space-y-3 rounded-xl border p-3">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Refunds</div>
          {refunds.map((r) => (
            <div key={r.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{money(r.amount, r.currency)}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${REFUND_STATUS_STYLE[r.status]}`}>
                  {r.status}
                </span>
              </div>
              {r.reason && <p className="mt-1 text-xs text-slate-600">{r.reason}</p>}
              <p className="mt-1 text-xs text-slate-400">
                Requested by {r.requested_by_profile?.full_name ?? "Staff"} · {formatDateTime(r.created_at)}
              </p>
              {r.status === "processed" && r.processed_at && (
                <p className="mt-0.5 text-xs text-slate-400">
                  Marked processed by {r.processed_by_profile?.full_name ?? "Finance"} · {formatDateTime(r.processed_at)}
                </p>
              )}
              {r.status === "pending" && canProcessRefunds && (
                <button
                  onClick={() => setConfirmRefund(r)}
                  disabled={refundPending}
                  className="mt-2 w-full rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  Mark processed
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {cancelOpen && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setCancelOpen(false)}
          title="Cancel this booking?"
          description="The quote and any linked job will be marked cancelled, and any pending supplier offers withdrawn. If money has already been collected, a pending refund will be recorded for Finance."
          details={[
            { label: "Quote", value: quote.quote_number },
            { label: "Customer", value: quote.customerLabel },
            { label: "Value", value: money(quote.sellingPrice, quote.currency) },
          ]}
          pending={pending}
          destructive
          confirmLabel="Cancel booking"
          onConfirm={cancelBooking}
        >
          <label className="block text-sm font-bold">
            Reason
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-2 min-h-20 w-full rounded-xl border px-3 py-2 font-normal"
              placeholder="Why is this booking being cancelled?"
            />
          </label>
        </ConfirmDetailModal>
      )}

      {confirmRefund && (
        <ConfirmDetailModal
          open
          onClose={() => !refundPending && setConfirmRefund(null)}
          title="Mark this refund as processed?"
          description="Confirms the money has actually been sent back to the customer — this cannot be undone."
          details={[
            { label: "Amount", value: money(confirmRefund.amount, confirmRefund.currency) },
            { label: "Reason", value: confirmRefund.reason ?? "—" },
          ]}
          pending={refundPending}
          confirmLabel="Mark processed"
          onConfirm={processRefund}
        />
      )}

      {resendOpen && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setResendOpen(false)}
          title="Resend the invoice?"
          description="This emails the invoice PDF to the customer again."
          details={[
            { label: "Quote", value: quote.quote_number },
            { label: "Customer", value: quote.customerLabel },
            { label: "Value", value: money(quote.sellingPrice, quote.currency) },
            { label: "Invoice", value: quote.invoice_number ?? "—" },
          ]}
          pending={pending}
          confirmLabel="Resend invoice"
          onConfirm={resendInvoice}
        />
      )}
    </>
  );
}
