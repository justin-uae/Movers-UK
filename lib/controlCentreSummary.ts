import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGbpRates } from "@/lib/fxRates";
import { startOfTodayIso } from "@/lib/attendance";
import { deriveAttendanceState, type AttendanceEventLike } from "@/lib/attendanceState";
import { SOURCE_LABEL } from "@/lib/leadSource";
import type { LeadSource } from "@/lib/supabase/database.types";

export interface ControlCentreKpis {
  revenueTodayGbp: number;
  profitTodayGbp: number;
  newLeadsToday: number;
  openPoolCount: number;
  jobsOperating: number;
  jobsNeedingAttention: number;
}

export interface TrendPoint {
  name: string;
  revenue: number;
  profit: number;
}

export interface ChannelSlice {
  name: string;
  value: number;
}

export interface TeamPerformanceRow {
  name: string;
  role: string;
  leads: number;
  conversionPct: number;
  revenueGbp: number;
  status: "Working" | "On Break" | "Off Shift";
}

export interface OpenPoolLead {
  id: string;
  route: string;
  source: string;
  createdAt: string;
}

export interface PriorityAlert {
  type: "danger" | "warning" | "success" | "info";
  title: string;
  text: string;
}

export interface ControlCentreSummary {
  kpis: ControlCentreKpis;
  trend: TrendPoint[];
  channelMix: ChannelSlice[];
  team: TeamPerformanceRow[];
  openPool: OpenPoolLead[];
  alerts: PriorityAlert[];
}

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toGbp(amount: number, currency: string, rates: Record<string, number>): number {
  const code = currency.toUpperCase();
  if (code === "GBP") return amount;
  const rate = rates[code];
  if (!rate) return amount;
  return amount / rate;
}

