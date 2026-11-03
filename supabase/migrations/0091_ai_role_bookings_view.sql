-- =============================================================================
-- Global Transport CRM — grant the AI role visibility into the Confirmed/
-- Lost/Completed Booking tabs (nav.ts), but scoped to its OWN bookings only.
--
-- bookings.view (used by Sales User/Finance/Read-Only) has no "own" concept
-- at all — jobs_select's RLS (0054_job_allocations.sql) grants it full
-- tenant-wide visibility, by design (dispatch is a shared operational
-- queue). That's wrong for the AI role, which should only ever see bookings
-- that came from its own quotes, so this introduces a new bookings.view_own
-- permission with real "own" scoping instead of reusing bookings.view.
--
-- "Own" is traced the same way can_view_assignment scopes everything else
-- (quote -> parent enquiry -> assigned_user_id = auth.uid()), not
-- jobs.created_by (that's whoever recorded the payment, e.g. Finance — not
-- necessarily who quoted it).
--
-- Lost Booking needs no RLS change — it queries leads/quotes directly,
-- already "own"-scoped via can_view_assignment since the AI role only holds
-- enquiries.view_own, not enquiries.view_all. Only Confirmed/Completed
-- (both query the jobs table) needed this.
-- =============================================================================

insert into permissions (key, category, description) values
  ('bookings.view_own', 'Bookings', 'View only bookings tied to your own assigned enquiries (Confirmed/Completed), not every booking tenant-wide')
on conflict (key) do nothing;

-- Cleanup in case an earlier draft of this migration (granting the
-- tenant-wide bookings.view instead) was already applied by hand.
delete from role_permissions
where role_id in (select id from roles where name = 'AI')
  and permission_id in (select id from permissions where key = 'bookings.view');

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key = 'bookings.view_own'
where r.name = 'AI'
on conflict (role_id, permission_id) do nothing;

drop policy if exists jobs_select on jobs;
create policy jobs_select on jobs for select
  using (
    tenant_id = current_tenant_id()
    and (
      is_master_admin()
      or has_permission('bookings.view')
      or has_permission('finance.pay_suppliers')
      or has_permission('finance.view_invoices')
      or (
        has_permission('bookings.view_own')
        and exists (
          select 1 from quotes q
          join enquiries e on e.id = q.enquiry_id
          where q.id = jobs.quote_id and e.assigned_user_id = auth.uid()
        )
      )
    )
  );

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
        'enquiries.view_own', 'enquiries.add', 'enquiries.claim_open_leads',
        'quotes.create', 'quotes.send', 'quotes.view_selling_price', 'quotes.view_ai_generated',
        'bookings.view_own', 'general.workspace_access'
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
