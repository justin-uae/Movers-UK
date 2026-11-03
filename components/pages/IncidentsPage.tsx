"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { PageGuide } from "@/components/ui/PageGuide";
import { IncidentsDiagram } from "@/components/ui/guide-diagrams/IncidentsDiagram";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/formatDate";
import { logIncidentAction, updateIncidentStatusAction, assignIncidentAction } from "@/app/(staff)/incidents/actions";
import type { IncidentCategory, ServiceOpsSeverity, ServiceOpsStatus } from "@/lib/supabase/database.types";

export interface IncidentRow {
  id: string;
  category: IncidentCategory;
  severity: ServiceOpsSeverity;
  description: string;
  status: ServiceOpsStatus;
  resolutionNotes: string | null;
  createdAt: string;
  quoteNumber: string | null;
  supplierName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
}

export interface PickerOption {
  id: string;
  label: string;
}

const CATEGORIES: { value: IncidentCategory; label: string }[] = [
  { value: "accident", label: "Accident" },
  { value: "breakdown", label: "Breakdown" },
  { value: "delay", label: "Delay" },
  { value: "safety", label: "Safety" },
  { value: "other", label: "Other" },
];

const SEVERITIES: ServiceOpsSeverity[] = ["low", "medium", "high", "critical"];
const STATUSES: ServiceOpsStatus[] = ["open", "investigating", "resolved", "closed"];

const STATUS_BADGE: Record<ServiceOpsStatus, string> = {
  open: "bg-red-50 text-red-700",
  investigating: "bg-amber-50 text-amber-700",
  resolved: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-500",
};

const SEVERITY_BADGE: Record<ServiceOpsSeverity, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700",
  critical: "bg-red-100 text-red-800",
};

