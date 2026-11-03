-- =============================================================================
-- A supplier rejecting a job — whether a fresh offer they never accepted, or
-- an already-accepted job pulled back for re-approval after an edit — now
-- has to give a reason, and that reason needs to actually be visible
-- somewhere on staff's side. There was nowhere to put it: rejecting a fresh
-- offer only ever touched job_allocation_offers.status, and rejecting an
-- edited job only ever touched job_allocations.status — neither table has a
-- "why" column, and job_allocation_offers rows are per (allocation,
-- supplier) so they don't even survive a later re-offer to someone else
-- cleanly as a durable log. One small, dedicated, append-only table instead
-- — covers both contexts, keyed by job_id so the Dispatch job detail page
-- can show a simple "Rejection history" panel regardless of which flow
-- produced each entry. supplier_id is captured directly (not resolved via
-- job_allocations.assigned_supplier_id) so it survives that column later
-- going null, same reasoning as 0073's supplier_id fix on the payments side.
-- =============================================================================

create table job_rejection_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  job_allocation_id uuid not null references job_allocations(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  context text not null check (context in ('initial_offer', 'post_edit_reapproval')),
  reason text not null,
  rejected_at timestamptz not null default now()
);
create index job_rejection_log_job_id_idx on job_rejection_log(job_id);
create index job_rejection_log_job_allocation_id_idx on job_rejection_log(job_allocation_id);

alter table job_rejection_log enable row level security;

create policy job_rejection_log_select on job_rejection_log for select
  using (
    tenant_id = current_tenant_id()
    and (is_master_admin() or has_permission('bookings.view') or has_permission('dispatch.send_manual') or has_permission('dispatch.reassign_supplier'))
    or supplier_id = auth.uid()
  );

-- Every insert happens server-side through the admin client (both reject
-- actions already write audit_log/notifications the same way, for the same
-- reason: a supplier session has no profiles/tenant row for RLS to key
-- off), so this is a backstop against a direct client-side insert rather
-- than the real access path.
create policy job_rejection_log_insert on job_rejection_log for insert
  with check (is_master_admin());
