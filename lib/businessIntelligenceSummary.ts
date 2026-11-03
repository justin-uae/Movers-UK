import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGbpRates } from "@/lib/fxRates";
import { toGbp } from "@/lib/accountingSummary";
import type { Database } from "@/lib/supabase/database.types";
import { netOfVat } from "./vat";

export interface MonthlyRevenuePoint {
  m: string;
  v: number;
}

export interface BrandProfitPoint {
  n: string;
  v: number;
}

export interface BusinessIntelligenceSummary {
  monthlyRevenue: MonthlyRevenuePoint[];
  profitByBrand: BrandProfitPoint[];
  lastRefreshedAt: string;
  fxFallbackUsed: boolean;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_BACK = 6;

interface PaidQuoteRow {
  brand_id: string | null;
  currency: string;
  invoiced_at: string | null;
  brands: { name: string } | null;
  quote_versions: { selling_price: number; vat_rate: number; supplier_estimated_cost: number | null } | null;
}

/**
 * Real revenue/profit numbers behind the Business Intelligence dashboard —
 * this page previously rendered entirely from components/demo/demoData.ts
 * (hardcoded, no query at all). "Revenue" here is what's actually been
 * invoiced (quotes.status = 'paid'), grouped by the calendar month it was
 * invoiced in, converted to GBP the same way lib/accountingSummary.ts does
 * everywhere else in Accounting so the two pages agree with each other.
 */
export async function getBusinessIntelligenceSummary(
  supabase: SupabaseClient<Database>,
): Promise<BusinessIntelligenceSummary> {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - (MONTHS_BACK - 1), 1);
  since.setUTCHours(0, 0, 0, 0);

  const [{ data: quoteRows }, rates] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "brand_id, currency, invoiced_at, brands(name), quote_versions!quotes_current_version_id_fkey(selling_price, vat_rate, supplier_estimated_cost)",
      )
      .eq("status", "paid")
      .gte("invoiced_at", since.toISOString()),
    getGbpRates().catch(() => ({}) as Record<string, number>),
  ]);

  const quotes = (quoteRows ?? []) as unknown as PaidQuoteRow[];
  let fxFallbackUsed = false;

  // Fixed month buckets for the last MONTHS_BACK months, oldest first, even
  // if a month had zero paid quotes — a real chart with a gap reads better
  // than one that silently skips months with no revenue.
  const now = new Date();
  const monthBuckets: { key: string; label: string; total: number }[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthBuckets.push({ key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: MONTH_NAMES[d.getUTCMonth()]!, total: 0 });
  }

  const currentMonthKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}`;
  const profitByBrandMap = new Map<string, number>();

  for (const q of quotes) {
    if (!q.invoiced_at || !q.quote_versions) continue;
    const invoicedDate = new Date(q.invoiced_at);
    const monthKey = `${invoicedDate.getUTCFullYear()}-${invoicedDate.getUTCMonth()}`;
    // Revenue and profit excluding VAT (lib/vat.ts).
    const sellingConverted = toGbp(netOfVat(q.quote_versions.selling_price, q.quote_versions.vat_rate), q.currency, rates);
    if (sellingConverted.usedFallback) fxFallbackUsed = true;

    const bucket = monthBuckets.find((b) => b.key === monthKey);
    if (bucket) bucket.total += sellingConverted.value;

    if (monthKey === currentMonthKey) {
      const costConverted = toGbp(q.quote_versions.supplier_estimated_cost ?? 0, q.currency, rates);
      if (costConverted.usedFallback) fxFallbackUsed = true;
      const profit = sellingConverted.value - costConverted.value;
      const brandName = q.brands?.name ?? "Unassigned";
      profitByBrandMap.set(brandName, (profitByBrandMap.get(brandName) ?? 0) + profit);
    }
  }

  const profitByBrand = [...profitByBrandMap.entries()]
    .map(([n, v]) => ({ n, v: Math.round(v) }))
    .sort((a, b) => b.v - a.v);

  return {
    monthlyRevenue: monthBuckets.map((b) => ({ m: b.label, v: Math.round(b.total) })),
    profitByBrand,
    lastRefreshedAt: new Date().toISOString(),
    fxFallbackUsed,
  };
}
