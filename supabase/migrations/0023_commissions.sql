-- =============================================================================
-- Global Transport CRM — Real Commissions module (Part 16, projectContext.md).
--
-- Canonical rule (§104): commission is never final at quote-accept or
-- payment time, only once the job is completed and costs are confirmed.
-- Implements the lifecycle backbone (§105) as far as the schema already
-- supports: completion -> calculation -> manager/finance approval -> paid,
-- plus a manual reversal for disputes/cancellations (§109). Deliberately
-- out of scope for this pass: tiered/vehicle/country/brand/team-split plan
-- types (§110 lists them; commission_plans only supports a flat per-user or
-- tenant-default percentage-of-gross-profit rate today) and payroll export.
--
-- commission_plans: rate configuration. One tenant-default row (profile_id
-- null) plus optional per-user override rows.
-- commissions: one row per completed job, created once by the completion
-- hook (app/supplier/dashboard/actions.ts completeJobAction, via the
-- service-role client — no authenticated session, staff or supplier, is
-- ever allowed to insert a row directly; only that trigger path can, so
-- there is deliberately no insert policy here for either role).
-- =============================================================================

create table commission_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade, -- null = tenant default
  rate_percent numeric(5, 2) not null check (rate_percent >= 0 and rate_percent <= 100),
  updated_at timestamptz not null default now()
);
create unique index commission_plans_default_uidx on commission_plans(tenant_id) where profile_id is null;
create unique index commission_plans_profile_uidx on commission_plans(tenant_id, profile_id) where profile_id is not null;

alter table commission_plans enable row level security;

-- Rate configuration is finance-editable only, but every user can read the
-- tenant-default row and their own override — needed so a Sales User's own
-- live "estimated commission" pipeline can resolve their effective rate
-- without exposing anyone else's individually negotiated rate to them.
create policy commission_plans_select on commission_plans for select
  using (
    tenant_id = current_tenant_id()
    and (is_master_admin() or has_permission('finance.approve_commissions') or profile_id = auth.uid() or profile_id is null)
  );

create policy commission_plans_insert on commission_plans for insert
  with check (tenant_id = current_tenant_id() and has_permission('finance.approve_commissions'));

create policy commission_plans_update on commission_plans for update
  using (tenant_id = current_tenant_id() and has_permission('finance.approve_commissions'));

create table commissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job_id uuid not null unique references jobs(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null, -- attributed salesperson (quotes.created_by at completion time)
  selling_price numeric(12, 2) not null,
  supplier_cost numeric(12, 2) not null,
  gross_profit numeric(12, 2) not null,
  rate_percent numeric(5, 2) not null,
  amount numeric(12, 2) not null,
  currency text not null,
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'approved', 'paid', 'reversed')),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  paid_at timestamptz,
  payroll_reference text,
  reversed_by uuid references profiles(id),
  reversed_at timestamptz,
  reversed_reason text,
  created_at timestamptz not null default now()
);
create index commissions_tenant_id_idx on commissions(tenant_id);
create index commissions_profile_id_idx on commissions(profile_id);
create index commissions_status_idx on commissions(status);

alter table commissions enable row level security;

-- A Sales User sees only their own rows (their attributed commission); the
-- broad tenant-wide view is reserved for whoever can also approve/pay/reverse.
create policy commissions_select on commissions for select
  using (
    tenant_id = current_tenant_id()
    and (is_master_admin() or has_permission('finance.approve_commissions') or profile_id = auth.uid())
  );

create policy commissions_update on commissions for update
  using (tenant_id = current_tenant_id() and has_permission('finance.approve_commissions'));

-- ---------------------------------------------------------------------------
-- Permission grants: finance.view_commissions / finance.approve_commissions /
-- finance.view_profit already exist in the permission catalog (0001) but
-- 0015_simplify_roles.sql's 4-role reset didn't carry them onto the roles
-- that need them. Same backfill + seed_tenant_defaults() pattern as
-- 0011_backfill_admin_role_permissions.sql. Master Admin already holds every
-- key via its existing cross-join, so it's untouched here.
-- ---------------------------------------------------------------------------

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'finance.view_commissions'
where r.name = 'Sales User'
on conflict (role_id, permission_id) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = any(array[
  'finance.view_commissions', 'finance.approve_commissions', 'finance.view_profit'
])
where r.name = 'Finance Manager'
on conflict (role_id, permission_id) do nothing;

create or replace function seed_tenant_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_role_id uuid;
  role_def record;
begin
  for role_def in
    select * from (values
      ('Master Admin', true, (select array_agg(key) from permissions)),
      ('Sales User', true, array[
        'enquiries.view_own', 'enquiries.add', 'enquiries.claim_open_leads', 'enquiries.return_to_pool',
        'quotes.create', 'quotes.send', 'quotes.view_selling_price',
        'bookings.view', 'dispatch.send_manual', 'dispatch.transfer_supplier_invoice',
        'finance.view_commissions', 'general.workspace_access'
      ]),
      ('Finance Manager', true, array[
        'finance.view_invoices', 'finance.record_payments', 'finance.pay_suppliers',
        'finance.view_commissions', 'finance.approve_commissions', 'finance.view_profit'
      ]),
      ('Read-Only User', true, array[
        'enquiries.view_all', 'quotes.view_selling_price', 'bookings.view', 'general.workspace_access'
      ])
    ) as t(role_name, is_system, perm_keys)
  loop
    insert into roles (tenant_id, name, is_system)
    values (new.id, role_def.role_name, role_def.is_system)
    returning id into new_role_id;

    insert into role_permissions (role_id, permission_id)
    select new_role_id, p.id from permissions p where p.key = any(role_def.perm_keys);
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed a tenant-default commission_plans row (10%) for every existing
-- tenant, and fold the same seeding into seed_tenant_defaults() below so new
-- tenants always start with a resolvable default rate — commission
-- calculation falls back to this row whenever a salesperson has no personal
-- rate override.
-- ---------------------------------------------------------------------------

insert into commission_plans (tenant_id, profile_id, rate_percent)
select t.id, null, 10
from tenants t
where not exists (select 1 from commission_plans cp where cp.tenant_id = t.id and cp.profile_id is null);

create or replace function seed_tenant_commission_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into commission_plans (tenant_id, profile_id, rate_percent)
  values (new.id, null, 10);
  return new;
end;
$$;

create trigger tenants_seed_commission_default
  after insert on tenants
  for each row execute function seed_tenant_commission_default();
