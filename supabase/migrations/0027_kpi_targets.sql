-- =============================================================================
-- Global Transport CRM — Real KPIs & Targets module (Part 18/22, §119 + §148,
-- projectContext.md).
--
-- Individual, monthly targets across four metrics computable from existing
-- data (revenue, gross profit, quotes sent, paid bookings). Manager-assigned,
-- not self-service. Deliberately out of scope for this pass: team/department/
-- brand/company target rows (the leaderboard already gives an aggregate view
-- without a separately stored target), non-monthly periods, and any metric
-- without an existing data source (response time, satisfaction, follow-up).
-- =============================================================================

create type target_metric as enum ('revenue_gbp', 'gross_profit_gbp', 'quotes_sent', 'paid_bookings');

create table targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  metric target_metric not null,
  period_month date not null,
  target_value numeric not null check (target_value >= 0),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, profile_id, metric, period_month)
);
create index targets_tenant_period_idx on targets(tenant_id, period_month);
create index targets_profile_idx on targets(profile_id);

alter table targets enable row level security;

-- Same "manager sees/manages everyone, individual sees only their own" shape
-- as attendance_events (0024_attendance.sql), reusing admin.view_audit_logs
-- as the oversight permission rather than minting a new key.
create policy targets_select on targets for select
  using (tenant_id = current_tenant_id() and (profile_id = auth.uid() or has_permission('admin.view_audit_logs')));
create policy targets_insert on targets for insert
  with check (tenant_id = current_tenant_id() and has_permission('admin.view_audit_logs') and created_by = auth.uid());
create policy targets_update on targets for update
  using (tenant_id = current_tenant_id() and has_permission('admin.view_audit_logs'));
create policy targets_delete on targets for delete
  using (tenant_id = current_tenant_id() and has_permission('admin.view_audit_logs'));
