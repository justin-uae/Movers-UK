-- =============================================================================
-- Global Transport CRM — Phase 1 (Foundation)
-- Tenants, companies, brands, org structure, users/roles/permissions,
-- territories, audit log, login history, and the RLS pattern reused by
-- every later phase.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Core tenant / legal company / brand / org structure
-- -----------------------------------------------------------------------------

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  legal_name text not null,
  trading_name text,
  registration_number text,
  vat_number text,
  registered_address text,
  trading_address text,
  phone text,
  email text,
  website text,
  default_currency text not null default 'EUR',
  created_at timestamptz not null default now()
);
create index companies_tenant_id_idx on companies(tenant_id);

create table brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  slug text not null,
  logo_url text,
  primary_color text not null default '#f97316',
  secondary_color text,
  default_currency text not null default 'EUR',
  default_language text not null default 'en',
  quote_number_prefix text not null default 'QT',
  booking_number_prefix text not null default 'BK',
  invoice_number_prefix text not null default 'INV',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index brands_tenant_id_idx on brands(tenant_id);
create index brands_company_id_idx on brands(company_id);

create table offices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  name text not null,
  country text,
  city text,
  address text,
  created_at timestamptz not null default now()
);
create index offices_tenant_id_idx on offices(tenant_id);

create table departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index departments_tenant_id_idx on departments(tenant_id);

create table teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,
  office_id uuid references offices(id) on delete set null,
  name text not null,
  manager_id uuid, -- references profiles(id); FK added after profiles exists
  created_at timestamptz not null default now()
);
create index teams_tenant_id_idx on teams(tenant_id);

-- -----------------------------------------------------------------------------
-- Roles & granular permission catalog (Part 8 of the project brief)
-- -----------------------------------------------------------------------------

create table roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);
create index roles_tenant_id_idx on roles(tenant_id);

-- Global catalog, not tenant-scoped: the set of things a role/user can be
-- granted. Mirrored in lib/permissions.ts — keep the two in sync.
create table permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  category text not null,
  description text
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  job_title text,
  department_id uuid references departments(id) on delete set null,
  team_id uuid references teams(id) on delete set null,
  office_id uuid references offices(id) on delete set null,
  manager_id uuid references profiles(id) on delete set null,
  role_id uuid references roles(id) on delete set null,
  default_company_id uuid references companies(id) on delete set null,
  default_brand_id uuid references brands(id) on delete set null,
  status text not null default 'invited'
    check (status in ('invited', 'active', 'suspended', 'disabled', 'archived')),
  is_master_admin boolean not null default false,
  requires_password_reset boolean not null default true,
  requires_2fa boolean not null default false,
  access_expires_at timestamptz,
  avatar_url text,
  preferred_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_tenant_id_idx on profiles(tenant_id);
create index profiles_role_id_idx on profiles(role_id);

alter table teams
  add constraint teams_manager_id_fkey foreign key (manager_id) references profiles(id) on delete set null;

create table user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  effect text not null check (effect in ('grant', 'revoke')),
  created_at timestamptz not null default now(),
  unique (user_id, permission_id)
);
create index user_permission_overrides_user_id_idx on user_permission_overrides(user_id);

-- A user may be authorised to work across several brands (Part 12); one of
-- them is profiles.default_brand_id.
create table user_brands (
  user_id uuid not null references profiles(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  primary key (user_id, brand_id)
);

-- -----------------------------------------------------------------------------
-- Territories (Part 28)
-- -----------------------------------------------------------------------------

create table territories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null check (type in ('country', 'region', 'city', 'postcode', 'airport', 'custom')),
  value text not null,
  label text not null,
  created_at timestamptz not null default now()
);
create index territories_tenant_id_idx on territories(tenant_id);

create table user_territories (
  user_id uuid not null references profiles(id) on delete cascade,
  territory_id uuid not null references territories(id) on delete cascade,
  primary key (user_id, territory_id)
);

