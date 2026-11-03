-- =============================================================================
-- Global Transport CRM — Payment-proof attachment for customer payments.
--
-- Mirrors the supplier side (0012_supplier_payment_proof.sql) exactly: a
-- quote transitions accepted -> paid exactly once (no partial-payment ledger
-- on the customer side, unlike supplier_payments), so the proof file lives
-- directly on the quotes row rather than a separate table.
--
-- Written idempotent (if-exists/if-not-exists guards throughout) so a
-- partial or repeat run — e.g. after an earlier attempt errored partway
-- through — doesn't fail on objects that already exist.
-- =============================================================================

alter table quotes
  add column if not exists payment_proof_storage_path text,
  add column if not exists payment_proof_file_name text;

insert into storage.buckets (id, name, public)
values ('customer-payment-proofs', 'customer-payment-proofs', false)
on conflict (id) do nothing;

drop policy if exists customer_payment_proofs_storage_insert on storage.objects;
create policy customer_payment_proofs_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'customer-payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists customer_payment_proofs_storage_read on storage.objects;
create policy customer_payment_proofs_storage_read on storage.objects for select
  using (
    bucket_id = 'customer-payment-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or has_permission('finance.view_invoices')
      or has_permission('finance.record_payments')
      or is_master_admin()
    )
  );
