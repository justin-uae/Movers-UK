-- =============================================================================
-- Global Transport CRM — Two independent payment legs on a job
--
-- customer -> company: existing quotes.status = 'paid' flip (markQuotePaidAction),
--   now gated behind finance.record_payments at the app layer (see
--   app/(staff)/quotes/actions.ts) — no schema change needed for that leg.
-- company -> supplier: new supplier_payments ledger below, supporting
--   partial payments with a running balance against the supplier's
--   forwarded invoice amount (job_supplier_invoices).
--
-- Once a supplier is fully paid, job_offer_view additionally reveals the
-- real customer's name/phone to them (logistics fields — pickup address,
-- date, passenger count — already reveal at job "confirmed", unchanged,
-- since the supplier needs those to actually do the job before payment).
-- =============================================================================

alter table jobs add column supplier_payment_status text not null default 'unpaid'
  check (supplier_payment_status in ('unpaid', 'partially_paid', 'paid'));

create table supplier_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'EUR',
  bank_reference text,
  notes text,
  paid_by uuid references profiles(id) on delete set null,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index supplier_payments_job_id_idx on supplier_payments(job_id);

alter table supplier_payments enable row level security;

create policy supplier_payments_select on supplier_payments for select
  using (
    exists (select 1 from jobs j where j.id = job_id and j.assigned_supplier_id = auth.uid())
    or (tenant_id = current_tenant_id() and (is_master_admin() or has_permission('finance.view_invoices') or has_permission('finance.view_bank_details')))
  );

-- Only payable once the supplier's invoice has actually reached accounting
-- (status = forwarded_to_accounting) — mirrors the real workflow (dispatch
-- forwards it, then the accountant pays it) rather than relying solely on
-- the permission check.
create policy supplier_payments_insert on supplier_payments for insert
  with check (
    tenant_id = current_tenant_id()
    and has_permission('finance.pay_suppliers')
    and exists (
      select 1 from job_supplier_invoices jsi
      where jsi.job_id = supplier_payments.job_id and jsi.status = 'forwarded_to_accounting'
    )
  );

-- Recompute jobs.supplier_payment_status whenever a payment is recorded,
-- comparing the running sum against the forwarded invoice amount.
create or replace function recalc_supplier_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_amount numeric(12, 2);
  v_paid numeric(12, 2);
begin
  select amount into v_invoice_amount from job_supplier_invoices where job_id = new.job_id;
  select coalesce(sum(amount), 0) into v_paid from supplier_payments where job_id = new.job_id;

  update jobs
  set supplier_payment_status = case
    when v_invoice_amount is null then 'unpaid'
    when v_paid >= v_invoice_amount then 'paid'
    when v_paid > 0 then 'partially_paid'
    else 'unpaid'
  end
  where id = new.job_id;

  return new;
end;
$$;

create trigger supplier_payments_recalc
  after insert on supplier_payments
  for each row execute function recalc_supplier_payment_status();

insert into permissions (key, category, description) values
  ('finance.pay_suppliers', 'Finance', 'Record bank transfer payments (partial or full) made to a supplier')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'finance.pay_suppliers'
