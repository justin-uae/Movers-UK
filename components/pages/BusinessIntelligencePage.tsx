"use client";

import { AlertTriangle, Download } from "lucide-react";
import { LineChart, Line, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { BusinessIntelligenceDiagram } from "@/components/ui/guide-diagrams/BusinessIntelligenceDiagram";
import { downloadCsv } from "@/lib/exportCsv";
import { formatDateTime } from "@/lib/formatDate";
import type { BusinessIntelligenceSummary } from "@/lib/businessIntelligenceSummary";

function compactGbp(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(2)}k`;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
    amount,
  );
}

export function BusinessIntelligencePage({ summary }: { summary: BusinessIntelligenceSummary }) {
  return (
    <div>
      <PageHead
        eyebrow="Business Intelligence"
        title="Executive analytics"
        text="Interactive group reporting across brands, countries, users and lead channels."
        action={
          <PageGuide
            title="Executive analytics"
            subtitle="Group-wide reporting — read-only, refreshed periodically rather than live."
            screenshot={<BusinessIntelligenceDiagram />}
            sections={[
              {
                heading: "What's on this page",
                bullets: true,
                body: [
                  "Monthly revenue — paid quotes only, grouped by invoice month, converted to GBP.",
                  "Profit by brand — this month's gross profit, one bar per brand.",
                ],
              },
              {
                heading: "Currency conversion",
                body: [
                  "Everything is converted to GBP so figures from different brands/currencies can be compared directly. If a currency has no live exchange rate available, an amber warning banner appears and that figure is added at face value instead of being converted.",
                ],
              },
              {
                heading: "Exporting",
                body: [
                  "Export on either chart downloads its underlying data as a CSV — useful for a board pack or a deeper analysis outside the CRM.",
                ],
              },
            ]}
          />
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Data as of {formatDateTime(summary.lastRefreshedAt)}</span>
      </div>
      {summary.fxFallbackUsed && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          <AlertTriangle size={16} className="shrink-0" />
          One or more figures below include an amount in a currency with no live exchange rate available — added at
          face value rather than converted.
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <div className="flex items-center justify-between">
            <SectionTitle title="Monthly revenue" sub="Paid quotes, by invoice month (GBP)" />
            <button
              type="button"
              onClick={() => downloadCsv("monthly-revenue", summary.monthlyRevenue, [
                { header: "Month", value: (r) => r.m },
                { header: "Revenue (GBP)", value: (r) => r.v },
              ])}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              <Download size={14} />
              Export
            </button>
          </div>
          <div className="mt-4 h-72">
            <ResponsiveContainer>
              <LineChart data={summary.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="m" axisLine={false} />
                <YAxis axisLine={false} tickFormatter={compactGbp} />
                <Tooltip formatter={(value: number) => compactGbp(value)} />
                <Line dataKey="v" name="Revenue" stroke="#f97316" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between">
            <SectionTitle title="Profit by brand" sub="Current month, gross profit (GBP)" />
            <button
              type="button"
              onClick={() => downloadCsv("profit-by-brand", summary.profitByBrand, [
                { header: "Brand", value: (r) => r.n },
                { header: "Gross profit (GBP)", value: (r) => r.v },
              ])}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              <Download size={14} />
              Export
            </button>
          </div>
          <div className="mt-4 h-72">
            {summary.profitByBrand.length > 0 ? (
              <ResponsiveContainer>
                <BarChart layout="vertical" data={summary.profitByBrand}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickFormatter={compactGbp} />
                  <YAxis type="category" dataKey="n" width={120} axisLine={false} />
                  <Tooltip formatter={(value: number) => compactGbp(value)} />
                  <Bar dataKey="v" fill="#f97316" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-slate-400">No paid quotes this month yet.</div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
