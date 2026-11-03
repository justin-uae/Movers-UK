-- =============================================================================
-- Closes the loop opened by 0072's auto-refund adjustment:
--   1. A rejected allocation's assigned_supplier_id goes to null (by design
--      — the job really is no longer theirs) — but two RLS policies used
--      that same column as their ONLY way to let a supplier see their own
--      adjustment/payment history, so both silently lost that supplier's
--      access the moment they were unassigned. Fixed by scoping through
--      job_supplier_invoices.supplier_id instead — set once at submission
--      and never touched again, so it survives reassignment.
--   2. There was no way to record that a refund was actually RECEIVED back
--      from a supplier — only that one was owed (the negative adjustment).
--      New supplier_refunds table, deliberately separate from
--      job_allocation_adjustments (which answers "why does the amount owed
--      differ from the invoice", not "did money actually move") — mirrors
--      supplier_payments' own shape (amount/reference/notes/proof) since
--      it's the same kind of event in the other direction.
-- =============================================================================

drop policy if exists job_allocation_adjustments_select on job_allocation_adjustments;
create policy job_allocation_adjustments_select on job_allocation_adjustments for select
  using (
    tenant_id = current_tenant_id()
    and (
      is_master_admin()
      or has_permission('bookings.view')
      or has_permission('finance.view_invoices')
    )
    or exists (
      select 1 from job_supplier_invoices jsi
      where jsi.job_allocation_id = job_allocation_adjustments.job_allocation_id and jsi.supplier_id = auth.uid()
    )
  );

drop policy if exists supplier_payments_select on supplier_payments;
create policy supplier_payments_select on supplier_payments for select
  using (
    tenant_id = current_tenant_id()
    and (is_master_admin() or has_permission('finance.view_invoices') or has_permission('finance.view_bank_details'))
    or exists (
      select 1 from job_supplier_invoices jsi
      where jsi.job_allocation_id = supplier_payments.job_allocation_id and jsi.supplier_id = auth.uid()
    )
  );

create table supplier_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job_allocation_id uuid not null references job_allocations(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'EUR',
  bank_reference text,
  notes text,
  proof_storage_path text,
  proof_file_name text,
  received_by uuid references profiles(id) on delete set null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index supplier_refunds_job_allocation_id_idx on supplier_refunds(job_allocation_id);

alter table supplier_refunds enable row level security;

create policy supplier_refunds_select on supplier_refunds for select
  using (
    tenant_id = current_tenant_id()
    and (is_master_admin() or has_permission('finance.view_invoices') or has_permission('finance.view_bank_details'))
    or exists (
      select 1 from job_supplier_invoices jsi
      where jsi.job_allocation_id = supplier_refunds.job_allocation_id and jsi.supplier_id = auth.uid()
    )
  );

create policy supplier_refunds_insert on supplier_refunds for insert
  with check (tenant_id = current_tenant_id() and has_permission('finance.pay_suppliers'));

insert into storage.buckets (id, name, public)
values ('supplier-refund-proofs', 'supplier-refund-proofs', false)
on conflict (id) do nothing;

create policy supplier_refund_proofs_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'supplier-refund-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy supplier_refund_proofs_storage_read on storage.objects for select
  using (
    bucket_id = 'supplier-refund-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or has_permission('finance.view_invoices')
      or has_permission('finance.pay_suppliers')
      or is_master_admin()
    )
  );
