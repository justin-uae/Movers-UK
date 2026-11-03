-- =============================================================================
-- Global Transport CRM — Real Attendance module (Part 19, projectContext.md).
--
-- Append-only clock event log, mirroring login_history's exact shape and RLS
-- (0001_foundation.sql:216-228,430-433) — current status and shift duration
-- are always derived from this log (see lib/attendance.ts), never stored as
-- a mutable "current status" column, so there's nothing to fall out of sync.
--
-- Scope for this pass: Clock In / Start Break / End Break / Clock Out and
-- the resulting Not Clocked In / Working / On Break / Clocked Out statuses
-- only (projectContext.md §126-127). Deliberately out of scope: per-user
-- shift/timezone configuration (§129 — "today" uses a UTC day boundary),
-- automatic exception detection (§130), multiple break types (§131),
-- activity monitoring (§132), and the correction-approval workflow (§133).
-- =============================================================================

create table attendance_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  event text not null check (event in ('clock_in', 'break_start', 'break_end', 'clock_out')),
  created_at timestamptz not null default now()
);
create index attendance_events_user_id_idx on attendance_events(user_id, created_at desc);
create index attendance_events_tenant_id_idx on attendance_events(tenant_id, created_at desc);

alter table attendance_events enable row level security;

-- Same visibility split as login_history: everyone sees their own clock
-- history, and admin.view_audit_logs (already the "see everyone" gate for
-- that adjacent table in the same spec Part) additionally unlocks the
-- tenant-wide "today" team overview.
create policy attendance_events_select on attendance_events for select
  using (tenant_id = current_tenant_id() and (user_id = auth.uid() or has_permission('admin.view_audit_logs')));

-- A user may only ever clock themselves in/out — no admin override to
-- insert on someone else's behalf.
create policy attendance_events_insert on attendance_events for insert
  with check (tenant_id = current_tenant_id() and user_id = auth.uid());
