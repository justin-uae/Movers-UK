"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Landmark, ReceiptText, TrendingUp, Truck, X, AlertTriangle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { AccountingDiagram } from "@/components/ui/guide-diagrams/AccountingDiagram";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { AccountingSummary, AgeBucket } from "@/lib/accountingSummary";

const BUCKET_LABEL: Record<AgeBucket, string> = {
  current: "Current",
  d1_30: "1–30 days",
  d31_60: "31–60 days",
  d61plus: "61+ days",
};

// Built by hand rather than Intl's `notation: "compact"` — that option
// disagrees between Node's ICU (SSR) and the browser's (hydration) on both
// trailing-zero trimming ("£25.7" vs "£25.70") and the unit suffix's case
// ("2.14k" vs "2.14K") for the same number, either of which trips a
// hydration mismatch. This is fully deterministic in both environments.
function compactGbp(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(2)}k`;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    amount,
  );
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function AccountingPage({ summary }: { summary: AccountingSummary }) {
  const [selectedBucket, setSelectedBucket] = useState<AgeBucket | null>(null);
  const bucketRows = selectedBucket ? summary.receivablesAgeingDetail.filter((r) => r.ageBucket === selectedBucket) : [];

  return (
    <div>
      <PageHead
        eyebrow="Finance Suite"
        title="Accounting & payment control"
        text="Invoices, bank transfers, supplier costs, reconciliation and group reporting."
        action={
          <PageGuide
            title="Accounting & payment control"
            subtitle="The finance overview — cash collected, outstanding, margin, and what's owed to suppliers."
            screenshot={<AccountingDiagram />}
            sections={[
              {
                heading: "What this page is",
                body: [
                  "The top-level finance dashboard — a snapshot of where money stands across every quote and job, plus the queue of bank transfers still waiting on a Finance sign-off.",
                ],
              },
              {
                heading: "The KPI cards",
                bullets: true,
                body: [
                  "Collected revenue — payments received this month.",
                  "Outstanding — accepted quotes still unpaid, and how many.",
                  "Gross profit — collected revenue minus supplier cost, with margin %.",
                  "Supplier payable — what's owed to suppliers on forwarded invoices.",
                ],
              },
              {
                heading: "Bank transfer verification",
                body: [
                  "Quotes waiting on a customer's bank transfer to be confirmed. Review & record jumps straight to Customer Payments to log it — full detail and history live there, this is just the queue.",
                ],
              },
              {
                heading: "Accounts receivable ageing",
                body: [
                  "How long unpaid balances have been outstanding, bucketed from Current up to 61+ days. Click a bar to see exactly which quotes make up that bucket.",
                ],
              },
            ]}
          />
        }
      />
      {summary.fxFallbackUsed && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          <AlertTriangle size={16} className="shrink-0" />
          One or more figures below include an amount in a currency with no live exchange rate available — added at
          face value rather than converted, so totals may be under- or over-stated for that amount.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Collected revenue"
          value={compactGbp(summary.collectedRevenueGbp)}
          delta="This month"
          icon={Landmark}
        />
        <Kpi
          title="Outstanding"
          value={compactGbp(summary.outstandingGbp)}
          delta={`${summary.outstandingCount} quote${summary.outstandingCount === 1 ? "" : "s"}`}
          icon={ReceiptText}
          warn
        />
        <Kpi
          title="Gross profit"
          value={compactGbp(summary.grossProfitGbp)}
          delta={
            summary.grossProfitMarginPct === null
              ? "No paid quotes this month"
              : `${summary.grossProfitMarginPct.toFixed(1)}% margin`
          }
          icon={TrendingUp}
        />
        <Kpi
          title="Supplier payable"
          value={compactGbp(summary.supplierPayableGbp)}
          delta={`${summary.supplierPayableCount} invoice${summary.supplierPayableCount === 1 ? "" : "s"}`}
          icon={Truck}
        />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <Panel>
          <SectionTitle title="Bank transfer verification" sub="Manager approval queue" />
          <div className="mt-4 space-y-3">
            {summary.bankTransferQueue.map((x) => (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-4" key={x.quoteId}>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700">
                  <Landmark size={19} />
                </div>
                <div className="flex-1">
                  <b>{x.customerName}</b>
                  <div className="text-xs text-slate-500">{x.quoteNumber} • Awaiting payment</div>
                </div>
                <b>{money(x.balance, x.currency)}</b>
                <Link
                  href="/accounting/customer-payments"
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                >
                  Review &amp; record
                </Link>
              </div>
            ))}
            {summary.bankTransferQueue.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">No quotes awaiting payment.</p>
            )}
          </div>
        </Panel>
        <Panel>
          <SectionTitle title="Accounts receivable" sub="Ageing summary — click a bar to see the quotes behind it" />
          <div className="mt-5 h-64">
            <ResponsiveContainer>
              <BarChart data={summary.receivablesAgeing}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="n" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: number) => compactGbp(value)} />
                <Bar
                  dataKey="v"
                  fill="#f97316"
                  radius={[8, 8, 0, 0]}
                  cursor="pointer"
                  onClick={(data: { bucket: AgeBucket }) => setSelectedBucket(data.bucket)}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {selectedBucket && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onClick={() => setSelectedBucket(null)}>
          <div className="w-full max-w-lg rounded-3xl border bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">{BUCKET_LABEL[selectedBucket]} — {bucketRows.length} quote{bucketRows.length === 1 ? "" : "s"}</h3>
              <button onClick={() => setSelectedBucket(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto">
              {bucketRows.map((r) => (
                <Link
                  key={r.quoteId}
                  href={`/quotes/${r.quoteId}`}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm hover:bg-slate-50"
                >
                  <div>
                    <b className="text-primary-600">{r.quoteNumber}</b>
                    <div className="text-slate-500">{r.customerName}</div>
                  </div>
                  <b>{money(r.balance, r.currency)}</b>
                </Link>
              ))}
              {bucketRows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No quotes in this bucket.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