-- -----------------------------------------------------------------------------
-- Audit log & login history (Part 19 / Part 32)
-- -----------------------------------------------------------------------------

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_log_tenant_id_idx on audit_log(tenant_id);
create index audit_log_entity_idx on audit_log(entity_type, entity_id);

create table login_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  event text not null check (
    event in ('login_success', 'login_failed', 'logout', 'forced_logout', 'session_expired')
  ),
  ip_address text,
  user_agent text,
  device text,
  created_at timestamptz not null default now()
);
create index login_history_user_id_idx on login_history(user_id);

-- =============================================================================
-- RLS helper functions
--
-- All SECURITY DEFINER + STABLE, and all query tables directly (not through
-- RLS) to avoid recursive-policy evaluation. This is the pattern every later
-- phase's tables should reuse: current_tenant_id() for tenant scoping,
-- is_master_admin() for the universal bypass, has_permission() for
-- granular checks.
-- =============================================================================

create or replace function current_tenant_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select tenant_id from profiles where id = auth.uid();
$$;

create or replace function is_master_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_master_admin from profiles where id = auth.uid()), false);
$$;

create or replace function has_permission(permission_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce((select is_master_admin from profiles where id = auth.uid()), false)
    or (
      exists (
        select 1
        from user_permission_overrides upo
        join permissions perm on perm.id = upo.permission_id
        where upo.user_id = auth.uid() and perm.key = permission_key and upo.effect = 'grant'
      )
      or (
        exists (
          select 1
          from profiles p
          join role_permissions rp on rp.role_id = p.role_id
          join permissions perm on perm.id = rp.permission_id
          where p.id = auth.uid() and perm.key = permission_key
        )
        and not exists (
          select 1
          from user_permission_overrides upo
          join permissions perm on perm.id = upo.permission_id
          where upo.user_id = auth.uid() and perm.key = permission_key and upo.effect = 'revoke'
        )
      )
    );
$$;

-- =============================================================================
-- Row-Level Security
-- =============================================================================

alter table tenants enable row level security;
alter table companies enable row level security;
alter table brands enable row level security;
alter table offices enable row level security;
alter table departments enable row level security;
alter table teams enable row level security;
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table profiles enable row level security;
alter table user_permission_overrides enable row level security;
alter table user_brands enable row level security;
alter table territories enable row level security;
alter table user_territories enable row level security;
alter table audit_log enable row level security;
alter table login_history enable row level security;

-- tenants: a user may only see their own tenant.
create policy tenants_select on tenants for select
  using (id = current_tenant_id() or is_master_admin());
create policy tenants_update on tenants for update
  using (is_master_admin());

-- Simple tenant-scoped read policy, reused for most Phase 1 tables: any
-- signed-in member of the tenant can read; writes are gated by permission.
create policy companies_select on companies for select
  using (tenant_id = current_tenant_id());
create policy companies_write on companies for insert
  with check (tenant_id = current_tenant_id() and is_master_admin());
create policy companies_update on companies for update
  using (tenant_id = current_tenant_id() and is_master_admin());

create policy brands_select on brands for select
  using (tenant_id = current_tenant_id());
create policy brands_insert on brands for insert
  with check (tenant_id = current_tenant_id() and has_permission('admin.manage_brands'));
create policy brands_update on brands for update
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_brands'));

create policy offices_select on offices for select
  using (tenant_id = current_tenant_id());
create policy offices_write on offices for insert
  with check (tenant_id = current_tenant_id() and has_permission('admin.manage_brands'));
create policy offices_update on offices for update
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_brands'));

create policy departments_select on departments for select
  using (tenant_id = current_tenant_id());
create policy departments_write on departments for insert
  with check (tenant_id = current_tenant_id() and has_permission('admin.manage_users'));
create policy departments_update on departments for update
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_users'));

create policy teams_select on teams for select
  using (tenant_id = current_tenant_id());
create policy teams_write on teams for insert
  with check (tenant_id = current_tenant_id() and has_permission('admin.manage_users'));
create policy teams_update on teams for update
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_users'));

create policy roles_select on roles for select
  using (tenant_id = current_tenant_id());
create policy roles_write on roles for insert
  with check (tenant_id = current_tenant_id() and has_permission('admin.manage_roles'));
create policy roles_update on roles for update
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_roles'));
create policy roles_delete on roles for delete
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_roles') and not is_system);

-- permissions is a shared global catalog: readable by anyone signed in,
-- never written by the app (only by migrations).
create policy permissions_select on permissions for select using (true);

create policy role_permissions_select on role_permissions for select
  using (exists (select 1 from roles r where r.id = role_id and r.tenant_id = current_tenant_id()));
create policy role_permissions_write on role_permissions for insert
  with check (
    has_permission('admin.manage_roles')
    and exists (select 1 from roles r where r.id = role_id and r.tenant_id = current_tenant_id())
  );
create policy role_permissions_delete on role_permissions for delete
  using (
    has_permission('admin.manage_roles')
    and exists (select 1 from roles r where r.id = role_id and r.tenant_id = current_tenant_id())
  );

-- profiles: everyone can see their own row and same-tenant colleagues
-- (needed for assignment pickers, org chart, @mentions, etc.) — but only
-- admin.manage_users / master admin can write other people's rows.
create policy profiles_select on profiles for select
  using (tenant_id = current_tenant_id());
create policy profiles_update_self on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
create policy profiles_update_admin on profiles for update
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_users'));

create policy user_permission_overrides_select on user_permission_overrides for select
  using (tenant_id = current_tenant_id() and (user_id = auth.uid() or has_permission('admin.manage_roles')));
create policy user_permission_overrides_write on user_permission_overrides for insert
  with check (tenant_id = current_tenant_id() and has_permission('admin.manage_roles'));
create policy user_permission_overrides_delete on user_permission_overrides for delete
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_roles'));

create policy user_brands_select on user_brands for select
  using (exists (select 1 from profiles p where p.id = user_id and p.tenant_id = current_tenant_id()));
create policy user_brands_write on user_brands for insert
  with check (has_permission('admin.manage_users'));
create policy user_brands_delete on user_brands for delete
  using (has_permission('admin.manage_users'));

create policy territories_select on territories for select
  using (tenant_id = current_tenant_id());
create policy territories_write on territories for insert
  with check (tenant_id = current_tenant_id() and has_permission('admin.manage_users'));
create policy territories_update on territories for update
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_users'));

create policy user_territories_select on user_territories for select
  using (exists (select 1 from profiles p where p.id = user_id and p.tenant_id = current_tenant_id()));
create policy user_territories_write on user_territories for insert
  with check (has_permission('admin.manage_users'));
create policy user_territories_delete on user_territories for delete
  using (has_permission('admin.manage_users'));

-- audit_log: append-only. No update/delete policy exists for any role, so
-- entries are immutable once written, per Part 32 rule.
create policy audit_log_select on audit_log for select
  using (tenant_id = current_tenant_id() and has_permission('admin.view_audit_logs'));
create policy audit_log_insert on audit_log for insert
  with check (tenant_id = current_tenant_id());

create policy login_history_select on login_history for select
  using (tenant_id = current_tenant_id() and (user_id = auth.uid() or has_permission('admin.view_audit_logs')));
create policy login_history_insert on login_history for insert
  with check (tenant_id = current_tenant_id());

-- =============================================================================
-- Permission catalog seed (Part 8)
-- =============================================================================

insert into permissions (key, category, description) values
  ('enquiries.view_own', 'Enquiries', 'View enquiries assigned to the current user'),
  ('enquiries.view_team', 'Enquiries', 'View enquiries assigned to the user''s team'),
  ('enquiries.view_all', 'Enquiries', 'View all enquiries in the tenant'),
  ('enquiries.add', 'Enquiries', 'Create enquiries'),
  ('enquiries.edit', 'Enquiries', 'Edit enquiries'),
  ('enquiries.delete', 'Enquiries', 'Delete enquiries'),
  ('enquiries.reassign', 'Enquiries', 'Reassign enquiries to another user'),
  ('enquiries.claim_open_leads', 'Enquiries', 'Claim leads from the open pool'),
  ('enquiries.return_to_pool', 'Enquiries', 'Return a lead to the open pool'),

  ('quotes.create', 'Quotes', 'Create quotations'),
  ('quotes.edit', 'Quotes', 'Edit quotations'),
  ('quotes.send', 'Quotes', 'Send quotations to customers'),
  ('quotes.resend', 'Quotes', 'Resend quotations'),
  ('quotes.cancel', 'Quotes', 'Cancel quotations'),
  ('quotes.apply_discounts', 'Quotes', 'Apply discounts to a quote'),
  ('quotes.override_ai_pricing', 'Quotes', 'Override the AI pricing recommendation'),
  ('quotes.view_supplier_cost', 'Quotes', 'View estimated/actual supplier cost on a quote'),
  ('quotes.view_selling_price', 'Quotes', 'View and enter the customer selling price'),
  ('quotes.view_margin_estimated', 'Quotes', 'View estimated margin before job completion'),
  ('quotes.view_margin_final', 'Quotes', 'View final margin after job completion'),
  ('quotes.approve_low_margin', 'Quotes', 'Approve a quote priced below minimum margin'),
  ('quotes.accept_manually', 'Quotes', 'Manually mark a quote as accepted'),
  ('quotes.change_expiry', 'Quotes', 'Change a quote''s expiry date'),

  ('bookings.view', 'Bookings & Dispatch', 'View bookings'),
  ('bookings.edit', 'Bookings & Dispatch', 'Edit bookings'),
  ('bookings.cancel', 'Bookings & Dispatch', 'Cancel a booking'),
  ('dispatch.send_manual', 'Bookings & Dispatch', 'Manually send a job to suppliers/drivers'),
  ('dispatch.use_assisted', 'Bookings & Dispatch', 'Use assisted dispatch recommendations'),
  ('dispatch.use_automatic', 'Bookings & Dispatch', 'Use automatic dispatch'),
  ('dispatch.override_allocation', 'Bookings & Dispatch', 'Override an automatic allocation'),
  ('dispatch.reassign_supplier', 'Bookings & Dispatch', 'Reassign a job to a different supplier'),
  ('dispatch.reassign_driver', 'Bookings & Dispatch', 'Reassign a job to a different driver'),
  ('dispatch.confirm_completion', 'Bookings & Dispatch', 'Confirm a job as completed'),

  ('finance.view_invoices', 'Finance', 'View invoices'),
  ('finance.create_invoices', 'Finance', 'Create invoices'),
  ('finance.edit_draft_invoices', 'Finance', 'Edit draft invoices'),
  ('finance.approve_invoices', 'Finance', 'Approve invoices'),
  ('finance.verify_bank_transfers', 'Finance', 'Verify pending bank transfers as paid'),
  ('finance.record_payments', 'Finance', 'Record customer payments'),
  ('finance.process_refunds', 'Finance', 'Process refunds'),
  ('finance.issue_credit_notes', 'Finance', 'Issue credit notes'),
  ('finance.view_bank_details', 'Finance', 'View company/supplier bank details'),
  ('finance.view_profit', 'Finance', 'View gross/net profit figures'),
  ('finance.view_commissions', 'Finance', 'View commission figures'),
  ('finance.approve_commissions', 'Finance', 'Approve commission for payroll'),
  ('finance.export', 'Finance', 'Export financial reports'),

  ('suppliers.add', 'Suppliers', 'Add transport companies'),
  ('suppliers.invite', 'Suppliers', 'Invite suppliers to register'),
  ('suppliers.approve', 'Suppliers', 'Approve supplier registration'),
  ('suppliers.edit', 'Suppliers', 'Edit supplier records'),
  ('suppliers.view_prices', 'Suppliers', 'View supplier submitted prices'),
  ('suppliers.view_performance', 'Suppliers', 'View supplier performance scoring'),
  ('suppliers.send_jobs', 'Suppliers', 'Send job offers to suppliers'),
  ('suppliers.suspend', 'Suppliers', 'Suspend a supplier'),
  ('suppliers.override_expired_documents', 'Suppliers', 'Allow a supplier with expired documents to receive work'),

  ('admin.manage_users', 'Administration', 'Create, edit, suspend and reassign users'),
  ('admin.manage_roles', 'Administration', 'Create custom roles and assign permissions'),
  ('admin.manage_brands', 'Administration', 'Manage companies, brands and offices'),
  ('admin.manage_templates', 'Administration', 'Manage document/email templates'),
  ('admin.manage_integrations', 'Administration', 'Manage API keys and integrations'),
  ('admin.manage_automations', 'Administration', 'Manage workflow automations'),
  ('admin.manage_accounting_settings', 'Administration', 'Change global accounting settings'),
  ('admin.export_company_data', 'Administration', 'Export company-wide data'),
  ('admin.view_audit_logs', 'Administration', 'View the audit log')
on conflict (key) do nothing;

-- =============================================================================
-- Default role + permission seeding for every new tenant
-- =============================================================================

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
  -- (role name, is_system, permission keys granted by default)
  for role_def in
    select * from (values
      ('Master Admin', true, (select array_agg(key) from permissions)),
      ('Administrator', true, (select array_agg(key) from permissions)),
      ('Sales Manager', true, array[
        'enquiries.view_own','enquiries.view_team','enquiries.reassign','enquiries.claim_open_leads',
        'quotes.create','quotes.edit','quotes.send','quotes.resend','quotes.apply_discounts',
        'quotes.approve_low_margin','quotes.view_selling_price','quotes.view_margin_estimated',
        'bookings.view','finance.view_profit','finance.view_commissions'
      ]),
      ('Sales User', true, array[
        'enquiries.view_own','enquiries.add','enquiries.claim_open_leads','enquiries.return_to_pool',
        'quotes.create','quotes.send','quotes.resend','quotes.view_selling_price',
        'bookings.view','finance.view_commissions'
      ]),
      ('Operations Manager', true, array[
        'bookings.view','bookings.edit','dispatch.send_manual','dispatch.use_assisted',
        'dispatch.use_automatic','dispatch.override_allocation','dispatch.reassign_supplier',
        'dispatch.reassign_driver','dispatch.confirm_completion','suppliers.view_performance','suppliers.send_jobs'
      ]),
      ('Operations User', true, array[
        'bookings.view','dispatch.send_manual','dispatch.reassign_driver',
        'dispatch.confirm_completion','suppliers.send_jobs'
      ]),
      ('Finance Manager', true, array[
        'finance.view_invoices','finance.create_invoices','finance.edit_draft_invoices','finance.approve_invoices',
        'finance.verify_bank_transfers','finance.record_payments','finance.process_refunds','finance.issue_credit_notes',
        'finance.view_bank_details','finance.view_profit','finance.view_commissions','finance.approve_commissions',
        'finance.export','admin.view_audit_logs'
      ]),
      ('Accounts User', true, array[
        'finance.view_invoices','finance.create_invoices','finance.record_payments',
        'finance.verify_bank_transfers','finance.export'
      ]),
      ('Read-Only User', true, array[
        'enquiries.view_own','quotes.view_selling_price','bookings.view','finance.view_invoices'
      ]),
      ('Transport Company / Supplier User', true, array[]::text[]),
      ('Driver', true, array[]::text[]),
      ('Auditor / Accountant', true, array[
        'finance.view_invoices','finance.view_bank_details','finance.export','admin.view_audit_logs'
      ]),
      ('Brand Administrator', true, array[
        'admin.manage_brands','admin.manage_templates','enquiries.view_team','quotes.view_selling_price'
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

create trigger tenants_seed_defaults
  after insert on tenants
  for each row execute function seed_tenant_defaults();
