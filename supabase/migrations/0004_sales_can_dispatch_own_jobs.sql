-- =============================================================================
-- Global Transport CRM — Phase 2.5 follow-up
--
-- The original permission seed (0001) gave dispatch.* only to Operations
-- roles, on the assumption a separate ops team handles supplier assignment.
-- The confirmed real flow is simpler: the same sales user who quoted,
-- collected payment and marked a quote paid should be able to dispatch that
-- job themselves. This:
--   1. Lets the RLS layer recognise job ownership, not just role permission.
--   2. Backfills dispatch.send_manual / dispatch.reassign_supplier onto the
--      Sales Manager and Sales User roles for every existing tenant.
--   3. Updates the new-tenant seed function so future tenants get the same
--      default.
-- =============================================================================

-- 1. RLS: a job's creator (the sales user who marked its quote paid) can
-- always update it, on top of the existing dispatch permission check.
drop policy if exists jobs_update on jobs;
create policy jobs_update on jobs for update
  using (
    assigned_supplier_id = auth.uid()
    or created_by = auth.uid()
    or (
      tenant_id = current_tenant_id()
      and (has_permission('dispatch.send_manual') or has_permission('dispatch.reassign_supplier') or has_permission('bookings.edit'))
    )
  );

-- 2. Backfill existing tenants' Sales Manager / Sales User roles.
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key in ('dispatch.send_manual', 'dispatch.reassign_supplier')
where r.name in ('Sales Manager', 'Sales User')
on conflict (role_id, permission_id) do nothing;

-- 3. Same default for tenants created from now on.
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
      ('Administrator', true, (select array_agg(key) from permissions)),
      ('Sales Manager', true, array[
        'enquiries.view_own','enquiries.view_team','enquiries.reassign','enquiries.claim_open_leads',
        'quotes.create','quotes.edit','quotes.send','quotes.resend','quotes.apply_discounts',
        'quotes.approve_low_margin','quotes.view_selling_price','quotes.view_margin_estimated',
        'bookings.view','finance.view_profit','finance.view_commissions',
        'dispatch.send_manual','dispatch.reassign_supplier'
      ]),
      ('Sales User', true, array[
        'enquiries.view_own','enquiries.add','enquiries.claim_open_leads','enquiries.return_to_pool',
        'quotes.create','quotes.send','quotes.resend','quotes.view_selling_price',
        'bookings.view','finance.view_commissions',
        'dispatch.send_manual','dispatch.reassign_supplier'
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
