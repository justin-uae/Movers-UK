import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { getKpiActuals } from "@/lib/kpiSummary";
import { KpisPage, type MyTargetRow, type LeaderboardRow, type ManagedTargetRow, type ProfileOption } from "@/components/pages/KpisPage";
import type { TargetMetric } from "@/lib/supabase/database.types";

const METRICS: TargetMetric[] = ["revenue_gbp", "gross_profit_gbp", "quotes_sent", "paid_bookings"];

function resolveMonth(input?: string): string {
  if (input && /^\d{4}-\d{2}$/.test(input)) return `${input}-01`;
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export default async function KpisRoutePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const canManage = await hasPermission(profile, PERMISSIONS.ADMIN_VIEW_AUDIT_LOGS);

  const periodMonth = resolveMonth(params.month);

  // RLS on `targets` already returns only the caller's own row for a
  // non-manager, and every row tenant-wide for a manager (admin.view_audit_logs)
  // — one query naturally serves both "my targets" and "manage everyone's".
  const [{ data: visibleTargets, error }, actuals, profilesResult] = await Promise.all([
    supabase.from("targets").select("id, profile_id, metric, target_value").eq("period_month", periodMonth),
    getKpiActuals(supabase, periodMonth),
    canManage ? supabase.from("profiles").select("id, full_name").order("full_name") : Promise.resolve({ data: null }),
  ]);
  if (error) throw new Error(error.message);

  const targetRows = visibleTargets ?? [];

  const myActuals = actuals[profile.id] ?? { revenueGbp: 0, grossProfitGbp: 0, quotesSent: 0, paidBookings: 0 };
  const myTargets: MyTargetRow[] = METRICS.map((metric) => ({
    metric,
    targetValue: targetRows.find((t) => t.profile_id === profile.id && t.metric === metric)?.target_value ?? null,
    actualValue:
      metric === "revenue_gbp"
        ? myActuals.revenueGbp
        : metric === "gross_profit_gbp"
          ? myActuals.grossProfitGbp
          : metric === "quotes_sent"
            ? myActuals.quotesSent
            : myActuals.paidBookings,
  }));

  const profileOptions: ProfileOption[] = (profilesResult.data ?? []).map((p) => ({ id: p.id, name: p.full_name }));

  const leaderboard: LeaderboardRow[] = profileOptions.map((p) => {
    const a = actuals[p.id] ?? { revenueGbp: 0, grossProfitGbp: 0, quotesSent: 0, paidBookings: 0 };
    return {
      profileId: p.id,
      name: p.name,
      revenueGbp: a.revenueGbp,
      grossProfitGbp: a.grossProfitGbp,
      quotesSent: a.quotesSent,
      paidBookings: a.paidBookings,
      conversionPct: a.quotesSent > 0 ? (a.paidBookings / a.quotesSent) * 100 : null,
    };
  });

  const managedTargets: ManagedTargetRow[] = canManage
    ? targetRows.map((t) => ({
        id: t.id,
        profileId: t.profile_id,
        profileName: profileOptions.find((p) => p.id === t.profile_id)?.name ?? "Unknown",
        metric: t.metric,
        targetValue: t.target_value,
      }))
    : [];

  return (
    <KpisPage
      periodMonth={periodMonth}
      myTargets={myTargets}
      canManage={canManage}
      leaderboard={leaderboard}
      managedTargets={managedTargets}
      profiles={profileOptions}
    />
  );
}
