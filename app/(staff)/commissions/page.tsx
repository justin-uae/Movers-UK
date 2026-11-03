import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { getCommissionSummary } from "@/lib/commissionSummary";
import { CommissionsPage, type CommissionRow, type PipelineRow, type RateRow } from "@/components/pages/CommissionsPage";
import type { CommissionStatus } from "@/lib/supabase/database.types";
import { netOfVat } from "@/lib/vat";

const PAGE_SIZE = 25;
const STATUS_TABS: CommissionStatus[] = ["pending_approval", "approved", "paid", "reversed"];
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

interface CommissionListRow {
  id: string;
  status: CommissionStatus;
  gross_profit: number;
  rate_percent: number;
  amount: number;
  currency: string;
  approved_at: string | null;
  paid_at: string | null;
  payroll_reference: string | null;
  reversed_reason: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
  jobs: { region: string | null } | null;
}

interface PipelineJobRow {
  id: string;
  region: string | null;
  quotes: {
    currency: string;
    created_by: string | null;
    quote_versions: { selling_price: number; vat_rate: number; supplier_estimated_cost: number | null } | null;
  } | null;
}

export default async function CommissionsRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireProfile();
  if (!(await hasPermission(profile, PERMISSIONS.FINANCE_VIEW_COMMISSIONS))) redirect("/dashboard");

  const canManage = await hasPermission(profile, PERMISSIONS.FINANCE_APPROVE_COMMISSIONS);
  const canSeeMargin = await hasPermission(profile, PERMISSIONS.FINANCE_VIEW_PROFIT);
  const supabase = await createClient();

  const q = params.q?.trim() || "";
  const status: CommissionStatus = STATUS_TABS.includes(params.status as CommissionStatus)
    ? (params.status as CommissionStatus)
    : "pending_approval";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let listQuery = supabase
    .from("commissions")
    .select(
      "id, status, gross_profit, rate_percent, amount, currency, approved_at, paid_at, payroll_reference, reversed_reason, created_at, profiles!commissions_profile_id_fkey(full_name), jobs(region)",
      { count: "exact" },
    )
    .eq("status", status);
  if (!canManage) listQuery = listQuery.eq("profile_id", profile.id);
  if (q) {
    const { data: matches } = await supabase.from("profiles").select("id").ilike("full_name", `%${q}%`);
    const ids = (matches ?? []).map((m) => m.id);
    listQuery = listQuery.in("profile_id", ids.length ? ids : [NO_MATCH_ID]);
  }

  // Pipeline preview of in-flight (not yet completed) jobs, for the live
  // "estimated commission" panel. Scoped by jobs.created_by rather than the
  // authoritative quotes.created_by used for real attribution — a plain
  // top-level column filter is simpler/safer than filtering an embedded
  // resource, and in today's one-person-carries-a-booking flow the two are
  // normally the same person anyway; this list is a preview, not the ledger.
  let pipelineQuery = supabase
    .from("jobs")
    .select("id, region, quotes(currency, created_by, quote_versions!quotes_current_version_id_fkey(selling_price, vat_rate, supplier_estimated_cost))")
    .neq("status", "completed")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(10);
  if (!canManage) pipelineQuery = pipelineQuery.eq("created_by", profile.id);

  // Always fetch the rate rows this viewer is allowed to see (their own
  // override + the tenant default when not a manager, or every row when
  // they can manage rates) — needed both for the Rates panel and to price
  // the pipeline preview at the viewer's own effective rate.
  const plansQuery = canManage
    ? supabase.from("commission_plans").select("profile_id, rate_percent")
    : supabase.from("commission_plans").select("profile_id, rate_percent").or(`profile_id.eq.${profile.id},profile_id.is.null`);

  const [{ data: rows, count }, summary, { data: pipelineData }, { data: rateProfiles }, { data: planRows }] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).range(from, to),
    getCommissionSummary(supabase, canManage ? null : profile.id),
    pipelineQuery,
    canManage ? supabase.from("profiles").select("id, full_name").order("full_name") : Promise.resolve({ data: null }),
    plansQuery,
  ]);

  const plans = (planRows ?? []) as { profile_id: string | null; rate_percent: number }[];
  const tenantDefaultRate = plans.find((p) => p.profile_id === null)?.rate_percent ?? 10;
  const rateForProfile = (pid: string | null) =>
    (pid ? Number(plans.find((p) => p.profile_id === pid)?.rate_percent ?? tenantDefaultRate) : tenantDefaultRate);

  const commissionRows: CommissionRow[] = ((rows ?? []) as unknown as CommissionListRow[]).map((r) => ({
    id: r.id,
    status: r.status,
    grossProfit: r.gross_profit,
    ratePercent: r.rate_percent,
    amount: r.amount,
    currency: r.currency,
    approvedAt: r.approved_at,
    paidAt: r.paid_at,
    payrollReference: r.payroll_reference,
    reversedReason: r.reversed_reason,
    createdAt: r.created_at,
    salespersonName: r.profiles?.full_name ?? "Unknown",
    jobRegion: r.jobs?.region ?? null,
  }));

  const pipelineRows: PipelineRow[] = ((pipelineData ?? []) as unknown as PipelineJobRow[])
    .filter((j) => j.quotes?.created_by && j.quotes.quote_versions)
    .map((j) => {
      const quote = j.quotes!;
      const version = quote.quote_versions!;
      const grossProfit = netOfVat(version.selling_price, version.vat_rate) - (version.supplier_estimated_cost ?? 0);
      const estimatedAmount = Math.max(0, grossProfit) * (rateForProfile(quote.created_by) / 100);
      return { jobId: j.id, region: j.region, estimatedAmount, currency: quote.currency };
    });

  const rates: RateRow[] | null =
    canManage && rateProfiles
      ? [
          { profileId: null, name: "Tenant default", ratePercent: tenantDefaultRate, isOverride: false },
          ...rateProfiles.map((p) => {
            const override = plans.find((pl) => pl.profile_id === p.id);
            return {
              profileId: p.id,
              name: p.full_name,
              ratePercent: override ? Number(override.rate_percent) : tenantDefaultRate,
              isOverride: Boolean(override),
            };
          }),
        ]
      : null;

  return (
    <CommissionsPage
      summary={summary}
      rows={commissionRows}
      pipeline={pipelineRows}
      rates={rates}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
      status={status}
      q={q}
      canManage={canManage}
      canSeeMargin={canSeeMargin}
    />
  );
}
