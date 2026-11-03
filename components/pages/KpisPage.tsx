"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { KpisDiagram } from "@/components/ui/guide-diagrams/KpisDiagram";
import { useToast } from "@/components/ui/Toast";
import { setTargetAction, deleteTargetAction } from "@/app/(staff)/kpis/actions";
import type { TargetMetric } from "@/lib/supabase/database.types";

export interface MyTargetRow {
  metric: TargetMetric;
  targetValue: number | null;
  actualValue: number;
}

export interface LeaderboardRow {
  profileId: string;
  name: string;
  revenueGbp: number;
  grossProfitGbp: number;
  quotesSent: number;
  paidBookings: number;
  conversionPct: number | null;
}

export interface ManagedTargetRow {
  id: string;
  profileId: string;
  profileName: string;
  metric: TargetMetric;
  targetValue: number;
}

export interface ProfileOption {
  id: string;
  name: string;
}

const METRIC_LABEL: Record<TargetMetric, string> = {
  revenue_gbp: "Revenue",
  gross_profit_gbp: "Gross Profit",
  quotes_sent: "Quotes Sent",
  paid_bookings: "Paid Bookings",
};
const IS_MONEY: Record<TargetMetric, boolean> = {
  revenue_gbp: true,
  gross_profit_gbp: true,
  quotes_sent: false,
  paid_bookings: false,
};
const METRICS = Object.keys(METRIC_LABEL) as TargetMetric[];

function gbp(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(
    amount,
  );
}

function formatMetric(metric: TargetMetric, value: number) {
  return IS_MONEY[metric] ? gbp(value) : String(Math.round(value));
}