where r.name in ('Finance Manager', 'Accounts User', 'Auditor / Accountant')
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
      ('Administrator', true, (select array_agg(key) from permissions)),
      ('Sales Manager', true, array[
        'enquiries.view_own','enquiries.view_team','enquiries.reassign','enquiries.claim_open_leads',
        'quotes.create','quotes.edit','quotes.send','quotes.resend','quotes.apply_discounts',
        'quotes.approve_low_margin','quotes.view_selling_price','quotes.view_margin_estimated',
        'bookings.view','finance.view_profit','finance.view_commissions',
        'dispatch.send_manual','dispatch.reassign_supplier','dispatch.transfer_supplier_invoice'
      ]),
      ('Sales User', true, array[
        'enquiries.view_own','enquiries.add','enquiries.claim_open_leads','enquiries.return_to_pool',
        'quotes.create','quotes.send','quotes.resend','quotes.view_selling_price',
        'bookings.view','finance.view_commissions',
        'dispatch.send_manual','dispatch.reassign_supplier','dispatch.transfer_supplier_invoice'
      ]),
      ('Operations Manager', true, array[
        'bookings.view','bookings.edit','dispatch.send_manual','dispatch.use_assisted',
        'dispatch.use_automatic','dispatch.override_allocation','dispatch.reassign_supplier',
        'dispatch.reassign_driver','dispatch.confirm_completion','dispatch.transfer_supplier_invoice',
        'suppliers.view_performance','suppliers.send_jobs'
      ]),
      ('Operations User', true, array[
        'bookings.view','dispatch.send_manual','dispatch.reassign_driver',
        'dispatch.confirm_completion','dispatch.transfer_supplier_invoice','suppliers.send_jobs'
      ]),
      ('Finance Manager', true, array[
        'finance.view_invoices','finance.create_invoices','finance.edit_draft_invoices','finance.approve_invoices',
        'finance.verify_bank_transfers','finance.record_payments','finance.pay_suppliers','finance.process_refunds',
        'finance.issue_credit_notes','finance.view_bank_details','finance.view_profit','finance.view_commissions',
        'finance.approve_commissions','finance.export','admin.view_audit_logs'
      ]),
      ('Accounts User', true, array[
        'finance.view_invoices','finance.create_invoices','finance.record_payments','finance.pay_suppliers',
        'finance.verify_bank_transfers','finance.export'
      ]),
      ('Read-Only User', true, array[
        'enquiries.view_own','quotes.view_selling_price','bookings.view','finance.view_invoices'
      ]),
      ('Transport Company / Supplier User', true, array[]::text[]),
      ('Driver', true, array[]::text[]),
      ('Auditor / Accountant', true, array[
        'finance.view_invoices','finance.view_bank_details','finance.pay_suppliers','finance.export','admin.view_audit_logs'
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

-- job_offer_view: add supplier_payment_status, and additionally gate
-- customer identity (name/phone) on it being 'paid' — logistics fields
-- (address/date/passengers) stay gated on job status only, unchanged, since
-- the supplier needs those before payment happens.
drop view if exists job_offer_view;

create view job_offer_view as
select
  jo.id as offer_id,
  jo.job_id,
  jo.status as offer_status,
  j.status as job_status,
  j.region,
  j.supplier_payment_status,
  jo.offered_at,
  jo.responded_at,
  j.confirmed_at,
  j.completed_at,
  j.supplier_invoice_note,
  j.supplier_invoice_url,
  el.pickup_date,
  el.pickup_time,
  el.passenger_count,
  el.vehicle_type_id,
  case when j.status in ('confirmed', 'completed') then el.pickup_address else null end as pickup_address,
  case when j.status in ('confirmed', 'completed') then el.destination_address else null end as destination_address,
  case when j.status in ('confirmed', 'completed') and j.supplier_payment_status = 'paid' then c.contact_name else null end as customer_name,
  case when j.status in ('confirmed', 'completed') and j.supplier_payment_status = 'paid' then c.phone else null end as customer_phone
from job_offers jo
join jobs j on j.id = jo.job_id
join quotes q on q.id = j.quote_id
join enquiries e on e.id = q.enquiry_id
left join enquiry_legs el on el.enquiry_id = e.id and el.sequence = 1
left join customers c on c.id = j.customer_id
where jo.supplier_id = auth.uid();

grant select on job_offer_view to authenticated;

-- -----------------------------------------------------------------------------
-- RLS fix: none of Finance Manager / Accounts User / Auditor-Accountant hold
-- bookings.view or any enquiries.* permission (they were never meant to
-- browse the sales pipeline), which are the only things jobs_select and
-- quotes_select check today. That would silently return null/empty embeds
-- on the new accounting pages above — the accountant couldn't actually see
-- the job/quote a supplier invoice or customer payment belongs to. Extend
-- both policies with the finance permissions that specifically imply "this
-- role needs to see job/quote detail to do a payment."
-- -----------------------------------------------------------------------------

drop policy if exists jobs_select on jobs;
create policy jobs_select on jobs for select
  using (
    assigned_supplier_id = auth.uid()
    or (
      tenant_id = current_tenant_id()
      and (is_master_admin() or has_permission('bookings.view') or has_permission('finance.pay_suppliers') or has_permission('finance.view_invoices'))
    )
  );

drop policy if exists quotes_select on quotes;
create policy quotes_select on quotes for select
  using (
    tenant_id = current_tenant_id()
    and (
      has_permission('finance.view_invoices')
      or exists (select 1 from enquiries e where e.id = quotes.enquiry_id and can_view_assignment(e.assigned_user_id))
    )
  );

-- Same gap one level down: the quote detail page (and the journey/pricing
-- it embeds) is reached via a "View" link from the new accounting pages, so
-- finance.view_invoices needs to unlock enquiries/enquiry_legs/quote_versions/
-- quote_events/quote_decisions too, not just the quotes row itself.
drop policy if exists enquiries_select on enquiries;
create policy enquiries_select on enquiries for select
  using (
    tenant_id = current_tenant_id()
    and (has_permission('finance.view_invoices') or can_view_assignment(assigned_user_id))
  );

drop policy if exists enquiry_legs_select on enquiry_legs;
create policy enquiry_legs_select on enquiry_legs for select
  using (exists (
    select 1 from enquiries e
    where e.id = enquiry_legs.enquiry_id
      and (has_permission('finance.view_invoices') or can_view_assignment(e.assigned_user_id))
  ));

drop policy if exists quote_versions_select on quote_versions;
create policy quote_versions_select on quote_versions for select
  using (exists (
    select 1 from quotes q
    join enquiries e on e.id = q.enquiry_id
    where q.id = quote_versions.quote_id
      and (has_permission('finance.view_invoices') or can_view_assignment(e.assigned_user_id))
  ));

drop policy if exists quote_events_select on quote_events;
create policy quote_events_select on quote_events for select
  using (exists (
    select 1 from quotes q
    join enquiries e on e.id = q.enquiry_id
    where q.id = quote_events.quote_id
      and (has_permission('finance.view_invoices') or can_view_assignment(e.assigned_user_id))
  ));

drop policy if exists quote_decisions_select on quote_decisions;
create policy quote_decisions_select on quote_decisions for select
  using (exists (
    select 1 from quotes q
    join enquiries e on e.id = q.enquiry_id
    where q.id = quote_decisions.quote_id
      and (has_permission('finance.view_invoices') or can_view_assignment(e.assigned_user_id))
  ));

-- The supplier-payments page embeds suppliers(name, phone, email) under
-- each job — an accountant paying a supplier needs to see who they're
-- paying, so finance.pay_suppliers unlocks read access to the supplier row
-- alongside the existing suppliers.* permission holders.
drop policy if exists suppliers_select on suppliers;
create policy suppliers_select on suppliers for select
  using (
    id = auth.uid()
    or (
      tenant_id = current_tenant_id()
      and (
        has_permission('suppliers.add') or has_permission('suppliers.edit')
        or has_permission('suppliers.approve') or has_permission('suppliers.view_performance')
        or has_permission('suppliers.send_jobs') or has_permission('finance.pay_suppliers')
      )
    )
  );
