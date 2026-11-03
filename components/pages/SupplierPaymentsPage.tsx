"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { SupplierPaymentsDiagram } from "@/components/ui/guide-diagrams/SupplierPaymentsDiagram";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatDate } from "@/lib/formatDate";
import { recordSupplierPaymentAction, recordSupplierRefundAction } from "@/app/(staff)/accounting/supplier-payments/actions";
import { downloadCsv } from "@/lib/exportCsv";
import type { SupplierPaymentStatus } from "@/lib/supabase/database.types";

export interface SupplierInvoiceRow {
  id: string;
  job_allocation_id: string;
  amount: number;
  currency: string;
  notes: string | null;
  file_name: string;
  storage_path: string;
  forwarded_at: string | null;
  // Joined via this invoice's OWN supplier_id (set once at submission, never
  // touched again) rather than through job_allocations.assigned_supplier_id
  // — that column goes null once a supplier rejects an edited job
  // (rejectAmendedAllocationAction), which used to make an already-paid,
  // now-rejected job show up here as "Unknown supplier".
  suppliers: { id: string; name: string; phone: string | null; email: string | null } | null;
  job_allocations: {
    id: string;
    status: string;
    supplier_payment_status: SupplierPaymentStatus;
    jobs: { quotes: { quote_number: string; customers: { company_name: string | null; contact_name: string } | null } | null } | null;
    supplier_payments: {
      id: string;
      amount: number;
      bank_reference: string | null;
      notes: string | null;
      paid_at: string;
      proof_storage_path: string | null;
    }[];
    job_allocation_adjustments: { id: string; amount: number; reason: string | null; created_at: string }[];
    supplier_refunds: {
      id: string;
      amount: number;
      bank_reference: string | null;
      notes: string | null;
      received_at: string;
      proof_storage_path: string | null;
    }[];
  } | null;
}

