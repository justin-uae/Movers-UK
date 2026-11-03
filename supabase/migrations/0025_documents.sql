-- =============================================================================
-- Global Transport CRM — Real Documents module (Part 23, projectContext.md).
--
-- A general document library: upload, categorize, optionally link to one
-- customer/supplier/quote record, search, download, delete. Deliberately
-- out of scope for this pass: nested folders (the doc_type filter stands in
-- for this), granular per-role permissions (view/upload is anyone with
-- general.workspace_access, delete is the uploader or Master Admin),
-- version history, digital signatures, expiry reminders, OCR/content
-- search, malware scanning, and retention-policy automation.
-- =============================================================================

create type document_type as enum (
  'contract', 'nda', 'customer_agreement', 'supplier_licence', 'insurance',
  'driver_licence', 'vehicle_registration', 'invoice', 'receipt', 'credit_note',
  'itinerary', 'passenger_list', 'other'
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  doc_type document_type not null default 'other',
  label text not null,
  notes text,
  storage_path text not null,
  file_name text not null,
  file_size bigint,
  customer_id uuid references customers(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index documents_tenant_id_idx on documents(tenant_id, created_at desc);
create index documents_customer_id_idx on documents(customer_id);
create index documents_supplier_id_idx on documents(supplier_id);
create index documents_quote_id_idx on documents(quote_id);

alter table documents enable row level security;

-- Matches the current nav gate on /documents (general.workspace_access,
-- already universal to every role except Finance Manager) — anyone who can
-- see the module can see every document in it. Deleting is tighter: your
-- own upload, or Master Admin.
create policy documents_select on documents for select
  using (tenant_id = current_tenant_id() and has_permission('general.workspace_access'));
create policy documents_insert on documents for insert
  with check (tenant_id = current_tenant_id() and has_permission('general.workspace_access') and uploaded_by = auth.uid());
create policy documents_delete on documents for delete
  using (tenant_id = current_tenant_id() and (uploaded_by = auth.uid() or is_master_admin()));

insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Tenant-folder-scoped, same idiom as every existing bucket's user-folder
-- scoping (e.g. supplier-documents in 0003_operations.sql:226-243) just
-- keyed by current_tenant_id() instead of auth.uid(), since visibility here
-- is "anyone on this tenant with workspace access," not "only the uploader."
create policy documents_storage_read on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and has_permission('general.workspace_access')
  );
create policy documents_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and has_permission('general.workspace_access')
  );
create policy documents_storage_delete on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and (
      is_master_admin()
      or exists (select 1 from documents d where d.storage_path = storage.objects.name and d.uploaded_by = auth.uid())
    )
  );
