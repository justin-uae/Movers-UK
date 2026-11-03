import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TasksPage, type TaskRow, type PickerOption, type AssigneeOption } from "@/components/pages/TasksPage";
import type { TaskChecklistItem, TaskPriority, TaskStatus } from "@/lib/supabase/database.types";

interface TaskListRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee_id: string | null;
  created_by: string | null;
  checklist: TaskChecklistItem[];
  customer_id: string | null;
  supplier_id: string | null;
  quote_id: string | null;
  source: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
  customers: { contact_name: string; company_name: string | null } | null;
  suppliers: { name: string } | null;
  quotes: { quote_number: string } | null;
}

export default async function TasksRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; priority?: string; includeCancelled?: string; due?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const q = params.q?.trim() || "";
  // "Overdue" and "Due this week" (the Tasks KPI cards) are always scoped to
  // the signed-in user's own tasks — the counts they link here were never
  // computed any other way — so either one forces view=mine regardless of
  // whatever ?view= was also passed.
  const due = params.due === "overdue" || params.due === "soon" ? params.due : null;
  const view = due ? "mine" : params.view === "mine" || params.view === "team" ? params.view : "all";
  const priority: TaskPriority | null = (["low", "medium", "high", "urgent"] as const).includes(
    params.priority as TaskPriority,
  )
    ? (params.priority as TaskPriority)
    : null;
  const includeCancelled = params.includeCancelled === "1";

  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let query = supabase
    .from("tasks")
    .select(
      "id, title, description, status, priority, due_date, assignee_id, created_by, checklist, customer_id, supplier_id, quote_id, source, created_at, profiles!tasks_assignee_id_fkey(full_name), customers(contact_name, company_name), suppliers(name), quotes(quote_number)",
    );
  if (view === "mine") query = query.eq("assignee_id", profile.id);
  if (view === "team") query = query.neq("assignee_id", profile.id);
  if (priority) query = query.eq("priority", priority);
  if (!includeCancelled) query = query.neq("status", "cancelled");
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  if (due === "overdue") query = query.lt("due_date", today).not("status", "in", "(done,cancelled)");
  if (due === "soon") query = query.gte("due_date", today).lte("due_date", weekAhead).not("status", "in", "(done,cancelled)");

  const [{ data, error }, { data: profiles }, { data: customers }, { data: suppliers }, { data: quotes }, overdue, dueSoon, myOpen] =
    await Promise.all([
      query.order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase.from("customers").select("id, contact_name, company_name").order("contact_name").limit(200),
      supabase.from("suppliers").select("id, name").order("name").limit(200),
      supabase.from("quotes").select("id, quote_number").order("created_at", { ascending: false }).limit(200),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assignee_id", profile.id)
        .lt("due_date", today)
        .not("status", "in", "(done,cancelled)"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assignee_id", profile.id)
        .gte("due_date", today)
        .lte("due_date", weekAhead)
        .not("status", "in", "(done,cancelled)"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assignee_id", profile.id)
        .not("status", "in", "(done,cancelled)"),
    ]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as TaskListRow[];

  const taskRows: TaskRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    dueDate: r.due_date,
    assigneeId: r.assignee_id,
    assigneeName: r.profiles?.full_name ?? null,
    checklist: r.checklist ?? [],
    linkedLabel:
      r.customers?.company_name || r.customers?.contact_name || r.suppliers?.name || (r.quotes ? `Quote ${r.quotes.quote_number}` : null),
    customerId: r.customer_id,
    supplierId: r.supplier_id,
    quoteId: r.quote_id,
    isAutomated: r.source !== null,
    canEdit: r.created_by === profile.id || r.assignee_id === profile.id || profile.is_master_admin,
    canDelete: r.created_by === profile.id || profile.is_master_admin,
  }));

  const myOpenCount = myOpen.count ?? 0;

  const assigneeOptions: AssigneeOption[] = (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name }));
  const customerOptions: PickerOption[] = (customers ?? []).map((c) => ({ id: c.id, label: c.company_name || c.contact_name }));
  const supplierOptions: PickerOption[] = (suppliers ?? []).map((s) => ({ id: s.id, label: s.name }));
  const quoteOptions: PickerOption[] = (quotes ?? []).map((q) => ({ id: q.id, label: q.quote_number }));

  return (
    <TasksPage
      rows={taskRows}
      today={today}
      view={view}
      priority={priority}
      includeCancelled={includeCancelled}
      currentProfileId={profile.id}
      myOpenCount={myOpenCount}
      overdueCount={overdue.count ?? 0}
      dueSoonCount={dueSoon.count ?? 0}
      assignees={assigneeOptions}
      customers={customerOptions}
      suppliers={supplierOptions}
      quotes={quoteOptions}
    />
  );
}
