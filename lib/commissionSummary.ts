import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGbpRates } from "@/lib/fxRates";
import type { Database } from "@/lib/supabase/database.types";
import { netOfVat } from "@/lib/vat";

export interface CommissionSummary {
  pendingApprovalGbp: number;
  pendingApprovalCount: number;
  approvedUnpaidGbp: number;
  approvedUnpaidCount: number;
  paidThisMonthGbp: number;
  estimatedPipelineGbp: number;
  estimatedPipelineCount: number;
}

interface CommissionRow {
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
}

interface PipelineJobRow {
  id: string;
  quotes: {
    currency: string;
    created_by: string | null;
    quote_versions: { selling_price: number; vat_rate: number; supplier_estimated_cost: number | null } | null;
  } | null;
}

interface CommissionPlanRow {
  profile_id: string | null;
  rate_percent: number;
}

function toGbp(amount: number, currency: string, rates: Record<string, number>): number {
  const code = currency.toUpperCase();
  if (code === "GBP") return amount;
  const rate = rates[code];
  if (!rate) return amount;
  return amount / rate;
}

function startOfMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Mirrors lib/accountingSummary.ts's shape: relies entirely on RLS for
 * tenant scoping (no explicit tenant_id filter, same as getAccountingSummary)
 * — pass `profileId` to scope every figure to one salesperson's own
 * commission (what a Sales User sees), or `null` for the tenant-wide view
 * (what Finance Manager/Master Admin see, per commissions_select's RLS).
 */
export async function getCommissionSummary(
  supabase: SupabaseClient<Database>,
  profileId: string | null,
): Promise<CommissionSummary> {
  let commissionsQuery = supabase.from("commissions").select("amount, currency, status, paid_at");
  if (profileId) commissionsQuery = commissionsQuery.eq("profile_id", profileId);

  const [{ data: commissionRows }, { data: pipelineRows }, { data: planRows }, rates] = await Promise.all([
    commissionsQuery,
    supabase
      .from("jobs")
      .select("id, quotes(currency, created_by, quote_versions!quotes_current_version_id_fkey(selling_price, vat_rate, supplier_estimated_cost))")
      .neq("status", "completed")
      .neq("status", "cancelled"),
    supabase.from("commission_plans").select("profile_id, rate_percent"),
    getGbpRates().catch(() => ({}) as Record<string, number>),
  ]);

  const commissions = (commissionRows ?? []) as unknown as CommissionRow[];
  const pipeline = (pipelineRows ?? []) as unknown as PipelineJobRow[];
  const plans = (planRows ?? []) as CommissionPlanRow[];
  const defaultRate = plans.find((p) => p.profile_id === null)?.rate_percent ?? 0;
  const rateFor = (pid: string | null) => (pid ? (plans.find((p) => p.profile_id === pid)?.rate_percent ?? defaultRate) : defaultRate);

  const monthStart = startOfMonth();
  let pendingApprovalGbp = 0;
  let pendingApprovalCount = 0;
  let approvedUnpaidGbp = 0;
  let approvedUnpaidCount = 0;
  let paidThisMonthGbp = 0;

  for (const c of commissions) {
    const gbp = toGbp(Number(c.amount), c.currency, rates);
    if (c.status === "pending_approval") {
      pendingApprovalGbp += gbp;
      pendingApprovalCount += 1;
    } else if (c.status === "approved") {
      approvedUnpaidGbp += gbp;
      approvedUnpaidCount += 1;
    } else if (c.status === "paid" && c.paid_at && c.paid_at >= monthStart) {
      paidThisMonthGbp += gbp;
    }
  }

  let estimatedPipelineGbp = 0;
  let estimatedPipelineCount = 0;
  for (const job of pipeline) {
    const quote = job.quotes;
    if (!quote?.created_by || !quote.quote_versions) continue;
    if (profileId && quote.created_by !== profileId) continue;
    const grossProfit = netOfVat(quote.quote_versions.selling_price, quote.quote_versions.vat_rate) - (quote.quote_versions.supplier_estimated_cost ?? 0);
    const estimate = Math.max(0, grossProfit) * (rateFor(quote.created_by) / 100);
    estimatedPipelineGbp += toGbp(estimate, quote.currency, rates);
    estimatedPipelineCount += 1;
  }

  return {
    pendingApprovalGbp,
    pendingApprovalCount,
    approvedUnpaidGbp,
    approvedUnpaidCount,
    paidThisMonthGbp,
    estimatedPipelineGbp,
    estimatedPipelineCount,
  };
}