function monthLabel(periodMonth: string) {
  return new Date(`${periodMonth}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function shiftMonth(periodMonth: string, delta: number) {
  const parts = periodMonth.split("-").map(Number);
  const y = parts[0] ?? new Date().getUTCFullYear();
  const m = parts[1] ?? 1;
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function emptyForm() {
  return { profileId: "", metric: "revenue_gbp" as TargetMetric, value: "" };
}

export function KpisPage({
  periodMonth,
  myTargets,
  canManage,
  leaderboard,
  managedTargets,
  profiles,
}: {
  periodMonth: string;
  myTargets: MyTargetRow[];
  canManage: boolean;
  leaderboard: LeaderboardRow[];
  managedTargets: ManagedTargetRow[];
  profiles: ProfileOption[];
}) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [sortMetric, setSortMetric] = useState<TargetMetric>("revenue_gbp");

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ManagedTargetRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const sortedLeaderboard = useMemo(() => {
    const key = sortMetric === "revenue_gbp" ? "revenueGbp" : sortMetric === "gross_profit_gbp" ? "grossProfitGbp" : sortMetric === "quotes_sent" ? "quotesSent" : "paidBookings";
    return [...leaderboard].sort((a, b) => b[key] - a[key]);
  }, [leaderboard, sortMetric]);

  function openNewTarget() {
    setForm(emptyForm());
    setFormError(null);
    setFormOpen(true);
  }

  function openEditTarget(row: ManagedTargetRow) {
    setForm({ profileId: row.profileId, metric: row.metric, value: String(row.targetValue) });
    setFormError(null);
    setFormOpen(true);
  }

  function submitForm() {
    if (!form.profileId) {
      setFormError("Choose a person.");
      return;
    }
    const value = Number(form.value);
    if (!Number.isFinite(value) || value < 0) {
      setFormError("Target must be a positive number.");
      return;
    }
    startTransition(async () => {
      try {
        await setTargetAction({ profileId: form.profileId, metric: form.metric, periodMonth, targetValue: value });
        notify("Target saved");
        setFormOpen(false);
        router.refresh();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Could not save this target.");
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteTargetAction(deleteTarget.id);
        notify("Target removed");
        setDeleteTarget(null);
        router.refresh();
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "Could not remove this target.");
      }
    });
  }

  return (
    <div>
      <PageHead
        eyebrow="Performance"
        title="KPIs & Targets"
        text="Individual monthly targets, tracked against real revenue, profit, quotes and bookings data."
        action={
          <div className="flex flex-wrap items-start gap-2">
            <PageGuide
              title="KPIs & Targets"
              subtitle="Monthly targets for yourself, plus a team leaderboard and target management for managers."
              screenshot={<KpisDiagram />}
              sections={[
                {
                  heading: "My targets",
                  body: [
                    "Your own targets for the selected month, shown as progress bars against real data — revenue, gross profit, quotes sent and paid bookings. A bar turns green once you hit 100%.",
                  ],
                },
                {
                  heading: "Leaderboard",
                  body: [
                    "Managers only. Ranks everyone by whichever metric is selected in the dropdown, using the same real figures as My targets.",
                  ],
                },
                {
                  heading: "Manage targets",
                  body: [
                    "Managers only. Set target adds a new target for a person/metric/month; Edit changes an existing one. Targets are per calendar month — use the ◂ ▸ arrows to switch months.",
                  ],
                },
              ]}
            />
            <div className="flex items-center gap-2 rounded-xl border bg-white px-2 py-1.5">
              <Link href={`/kpis?month=${shiftMonth(periodMonth, -1)}`} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Previous month">
                <ChevronLeft size={16} />
              </Link>
              <span className="min-w-[9rem] text-center text-sm font-bold">{monthLabel(periodMonth)}</span>
              <Link href={`/kpis?month=${shiftMonth(periodMonth, 1)}`} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Next month">
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        }
      />

      <Panel>
        <SectionTitle title="My targets" />
        <div className="mt-4 space-y-4">
          {myTargets.map((row) => {
            const pct = row.targetValue ? Math.min(100, (row.actualValue / row.targetValue) * 100) : 0;
            return (
              <div key={row.metric}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold text-slate-700">{METRIC_LABEL[row.metric]}</span>
                  <span className="text-slate-500">
                    {formatMetric(row.metric, row.actualValue)} {row.targetValue !== null ? `of ${formatMetric(row.metric, row.targetValue)}` : "— no target set"}
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={clsx("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-primary-500")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {canManage && (
        <Panel className="mt-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle title="Leaderboard" />
            <select
              value={sortMetric}
              onChange={(e) => setSortMetric(e.target.value as TargetMetric)}
              className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-600"
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  Rank by {METRIC_LABEL[m]}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="pb-3">Person</th>
                  <th>Revenue</th>
                  <th>Gross Profit</th>
                  <th>Quotes Sent</th>
                  <th>Paid Bookings</th>
                  <th>Conversion</th>
                </tr>
              </thead>
              <tbody>
                {sortedLeaderboard.map((row, i) => (
                  <tr key={row.profileId} className="border-t">
                    <td className="py-3 font-bold">
                      <span className="mr-2 text-slate-400">#{i + 1}</span>
                      {row.name}
                    </td>
                    <td className="whitespace-nowrap">{gbp(row.revenueGbp)}</td>
                    <td className="whitespace-nowrap">{gbp(row.grossProfitGbp)}</td>
                    <td className="whitespace-nowrap">{row.quotesSent}</td>
                    <td className="whitespace-nowrap">{row.paidBookings}</td>
                    <td className="whitespace-nowrap">{row.conversionPct !== null ? `${row.conversionPct.toFixed(0)}%` : "—"}</td>
                  </tr>
                ))}
                {sortedLeaderboard.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No staff to rank yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {canManage && (
        <Panel className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <SectionTitle title="Manage targets" />
            <button
              onClick={openNewTarget}
              className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200"
            >
              <Plus size={17} />
              Set target
            </button>
          </div>

          <div className="space-y-2">
            {managedTargets.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
                <div>
                  <div className="text-sm font-bold">{row.profileName}</div>
                  <div className="text-xs text-slate-500">
                    {METRIC_LABEL[row.metric]} · {formatMetric(row.metric, row.targetValue)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEditTarget(row)} className="rounded-lg border px-3 py-1.5 text-xs font-bold">
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      setDeleteTarget(row);
                      setDeleteError(null);
                    }}
                    className="rounded-lg border border-red-200 p-1.5 text-red-600"
                    aria-label="Delete target"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {managedTargets.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No targets set for this month yet.</p>}
          </div>
        </Panel>
      )}

      <ConfirmDetailModal
        open={formOpen}
        onClose={() => !pending && setFormOpen(false)}
        title="Set a target"
        description={monthLabel(periodMonth)}
        pending={pending}
        error={formError}
        confirmLabel="Save"
        onConfirm={submitForm}
      >
        <div className="space-y-3">
          <label className="block text-sm font-bold">
            Person
            <select
              value={form.profileId}
              onChange={(e) => setForm((f) => ({ ...f, profileId: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
            >
              <option value="">Choose…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold">
            Metric
            <select
              value={form.metric}
              onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value as TargetMetric }))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold">
            Target value
            <input
              type="number"
              min={0}
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder={IS_MONEY[form.metric] ? "e.g. 25000" : "e.g. 40"}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
            />
          </label>
        </div>
      </ConfirmDetailModal>

      {deleteTarget && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setDeleteTarget(null)}
          title="Remove this target?"
          pending={pending}
          error={deleteError}
          destructive
          details={[
            { label: "Person", value: deleteTarget.profileName },
            { label: "Metric", value: METRIC_LABEL[deleteTarget.metric] },
          ]}
          confirmLabel="Remove"
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
