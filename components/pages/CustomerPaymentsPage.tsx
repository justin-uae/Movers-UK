"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { CustomerPaymentsDiagram } from "@/components/ui/guide-diagrams/CustomerPaymentsDiagram";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { SendEmailButton } from "@/components/ui/SendEmailButton";
import { createClient } from "@/lib/supabase/client";
import { recordCustomerPaymentAction, verifyBankTransferAction, processRefundAction } from "@/app/(staff)/quotes/actions";
import { amountDueNow } from "@/lib/quoteMoney";
import { formatDateTime } from "@/lib/formatDate";
import type { QuoteStatus, CustomerPaymentMethod, RefundStatus } from "@/lib/supabase/database.types";

export interface PaymentRow {
  id: string;
  amount: number;
  method: CustomerPaymentMethod;
  paid_at: string;
  proof_storage_path: string | null;
  verification_status: "pending" | "verified";
}

export interface CustomerRefundRow {
  id: string;
  quote_id: string;
  amount: number;
  currency: string;
  reason: string | null;
  status: RefundStatus;
  created_at: string;
  processed_at: string | null;
  quotes: { quote_number: string; customers: { company_name: string | null; contact_name: string } | null } | null;
  requested_by_profile: { full_name: string } | null;
  processed_by_profile: { full_name: string } | null;
}

export interface AcceptedQuoteRow {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  decided_at: string | null;
  invoice_number: string | null;
  invoiced_at: string | null;
  customers: { company_name: string | null; contact_name: string; phone: string | null; email: string | null } | null;
  enquiries: { enquiry_legs: { pickup_address: string; destination_address: string; pickup_date: string | null }[] } | null;
  quote_versions: { selling_price: number; deposit_percentage: number | null } | null;
  customer_payments: PaymentRow[] | null;
}