const STATUS_STYLE: Record<SupplierPaymentStatus, string> = {
  unpaid: "bg-slate-100 text-slate-600",
  partially_paid: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function paidSoFar(row: SupplierInvoiceRow) {
  return (row.job_allocations?.supplier_payments ?? []).reduce((sum, p) => sum + p.amount, 0);
}

/** Sum of every post-invoice amendment adjustment (can be negative) — see 0067_booking_amendments.sql. Added on top of the submitted invoice amount rather than editing it, since the invoice is the supplier's own document. */
function totalAdjustments(row: SupplierInvoiceRow) {
  return (row.job_allocations?.job_allocation_adjustments ?? []).reduce((sum, a) => sum + Number(a.amount), 0);
}

/** Money actually received back from the supplier — see 0073_supplier_refunds.sql. Kept separate from adjustments (why the amount owed changed) since this is money that actually moved. */
function refundedSoFar(row: SupplierInvoiceRow) {
  return (row.job_allocations?.supplier_refunds ?? []).reduce((sum, r) => sum + r.amount, 0);
}

/** The invoice amount plus any amendment adjustments — the real amount owed, which a negative adjustment can push below what's already been paid (a refund owed back from the supplier) rather than just toward zero. */
function effectiveAmount(row: SupplierInvoiceRow) {
  return row.amount + totalAdjustments(row);
}

/** What's paid minus what's since been refunded back — the net cash actually sitting with the supplier right now. */
function netPaid(row: SupplierInvoiceRow) {
  return paidSoFar(row) - refundedSoFar(row);
}

/** Positive = still owed to the supplier; negative = a refund is still owed back from them; ~0 = fully settled either way. */
function balance(row: SupplierInvoiceRow) {
  return effectiveAmount(row) - netPaid(row);
}

export type SupplierPaymentsSortKey = "forwarded_desc" | "forwarded_asc" | "amount_desc" | "amount_asc" | "balance_desc" | "balance_asc";

const SORT_OPTIONS: { value: SupplierPaymentsSortKey; label: string }[] = [
  { value: "forwarded_desc", label: "Recently forwarded" },
  { value: "forwarded_asc", label: "Oldest forwarded" },
  { value: "amount_desc", label: "Highest invoice amount" },
  { value: "amount_asc", label: "Lowest invoice amount" },
  { value: "balance_desc", label: "Highest balance owed" },
  { value: "balance_asc", label: "Lowest balance owed" },
];

function time(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

function sortInvoices(rows: SupplierInvoiceRow[], sort: SupplierPaymentsSortKey): SupplierInvoiceRow[] {
  const sorted = rows.slice();
  switch (sort) {
    case "forwarded_asc":
      sorted.sort((a, b) => time(a.forwarded_at) - time(b.forwarded_at));
      break;
    case "amount_desc":
      sorted.sort((a, b) => b.amount - a.amount);
      break;
    case "amount_asc":
      sorted.sort((a, b) => a.amount - b.amount);
      break;
    case "balance_desc":
      sorted.sort((a, b) => Math.abs(balance(b)) - Math.abs(balance(a)));
      break;
    case "balance_asc":
      sorted.sort((a, b) => Math.abs(balance(a)) - Math.abs(balance(b)));
      break;
    case "forwarded_desc":
    default:
      sorted.sort((a, b) => time(b.forwarded_at) - time(a.forwarded_at));
  }
  return sorted;
}

export function SupplierPaymentsPage({
  invoices,
  invoiceUrls,
  proofUrls,
  refundProofUrls,
  currentUserId,
}: {
  invoices: SupplierInvoiceRow[];
  invoiceUrls: Record<string, string | null>;
  proofUrls: Record<string, string | null>;
  refundProofUrls: Record<string, string | null>;
  currentUserId: string;
}) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"outstanding" | "paid">("outstanding");
  const [target, setTarget] = useState<SupplierInvoiceRow | null>(null);
  const [refundTarget, setRefundTarget] = useState<SupplierInvoiceRow | null>(null);
  const [amount, setAmount] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<SupplierPaymentsSortKey>("forwarded_desc");

  // A row counts as outstanding as long as there's a non-zero balance in
  // EITHER direction — still owed to the supplier, or a refund still owed
  // back from them (job_allocations.supplier_payment_status alone can't
  // tell these apart: it only tracks money paid out, not adjustments, so a
  // fully-paid-then-refund-owed row would otherwise stay stuck in Paid
  // History looking settled when it isn't).
  const outstanding = invoices.filter((row) => Math.abs(balance(row)) > 0.01);
  const paidHistory = invoices.filter((row) => Math.abs(balance(row)) <= 0.01);

  const supplierOptions = useMemo(() => {
    const names = new Set(invoices.map((row) => row.suppliers?.name).filter((n): n is string => !!n));
    return [...names].sort();
  }, [invoices]);

  /** Latest payment date on the invoice (Paid History rows always have at
      least one) — used for both display and the date-range filter there. */
  function latestPaymentDate(row: SupplierInvoiceRow): string | null {
    const dates = (row.job_allocations?.supplier_payments ?? []).map((p) => p.paid_at).sort();
    return dates.length > 0 ? dates[dates.length - 1]! : null;
  }

  const filtered = useMemo(() => {
    const base = tab === "outstanding" ? outstanding : paidHistory;
    const q = search.trim().toLowerCase();
    const matched = base.filter((row) => {
      if (supplierFilter && row.suppliers?.name !== supplierFilter) return false;
      if (q) {
        const haystack = [
          row.suppliers?.name,
          row.job_allocations?.jobs?.quotes?.quote_number,
          row.job_allocations?.jobs?.quotes?.customers?.company_name,
          row.job_allocations?.jobs?.quotes?.customers?.contact_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      const relevantDate = tab === "outstanding" ? row.forwarded_at : latestPaymentDate(row);
      if (dateFrom && (!relevantDate || relevantDate < dateFrom)) return false;
      if (dateTo && (!relevantDate || relevantDate > `${dateTo}T23:59:59`)) return false;
      return true;
    });
    return sortInvoices(matched, sort);
  }, [tab, outstanding, paidHistory, search, supplierFilter, dateFrom, dateTo, sort]);

  const visible = filtered;

  function exportVisible() {
    downloadCsv(`supplier-payments-${tab}`, visible, [
      { header: "Supplier", value: (row) => row.suppliers?.name },
      { header: "Quote number", value: (row) => row.job_allocations?.jobs?.quotes?.quote_number },
      {
        header: "Customer",
        value: (row) => row.job_allocations?.jobs?.quotes?.customers?.company_name || row.job_allocations?.jobs?.quotes?.customers?.contact_name,
      },
      { header: "Currency", value: (row) => row.currency },
      { header: "Invoice amount", value: (row) => row.amount },
      { header: "Adjustments", value: (row) => totalAdjustments(row) },
      { header: "Paid so far", value: (row) => paidSoFar(row) },
      { header: "Refunded so far", value: (row) => refundedSoFar(row) },
      { header: "Balance", value: (row) => balance(row) },
      { header: "Status", value: (row) => row.job_allocations?.supplier_payment_status ?? "unpaid" },
      { header: "Forwarded", value: (row) => (row.forwarded_at ? formatDate(row.forwarded_at) : "") },
      { header: "Latest payment date", value: (row) => { const d = latestPaymentDate(row); return d ? formatDate(d) : ""; } },
    ]);
  }

  function open(row: SupplierInvoiceRow) {
    const bal = effectiveAmount(row) - paidSoFar(row);
    setTarget(row);
    setAmount(bal > 0 ? bal.toFixed(2) : "");
    setBankReference("");
    setNotes("");
    setProofFile(null);
    setModalError(null);
  }

  function openRefund(row: SupplierInvoiceRow) {
    const owed = -balance(row);
    setRefundTarget(row);
    setAmount(owed > 0 ? owed.toFixed(2) : "");
    setBankReference("");
    setNotes("");
    setProofFile(null);
    setModalError(null);
  }

  function close() {
    if (pending) return;
    setTarget(null);
    setRefundTarget(null);
  }

  const enteredAmount = Number(amount) || 0;
  const paymentBalance = target ? target.amount - paidSoFar(target) : 0;
  const remainingAfter = paymentBalance - enteredAmount;
  const willFullySettle = enteredAmount > 0 && remainingAfter <= 0;
  const refundOwedAmount = refundTarget ? -balance(refundTarget) : 0;

  function confirm() {
    if (!target) return;
    if (willFullySettle && !proofFile) {
      setModalError("Attach proof of payment before marking this supplier as fully paid.");
      return;
    }
    startTransition(async () => {
      let proofStoragePath: string | null = null;
      let proofFileName: string | null = null;

      if (proofFile) {
        const supabase = createClient();
        const path = `${currentUserId}/${crypto.randomUUID()}-${proofFile.name}`;
        const { error: uploadError } = await supabase.storage.from("supplier-payment-proofs").upload(path, proofFile);
        if (uploadError) {
          setModalError(uploadError.message);
          notify(uploadError.message);
          return;
        }
        proofStoragePath = path;
        proofFileName = proofFile.name;
      }

      const result = await recordSupplierPaymentAction(target.job_allocation_id, {
        amount: enteredAmount,
        currency: target.currency,
        bankReference,
        notes,
        proofStoragePath,
        proofFileName,
      });
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
        return;
      }
      notify(remainingAfter > 0 ? "Partial payment recorded" : "Supplier marked as paid in full");
      setTarget(null);
      router.refresh();
    });
  }

  function confirmRefund() {
    if (!refundTarget) return;
    startTransition(async () => {
      let proofStoragePath: string | null = null;
      let proofFileName: string | null = null;

      if (proofFile) {
        const supabase = createClient();
        const path = `${currentUserId}/${crypto.randomUUID()}-${proofFile.name}`;
        const { error: uploadError } = await supabase.storage.from("supplier-refund-proofs").upload(path, proofFile);
        if (uploadError) {
          setModalError(uploadError.message);
          notify(uploadError.message);
          return;
        }
        proofStoragePath = path;
        proofFileName = proofFile.name;
      }

      const result = await recordSupplierRefundAction(refundTarget.job_allocation_id, {
        amount: enteredAmount,
        currency: refundTarget.currency,
        bankReference,
        notes,
        proofStoragePath,
        proofFileName,
      });
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
        return;
      }
      notify("Refund recorded");
      setRefundTarget(null);
      router.refresh();
    });
  }

  return (
    <div>
      <PageHead
        eyebrow="Accounting"
        title="Supplier Payments"
        text="Invoices forwarded from Dispatch — pay the supplier by bank transfer outside the system, then record it here (partial payments supported)."
        action={
          <PageGuide
            title="Supplier Payments"
            subtitle="Invoices forwarded from Dispatch — log what you pay suppliers outside the system."
            screenshot={<SupplierPaymentsDiagram />}
            sections={[
              {
                heading: "What this page is",
                body: [
                  "Once a job is confirmed, Dispatch forwards the supplier's invoice here automatically — there's nothing to upload from this page. Pay the supplier by bank transfer outside the CRM, then record that payment here so the balance stays accurate.",
                ],
              },
              {
                heading: "Outstanding vs. Paid History",
                bullets: true,
                body: [
                  "Outstanding — invoices with a non-zero balance either way: still owed to the supplier, or a refund still owed back from them.",
                  "Paid History — invoices fully settled, with every payment (and refund, if any) against them.",
                  "Search, filter by supplier, and filter by date (forwarded date on Outstanding, payment date on Paid History) to narrow the list; Export CSV downloads whatever's currently visible.",
                ],
              },
              {
                heading: "Recording a payment",
                body: [
                  "Record Payment takes the amount, an optional bank reference/notes, and proof — proof is only required when the amount fully settles the invoice. Partial payments are supported; the remaining balance stays outstanding.",
                ],
              },
              {
                heading: "When a refund is owed",
                body: [
                  "If a paid job gets edited and the supplier then rejects it (or a payout adjustment goes negative), the balance can go below zero — shown as \"Refund owed from supplier\". Once you've actually received that money back, Record Refund logs it the same way a payment is logged, and the balance settles to zero.",
                ],
              },
            ]}
          />
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["outstanding", "paid"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "rounded-xl px-3 py-2 text-sm font-bold " +
                (tab === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600")
              }
            >
              {t === "outstanding" ? `Outstanding (${outstanding.length})` : `Paid History (${paidHistory.length})`}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportVisible}
          disabled={visible.length === 0}
          className="rounded-xl border px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search supplier, quote, customer…"
          className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm outline-none"
        />
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm outline-none"
        >
          <option value="">All suppliers</option>
          {supplierOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label={tab === "outstanding" ? "Forwarded from" : "Paid from"}
          className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm outline-none"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label={tab === "outstanding" ? "Forwarded to" : "Paid to"}
          className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm outline-none"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SupplierPaymentsSortKey)}
          className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <Panel>
        <div className="space-y-3">
          {visible.map((row) => {
            const paid = paidSoFar(row);
            const refunded = refundedSoFar(row);
            const adjustments = totalAdjustments(row);
            const bal = balance(row);
            const refundOwed = bal < -0.01;
            const customer = row.job_allocations?.jobs?.quotes?.customers;
            const status = row.job_allocations?.supplier_payment_status ?? "unpaid";
            return (
              <div key={row.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b>{row.suppliers?.name ?? "Unknown supplier"}</b>
                    <div className="text-xs text-slate-500">
                      {row.job_allocations?.jobs?.quotes?.quote_number} · {customer?.company_name || customer?.contact_name || "—"}
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLE[status]}`}>
                    {status.replaceAll("_", " ")}
                  </span>
                </div>
                <div
                  className={`mt-3 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 text-sm ${
                    adjustments !== 0 && refunded !== 0
                      ? "sm:grid-cols-5"
                      : adjustments !== 0 || refunded !== 0
                        ? "sm:grid-cols-4"
                        : "sm:grid-cols-3"
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold uppercase text-slate-400">Invoice</div>
                    <b>{money(row.amount, row.currency)}</b>
                  </div>
                  {adjustments !== 0 && (
                    <div>
                      <div className="text-xs font-bold uppercase text-slate-400">Adjustments</div>
                      <b className={adjustments < 0 ? "text-red-600" : "text-slate-800"}>
                        {adjustments > 0 ? "+" : ""}
                        {money(adjustments, row.currency)}
                      </b>
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-bold uppercase text-slate-400">Paid so far</div>
                    <b>{money(paid, row.currency)}</b>
                  </div>
                  {refunded !== 0 && (
                    <div>
                      <div className="text-xs font-bold uppercase text-slate-400">Refunded so far</div>
                      <b className="text-slate-800">{money(refunded, row.currency)}</b>
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-bold uppercase text-slate-400">{refundOwed ? "Refund owed from supplier" : "Balance"}</div>
                    <b className={refundOwed ? "text-red-600" : "text-primary-600"}>{money(Math.abs(bal), row.currency)}</b>
                  </div>
                </div>
                {row.job_allocations!.job_allocation_adjustments.length > 0 && (
                  <div className="mt-3 space-y-1 border-t pt-3 text-xs text-slate-500">
                    {row.job_allocations!.job_allocation_adjustments.map((a) => (
                      <div key={a.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span>
                          {a.reason ?? "Booking update adjustment"} · {formatDateTime(a.created_at)}
                        </span>
                        <b className={a.amount < 0 ? "text-red-600" : "text-slate-700"}>
                          {a.amount > 0 ? "+" : ""}
                          {money(a.amount, row.currency)}
                        </b>
                      </div>
                    ))}
                  </div>
                )}
                {(row.job_allocations?.supplier_payments?.length ?? 0) > 0 && (
                  <div className="mt-3 space-y-1 border-t pt-3 text-xs text-slate-500">
                    {row.job_allocations!.supplier_payments.map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span>
                          Paid {money(p.amount, row.currency)} · {formatDateTime(p.paid_at)}
                          {p.bank_reference && ` · ${p.bank_reference}`}
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
                {(row.job_allocations?.supplier_refunds?.length ?? 0) > 0 && (
                  <div className="mt-3 space-y-1 border-t pt-3 text-xs text-slate-500">
                    {row.job_allocations!.supplier_refunds.map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span>
                          Refund received {money(r.amount, row.currency)} · {formatDateTime(r.received_at)}
                          {r.bank_reference && ` · ${r.bank_reference}`}
                        </span>
                        {refundProofUrls[r.id] && (
                          <a href={refundProofUrls[r.id] ?? undefined} target="_blank" rel="noreferrer" className="font-bold text-primary-600">
                            View proof
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-3">
                  {invoiceUrls[row.id] && (
                    <a href={invoiceUrls[row.id] ?? undefined} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600">
                      View invoice file
                    </a>
                  )}
                  {tab === "outstanding" && refundOwed && (
                    <button
                      onClick={() => openRefund(row)}
                      className="ml-auto rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                    >
                      Record Refund
                    </button>
                  )}
                  {tab === "outstanding" && !refundOwed && (
                    <button
                      onClick={() => open(row)}
                      className="ml-auto rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white"
                    >
                      Record Payment
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              {tab === "outstanding" ? "No supplier invoices awaiting payment." : "No supplier payments recorded yet."}
            </p>
          )}
        </div>
      </Panel>

      {target && (
        <ConfirmDetailModal
          open
          onClose={close}
          title="Record a payment to this supplier?"
          description="This confirms you've already sent the bank transfer outside the system — this just logs it."
          pending={pending}
          error={modalError}
          details={[
            { label: "Supplier", value: target.suppliers?.name ?? "—" },
            { label: "Invoice total", value: money(target.amount, target.currency) },
            { label: "Balance before", value: money(paymentBalance, target.currency) },
            { label: "Balance after this payment", value: money(Math.max(remainingAfter, 0), target.currency) },
          ]}
          confirmLabel={willFullySettle ? "Mark supplier as paid" : "Record partial payment"}
          onConfirm={confirm}
        >
          <div className="space-y-2">
            <label className="block text-sm font-bold">
              Amount ({target.currency})
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-bold">
              Bank reference
              <input
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                placeholder="Transfer reference / ID"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-bold">
              Notes (optional)
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-bold">
              Proof of payment{willFullySettle ? " (required)" : " (optional)"}
              <input
                type="file"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                className="mt-1 w-full text-xs font-normal"
              />
            </label>
            {remainingAfter > 0 && enteredAmount > 0 && (
              <p className="text-xs font-semibold text-amber-600">
                This leaves a balance of {money(remainingAfter, target.currency)} — you can pay the rest later.
              </p>
            )}
            {willFullySettle && (
              <p className="text-xs font-semibold text-emerald-600">
                This settles the invoice in full — attach proof of payment to mark the supplier as paid.
              </p>
            )}
          </div>
        </ConfirmDetailModal>
      )}

      {refundTarget && (
        <ConfirmDetailModal
          open
          onClose={close}
          title="Record a refund received from this supplier?"
          description="This confirms the supplier has already sent the money back outside the system — this just logs it."
          pending={pending}
          error={modalError}
          details={[
            { label: "Supplier", value: refundTarget.suppliers?.name ?? "—" },
            { label: "Refund owed", value: money(refundOwedAmount, refundTarget.currency) },
          ]}
          confirmLabel="Record refund"
          onConfirm={confirmRefund}
        >
          <div className="space-y-2">
            <label className="block text-sm font-bold">
              Amount ({refundTarget.currency})
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-bold">
              Bank reference
              <input
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                placeholder="Transfer reference / ID"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-bold">
              Notes (optional)
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-bold">
              Proof (optional)
              <input
                type="file"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                className="mt-1 w-full text-xs font-normal"
              />
            </label>
          </div>
        </ConfirmDetailModal>
      )}
    </div>
  );
}
