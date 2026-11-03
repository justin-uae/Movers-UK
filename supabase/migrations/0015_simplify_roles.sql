-- =============================================================================
-- Global Transport CRM — Collapse the role catalog down to exactly 4 roles:
-- Master Admin, Sales User, Finance Manager, Read-Only User.
--
-- Permission KEYS drive every RLS policy and hasPermission() check in the
-- app — never role names — so this migration only needs to change which
-- roles hold which keys; no RLS policy needs touching for the consolidation
-- itself. Retires 9 roles (Administrator, Sales Manager, Operations
-- Manager, Operations User, Accounts User, Auditor / Accountant, Brand
-- Administrator, Transport Company / Supplier User, Driver), reassigning
-- any profile on one of them to the corresponding kept role first so no
-- user is left with role_id = null.
-- =============================================================================

insert into permissions (key, category, description) values
  ('general.workspace_access', 'General', 'Access to generic workspace tools (dashboard, attendance, documents, comms) with no business-data meaning of their own')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Reassign existing profiles off the roles about to be retired. Scoped per
-- tenant via the correlated subquery (r2.tenant_id = p.tenant_id) — a single
-- statement handles every tenant, nothing hardcoded to one tenant id.
-- ---------------------------------------------------------------------------

update profiles p
set role_id = (select r2.id from roles r2 where r2.tenant_id = p.tenant_id and r2.name = 'Master Admin')
where p.role_id in (select id from roles where name in ('Administrator', 'Brand Administrator'));

update profiles p
set role_id = (select r2.id from roles r2 where r2.tenant_id = p.tenant_id and r2.name = 'Sales User')
where p.role_id in (
  select id from roles where name in (
    'Sales Manager', 'Operations Manager', 'Operations User',
    'Transport Company / Supplier User', 'Driver'
  )
);

update profiles p
set role_id = (select r2.id from roles r2 where r2.tenant_id = p.tenant_id and r2.name = 'Finance Manager')
where p.role_id in (select id from roles where name in ('Accounts User', 'Auditor / Accountant'));

-- role_permissions cascades automatically (fk ... on delete cascade);
-- profiles.role_id would fall back to null on delete for anything the
-- three updates above missed (belt-and-suspenders, should affect 0 rows).
delete from roles where name in (
  'Administrator', 'Sales Manager', 'Operations Manager', 'Operations User',
  'Accounts User', 'Auditor / Accountant', 'Brand Administrator',
  'Transport Company / Supplier User', 'Driver'
);

-- ---------------------------------------------------------------------------
-- Reset the 4 kept roles to exactly their new permission sets.
-- ---------------------------------------------------------------------------

delete from role_permissions
where role_id in (select id from roles where name in ('Master Admin', 'Sales User', 'Finance Manager', 'Read-Only User'));

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.name = 'Master Admin'
on conflict (role_id, permission_id) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = any(array[
  'enquiries.view_own', 'enquiries.add', 'enquiries.claim_open_leads', 'enquiries.return_to_pool',
  'quotes.create', 'quotes.send', 'quotes.view_selling_price',
  'bookings.view', 'dispatch.send_manual', 'dispatch.transfer_supplier_invoice',
  'general.workspace_access'
])
where r.name = 'Sales User'
on conflict (role_id, permission_id) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = any(array[
  'finance.view_invoices', 'finance.record_payments', 'finance.pay_suppliers'
])
where r.name = 'Finance Manager'
on conflict (role_id, permission_id) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = any(array[
  'enquiries.view_all', 'quotes.view_selling_price', 'bookings.view', 'general.workspace_access'
])
where r.name = 'Read-Only User'
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Every tenant created from now on gets exactly these 4 roles.
-- ---------------------------------------------------------------------------

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
        'general.workspace_access'
      ]),
      ('Finance Manager', true, array[
        'finance.view_invoices', 'finance.record_payments', 'finance.pay_suppliers'
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