function money(amount: number | undefined, currency: string) {
  if (amount === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export type CustomerPaymentsSortKey = "decided_desc" | "decided_asc" | "pickup_asc" | "pickup_desc" | "value_desc" | "value_asc";

const SORT_OPTIONS: { value: CustomerPaymentsSortKey; label: string }[] = [
  { value: "decided_desc", label: "Newest accepted" },
  { value: "decided_asc", label: "Oldest accepted" },
  { value: "pickup_asc", label: "Travel date: soonest" },
  { value: "pickup_desc", label: "Travel date: latest" },
  { value: "value_desc", label: "Highest value" },
  { value: "value_asc", label: "Lowest value" },
];

function time(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

function sortQuotes(rows: AcceptedQuoteRow[], sort: CustomerPaymentsSortKey): AcceptedQuoteRow[] {
  const pickupOf = (q: AcceptedQuoteRow) => q.enquiries?.enquiry_legs?.[0]?.pickup_date ?? null;
  const valueOf = (q: AcceptedQuoteRow) => q.quote_versions?.selling_price ?? null;
  const sorted = rows.slice();
  switch (sort) {
    case "decided_asc":
      sorted.sort((a, b) => time(a.decided_at) - time(b.decided_at));
      break;
    case "pickup_asc":
      sorted.sort((a, b) => (pickupOf(a) ? time(pickupOf(a)) : Infinity) - (pickupOf(b) ? time(pickupOf(b)) : Infinity));
      break;
    case "pickup_desc":
      sorted.sort((a, b) => (pickupOf(b) ? time(pickupOf(b)) : -Infinity) - (pickupOf(a) ? time(pickupOf(a)) : -Infinity));
      break;
    case "value_desc":
      sorted.sort((a, b) => (valueOf(b) ?? -Infinity) - (valueOf(a) ?? -Infinity));
      break;
    case "value_asc":
      sorted.sort((a, b) => (valueOf(a) ?? Infinity) - (valueOf(b) ?? Infinity));
      break;
    case "decided_desc":
    default:
      sorted.sort((a, b) => time(b.decided_at) - time(a.decided_at));
  }
  return sorted;
}

export function CustomerPaymentsPage({
  quotes,
  refunds,
  proofUrls,
  currentUserId,
  canVerify,
  canProcessRefunds,
}: {
  quotes: AcceptedQuoteRow[];
  refunds: CustomerRefundRow[];
  proofUrls: Record<string, string | null>;
  currentUserId: string;
  canVerify: boolean;
  canProcessRefunds: boolean;
}) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [refundPending, startRefundTransition] = useTransition();
  const [processingRefundId, setProcessingRefundId] = useState<string | null>(null);
  const [confirmRefund, setConfirmRefund] = useState<CustomerRefundRow | null>(null);
  const [tab, setTab] = useState<"awaiting" | "verify" | "paid" | "refunds">("awaiting");
  const [sort, setSort] = useState<CustomerPaymentsSortKey>("decided_desc");
  const [target, setTarget] = useState<AcceptedQuoteRow | null>(null);
  const [amount, setAmount] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalWarning, setModalWarning] = useState<string | null>(null);

  const awaiting = useMemo(() => quotes.filter((q) => q.status === "accepted" || q.status === "partially_paid"), [quotes]);
  const paid = useMemo(() => quotes.filter((q) => q.status === "paid"), [quotes]);
  const pendingPayments = useMemo(
    () =>
      quotes.flatMap((q) =>
        (q.customer_payments ?? [])
          .filter((p) => p.method === "bank_transfer" && p.verification_status === "pending")
          .map((p) => ({ quote: q, payment: p })),
      ),
    [quotes],
  );
  const visible = useMemo(() => sortQuotes(tab === "awaiting" ? awaiting : tab === "paid" ? paid : [], sort), [tab, awaiting, paid, sort]);
  const pendingRefunds = useMemo(() => refunds.filter((r) => r.status === "pending"), [refunds]);

  function processRefund() {
    if (!confirmRefund) return;
    setProcessingRefundId(confirmRefund.id);
    startRefundTransition(async () => {
      const result = await processRefundAction(confirmRefund.id);
      if (result?.error) {
        notify(result.error);
        setProcessingRefundId(null);
        return;
      }
      notify("Refund marked as processed");
      setProcessingRefundId(null);
      setConfirmRefund(null);
      router.refresh();
    });
  }

  function verifiedAmount(q: AcceptedQuoteRow) {
    return (q.customer_payments ?? [])
      .filter((p) => p.verification_status === "verified")
      .reduce((sum, p) => sum + Number(p.amount), 0);
  }

  function balanceOf(q: AcceptedQuoteRow) {
    if (!q.quote_versions) return 0;
    return amountDueNow(q.quote_versions, verifiedAmount(q));
  }

  function verify(paymentId: string) {
    setVerifyingId(paymentId);
    startTransition(async () => {
      const result = await verifyBankTransferAction(paymentId);
      if (result?.error) {
        notify(result.error);
        setVerifyingId(null);
        return;
      }
      notify(
        result.status === "paid"
          ? "Verified — quote marked as paid, invoice generated and job sent to Confirmed Booking"
          : "Payment verified",
      );
      setVerifyingId(null);
      router.refresh();
    });
  }

  function open(q: AcceptedQuoteRow) {
    setTarget(q);
    setAmount(String(balanceOf(q)));
    setProofFile(null);
    setModalError(null);
    setModalWarning(null);
  }

  function confirm() {
    if (!target) return;
    if (!proofFile) {
      setModalError("Attach proof of payment before recording it.");
      return;
    }
    const amountNum = Number(amount);
    if (amount.trim() === "" || Number.isNaN(amountNum)) {
      setModalError("Enter a valid amount.");
      return;
    }

    // Zero/negative and above-balance amounts are allowed, but only after an
    // explicit second confirmation — the warning banner stays up and the
    // button re-labels to "Record anyway" until the user presses again with
    // the same amount, matching PAY-01/PAY-02's warn-then-allow rule.
    if (!modalWarning) {
      const fullRemaining = Math.max(
        0,
        Math.round(((target.quote_versions?.selling_price ?? 0) - verifiedAmount(target)) * 100) / 100,
      );
      if (amountNum <= 0) {
        setModalWarning("This amount is zero or negative. Press Record Payment again to save it anyway.");
        return;
      }
      if (amountNum > fullRemaining) {
        setModalWarning(
          `This amount is more than the outstanding balance (${money(fullRemaining, target.currency)}). Press Record Payment again to save it anyway.`,
        );
        return;
      }
    }

    setModalError(null);
    startTransition(async () => {
      const supabase = createClient();
      const path = `${currentUserId}/${crypto.randomUUID()}-${proofFile.name}`;
      const { error: uploadError } = await supabase.storage.from("customer-payment-proofs").upload(path, proofFile);
      if (uploadError) {
        setModalError(uploadError.message);
        notify(uploadError.message);
        return;
      }

      const result = await recordCustomerPaymentAction(target.id, {
        amount: amountNum,
        currency: target.currency,
        proofStoragePath: path,
        proofFileName: proofFile.name,
        confirmedOverride: !!modalWarning,
      });
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
        return;
      }
      notify(
        result.pendingVerification
          ? "Payment recorded — awaiting Finance verification before it counts toward the balance"
          : result.status === "paid"
            ? "Marked as paid — invoice generated and job sent to Confirmed Booking"
            : "Payment recorded — balance still outstanding",
      );
      setTarget(null);
      router.refresh();
    });
  }

  const targetBalance = target ? balanceOf(target) : 0;

  return (
    <div>
      <PageHead
        eyebrow="Accounting"
        title="Customer Payments"
        text="Quotes the customer has accepted — record deposits, balances and full payments as bank transfers arrive."
        action={
          <PageGuide
            title="Customer Payments"
            subtitle="Record every deposit and balance as a customer's bank transfer arrives."
            screenshot={<CustomerPaymentsDiagram />}
            sections={[
              {
                heading: "What this page is",
                body: [
                  "Every quote the customer has accepted lands here, waiting on payment. Recording a payment that covers the full balance marks the quote Paid, generates the invoice, and sends the job on to Dispatch — all in one action.",
                ],
              },
              {
                heading: "The three tabs",
                bullets: true,
                body: [
                  "Awaiting Payment — accepted quotes with a balance still outstanding.",
                  "Pending Verification — bank transfers a rep has logged that a Finance role still needs to verify before they count toward the balance.",
                  "Paid — quotes fully settled.",
                  "Refunds — every refund owed back to a customer from a cancelled booking, tenant-wide. Mark processed once the money has actually gone out.",
                ],
              },
              {
                heading: "Recording a payment",
                body: [
                  "Record Payment (or Mark as Paid once it's the final amount) opens a form for the amount and proof of payment — proof is always required. Partial amounts are fine; the remaining balance stays open for next time.",
                ],
              },
            ]}
          />
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {(["awaiting", "verify", "paid", "refunds"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "rounded-xl px-3 py-2 text-sm font-bold " +
                (tab === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600")
              }
            >
              {t === "awaiting"
                ? `Awaiting Payment (${awaiting.length})`
                : t === "verify"
                  ? `Pending Verification (${pendingPayments.length})`
                  : t === "paid"
                    ? `Paid (${paid.length})`
                    : `Refunds (${pendingRefunds.length})`}
            </button>
          ))}
        </div>
        {(tab === "awaiting" || tab === "paid") && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as CustomerPaymentsSortKey)}
            className="rounded-xl border bg-slate-50 px-3 py-2 text-sm font-semibold"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {tab === "refunds" ? (
        <Panel>
          <div className="space-y-3">
            {refunds.map((r) => (
              <div key={r.id} className="rounded-2xl border p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b className="text-primary-600">{r.quotes?.quote_number ?? "—"}</b>
                    <div className="font-semibold">
                      {r.quotes?.customers?.company_name || r.quotes?.customers?.contact_name || "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black">{money(r.amount, r.currency)}</div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${
                        r.status === "processed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                </div>
                {r.reason && <p className="mt-2 text-slate-600">{r.reason}</p>}
                <p className="mt-2 text-xs text-slate-400">
                  Requested by {r.requested_by_profile?.full_name ?? "Staff"} · {formatDateTime(r.created_at)}
                </p>
                {r.status === "processed" && r.processed_at && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    Marked processed by {r.processed_by_profile?.full_name ?? "Finance"} · {formatDateTime(r.processed_at)}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  {r.status === "pending" && canProcessRefunds && (
                    <button
                      disabled={refundPending && processingRefundId === r.id}
                      onClick={() => setConfirmRefund(r)}
                      className="ml-auto rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {refundPending && processingRefundId === r.id ? "Marking…" : "Mark processed"}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {refunds.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No customer refunds recorded yet.</p>}
          </div>
        </Panel>
      ) : tab === "verify" ? (
        <Panel>
          <div className="space-y-3">
            {pendingPayments.map(({ quote: q, payment: p }) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
                <div>
                  <b className="text-primary-600">{q.quote_number}</b>
                  <div className="text-sm font-semibold">
                    {q.customers?.company_name || q.customers?.contact_name || "—"}
                  </div>
                  <div className="mt-1 text-sm">
                    Bank transfer · {money(p.amount, q.currency)} · {formatDateTime(p.paid_at)}
                  </div>
                  {proofUrls[p.id] && (
                    <a href={proofUrls[p.id] ?? undefined} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600">
                      View proof
                    </a>
                  )}
                </div>
                {canVerify ? (
                  <button
                    disabled={pending && verifyingId === p.id}
                    onClick={() => verify(p.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {pending && verifyingId === p.id ? "Verifying…" : "Verify"}
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-amber-600">Awaiting Finance verification</span>
                )}
              </div>
            ))}
            {pendingPayments.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">No bank transfers awaiting verification.</p>
            )}
          </div>
        </Panel>
      ) : (
      <Panel>
        <div className="space-y-3">
          {visible.map((q) => {
            const leg = q.enquiries?.enquiry_legs?.[0];
            const customer = q.customers;
            const balance = balanceOf(q);
            const paidSoFar = verifiedAmount(q);
            return (
              <div key={q.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b className="text-primary-600">{q.quote_number}</b>
                    {q.invoice_number && <span className="ml-2 text-xs text-slate-400">Inv {q.invoice_number}</span>}
                    <div className="text-sm font-semibold">{customer?.company_name || customer?.contact_name || "—"}</div>
                  </div>
                  <div className="text-right">
                    <span className="font-black">{money(q.quote_versions?.selling_price, q.currency)}</span>
                    {q.status === "partially_paid" && (
                      <div className="text-xs font-semibold text-amber-600">
                        {money(paidSoFar, q.currency)} paid · {money(balance, q.currency)} remaining
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {leg ? `${leg.pickup_address} → ${leg.destination_address}` : "—"}
                </div>
                {(q.customer_payments ?? []).length > 0 && (
                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    {(q.customer_payments ?? []).map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="capitalize">
                          {p.method.replace("_", " ")} · {money(p.amount, q.currency)} · {formatDateTime(p.paid_at)}
                          {p.verification_status === "pending" && (
                            <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold normal-case text-amber-700">
                              Pending verification
                            </span>
                          )}
                        </span>
                        {proofUrls[p.id] && (
                          <a href={proofUrls[p.id] ?? undefined} target="_blank" rel="noreferrer" className="font-bold text-primary-600">
                            View proof
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <SendEmailButton email={q.customers?.email} quoteNumber={q.quote_number} variant="row" />
                  {(q.status === "accepted" || q.status === "partially_paid") && (
                    <button
                      disabled={pending}
                      onClick={() => open(q)}
                      className="ml-auto rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {balance < (q.quote_versions?.selling_price ?? 0) ? "Record Payment" : "Mark as Paid"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              {tab === "awaiting" ? "No quotes awaiting payment." : "No paid quotes yet."}
            </p>
          )}
        </div>
      </Panel>
      )}

      {target && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setTarget(null)}
          title="Record a customer payment"
          description="Confirms a bank transfer has arrived — attach proof of payment to record it. If the amount covers the full outstanding balance, the quote is marked paid, an invoice is generated and the job is sent to dispatch."
          pending={pending}
          error={modalError}
          details={[
            { label: "Quote", value: target.quote_number },
            { label: "Customer", value: target.customers?.company_name || target.customers?.contact_name || "—" },
            { label: "Outstanding balance", value: money(targetBalance, target.currency) },
          ]}
          confirmLabel={modalWarning ? "Record anyway" : "Record payment"}
          onConfirm={confirm}
        >
          {modalWarning && (
            <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">{modalWarning}</div>
          )}
          <label className="block text-sm font-bold">
            Amount received
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setModalWarning(null);
              }}
              className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
            />
          </label>
          <label className="mt-3 block text-sm font-bold">
            Proof of payment (required)
            <input
              type="file"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-xs font-normal"
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
            { label: "Quote", value: confirmRefund.quotes?.quote_number ?? "—" },
            {
              label: "Customer",
              value: confirmRefund.quotes?.customers?.company_name || confirmRefund.quotes?.customers?.contact_name || "—",
            },
            { label: "Amount", value: money(confirmRefund.amount, confirmRefund.currency) },
            { label: "Reason", value: confirmRefund.reason ?? "—" },
          ]}
          pending={refundPending}
          confirmLabel="Mark processed"
          onConfirm={processRefund}
        />
      )}
    </div>
  );
}
