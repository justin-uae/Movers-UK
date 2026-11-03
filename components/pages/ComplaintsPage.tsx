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
import { ComplaintsDiagram } from "@/components/ui/guide-diagrams/ComplaintsDiagram";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/formatDate";
import { fileComplaintAction, updateComplaintStatusAction, assignComplaintAction } from "@/app/(staff)/complaints/actions";
import type { ComplaintCategory, ServiceOpsSeverity, ServiceOpsStatus } from "@/lib/supabase/database.types";

export interface ComplaintRow {
  id: string;
  category: ComplaintCategory;
  severity: ServiceOpsSeverity;
  description: string;
  status: ServiceOpsStatus;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  customerLabel: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
}

export interface PickerOption {
  id: string;
  label: string;
}

const CATEGORIES: { value: ComplaintCategory; label: string }[] = [
  { value: "service_quality", label: "Service quality" },
  { value: "driver_behavior", label: "Driver behaviour" },
  { value: "vehicle_condition", label: "Vehicle condition" },
  { value: "billing", label: "Billing" },
  { value: "communication", label: "Communication" },
  { value: "other", label: "Other" },
];

const SEVERITIES: ServiceOpsSeverity[] = ["low", "medium", "high"];
const STATUSES: ServiceOpsStatus[] = ["open", "investigating", "resolved", "closed"];

const STATUS_BADGE: Record<ServiceOpsStatus, string> = {
  open: "bg-red-50 text-red-700",
  investigating: "bg-amber-50 text-amber-700",
  resolved: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-500",
};

const SEVERITY_BADGE: Record<ServiceOpsSeverity | "critical", string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700",
  critical: "bg-red-100 text-red-800",
};

export function ComplaintsPage({
  rows,
  customers,
  quotes,
  assignees,
  canManage,
}: {
  rows: ComplaintRow[];
  customers: PickerOption[];
  quotes: PickerOption[];
  assignees: PickerOption[];
  canManage: boolean;
}) {
  const notify = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState<ComplaintRow | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const [form, setForm] = useState({
    customerId: "",
    quoteId: "",
    category: "service_quality" as ComplaintCategory,
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
      const result = await fileComplaintAction({
        customerId: form.customerId || null,
        quoteId: form.quoteId || null,
        category: form.category,
        severity: form.severity,
        description: form.description,
        assigneeId: form.assigneeId || null,
      });
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("Complaint filed");
      setNewOpen(false);
      setForm({ customerId: "", quoteId: "", category: "service_quality", severity: "medium", description: "", assigneeId: "" });
      router.refresh();
    });
  }

  function changeStatus(row: ComplaintRow, next: ServiceOpsStatus) {
    startTransition(async () => {
      try {
        await updateComplaintStatusAction(row.id, next, resolutionNotes);
        notify(`Marked ${next}`);
        setDetail(null);
        setResolutionNotes("");
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not update the complaint.");
      }
    });
  }

  function reassign(row: ComplaintRow, assigneeId: string) {
    startTransition(async () => {
      try {
        await assignComplaintAction(row.id, assigneeId || null);
        notify("Reassigned");
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not reassign the complaint.");
      }
    });
  }

  return (
    <div>
      <PageHead
        eyebrow="Service Ops"
        title="Complaints"
        text="Customer complaints — logged, tracked and resolved."
        action={
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            <PageGuide
              title="Complaints"
              subtitle="Every customer complaint, logged, assigned and tracked to resolution."
              screenshot={<ComplaintsDiagram />}
              sections={[
                {
                  heading: "What this page is",
                  body: [
                    "Anything a customer complains about — service quality, driver behaviour, vehicle condition, billing or communication — gets logged here, optionally linked to the customer and quote it relates to, and assigned to someone to chase down.",
                  ],
                },
                {
                  heading: "Severity & status",
                  bullets: true,
                  body: [
                    "Severity: Low / Medium / High — how serious the complaint is.",
                    "Status: Open → Investigating → Resolved, or Closed if no further action is needed.",
                    "Filter the list by status using the pills above the table.",
                  ],
                },
                {
                  heading: "Working a complaint",
                  bullets: true,
                  body: [
                    "File Complaint logs a new one — description, category, severity, and who's handling it.",
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
              File Complaint
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
                <th className="pb-3">Complaint</th>
                <th>Customer</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Assigned</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t hover:bg-orange-50/30" onClick={() => setDetail(r)}>
                  <td className="max-w-xs py-4">
                    <div className="truncate font-bold">{CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category}</div>
                    <div className="truncate text-xs text-slate-500">{r.description}</div>
                  </td>
                  <td className="whitespace-nowrap">{r.customerLabel ?? "—"}</td>
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
                  <td className="whitespace-nowrap text-xs text-slate-400">{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No complaints here.
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
          title="File a complaint"
          pending={pending}
          confirmLabel="File complaint"
          onConfirm={submitNew}
        >
          <div className="space-y-3">
            <label className="block text-sm font-bold">
              Customer
              <select
                value={form.customerId}
                onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
                className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
              >
                <option value="">Not linked to a customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold">
              Quote
              <select
                value={form.quoteId}
                onChange={(e) => setForm((f) => ({ ...f, quoteId: e.target.value }))}
                className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
              >
                <option value="">Not linked to a quote</option>
                {quotes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-bold">
                Category
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ComplaintCategory }))}
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
            { label: "Customer", value: detail.customerLabel ?? "—" },
            { label: "Quote", value: detail.quoteNumber ?? "—" },
            { label: "Severity", value: <span className="capitalize">{detail.severity}</span> },
            { label: "Status", value: <span className="capitalize">{detail.status}</span> },
            { label: "Filed", value: formatDateTime(detail.createdAt) },
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