export function IncidentsPage({
  rows,
  jobs,
  suppliers,
  assignees,
  canManage,
}: {
  rows: IncidentRow[];
  jobs: (PickerOption & { quoteId: string })[];
  suppliers: PickerOption[];
  assignees: PickerOption[];
  canManage: boolean;
}) {
  const notify = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState<IncidentRow | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const [form, setForm] = useState({
    jobId: "",
    supplierId: "",
    category: "delay" as IncidentCategory,
    severity: "medium" as ServiceOpsSeverity,
    description: "",
    assigneeId: "",
  });

  const status = searchParams.get("status");
  const filtered = useMemo(() => (status ? rows.filter((r) => r.status === status) : rows), [rows, status]);

  function statusHref(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("status");
    else params.set("status", next);
    return `${pathname}?${params.toString()}`;
  }

  function submitNew() {
    startTransition(async () => {
      const job = jobs.find((j) => j.id === form.jobId);
      const result = await logIncidentAction({
        jobId: form.jobId || null,
        quoteId: job?.quoteId ?? null,
        supplierId: form.supplierId || null,
        category: form.category,
        severity: form.severity,
        description: form.description,
        assigneeId: form.assigneeId || null,
      });
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("Incident logged");
      setNewOpen(false);
      setForm({ jobId: "", supplierId: "", category: "delay", severity: "medium", description: "", assigneeId: "" });
      router.refresh();
    });
  }

  function changeStatus(row: IncidentRow, next: ServiceOpsStatus) {
    startTransition(async () => {
      try {
        await updateIncidentStatusAction(row.id, next, resolutionNotes);
        notify(`Marked ${next}`);
        setDetail(null);
        setResolutionNotes("");
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not update the incident.");
      }
    });
  }

  function reassign(row: IncidentRow, assigneeId: string) {
    startTransition(async () => {
      try {
        await assignIncidentAction(row.id, assigneeId || null);
        notify("Reassigned");
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not reassign the incident.");
      }
    });
  }

  return (
    <div>
      <PageHead
        eyebrow="Service Ops"
        title="Incidents"
        text="Accidents, breakdowns, delays and safety issues — logged and tracked to resolution."
        action={
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            <PageGuide
              title="Incidents"
              subtitle="Operational incidents on a job, logged and tracked to resolution."
              screenshot={<IncidentsDiagram />}
              sections={[
                {
                  heading: "What this page is",
                  body: [
                    "Anything that goes wrong operationally on a booking — an accident, breakdown, delay or safety issue — gets logged here, optionally linked to the booking and supplier involved, and assigned to someone to handle.",
                    "This is separate from Complaints: Incidents are about what happened on the road, Complaints are about what the customer said about it — the same event can end up as both.",
                  ],
                },
                {
                  heading: "Severity & status",
                  bullets: true,
                  body: [
                    "Severity: Low / Medium / High / Critical — Incidents go one level higher than Complaints since a safety issue can be more serious than a service complaint.",
                    "Status: Open → Investigating → Resolved, or Closed if no further action is needed.",
                    "Filter the list by status using the pills above the table.",
                  ],
                },
                {
                  heading: "Working an incident",
                  bullets: true,
                  body: [
                    "Log Incident records a new one — description, category, severity, linked booking/supplier, and who's handling it.",
                    "Click a row to open it, reassign who owns it, add resolution notes, and move it through Investigating → Resolved/Closed.",
                  ],
                },
              ]}
            />
            <button
              onClick={() => setNewOpen(true)}
              className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
            >
              <Plus size={17} />
              Log Incident
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {["all", ...STATUSES].map((s) => (
          <Link
            key={s}
            href={statusHref(s)}
            className={clsx(
              "rounded-xl px-3 py-2 text-sm font-bold capitalize",
              (s === "all" && !status) || status === s ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600",
            )}
          >
            {s}
          </Link>
        ))}
      </div>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">Incident</th>
                <th>Booking</th>
                <th>Supplier</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Assigned</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t hover:bg-orange-50/30" onClick={() => setDetail(r)}>
                  <td className="max-w-xs py-4">
                    <div className="truncate font-bold">{CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category}</div>
                    <div className="truncate text-xs text-slate-500">{r.description}</div>
                  </td>
                  <td className="whitespace-nowrap">{r.quoteNumber ?? "—"}</td>
                  <td className="whitespace-nowrap">{r.supplierName ?? "—"}</td>
                  <td className="whitespace-nowrap">
                    <span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold capitalize", SEVERITY_BADGE[r.severity])}>
                      {r.severity}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold capitalize", STATUS_BADGE[r.status])}>
                      {r.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-slate-500">{r.assigneeName ?? "Unassigned"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No incidents here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {newOpen && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setNewOpen(false)}
          title="Log an incident"
          pending={pending}
          confirmLabel="Log incident"
          onConfirm={submitNew}
        >
          <div className="space-y-3">
            <label className="block text-sm font-bold">
              Booking (job)
              <select
                value={form.jobId}
                onChange={(e) => setForm((f) => ({ ...f, jobId: e.target.value }))}
                className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
              >
                <option value="">Not linked to a booking</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold">
              Supplier
              <select
                value={form.supplierId}
                onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
              >
                <option value="">Not linked to a supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-bold">
                Category
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as IncidentCategory }))}
                  className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-bold">
                Severity
                <select
                  value={form.severity}
                  onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as ServiceOpsSeverity }))}
                  className="mt-1 w-full rounded-xl border px-3 py-2 font-normal capitalize"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm font-bold">
              Assign to
              <select
                value={form.assigneeId}
                onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
                className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
              >
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold">
              What happened
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="mt-1 min-h-24 w-full rounded-xl border px-3 py-2 font-normal"
              />
            </label>
          </div>
        </ConfirmDetailModal>
      )}

      {detail && (
        <ConfirmDetailModal
          open
          onClose={() => setDetail(null)}
          title={CATEGORIES.find((c) => c.value === detail.category)?.label ?? detail.category}
          description={detail.description}
          details={[
            { label: "Booking", value: detail.quoteNumber ?? "—" },
            { label: "Supplier", value: detail.supplierName ?? "—" },
            { label: "Severity", value: <span className="capitalize">{detail.severity}</span> },
            { label: "Status", value: <span className="capitalize">{detail.status}</span> },
            { label: "Logged", value: formatDateTime(detail.createdAt) },
          ]}
        >
          {canManage ? (
            <div className="space-y-3">
              <label className="block text-sm font-bold">
                Reassign to
                <select
                  defaultValue={detail.assigneeId ?? ""}
                  onChange={(e) => reassign(detail, e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                >
                  <option value="">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              {(detail.status === "open" || detail.status === "investigating") && (
                <label className="block text-sm font-bold">
                  Resolution notes
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    className="mt-1 min-h-20 w-full rounded-xl border px-3 py-2 font-normal"
                    placeholder="What was done to resolve this?"
                  />
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                {detail.status === "open" && (
                  <button
                    disabled={pending}
                    onClick={() => changeStatus(detail, "investigating")}
                    className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    Start investigating
                  </button>
                )}
                {(detail.status === "open" || detail.status === "investigating") && (
                  <button
                    disabled={pending}
                    onClick={() => changeStatus(detail, "resolved")}
                    className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    Mark resolved
                  </button>
                )}
                {detail.status !== "closed" && (
                  <button
                    disabled={pending}
                    onClick={() => changeStatus(detail, "closed")}
                    className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-60"
                  >
                    Close
                  </button>
                )}
              </div>
              {detail.resolutionNotes && (
                <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{detail.resolutionNotes}</p>
              )}
            </div>
          ) : (
            detail.resolutionNotes && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{detail.resolutionNotes}</p>
          )}
        </ConfirmDetailModal>
      )}
    </div>
  );
}
