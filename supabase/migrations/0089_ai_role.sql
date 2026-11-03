-- =============================================================================
-- Global Transport CRM — add a dedicated "AI" role so AI-authored quotes are
-- attributed to a real profile (with its own login) instead of created_by =
-- null, and can be filtered to that profile's own dashboard the same way a
-- Sales User's quotes are filtered to theirs.
--
-- Scope is deliberately narrow: create + send quotes and see only what's
-- assigned/created by it. No lead-claiming, dispatch, or finance access.
-- =============================================================================

insert into permissions (key, category, description) values
  ('quotes.view_ai_generated', 'Quotes', 'View the AI Created Quotes list — quotes priced and sent unattended by the AI Auto-Quote sweep')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Existing tenants: add the role + grants now (seed_tenant_defaults below
-- only covers tenants created from this point forward).
-- ---------------------------------------------------------------------------

insert into roles (tenant_id, name, is_system)
select t.id, 'AI', true
from tenants t
where not exists (
  select 1 from roles r where r.tenant_id = t.id and r.name = 'AI'
);

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key = any(array[
  'enquiries.view_own', 'enquiries.add',
  'quotes.create', 'quotes.send', 'quotes.view_selling_price', 'quotes.view_ai_generated',
  'general.workspace_access'
])
where r.name = 'AI'
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Every tenant created from now on gets the AI role too.
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
        'quotes.create', 'quotes.send', 'quotes.view_selling_price', 'quotes.cancel',
        'bookings.view', 'bookings.cancel', 'bookings.amend', 'dispatch.send_manual', 'dispatch.transfer_supplier_invoice',
        'finance.view_commissions', 'complaints.manage', 'incidents.manage', 'general.workspace_access'
      ]),
      ('Finance Manager', true, array[
        'finance.view_invoices', 'finance.record_payments', 'finance.pay_suppliers',
        'finance.view_commissions', 'finance.approve_commissions', 'finance.view_profit', 'finance.process_refunds'
      ]),
      ('Read-Only User', true, array[
        'enquiries.view_all', 'quotes.view_selling_price', 'bookings.view', 'general.workspace_access'
      ]),
      ('AI', true, array[
        'enquiries.view_own', 'enquiries.add',
        'quotes.create', 'quotes.send', 'quotes.view_selling_price', 'quotes.view_ai_generated',
        'general.workspace_access'
      ])
    ) as t(role_name, is_system, perm_keys)
  loop
    insert into roles (tenant_id, name, is_system)
    values (new.id, role_def.role_name, role_def.is_system)
    returning id into new_role_id;

    insert into role_permissions (role_id, permission_id)
    select new_role_id, p.id from permissions p where p.key = any(role_def.perm_keys);
  end loop;

  insert into email_templates (tenant_id, key, subject, body_html)
  select new.id, key, subject, body_html from default_email_templates();

  return new;
end;
$$;