function dayStartIso(daysAgo: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

interface QuoteVersionRow {
  selling_price: number;
  supplier_estimated_cost: number | null;
}
interface PaidQuoteRow {
  created_by: string | null;
  currency: string;
  decided_at: string;
  quote_versions: QuoteVersionRow | null;
}
interface PaymentRow {
  amount: number;
  currency: string;
  paid_at: string;
}
interface LeadRow {
  id: string;
  source: string;
  status: string;
  assigned_user_id: string | null;
  pickup_text: string | null;
  destination_text: string | null;
  created_at: string;
}
interface JobRow {
  status: string;
}
interface ProfileRow {
  id: string;
  full_name: string;
  job_title: string | null;
}
interface AttendanceRow extends AttendanceEventLike {
  user_id: string;
}

/**
 * Tenant-wide dashboard summary for the Control Centre, computed straight
 * from real records (no demo data). Uses the service-role client rather
 * than the caller's RLS-scoped session — same reasoning as
 * lib/liveOperations.ts's getLeadsByCountry: leads_select (and the
 * equivalent quote/job policies) only expose what the current viewer is
 * personally assigned to, which would silently shrink a tenant-wide
 * overview down to just their own slice. Every query below is explicitly
 * scoped by tenantId to preserve tenant isolation despite bypassing RLS.
 */
export async function getControlCentreSummary(tenantId: string): Promise<ControlCentreSummary> {
  const admin = createAdminClient();
  const todayStart = startOfTodayIso();
  const sevenDaysStart = dayStartIso(6);
  const thirtyDaysStart = dayStartIso(29);
  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: paidQuotes7d },
    { data: payments7d },
    { data: leads30d },
    { data: openPoolLeadsRaw },
    { data: jobsRaw },
    { count: expiringQuotesCount },
    { count: overdueTaskCount },
    { data: profilesRaw },
    { data: attendanceToday },
    { data: paidQuotes30dForTeam },
    rates,
  ] = await Promise.all([
    admin
      .from("quotes")
      .select("created_by, currency, decided_at, quote_versions!quotes_current_version_id_fkey(selling_price, supplier_estimated_cost)")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("decided_at", sevenDaysStart),
    admin.from("customer_payments").select("amount, currency, paid_at").eq("tenant_id", tenantId).gte("paid_at", sevenDaysStart),
    admin
      .from("leads")
      .select("id, source, status, assigned_user_id, pickup_text, destination_text, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", thirtyDaysStart),
    admin
      .from("leads")
      .select("id, source, status, assigned_user_id, pickup_text, destination_text, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "open_pool")
      .order("created_at", { ascending: true }),
    admin.from("jobs").select("status").eq("tenant_id", tenantId),
    admin
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["sent", "viewed"])
      .lte("expiry_at", in24h)
      .gte("expiry_at", new Date().toISOString()),
    admin
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .lt("due_date", todayStart.slice(0, 10))
      .not("status", "in", "(done,cancelled)"),
    admin.from("profiles").select("id, full_name, job_title").eq("tenant_id", tenantId).eq("status", "active"),
    admin.from("attendance_events").select("user_id, event, created_at").eq("tenant_id", tenantId).gte("created_at", todayStart),
    admin
      .from("quotes")
      .select("created_by, currency, decided_at, quote_versions!quotes_current_version_id_fkey(selling_price, supplier_estimated_cost)")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("decided_at", thirtyDaysStart),
    getGbpRates().catch(() => ({}) as Record<string, number>),
  ]);

  const paidQuotes = (paidQuotes7d ?? []) as unknown as PaidQuoteRow[];
  const payments = (payments7d ?? []) as unknown as PaymentRow[];
  const leads30 = (leads30d ?? []) as unknown as LeadRow[];
  const openPoolLeads = (openPoolLeadsRaw ?? []) as unknown as LeadRow[];
  const jobs = (jobsRaw ?? []) as unknown as JobRow[];
  const profiles = (profilesRaw ?? []) as unknown as ProfileRow[];
  const attendance = (attendanceToday ?? []) as unknown as AttendanceRow[];
  const teamPaidQuotes = (paidQuotes30dForTeam ?? []) as unknown as PaidQuoteRow[];

  // --- 7-day trend + today's KPI slice ---------------------------------
  const revenueByDay = new Map<string, number>();
  const profitByDay = new Map<string, number>();
  for (const p of payments) {
    const key = dateKey(p.paid_at);
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + toGbp(Number(p.amount), p.currency, rates));
  }
  for (const q of paidQuotes) {
    if (!q.quote_versions) continue;
    const key = dateKey(q.decided_at);
    const sellingGbp = toGbp(q.quote_versions.selling_price, q.currency, rates);
    const costGbp = toGbp(q.quote_versions.supplier_estimated_cost ?? 0, q.currency, rates);
    profitByDay.set(key, (profitByDay.get(key) ?? 0) + (sellingGbp - costGbp));
  }

  const trend: TrendPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(dayStartIso(i));
    const key = dateKey(d.toISOString());
    trend.push({
      name: DAY_LABEL[d.getUTCDay()] ?? "",
      revenue: Math.round(revenueByDay.get(key) ?? 0),
      profit: Math.round(profitByDay.get(key) ?? 0),
    });
  }
  const todayKey = dateKey(todayStart);
  const revenueTodayGbp = Math.round(revenueByDay.get(todayKey) ?? 0);
  const profitTodayGbp = Math.round(profitByDay.get(todayKey) ?? 0);

  // --- Leads: today's count, channel mix, open pool ---------------------
  const newLeadsToday = leads30.filter((l) => l.created_at >= todayStart).length;

  const channelCounts = new Map<string, number>();
  for (const l of leads30) {
    channelCounts.set(l.source, (channelCounts.get(l.source) ?? 0) + 1);
  }
  const channelMix: ChannelSlice[] = [...channelCounts.entries()]
    .map(([source, count]) => ({
      name: SOURCE_LABEL[source as LeadSource] ?? source,
      value: Math.round((count / Math.max(1, leads30.length)) * 100),
    }))
    .sort((a, b) => b.value - a.value);

  const openPool: OpenPoolLead[] = openPoolLeads.slice(0, 6).map((l) => ({
    id: l.id,
    route: l.pickup_text && l.destination_text ? `${l.pickup_text} → ${l.destination_text}` : "Route not specified",
    source: SOURCE_LABEL[l.source as LeadSource] ?? l.source,
    createdAt: l.created_at,
  }));

  // --- Jobs ---------------------------------------------------------------
  const jobsOperating = jobs.filter((j) => j.status === "confirmed").length;
  const jobsNeedingAttention = jobs.filter((j) => j.status === "unassigned").length;

  // --- Team performance ---------------------------------------------------
  const revenueByProfile = new Map<string, number>();
  for (const q of teamPaidQuotes) {
    if (!q.created_by || !q.quote_versions) continue;
    const gbp = toGbp(q.quote_versions.selling_price, q.currency, rates);
    revenueByProfile.set(q.created_by, (revenueByProfile.get(q.created_by) ?? 0) + gbp);
  }
  const leadsByProfile = new Map<string, LeadRow[]>();
  for (const l of leads30) {
    if (!l.assigned_user_id) continue;
    const list = leadsByProfile.get(l.assigned_user_id) ?? [];
    list.push(l);
    leadsByProfile.set(l.assigned_user_id, list);
  }
  const attendanceByProfile = new Map<string, AttendanceEventLike[]>();
  for (const e of attendance) {
    const list = attendanceByProfile.get(e.user_id) ?? [];
    list.push({ event: e.event, created_at: e.created_at });
    attendanceByProfile.set(e.user_id, list);
  }

  const team: TeamPerformanceRow[] = profiles
    .map((p) => {
      const myLeads = leadsByProfile.get(p.id) ?? [];
      const converted = myLeads.filter((l) => l.status === "converted").length;
      const state = deriveAttendanceState(attendanceByProfile.get(p.id) ?? []);
      const status: TeamPerformanceRow["status"] =
        state.status === "working" ? "Working" : state.status === "on_break" ? "On Break" : "Off Shift";
      return {
        name: p.full_name,
        role: p.job_title ?? "Team Member",
        leads: myLeads.length,
        conversionPct: myLeads.length > 0 ? Math.round((converted / myLeads.length) * 100) : 0,
        revenueGbp: Math.round(revenueByProfile.get(p.id) ?? 0),
        status,
      };
    })
    .filter((row) => row.leads > 0 || row.revenueGbp > 0)
    .sort((a, b) => b.revenueGbp - a.revenueGbp)
    .slice(0, 8);

  // --- Priority alerts (rule-based, not AI) -------------------------------
  const alerts: PriorityAlert[] = [];
  if (openPoolLeads.length > 0) {
    const oldestMinutes = Math.max(0, Math.round((Date.now() - new Date(openPoolLeads[0]!.created_at).getTime()) / 60000));
    if (oldestMinutes >= 10) {
      alerts.push({
        type: "danger",
        title: `${openPoolLeads.length} lead${openPoolLeads.length === 1 ? "" : "s"} waiting in the open pool`,
        text: `Oldest has been waiting ${oldestMinutes} minutes.`,
      });
    }
  }
  const expiringCount = expiringQuotesCount ?? 0;
  if (expiringCount > 0) {
    alerts.push({
      type: "warning",
      title: `${expiringCount} quote${expiringCount === 1 ? "" : "s"} expiring within 24 hours`,
      text: "Follow up before these lapse unanswered.",
    });
  }
  if (jobsNeedingAttention > 0) {
    alerts.push({
      type: "danger",
      title: `${jobsNeedingAttention} job${jobsNeedingAttention === 1 ? "" : "s"} need a supplier assigned`,
      text: "These are unassigned in Dispatch.",
    });
  }
  const overdueTasks = overdueTaskCount ?? 0;
  if (overdueTasks > 0) {
    alerts.push({
      type: "warning",
      title: `${overdueTasks} task${overdueTasks === 1 ? "" : "s"} overdue`,
      text: "Check the Tasks board for what's slipped.",
    });
  }
  if (alerts.length === 0) {
    alerts.push({ type: "success", title: "All clear", text: "No leads waiting, no expiring quotes, no unassigned jobs or overdue tasks." });
  }

  return {
    kpis: {
      revenueTodayGbp,
      profitTodayGbp,
      newLeadsToday,
      openPoolCount: openPoolLeads.length,
      jobsOperating,
      jobsNeedingAttention,
    },
    trend,
    channelMix,
    team,
    openPool,
    alerts,
  };
}
