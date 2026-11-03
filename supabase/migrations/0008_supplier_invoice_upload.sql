-- =============================================================================
-- Global Transport CRM — Supplier invoice upload + sales -> accountant handoff
--
-- Once a supplier has confirmed a job, they can upload their own invoice
-- (amount + file), editable until a staff member forwards it on to
-- accounting. Reuses the exact upload pattern already used for supplier
-- verification documents (private per-supplier-folder Storage bucket).
-- =============================================================================

create type supplier_invoice_status as enum ('submitted', 'forwarded_to_accounting');

create table job_supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job_id uuid not null unique references jobs(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  amount numeric(12, 2) not null,
  currency text not null default 'EUR',
  notes text,
  storage_path text not null,
  file_name text not null,
  status supplier_invoice_status not null default 'submitted',
  forwarded_by uuid references profiles(id) on delete set null,
  forwarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_supplier_invoices_job_id_idx on job_supplier_invoices(job_id);
create index job_supplier_invoices_status_idx on job_supplier_invoices(tenant_id, status);

alter table job_supplier_invoices enable row level security;

create policy job_supplier_invoices_select on job_supplier_invoices for select
  using (
    supplier_id = auth.uid()
    or (tenant_id = current_tenant_id() and (is_master_admin() or has_permission('bookings.view') or has_permission('finance.view_invoices')))
  );

create policy job_supplier_invoices_insert on job_supplier_invoices for insert
  with check (
    supplier_id = auth.uid()
    and exists (select 1 from jobs j where j.id = job_id and j.assigned_supplier_id = auth.uid() and j.status in ('confirmed', 'completed'))
  );

-- The supplier can edit their own invoice while it hasn't been forwarded
-- yet; staff with the new dispatch.transfer_supplier_invoice permission can
-- flip it to forwarded_to_accounting (and only that, in practice — the
-- Server Action only ever sets status/forwarded_by/forwarded_at).
create policy job_supplier_invoices_update on job_supplier_invoices for update
  using (
    (supplier_id = auth.uid() and status = 'submitted')
    or (tenant_id = current_tenant_id() and has_permission('dispatch.transfer_supplier_invoice'))
  );

insert into storage.buckets (id, name, public)
values ('job-invoices', 'job-invoices', false)
on conflict (id) do nothing;

create policy job_invoices_storage_read on storage.objects for select
  using (
    bucket_id = 'job-invoices'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or has_permission('bookings.view')
      or has_permission('finance.view_invoices')
      or is_master_admin()
    )
  );
create policy job_invoices_storage_insert on storage.objects for insert
  with check (bucket_id = 'job-invoices' and (storage.foldername(name))[1] = auth.uid()::text);

insert into permissions (key, category, description) values
  ('dispatch.transfer_supplier_invoice', 'Bookings & Dispatch', 'Forward a supplier''s submitted invoice to accounting for payment')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'dispatch.transfer_supplier_invoice'
where r.name in ('Sales Manager', 'Sales User', 'Operations Manager', 'Operations User')
on conflict (role_id, permission_id) do nothing;

-- Same default for tenants created from now on — full re-seed function,
-- unchanged apart from the added permission key on the four dispatching
-- roles (mirrors the pattern established in 0004).
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
