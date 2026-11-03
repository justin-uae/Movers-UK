import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { netOfVat } from "@/lib/vat";

/**
 * Resolves the commission rate for a salesperson: their own commission_plans
 * override if one exists, else the tenant's default row (profile_id null),
 * else 0 (defensive — a default row is always seeded per tenant, see
 * seed_tenant_commission_default() in 0023_commissions.sql).
 */
export async function getCommissionRate(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  profileId: string,
): Promise<number> {
  const { data: rows } = await supabase
    .from("commission_plans")
    .select("profile_id, rate_percent")
    .eq("tenant_id", tenantId)
    .or(`profile_id.eq.${profileId},profile_id.is.null`);

  const own = rows?.find((r) => r.profile_id === profileId);
  if (own) return Number(own.rate_percent);

  const tenantDefault = rows?.find((r) => r.profile_id === null);
  return tenantDefault ? Number(tenantDefault.rate_percent) : 0;
}

/**
 * Calculates and records the commission for a job the instant it completes —
 * the canonical rule (projectContext.md §104) is that commission is never
 * final before this point. Called once from completeJobAction
 * (app/supplier/dashboard/actions.ts) via the admin/service-role client:
 * commissions carries no RLS policy usable by a supplier session at all, and
 * this is the only path allowed to create a row.
 *
 * No-ops if a commission already exists for this job (defends against a
 * duplicate completion call) or if the quote has no owner to attribute the
 * commission to.
 */
export async function calculateAndRecordCommission(supabase: SupabaseClient<Database>, jobId: string): Promise<void> {
  const { data: existing } = await supabase.from("commissions").select("id").eq("job_id", jobId).maybeSingle();
  if (existing) return;

  const { data: job } = await supabase.from("jobs").select("tenant_id, quote_id").eq("id", jobId).single();
  if (!job) return;

  const { data: quote } = await supabase
    .from("quotes")
    .select("currency, created_by, quote_versions!quotes_current_version_id_fkey(selling_price, vat_rate, supplier_estimated_cost)")
    .eq("id", job.quote_id)
    .single();
  if (!quote?.created_by) return;

  const version = quote.quote_versions as unknown as { selling_price: number; vat_rate: number; supplier_estimated_cost: number | null } | null;
  if (!version) return;

  // Prefer the real, agreed-at-dispatch-time cost recorded per allocation
  // (BKG-02) over the sales-time estimate — it's more accurate, and is the
  // only correct source once a booking has been split across suppliers.
  // Falls back to the quote's own estimate if no allocation has a cost
  // entered yet, so this never blocks a commission on missing data.
  const { data: allocations } = await supabase.from("job_allocations").select("agreed_cost").eq("job_id", jobId);
  const hasAgreedCost = (allocations ?? []).some((a) => a.agreed_cost != null);
  const allocationCostTotal = (allocations ?? []).reduce((sum, a) => sum + (a.agreed_cost ?? 0), 0);

  // Commission is on profit excluding VAT — VAT is owed to the tax authority, not earned (lib/vat.ts).
  const sellingPrice = netOfVat(version.selling_price, version.vat_rate);
  const supplierCost = hasAgreedCost ? allocationCostTotal : (version.supplier_estimated_cost ?? 0);
  const grossProfit = sellingPrice - supplierCost;
  const ratePercent = await getCommissionRate(supabase, job.tenant_id, quote.created_by);
  const amount = Math.max(0, grossProfit) * (ratePercent / 100);

  await supabase.from("commissions").insert({
    tenant_id: job.tenant_id,
    job_id: jobId,
    quote_id: job.quote_id,
    profile_id: quote.created_by,
    selling_price: sellingPrice,
    supplier_cost: supplierCost,
    gross_profit: grossProfit,
    rate_percent: ratePercent,
    amount,
    currency: quote.currency,
  });
}
