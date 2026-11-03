-- =============================================================================
-- Global Transport CRM — Sales User can create suppliers and see who to
-- assign their own jobs to.
--
-- Two things were blocking this (job-ownership dispatch already worked —
-- app/(staff)/dispatch/actions.ts's canDispatch() lets the job's creator
-- dispatch it regardless of dispatch.send_manual):
--   1. suppliers_select (0009_payment_legs.sql) only reveals supplier rows
--      to holders of a suppliers.*/finance.pay_suppliers permission — Sales
--      User held none, so the supplier picker in Dispatch came back empty.
--   2. suppliers.add gates creating a supplier at all
--      (app/(staff)/suppliers/actions.ts).
-- Deliberately not granting dispatch.send_manual — that would let them
-- dispatch jobs they didn't create, which is more than asked for.
-- =============================================================================

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key = any(array['suppliers.add', 'suppliers.send_jobs'])
where r.name in ('Sales User', 'Sales Manager')
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
        'suppliers.add', 'suppliers.send_jobs',
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
