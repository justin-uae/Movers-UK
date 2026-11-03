import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGbpRates } from "@/lib/fxRates";
import type { Database } from "@/lib/supabase/database.types";
import { netOfVat } from "./vat";

export type AgeBucket = "current" | "d1_30" | "d31_60" | "d61plus";

export interface BankTransferQueueItem {
  quoteId: string;
  quoteNumber: string;
  customerName: string;
  balance: number;
  currency: string;
  ageBucket: AgeBucket;
}

export interface AccountingSummary {
  collectedRevenueGbp: number;
  outstandingGbp: number;
  outstandingCount: number;
  grossProfitGbp: number;
  grossProfitMarginPct: number | null;
  supplierPayableGbp: number;
  supplierPayableCount: number;
  bankTransferQueue: BankTransferQueueItem[];
  receivablesAgeing: { n: string; v: number; bucket: AgeBucket }[];
  /** Every outstanding quote, tagged with its age bucket — FIN-01's ageing
      chart drill-down reads this (unlike bankTransferQueue, which is capped
      to the top 8 by balance for the queue panel). */
  receivablesAgeingDetail: BankTransferQueueItem[];
  /** True if any outstanding quote's currency had no live FX rate available,
      so its balance was added at face value rather than a real GBP
      conversion — flags that the ageing totals may be understated/overstated
      for that quote rather than silently misreporting it. */
  fxFallbackUsed: boolean;
}

interface QuoteRow {
  id: string;
  quote_number: string;
  status: string;
  currency: string;
  decided_at: string | null;
  customers: { company_name: string | null; contact_name: string } | null;
  quote_versions: { selling_price: number; vat_rate: number; supplier_estimated_cost: number | null } | null;
  customer_payments: { amount: number; paid_at: string; verification_status: string }[] | null;
}

interface SupplierInvoiceRow {
  id: string;
  amount: number;
  currency: string;
  job_allocations: { supplier_payments: { amount: number }[] | null } | null;
}

/**
 * Converts to GBP using the same cached rate table as lib/quoteMoney.ts /
 * lib/fxRates.ts (the existing single-currency convention this app already
 * uses for cross-currency comparisons, e.g. the Stripe-vs-bank-transfer
 * threshold). If a quote/invoice was priced in a currency the free-tier rate
 * source doesn't cover, its amount is added at face value rather than
 * dropped — a KPI should never silently under-count, even if an exotic
 * currency can't be precisely converted.
 */
export function toGbp(amount: number, currency: string, rates: Record<string, number>): { value: number; usedFallback: boolean } {
  const code = currency.toUpperCase();
  if (code === "GBP") return { value: amount, usedFallback: false };
  const rate = rates[code];
  if (!rate) return { value: amount, usedFallback: true };
  return { value: amount / rate, usedFallback: false };
}

function startOfMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function getAccountingSummary(
  supabase: SupabaseClient<Database>,
): Promise<AccountingSummary> {
  const [{ data: quoteRows }, { data: invoiceRows }, rates] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, quote_number, status, currency, decided_at, customers(company_name, contact_name), quote_versions!quotes_current_version_id_fkey(selling_price, vat_rate, supplier_estimated_cost), customer_payments(amount, paid_at, verification_status)",
      )
      .in("status", ["accepted", "partially_paid", "paid"]),
    // supplier_payments has no direct FK to job_supplier_invoices — both key
    // off job_allocations (0054_job_allocations.sql) — so the embed chains
    // through it explicitly rather than relying on a shared-parent guess.
    supabase
      .from("job_supplier_invoices")
      .select("id, amount, currency, job_allocations(supplier_payments(amount))")
      .eq("status", "forwarded_to_accounting"),
    getGbpRates().catch(() => ({}) as Record<string, number>),
  ]);

  const quotes = (quoteRows ?? []) as unknown as QuoteRow[];
  const invoices = (invoiceRows ?? []) as unknown as SupplierInvoiceRow[];
  const monthStart = startOfMonth();

  let collectedRevenueGbp = 0;
  let outstandingGbp = 0;
  let outstandingCount = 0;
  let grossProfitGbp = 0;
  let paidRevenueGbp = 0;
  let fxFallbackUsed = false;
  const bankTransferQueue: BankTransferQueueItem[] = [];
  const ageingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61plus: 0 };

  for (const q of quotes) {
    // PAY-04: a bank transfer sits unverified until Finance confirms it —
    // it doesn't count toward the balance anywhere else in the app, so it
    // can't count here either (would otherwise understate what's still
    // outstanding, and overstate collected revenue, until verified).
    const verifiedPayments = (q.customer_payments ?? []).filter((p) => p.verification_status === "verified");
    const paidSoFar = verifiedPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    for (const p of verifiedPayments) {
      if (p.paid_at >= monthStart) {
        const converted = toGbp(Number(p.amount), q.currency, rates);
        collectedRevenueGbp += converted.value;
        if (converted.usedFallback) fxFallbackUsed = true;
      }
    }

    if (q.status === "accepted" || q.status === "partially_paid") {
      const sellingPrice = q.quote_versions?.selling_price ?? 0;
      const balance = Math.max(0, sellingPrice - paidSoFar);
      const converted = toGbp(balance, q.currency, rates);
      if (converted.usedFallback) fxFallbackUsed = true;
      outstandingGbp += converted.value;
      outstandingCount += 1;

      const ageDays = q.decided_at
        ? Math.floor((Date.now() - new Date(q.decided_at).getTime()) / (24 * 60 * 60 * 1000))
        : 0;
      const ageBucket: AgeBucket = ageDays <= 0 ? "current" : ageDays <= 30 ? "d1_30" : ageDays <= 60 ? "d31_60" : "d61plus";

      bankTransferQueue.push({
        quoteId: q.id,
        quoteNumber: q.quote_number,
        customerName: q.customers?.company_name || q.customers?.contact_name || "—",
        balance,
        currency: q.currency,
        ageBucket,
      });

      if (ageBucket === "current") ageingBuckets.current += converted.value;
      else if (ageBucket === "d1_30") ageingBuckets.d1_30 += converted.value;
      else if (ageBucket === "d31_60") ageingBuckets.d31_60 += converted.value;
      else ageingBuckets.d61plus += converted.value;
    }

    if (q.status === "paid" && q.decided_at && q.decided_at >= monthStart && q.quote_versions) {
      // Profit/revenue excluding VAT — the balance owed above stays VAT-inclusive (lib/vat.ts).
      const sellingPriceConverted = toGbp(netOfVat(q.quote_versions.selling_price, q.quote_versions.vat_rate), q.currency, rates);
      const costConverted = toGbp(q.quote_versions.supplier_estimated_cost ?? 0, q.currency, rates);
      if (sellingPriceConverted.usedFallback || costConverted.usedFallback) fxFallbackUsed = true;
      grossProfitGbp += sellingPriceConverted.value - costConverted.value;
      paidRevenueGbp += sellingPriceConverted.value;
    }
  }

  let supplierPayableGbp = 0;
  let supplierPayableCount = 0;
  for (const inv of invoices) {
    const paid = (inv.job_allocations?.supplier_payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
    const balance = Math.max(0, Number(inv.amount) - paid);
    if (balance > 0) {
      const converted = toGbp(balance, inv.currency, rates);
      if (converted.usedFallback) fxFallbackUsed = true;
      supplierPayableGbp += converted.value;
      supplierPayableCount += 1;
    }
  }

  bankTransferQueue.sort((a, b) => b.balance - a.balance);
  const receivablesAgeingDetail = bankTransferQueue;

  return {
    collectedRevenueGbp,
    outstandingGbp,
    outstandingCount,
    grossProfitGbp,
    grossProfitMarginPct: paidRevenueGbp > 0 ? (grossProfitGbp / paidRevenueGbp) * 100 : null,
    supplierPayableGbp,
    supplierPayableCount,
    bankTransferQueue: bankTransferQueue.slice(0, 8),
    receivablesAgeing: [
      { n: "Current", v: Math.round(ageingBuckets.current), bucket: "current" },
      { n: "1–30", v: Math.round(ageingBuckets.d1_30), bucket: "d1_30" },
      { n: "31–60", v: Math.round(ageingBuckets.d31_60), bucket: "d31_60" },
      { n: "61+", v: Math.round(ageingBuckets.d61plus), bucket: "d61plus" },
    ],
    receivablesAgeingDetail,
    fxFallbackUsed,
  };
}
