-- =============================================================================
-- Global Transport CRM — 0050_service_ops.sql's Finance Manager array
-- dropped finance.verify_bank_transfers entirely (along with several other
-- permissions, as part of that pass's role simplification) — so even a
-- brand-new tenant created today would hit the same "recorded it but can't
-- verify it" gap that 0057 just backfilled for existing tenants. Re-adds it
-- to seed_tenant_defaults() so new tenants don't inherit the same gap.
-- Every other role's array here is reproduced verbatim from 0050 — only the
-- Finance Manager line changes.
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
        'finance.view_invoices', 'finance.record_payments', 'finance.verify_bank_transfers', 'finance.pay_suppliers',
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
