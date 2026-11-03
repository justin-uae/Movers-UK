"use client";

import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Line,
} from "recharts";
import {
  CircleDollarSign,
  TrendingUp,
  Users,
  Bus,
  MapPin,
  ShieldAlert,
} from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Alert } from "@/components/ui/Alert";
import { LiveOperationsMap, type CountryLeadCluster } from "@/components/pages/LiveOperationsMap";
import { formatDateTime } from "@/lib/formatDate";
import type { ControlCentreSummary } from "@/lib/controlCentreSummary";
import { BRAND } from "@/lib/brandConfig";

const CHANNEL_COLORS = ["#f97316", "#fb923c", "#fdba74", "#172033", "#94a3b8", "#38bdf8", "#a855f7", "#ef4444"];

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

const STATUS_BADGE: Record<string, string> = {
  Working: "bg-emerald-50 text-emerald-700",
  "On Break": "bg-amber-50 text-amber-700",
  "Off Shift": "bg-slate-100 text-slate-500",
};

export function ControlCentre({
  greeting,
  displayName,
  leadClusters,
  summary,
}: {
  /** "Good morning" etc. — computed server-side in UK time (lib/formatDate.ts). */
  greeting: string;
  displayName: string;
  leadClusters: CountryLeadCluster[];
  summary: ControlCentreSummary;
}) {
  const { kpis, trend, channelMix, team, openPool, alerts } = summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="text-sm font-bold uppercase tracking-[.18em] text-primary-500">
            {BRAND.shortName} Control Centre
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
            {greeting}, {displayName}
          </h1>
          <p className="mt-2 text-slate-500">
            Live operations, finance and sales intelligence across every brand.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Revenue/profit aren't clickable: they're totals rolled up from
            today's completed jobs across every brand — there's no single
            list page that shows exactly that set. */}
        <Kpi title="Revenue today" value={compactGbp(kpis.revenueTodayGbp)} icon={CircleDollarSign} />
        <Kpi title="Gross profit today" value={compactGbp(kpis.profitTodayGbp)} icon={TrendingUp} />
        <Kpi
          title="New leads today"
          value={String(kpis.newLeadsToday)}
          delta={`${kpis.openPoolCount} waiting`}
          icon={Users}
          warn={kpis.openPoolCount > 0}
          href="/leads?tab=all&sort=created_desc"
        />
        <Kpi
          title="Jobs operating"
          value={String(kpis.jobsOperating)}
          delta={`${kpis.jobsNeedingAttention} need attention`}
          icon={Bus}
          warn={kpis.jobsNeedingAttention > 0}
          href="/dispatch"
        />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.45fr_.85fr]">
        <Panel className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b p-5">
            <div>
              <h2 className="font-black">Live global operations</h2>
              <p className="text-sm text-slate-500">Active bookings, leads and supplier activity</p>
            </div>
          </div>
          <LiveOperationsMap clusters={leadClusters} />
        </Panel>
        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black">Priority alerts</h2>
              <p className="text-sm text-slate-500">Computed from what needs attention right now</p>
            </div>
            <ShieldAlert className="text-primary-500" />
          </div>
          <div className="mt-5 space-y-3">
            {alerts.map((a, i) => (
              <Alert key={i} type={a.type} title={a.title} text={a.text} />
            ))}
          </div>
          <Link
            href="/ai-optimisation"
            className="mt-5 block w-full rounded-xl bg-primary-50 py-3 text-center text-sm font-black text-primary-700"
          >
            Open Optimisation Centre
          </Link>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <SectionTitle title="Revenue & profit trend" sub="Last 7 days" />
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#f97316" fill="url(#rev)" strokeWidth={3} />
                <Line type="monotone" dataKey="profit" stroke="#172033" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <SectionTitle title="Lead channels" sub="Mix over the last 30 days" />
          {channelMix.length > 0 ? (
            <>
              <div className="mt-4 h-56">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={channelMix} innerRadius={58} outerRadius={88} paddingAngle={3} dataKey="value">
                      {channelMix.map((_, i) => (
                        <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]!} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {channelMix.map((x, i) => (
                  <div key={x.name} className="flex items-center gap-2">
                    <i className="h-2.5 w-2.5 rounded-full" style={{ background: CHANNEL_COLORS[i % CHANNEL_COLORS.length]! }} />
                    {x.name} <b className="ml-auto">{x.value}%</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-8 text-center text-sm text-slate-500">No leads in the last 30 days.</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="min-w-0">
          <SectionTitle title="Team performance" sub="Last 30 days, live status" />
          <div className="mt-4 space-y-3 sm:hidden">
            {team.map((u) => (
              <div key={u.name} className="rounded-2xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <b>{u.name}</b>
                    <div className="text-xs text-slate-400">{u.role}</div>
                  </div>
                  <span className={"rounded-full px-2 py-1 text-xs font-bold " + (STATUS_BADGE[u.status] ?? "bg-slate-100 text-slate-500")}>
                    {u.status}
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>{u.leads} leads</span>
                  <span>{u.conversionPct}% conversion</span>
                  <span className="font-bold text-slate-700">{compactGbp(u.revenueGbp)}</span>
                </div>
              </div>
            ))}
            {team.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No recent sales activity yet.</p>}
          </div>
          <div className="mt-4 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="pb-3">User</th>
                  <th>Leads</th>
                  <th>Conversion</th>
                  <th>Revenue</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {team.map((u) => (
                  <tr key={u.name} className="border-t">
                    <td className="whitespace-nowrap py-3">
                      <b>{u.name}</b>
                      <div className="text-xs text-slate-400">{u.role}</div>
                    </td>
                    <td className="whitespace-nowrap">{u.leads}</td>
                    <td className="whitespace-nowrap">{u.conversionPct}%</td>
                    <td className="whitespace-nowrap font-bold">{compactGbp(u.revenueGbp)}</td>
                    <td className="whitespace-nowrap">
                      <span className={"rounded-full px-2 py-1 text-xs font-bold " + (STATUS_BADGE[u.status] ?? "bg-slate-100 text-slate-500")}>
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {team.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                      No recent sales activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel>
          <SectionTitle title="Open lead pool" sub={`${openPool.length} available leads`} />
          <div className="mt-4 space-y-3">
            {openPool.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-2xl border p-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-50 text-primary-600">
                  <MapPin size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <b className="text-sm">{l.route}</b>
                  <div className="text-xs text-slate-500">
                    {l.source} • {formatDateTime(l.createdAt)}
                  </div>
                </div>
                <Link href="/leads" className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                  View
                </Link>
              </div>
            ))}
            {openPool.length === 0 && <p className="py-4 text-center text-sm text-slate-500">The open pool is empty.</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
