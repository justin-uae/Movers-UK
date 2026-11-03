"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CircleGauge, Clock3, FileCheck2, CheckCircle2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { CommissionsDiagram } from "@/components/ui/guide-diagrams/CommissionsDiagram";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { useToast } from "@/components/ui/Toast";
import {
  approveCommissionAction,
  markCommissionPaidAction,
  reverseCommissionAction,
  setCommissionRateAction,
} from "@/app/(staff)/commissions/actions";
import type { CommissionSummary } from "@/lib/commissionSummary";
import type { CommissionStatus } from "@/lib/supabase/database.types";

export interface CommissionRow {
  id: string;
  status: CommissionStatus;
  grossProfit: number;
  ratePercent: number;
  amount: number;
  currency: string;
  approvedAt: string | null;
  paidAt: string | null;
  payrollReference: string | null;
  reversedReason: string | null;
  createdAt: string;
  salespersonName: string;
  jobRegion: string | null;
}

export interface PipelineRow {
  jobId: string;
  region: string | null;
  estimatedAmount: number;
  currency: string;
}

export interface RateRow {
  profileId: string | null;
  name: string;
  ratePercent: number;
  isOverride: boolean;
}

const STATUS_TABS: { key: CommissionStatus; label: string }[] = [
  { key: "pending_approval", label: "Pending Approval" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
  { key: "reversed", label: "Reversed" },
];

const STATUS_BADGE: Record<CommissionStatus, string> = {
  pending_approval: "bg-amber-50 text-amber-700",
  approved: "bg-blue-50 text-blue-700",
  paid: "bg-emerald-50 text-emerald-700",
  reversed: "bg-red-50 text-red-700",
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

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

function tabHref(key: string, q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (key !== "pending_approval") params.set("status", key);
  const qs = params.toString();
  return `/commissions${qs ? `?${qs}` : ""}`;
}

type ModalKind = "approve" | "pay" | "reverse";

export function CommissionsPage({
  summary,
  rows,
  pipeline,
  rates,
  page,
  pageSize,
  total,
  status,
  q,
  canManage,
  canSeeMargin,
}: {
  summary: CommissionSummary;
  rows: CommissionRow[];
  pipeline: PipelineRow[];
  rates: RateRow[] | null;
  page: number;
  pageSize: number;
  total: number;
  status: CommissionStatus;
  q: string;
  canManage: boolean;
  canSeeMargin: boolean;
}) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<{ row: CommissionRow; kind: ModalKind } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [payrollReference, setPayrollReference] = useState("");
  const [reverseReason, setReverseReason] = useState("");
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [ratePending, setRatePending] = useState<string | null>(null);

  function openModal(row: CommissionRow, kind: ModalKind) {
    setModal({ row, kind });
    setModalError(null);
    setPayrollReference("");
    setReverseReason("");
  }

  function closeModal() {
    if (pending) return;
    setModal(null);
  }

  function confirm() {
    if (!modal) return;
    startTransition(async () => {
      try {
        if (modal.kind === "approve") {
          await approveCommissionAction(modal.row.id);
          notify("Commission approved");
        } else if (modal.kind === "pay") {
          await markCommissionPaidAction(modal.row.id, payrollReference);
          notify("Commission marked as paid");
        } else {
          if (!reverseReason.trim()) {
            setModalError("A reason is required.");
            return;
          }
          await reverseCommissionAction(modal.row.id, reverseReason);
          notify("Commission reversed");
        }
        setModal(null);
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function saveRate(profileId: string | null) {
    const key = profileId ?? "default";
    const draft = rateDrafts[key];
    if (draft === undefined) return;
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      notify("Rate must be between 0 and 100.");
      return;
    }
    setRatePending(key);
    startTransition(async () => {
      try {
        await setCommissionRateAction(profileId, value);
        notify("Rate updated");
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not update rate.");
      } finally {
        setRatePending(null);
      }
    });
  }

  return (
    <div>
      <PageHead
        eyebrow="Completed-Job Commission"
        title="Commission management"
        text="Commission becomes payable only after the journey is completed and final costs are approved."
        action={
          <PageGuide
            title="Commission management"
            subtitle="Sales commission — only payable once a job is complete and costs are locked in."
            screenshot={<CommissionsDiagram />}
            sections={[
              {
                heading: "What this page is",
                body: [
                  "A commission is calculated automatically once a job is completed and its final costs are in — as a percentage of gross profit (selling price minus supplier cost), not the full booking value. Nothing on this page needs a manual calculation.",
                ],
              },
              {
                heading: "The lifecycle",
                bullets: true,
                body: [
                  "Pending Approval — calculated, waiting for a manager to confirm the margin and amount are correct.",
                  "Approved — confirmed, waiting to be included in payroll.",
                  "Paid — included in a payroll run, with an optional reference number.",
                  "Reversed — a carry-forward adjustment for a dispute or cancellation after approval, kept as a record rather than deleted.",
                ],
              },
              {
                heading: "Pipeline & Rates",
                bullets: true,
                body: [
                  "Pipeline — jobs still in flight, shown as an estimate only until the job actually completes.",
                  "Rates — the % of gross profit paid out, with a per-salesperson override on top of the tenant default. Only visible if you manage commissions.",
                ],
              },
            ]}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Pending approval"
          value={compactGbp(summary.pendingApprovalGbp)}
          delta={`${summary.pendingApprovalCount} job${summary.pendingApprovalCount === 1 ? "" : "s"}`}
          icon={Clock3}
          warn={summary.pendingApprovalCount > 0}
          href={tabHref("pending_approval", q)}
        />
        <Kpi
          title="Approved, unpaid"
          value={compactGbp(summary.approvedUnpaidGbp)}
          delta={`${summary.approvedUnpaidCount} job${summary.approvedUnpaidCount === 1 ? "" : "s"}`}
          icon={FileCheck2}
          href={tabHref("approved", q)}
        />
        {/* Links to the Paid tab, which is every paid commission ever, not
            just this month — the page has no month filter to narrow it
            further, so this is the closest honest match. */}
        <Kpi title="Paid this month" value={compactGbp(summary.paidThisMonthGbp)} delta="Payroll" icon={CheckCircle2} href={tabHref("paid", q)} />
        <Kpi
          title="Estimated pipeline"
          value={compactGbp(summary.estimatedPipelineGbp)}
          delta={`${summary.estimatedPipelineCount} in-flight`}
          icon={CircleGauge}
          href="#pipeline"
        />
      </div>

      <Panel className="mt-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((t) => (
              <Link
                key={t.key}
                href={tabHref(t.key, q)}
                className={clsx(
                  "rounded-xl px-3 py-2 text-sm font-bold",
                  status === t.key ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600",
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>
          {canManage && <SearchInput placeholder="Search by salesperson…" />}
        </div>

        <div className="space-y-3 sm:hidden">
          {rows.map((row) => (
            <CommissionCard key={row.id} row={row} canManage={canManage} canSeeMargin={canSeeMargin} onAction={openModal} />
          ))}
          {rows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No commissions here.</p>}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">Salesperson</th>
                <th>Job</th>
                {canSeeMargin && <th>Gross profit</th>}
                <th>Rate</th>
                <th>Commission</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="whitespace-nowrap py-4 font-bold">{row.salespersonName}</td>
                  <td className="whitespace-nowrap">{row.jobRegion ?? "—"}</td>
                  {canSeeMargin && <td className="whitespace-nowrap">{money(row.grossProfit, row.currency)}</td>}
                  <td className="whitespace-nowrap">{row.ratePercent}%</td>
                  <td className="whitespace-nowrap font-bold text-primary-600">{money(row.amount, row.currency)}</td>
                  <td className="whitespace-nowrap">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[row.status]}`}>
                      {row.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <CommissionActions row={row} canManage={canManage} onAction={openModal} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canSeeMargin ? 7 : 6} className="py-8 text-center text-sm text-slate-500">
                    No commissions here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Panel>

      <Panel id="pipeline" className="mt-5 scroll-mt-24">
        <SectionTitle title="Pipeline" sub="In-flight jobs not yet completed — estimated, not final" />
        <div className="mt-4 space-y-2">
          {pipeline.map((p) => (
            <div key={p.jobId} className="flex items-center justify-between gap-2 rounded-xl border p-3 text-sm">
              <div>
                <b>{p.region ?? "Region not set"}</b>
                <span className="ml-2 text-xs font-bold uppercase text-amber-600">Estimated</span>
              </div>
              <b className="text-slate-600">{money(p.estimatedAmount, p.currency)}</b>
            </div>
          ))}
          {pipeline.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No jobs in progress.</p>}
        </div>
      </Panel>

      {canManage && rates && (
        <Panel className="mt-5">
          <SectionTitle title="Rates" sub="Percentage of gross profit — per-user override, falling back to the tenant default" />
          <div className="mt-4 space-y-2">
            {rates.map((r) => {
              const key = r.profileId ?? "default";
              return (
                <div key={key} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                  <div>
                    <b>{r.name}</b>
                    {!r.isOverride && r.profileId && <span className="ml-2 text-xs text-slate-400">(using default)</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      defaultValue={r.ratePercent}
                      onChange={(e) => setRateDrafts((d) => ({ ...d, [key]: e.target.value }))}
                      className="w-20 rounded-lg border px-2 py-1.5 text-right text-sm"
                    />
                    <span className="text-slate-400">%</span>
                    <button
                      disabled={ratePending === key}
                      onClick={() => saveRate(r.profileId)}
                      className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {modal && (
        <ConfirmDetailModal
          open
          onClose={closeModal}
          title={
            modal.kind === "approve"
              ? "Approve this commission?"
              : modal.kind === "pay"
                ? "Mark this commission as paid?"
                : "Reverse this commission?"
          }
          description={
            modal.kind === "approve"
              ? "Confirms the final margin and commission amount below are correct."
              : modal.kind === "pay"
                ? "Confirms this has been included in payroll."
                : "Creates a carry-forward adjustment rather than deleting the record — use for disputes or cancellations after approval."
          }
          pending={pending}
          error={modalError}
          destructive={modal.kind === "reverse"}
          details={[
            { label: "Salesperson", value: modal.row.salespersonName },
            { label: "Job", value: modal.row.jobRegion ?? "—" },
            ...(canSeeMargin ? [{ label: "Gross profit", value: money(modal.row.grossProfit, modal.row.currency) }] : []),
            { label: "Commission", value: money(modal.row.amount, modal.row.currency) },
          ]}
          confirmLabel={modal.kind === "approve" ? "Approve" : modal.kind === "pay" ? "Mark paid" : "Reverse"}
          onConfirm={confirm}
        >
          {modal.kind === "pay" && (
            <label className="block text-sm font-bold">
              Payroll reference (optional)
              <input
                value={payrollReference}
                onChange={(e) => setPayrollReference(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              />
            </label>
          )}
          {modal.kind === "reverse" && (
            <label className="block text-sm font-bold">
              Reason
              <input
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              />
            </label>
          )}
        </ConfirmDetailModal>
      )}
    </div>
  );
}

function CommissionActions({
  row,
  canManage,
  onAction,
}: {
  row: CommissionRow;
  canManage: boolean;
  onAction: (row: CommissionRow, kind: ModalKind) => void;
}) {
  if (!canManage) return null;
  if (row.status === "pending_approval") {
    return (
      <button onClick={() => onAction(row, "approve")} className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white">
        Approve
      </button>
    );
  }
  if (row.status === "approved") {
    return (
      <div className="flex justify-end gap-2">
        <button onClick={() => onAction(row, "pay")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">
          Mark paid
        </button>
        <button onClick={() => onAction(row, "reverse")} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600">
          Reverse
        </button>
      </div>
    );
  }
  if (row.status === "paid") {
    return (
      <button onClick={() => onAction(row, "reverse")} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600">
        Reverse
      </button>
    );
  }
  return null;
}

function CommissionCard({
  row,
  canManage,
  canSeeMargin,
  onAction,
}: {
  row: CommissionRow;
  canManage: boolean;
  canSeeMargin: boolean;
  onAction: (row: CommissionRow, kind: ModalKind) => void;
}) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <b>{row.salespersonName}</b>
          <div className="text-xs text-slate-500">{row.jobRegion ?? "Region not set"}</div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[row.status]}`}>
          {row.status.replaceAll("_", " ")}
        </span>
      </div>
      <div className={clsx("mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 text-sm", canSeeMargin ? "grid-cols-3" : "grid-cols-2")}>
        {canSeeMargin && (
          <div>
            <div className="text-xs font-bold uppercase text-slate-400">Gross profit</div>
            <b>{money(row.grossProfit, row.currency)}</b>
          </div>
        )}
        <div>
          <div className="text-xs font-bold uppercase text-slate-400">Rate</div>
          <b>{row.ratePercent}%</b>
        </div>
        <div>
          <div className="text-xs font-bold uppercase text-slate-400">Commission</div>
          <b className="text-primary-600">{money(row.amount, row.currency)}</b>
        </div>
      </div>
      {canManage && row.status !== "reversed" && (
        <div className="mt-3 flex justify-end">
          <CommissionActions row={row} canManage={canManage} onAction={onAction} />
        </div>
      )}
    </div>
  );
}
