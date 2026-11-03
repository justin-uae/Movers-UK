"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, ListChecks, AlertTriangle, CalendarClock, X } from "lucide-react";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { SearchInput } from "@/components/ui/SearchInput";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { PageGuide } from "@/components/ui/PageGuide";
import { TasksDiagram } from "@/components/ui/guide-diagrams/TasksDiagram";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/formatDate";
import { createTaskAction, updateTaskAction, setTaskStatusAction, deleteTaskAction } from "@/app/(staff)/tasks/actions";
import type { TaskChecklistItem, TaskPriority, TaskStatus } from "@/lib/supabase/database.types";

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  checklist: TaskChecklistItem[];
  linkedLabel: string | null;
  customerId: string | null;
  supplierId: string | null;
  quoteId: string | null;
  isAutomated: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface AssigneeOption {
  id: string;
  name: string;
}

export interface PickerOption {
  id: string;
  label: string;
}

type ViewTab = "mine" | "team" | "all";
type LinkType = "none" | "customer" | "supplier" | "quote";

const STATUS_COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
];

const PRIORITY_LABEL: Record<TaskPriority, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-red-50 text-red-700",
};

const VIEW_TABS: { key: ViewTab; label: string }[] = [
  { key: "mine", label: "My Tasks" },
  { key: "team", label: "Team Tasks" },
  { key: "all", label: "All" },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function emptyForm() {
  return {
    title: "",
    description: "",
    priority: "medium" as TaskPriority,
    dueDate: "",
    assigneeId: null as string | null,
    checklist: [] as TaskChecklistItem[],
    linkType: "none" as LinkType,
    linkSearch: "",
    linkId: null as string | null,
  };
}

export function TasksPage({
  rows,
  today,
  view,
  priority,
  includeCancelled,
  currentProfileId,
  myOpenCount,
  overdueCount,
  dueSoonCount,
  assignees,
  customers,
  suppliers,
  quotes,
}: {
  rows: TaskRow[];
  today: string;
  view: ViewTab;
  priority: TaskPriority | null;
  includeCancelled: boolean;
  currentProfileId: string;
  myOpenCount: number;
  overdueCount: number;
  dueSoonCount: number;
  assignees: AssigneeOption[];
  customers: PickerOption[];
  suppliers: PickerOption[];
  quotes: PickerOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const notify = useToast();
  const [pending, startTransition] = useTransition();

  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [checklistDraft, setChecklistDraft] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<TaskRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const columns = useMemo(() => {
    const cancelled = includeCancelled ? rows.filter((r) => r.status === "cancelled") : [];
    const base = STATUS_COLUMNS.map((c) => ({ ...c, rows: rows.filter((r) => r.status === c.key) }));
    return includeCancelled ? [...base, { key: "cancelled" as TaskStatus, label: "Cancelled", rows: cancelled }] : base;
  }, [rows, includeCancelled]);

  const pickerOptions = form.linkType === "customer" ? customers : form.linkType === "supplier" ? suppliers : form.linkType === "quote" ? quotes : [];
  const filteredPickerOptions = useMemo(
    () => pickerOptions.filter((o) => o.label.toLowerCase().includes(form.linkSearch.toLowerCase())),
    [pickerOptions, form.linkSearch],
  );

  function paramsHref(mutate: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  }

  function viewHref(next: ViewTab) {
    return paramsHref((p) => (next === "all" ? p.delete("view") : p.set("view", next)));
  }

  function priorityHref(next: string) {
    return paramsHref((p) => (next === "all" ? p.delete("priority") : p.set("priority", next)));
  }

  function cancelledHref(next: boolean) {
    return paramsHref((p) => (next ? p.set("includeCancelled", "1") : p.delete("includeCancelled")));
  }

  function dueHref(next: "overdue" | "soon") {
    const params = new URLSearchParams();
    params.set("due", next);
    return `${pathname}?${params.toString()}`;
  }

  function openNew() {
    setForm(emptyForm());
    setChecklistDraft("");
    setFormError(null);
    setEditingId("new");
  }

  function openEdit(row: TaskRow) {
    setForm({
      title: row.title,
      description: row.description ?? "",
      priority: row.priority,
      dueDate: row.dueDate ?? "",
      assigneeId: row.assigneeId,
      checklist: row.checklist,
      linkType: row.customerId ? "customer" : row.supplierId ? "supplier" : row.quoteId ? "quote" : "none",
      linkSearch: "",
      linkId: row.customerId ?? row.supplierId ?? row.quoteId ?? null,
    });
    setChecklistDraft("");
    setFormError(null);
    setEditingId(row.id);
  }

  function addChecklistItem() {
    if (!checklistDraft.trim()) return;
    setForm((f) => ({
      ...f,
      checklist: [...f.checklist, { id: crypto.randomUUID(), text: checklistDraft.trim(), done: false }],
    }));
    setChecklistDraft("");
  }

  function toggleChecklistItem(id: string) {
    setForm((f) => ({ ...f, checklist: f.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)) }));
  }

  function removeChecklistItem(id: string) {
    setForm((f) => ({ ...f, checklist: f.checklist.filter((c) => c.id !== id) }));
  }

  function submitForm() {
    if (!form.title.trim()) {
      setFormError("Give the task a title.");
      return;
    }
    const input = {
      title: form.title,
      description: form.description,
      priority: form.priority,
      dueDate: form.dueDate || null,
      assigneeId: form.assigneeId,
      checklist: form.checklist,
      customerId: form.linkType === "customer" ? form.linkId : null,
      supplierId: form.linkType === "supplier" ? form.linkId : null,
      quoteId: form.linkType === "quote" ? form.linkId : null,
    };
    startTransition(async () => {
      try {
        if (editingId === "new") {
          await createTaskAction(input);
          notify("Task created");
        } else if (editingId) {
          await updateTaskAction(editingId, input);
          notify("Task updated");
        }
        setEditingId(null);
        router.refresh();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Could not save this task.");
      }
    });
  }

  function changeStatus(row: TaskRow, status: TaskStatus) {
    startTransition(async () => {
      try {
        await setTaskStatusAction(row.id, status);
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not update status.");
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteTaskAction(deleteTarget.id);
        notify("Task deleted");
        setDeleteTarget(null);
        setEditingId(null);
        router.refresh();
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "Could not delete this task.");
      }
    });
  }

  const editingRow = typeof editingId === "string" && editingId !== "new" ? rows.find((r) => r.id === editingId) ?? null : null;

  return (
    <div>
      <PageHead
        eyebrow="Operations"
        title="Tasks"
        text="Personal and team to-dos — track status on a board, keep a checklist, and optionally link a task to a customer, supplier or quote."
        action={
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            <PageGuide
              title="Tasks"
              subtitle="Personal and team to-dos, tracked on a simple three-column board."
              screenshot={<TasksDiagram />}
              sections={[
                {
                  heading: "What this page is",
                  body: [
                    "A shared to-do board for anything that needs following up — quick personal reminders or team work, each optionally linked back to the customer, supplier or quote it's about.",
                    "Some tasks appear automatically (tagged Auto) — created by the system rather than a person, e.g. a low customer-experience score escalating into a follow-up task.",
                  ],
                },
                {
                  heading: "The board",
                  bullets: true,
                  body: [
                    "To Do / In Progress / Done are the three columns — change a task's status from the dropdown on its card, no dragging needed.",
                    "My Tasks / Team Tasks / All switch whose tasks you're viewing.",
                    "\"Show cancelled\" adds a fourth column for tasks that were called off.",
                  ],
                },
                {
                  heading: "Creating and editing",
                  bullets: true,
                  body: [
                    "New task opens the form — title, priority, due date, assignee, an optional checklist, and an optional link to a customer, supplier or quote.",
                    "Click any card to edit it the same way; Delete task is available there if you're allowed to remove it.",
                  ],
                },
                {
                  heading: "The KPI cards",
                  bullets: true,
                  body: [
                    "My open tasks — everything assigned to you that isn't done or cancelled.",
                    "Overdue — past their due date and still open.",
                    "Due this week — open tasks due in the next 7 days.",
                  ],
                },
              ]}
            />
            <button
              onClick={openNew}
              className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200"
            >
              <Plus size={17} />
              New task
            </button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi title="My open tasks" value={String(myOpenCount)} icon={ListChecks} href={viewHref("mine")} />
        <Kpi title="Overdue" value={String(overdueCount)} icon={AlertTriangle} warn={overdueCount > 0} href={dueHref("overdue")} />
        <Kpi title="Due this week" value={String(dueSoonCount)} icon={CalendarClock} href={dueHref("soon")} />
      </div>

      <Panel className="mt-6">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {VIEW_TABS.map((t) => (
              <Link
                key={t.key}
                href={viewHref(t.key)}
                className={clsx(
                  "rounded-xl px-3 py-2 text-sm font-bold",
                  view === t.key ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600",
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput placeholder="Search tasks…" />
            <select
              value={priority ?? "all"}
              onChange={(e) => router.push(priorityHref(e.target.value))}
              className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-600"
            >
              <option value="all">All priorities</option>
              {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
              <input
                type="checkbox"
                checked={includeCancelled}
                onChange={(e) => router.push(cancelledHref(e.target.checked))}
              />
              Show cancelled
            </label>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {columns.map((col) => (
            <div key={col.key} className="min-w-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-sm font-black text-slate-700">{col.label}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{col.rows.length}</span>
              </div>
              <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
                {col.rows.map((row) => {
                  const overdue = !!row.dueDate && row.dueDate < today && row.status !== "done" && row.status !== "cancelled";
                  const doneCount = row.checklist.filter((c) => c.done).length;
                  return (
                    <div
                      key={row.id}
                      onClick={() => openEdit(row)}
                      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-primary-300"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 text-sm font-bold text-slate-800">{row.title}</div>
                        <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", PRIORITY_BADGE[row.priority])}>
                          {PRIORITY_LABEL[row.priority]}
                        </span>
                      </div>
                      {row.linkedLabel && <div className="mt-1 truncate text-xs text-slate-500">{row.linkedLabel}</div>}
                      {row.isAutomated && (
                        <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          Auto
                        </span>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {row.dueDate && (
                          <span className={clsx("font-semibold", overdue ? "text-red-600" : "text-slate-500")}>
                            {formatDate(row.dueDate)}
                          </span>
                        )}
                        {row.checklist.length > 0 && (
                          <span className="text-slate-500">
                            {doneCount}/{row.checklist.length}
                          </span>
                        )}
                        {row.assigneeName && (
                          <span className="ml-auto grid h-6 w-6 place-items-center rounded-full bg-primary-50 text-[10px] font-bold text-primary-700">
                            {initials(row.assigneeName)}
                          </span>
                        )}
                      </div>
                      {row.canEdit && (
                        <select
                          value={row.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => changeStatus(row, e.target.value as TaskStatus)}
                          className="mt-2 w-full rounded-lg border bg-slate-50 px-2 py-1.5 text-xs font-bold text-slate-600"
                        >
                          <option value="todo">To Do</option>
                          <option value="in_progress">In Progress</option>
                          <option value="done">Done</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      )}
                    </div>
                  );
                })}
                {col.rows.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Nothing here.</p>}
              </div>
            </div>
          ))}
        </div>
        {rows.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No tasks match this view.</p>}
      </Panel>

      <ConfirmDetailModal
        open={editingId !== null}
        onClose={() => !pending && setEditingId(null)}
        title={editingId === "new" ? "New task" : "Edit task"}
        pending={pending}
        error={formError}
        confirmLabel={editingId === "new" ? "Create" : "Save"}
        onConfirm={editingRow && !editingRow.canEdit ? undefined : submitForm}
      >
        <div className="space-y-3">
          <label className="block text-sm font-bold">
            Title
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              disabled={!!editingRow && !editingRow.canEdit}
              placeholder="e.g. Confirm supplier for the Manchester transfer"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal disabled:bg-slate-50"
            />
          </label>
          <label className="block text-sm font-bold">
            Description (optional)
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              disabled={!!editingRow && !editingRow.canEdit}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal disabled:bg-slate-50"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-bold">
              Priority
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                disabled={!!editingRow && !editingRow.canEdit}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal disabled:bg-slate-50"
              >
                {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold">
              Due date
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                disabled={!!editingRow && !editingRow.canEdit}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal disabled:bg-slate-50"
              />
            </label>
          </div>
          <label className="block text-sm font-bold">
            Assignee
            <select
              value={form.assigneeId ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value || null }))}
              disabled={!!editingRow && !editingRow.canEdit}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal disabled:bg-slate-50"
            >
              <option value="">Unassigned</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id === currentProfileId ? `${a.name} (me)` : a.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="text-sm font-bold">Checklist</span>
            <div className="mt-1 space-y-1">
              {form.checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                  <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(item.id)} />
                  <span className={clsx("flex-1 text-sm", item.done && "text-slate-400 line-through")}>{item.text}</span>
                  <button type="button" onClick={() => removeChecklistItem(item.id)} className="text-slate-400 hover:text-red-600">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={checklistDraft}
                onChange={(e) => setChecklistDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChecklistItem();
                  }
                }}
                placeholder="Add a checklist item…"
                className="flex-1 rounded-lg border px-3 py-2 text-sm"
              />
              <button type="button" onClick={addChecklistItem} className="rounded-lg border px-3 py-2 text-xs font-bold">
                Add
              </button>
            </div>
          </div>

          <div>
            <span className="text-sm font-bold">Link to (optional)</span>
            <div className="mt-1 flex gap-2">
              {(["none", "customer", "supplier", "quote"] as LinkType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, linkType: t, linkSearch: "", linkId: null }))}
                  className={clsx(
                    "rounded-lg px-3 py-1.5 text-xs font-bold capitalize",
                    form.linkType === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {form.linkType !== "none" && (
              <div className="mt-2">
                <input
                  value={form.linkSearch}
                  onChange={(e) => setForm((f) => ({ ...f, linkSearch: e.target.value }))}
                  placeholder={`Search ${form.linkType}s…`}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
                <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                  {filteredPickerOptions.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                      <input
                        type="radio"
                        name="link-record"
                        checked={form.linkId === o.id}
                        onChange={() => setForm((f) => ({ ...f, linkId: o.id }))}
                      />
                      {o.label}
                    </label>
                  ))}
                  {filteredPickerOptions.length === 0 && <p className="py-2 text-center text-xs text-slate-400">No matches.</p>}
                </div>
              </div>
            )}
          </div>

          {editingRow?.canDelete && (
            <button
              type="button"
              onClick={() => {
                setDeleteTarget(editingRow);
                setDeleteError(null);
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-red-600"
            >
              <Trash2 size={13} />
              Delete task
            </button>
          )}
        </div>
      </ConfirmDetailModal>

      {deleteTarget && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setDeleteTarget(null)}
          title="Delete this task?"
          description="This removes the task permanently — it can't be undone."
          pending={pending}
          error={deleteError}
          destructive
          details={[{ label: "Task", value: deleteTarget.title }]}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
