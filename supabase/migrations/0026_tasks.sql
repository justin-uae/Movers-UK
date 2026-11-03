-- =============================================================================
-- Global Transport CRM — Real Tasks module (Part 24, §152, projectContext.md).
--
-- A tenant-wide task tracker: title/description, priority, due date, a
-- single assignee, an inline checklist, and an optional link to one
-- customer/supplier/quote record. "Personal" vs. "team" tasks isn't a
-- separate field — it's just whether a task is assigned to you or someone
-- else, filtered client-side via the My/Team/All tabs. Deliberately out of
-- scope for this pass: dependencies/blocking, recurring tasks, Calendar and
-- Gantt views, drag-and-drop reordering, push/email notifications, and a
-- comment/activity thread (the audit log covers history, not discussion).
-- =============================================================================

create type task_status as enum ('todo', 'in_progress', 'done', 'cancelled');
create type task_priority as enum ('low', 'medium', 'high', 'urgent');

create table tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null,
  description text,
  status task_status not null default 'todo',
  priority task_priority not null default 'medium',
  due_date date,
  assignee_id uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  checklist jsonb not null default '[]'::jsonb,
  customer_id uuid references customers(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_tenant_id_idx on tasks(tenant_id, status);
create index tasks_assignee_id_idx on tasks(assignee_id);
create index tasks_due_date_idx on tasks(due_date);

alter table tasks enable row level security;

-- Same nav gate as /tasks today (general.workspace_access) — tenant-wide
-- visibility, since "team tasks" requires everyone to see everyone's board.
-- Update is wider than Documents' delete-only rule because moving a card
-- between Kanban columns is the core interaction and must work for the
-- assignee, not just the creator.
create policy tasks_select on tasks for select
  using (tenant_id = current_tenant_id() and has_permission('general.workspace_access'));
create policy tasks_insert on tasks for insert
  with check (tenant_id = current_tenant_id() and has_permission('general.workspace_access') and created_by = auth.uid());
create policy tasks_update on tasks for update
  using (tenant_id = current_tenant_id() and (created_by = auth.uid() or assignee_id = auth.uid() or is_master_admin()));
create policy tasks_delete on tasks for delete
  using (tenant_id = current_tenant_id() and (created_by = auth.uid() or is_master_admin()));
