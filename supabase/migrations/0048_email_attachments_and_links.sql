-- =============================================================================
-- Global Transport CRM — Email attachments + CRM record linking (P1: EML-01,
-- EML-03, EML-04).
--
-- EML-04: email_messages gains the same nullable-FK linking-column trio
-- documents/tasks already use (customer_id/supplier_id/quote_id), so an
-- email can optionally be associated with the record it's about. No RLS
-- change needed — visibility stays scoped to the mailbox owner exactly as
-- it already is, matching the documents/tasks precedent of link columns not
-- affecting who can see the row.
--
-- EML-01/EML-03: a new private bucket holds both outbound (composed) and
-- inbound (synced) attachment binaries — attachment_meta's existing jsonb
-- shape gains a storagePath field per entry rather than a new relational
-- table, since it was already a flexible per-message array. Path convention
-- is {tenantId}/{userId}/{uuid}-{filename} — encoding the owning user in the
-- path itself lets storage RLS enforce the same per-mailbox-owner boundary
-- email_messages already has, rather than the broader tenant-wide
-- general.workspace_access documents/chat-files use (email is more private
-- than a shared document library). Inbound writes happen from the sync
-- cron's service-role client, which bypasses this RLS entirely.
-- =============================================================================

alter table email_messages add column customer_id uuid references customers(id) on delete set null;
alter table email_messages add column supplier_id uuid references suppliers(id) on delete set null;
alter table email_messages add column quote_id uuid references quotes(id) on delete set null;
create index email_messages_customer_id_idx on email_messages(customer_id);
create index email_messages_supplier_id_idx on email_messages(supplier_id);
create index email_messages_quote_id_idx on email_messages(quote_id);

insert into storage.buckets (id, name, public) values ('email-attachments', 'email-attachments', false)
on conflict (id) do nothing;

create policy email_attachments_storage_read on storage.objects for select
  using (
    bucket_id = 'email-attachments'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or has_permission('admin.manage_users')
    )
  );
create policy email_attachments_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'email-attachments'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );
