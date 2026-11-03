-- =============================================================================
-- Global Transport CRM — Service ops: booking cancellation + refunds,
-- complaints, incidents (P1 OPS-01..04).
--
-- Three genuinely greenfield workflows, following the same shape as the
-- commission-approval lifecycle (0023_commissions.sql): a status column as
-- plain text + check constraint (not an enum type), per-transition
-- actor/timestamp columns, permission-gated update policy, app-layer
-- re-fetch-and-validate before every transition.
--
-- Cancellation reuses the quotes.status/jobs.status 'cancelled' value that
-- already existed in both enums but was never written anywhere in code —
-- no schema change needed for that part. A cancellation that already
-- collected payment creates a `refunds` row (finance.process_refunds was
-- also already seeded but never wired to anything) rather than mutating
-- customer_payments in place, keeping that ledger append-only.
-- =============================================================================

create table refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'processed')),
  requested_by uuid references profiles(id) on delete set null,
  processed_by uuid references profiles(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index refunds_quote_id_idx on refunds(quote_id);
create index refunds_tenant_status_idx on refunds(tenant_id, status);

alter table refunds enable row level security;

create policy refunds_select on refunds for select
  using (
    tenant_id = current_tenant_id()
    and (has_permission('finance.process_refunds') or has_permission('quotes.cancel') or has_permission('bookings.cancel'))
  );
create policy refunds_insert on refunds for insert
  with check (tenant_id = current_tenant_id() and (has_permission('quotes.cancel') or has_permission('bookings.cancel')));
create policy refunds_update on refunds for update
  using (tenant_id = current_tenant_id() and has_permission('finance.process_refunds'));

create table complaints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null,
  feedback_id uuid references customer_feedback(id) on delete set null,
  category text not null default 'other'
    check (category in ('service_quality', 'driver_behavior', 'vehicle_condition', 'billing', 'communication', 'other')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  description text not null,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'closed')),
  assigned_to uuid references profiles(id) on delete set null,
  resolution_notes text,
  resolved_by uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index complaints_tenant_status_idx on complaints(tenant_id, status);
create index complaints_customer_id_idx on complaints(customer_id);

alter table complaints enable row level security;

create policy complaints_select on complaints for select
  using (tenant_id = current_tenant_id() and has_permission('general.workspace_access'));
create policy complaints_insert on complaints for insert
  with check (tenant_id = current_tenant_id() and has_permission('general.workspace_access') and created_by = auth.uid());
create policy complaints_update on complaints for update
  using (
    tenant_id = current_tenant_id()
    and (has_permission('complaints.manage') or created_by = auth.uid() or assigned_to = auth.uid())
  );

create table incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  category text not null default 'other' check (category in ('accident', 'breakdown', 'delay', 'safety', 'other')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  description text not null,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'closed')),
  assigned_to uuid references profiles(id) on delete set null,
  resolution_notes text,
  resolved_by uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index incidents_tenant_status_idx on incidents(tenant_id, status);
create index incidents_job_id_idx on incidents(job_id);

alter table incidents enable row level security;

create policy incidents_select on incidents for select
  using (tenant_id = current_tenant_id() and has_permission('general.workspace_access'));
create policy incidents_insert on incidents for insert
  with check (tenant_id = current_tenant_id() and has_permission('general.workspace_access') and created_by = auth.uid());
create policy incidents_update on incidents for update
  using (
    tenant_id = current_tenant_id()
    and (has_permission('incidents.manage') or created_by = auth.uid() or assigned_to = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Permission grants — complaints.manage/incidents.manage are new catalog
-- entries; quotes.cancel/bookings.cancel/finance.process_refunds already
-- existed in the catalog (0001_foundation.sql) but, like
-- finance.view_commissions before 0023_commissions.sql, were never carried
-- onto a role by 0015_simplify_roles.sql's 4-role reset. Same backfill +
-- seed_tenant_defaults() pattern as that migration. Master Admin already
-- holds every key via its existing cross-join, untouched here.
-- ---------------------------------------------------------------------------

insert into permissions (key, category, description) values
  ('complaints.manage', 'Service Ops', 'Assign and resolve customer complaints'),
  ('incidents.manage', 'Service Ops', 'Assign and resolve trip incidents')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = any(array[
  'quotes.cancel', 'bookings.cancel', 'complaints.manage', 'incidents.manage'
])
where r.name = 'Sales User'
on conflict (role_id, permission_id) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'finance.process_refunds'
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
        'quotes.create', 'quotes.send', 'quotes.view_selling_price', 'quotes.cancel',
        'bookings.view', 'bookings.cancel', 'dispatch.send_manual', 'dispatch.transfer_supplier_invoice',
        'finance.view_commissions', 'complaints.manage', 'incidents.manage', 'general.workspace_access'
      ]),
      ('Finance Manager', true, array[
        'finance.view_invoices', 'finance.record_payments', 'finance.pay_suppliers',
        'finance.view_commissions', 'finance.approve_commissions', 'finance.view_profit', 'finance.process_refunds'
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
