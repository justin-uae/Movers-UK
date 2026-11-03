import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGbpRates } from "@/lib/fxRates";
import type { Database } from "@/lib/supabase/database.types";

export interface KpiActuals {
  revenueGbp: number;
  grossProfitGbp: number;
  quotesSent: number;
  paidBookings: number;
}

interface QuoteRow {
  created_by: string | null;
  status: string;
  currency: string;
  sent_at: string | null;
  decided_at: string | null;
  quote_versions: { selling_price: number; supplier_estimated_cost: number | null } | null;
}

function toGbp(amount: number, currency: string, rates: Record<string, number>): number {
  const code = currency.toUpperCase();
  if (code === "GBP") return amount;
  const rate = rates[code];
  if (!rate) return amount;
  return amount / rate;
}

function emptyActuals(): KpiActuals {
  return { revenueGbp: 0, grossProfitGbp: 0, quotesSent: 0, paidBookings: 0 };
}

/**
 * Per-salesperson actuals for one calendar month, attributed by
 * quotes.created_by — the same "who owns this deal" field Commissions
 * already relies on. periodMonth must be an ISO date on the 1st of the
 * month (e.g. "2026-08-01").
 */
export async function getKpiActuals(
  supabase: SupabaseClient<Database>,
  periodMonth: string,
): Promise<Record<string, KpiActuals>> {
  const start = periodMonth;
  const parts = periodMonth.split("-").map(Number);
  const y = parts[0] ?? new Date().getUTCFullYear();
  const m = parts[1] ?? 1;
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const [{ data: quoteRows }, rates] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "created_by, status, currency, sent_at, decided_at, quote_versions!quotes_current_version_id_fkey(selling_price, supplier_estimated_cost)",
      )
      .or(`and(sent_at.gte.${start},sent_at.lt.${end}),and(decided_at.gte.${start},decided_at.lt.${end})`),
    getGbpRates().catch(() => ({}) as Record<string, number>),
  ]);

  const quotes = (quoteRows ?? []) as unknown as QuoteRow[];
  const byProfile: Record<string, KpiActuals> = {};

  for (const q of quotes) {
    if (!q.created_by) continue;
    const bucket = (byProfile[q.created_by] ??= emptyActuals());

    if (q.sent_at && q.sent_at >= start && q.sent_at < end) {
      bucket.quotesSent += 1;
    }

    if (q.status === "paid" && q.decided_at && q.decided_at >= start && q.decided_at < end && q.quote_versions) {
      const sellingGbp = toGbp(q.quote_versions.selling_price, q.currency, rates);
      const costGbp = toGbp(q.quote_versions.supplier_estimated_cost ?? 0, q.currency, rates);
      bucket.paidBookings += 1;
      bucket.revenueGbp += sellingGbp;
      bucket.grossProfitGbp += sellingGbp - costGbp;
    }
  }

  return byProfile;
}
