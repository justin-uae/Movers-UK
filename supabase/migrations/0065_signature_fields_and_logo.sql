-- =============================================================================
-- Turns the email-signature fields that were hardcoded constants
-- (Switchboard, Emergency Email, Web) into per-user editable fields, same as
-- Direct Dial/WhatsApp already are — defaulted to the values every user
-- previously saw, so nothing changes visually until someone edits theirs.
-- Also adds a per-user signature logo, uploaded (not just a URL typed in)
-- via a new public bucket — public because the recipient's own mail client
-- fetches this image directly with no Supabase session, unlike every other
-- storage bucket in this app.
-- =============================================================================

alter table profiles
  add column if not exists signature_switchboard text default '+44 20 3834 3211',
  add column if not exists signature_emergency_email text default 'contact@globalbusrental.com',
  add column if not exists signature_website text default 'www.globalbusrental.com',
  add column if not exists signature_logo_url text;

insert into storage.buckets (id, name, public) values ('signature-assets', 'signature-assets', true)
on conflict (id) do nothing;

-- Folder layout: signature-assets/<tenant_id>/<user_id>/<file> — a user may
-- only write into their own folder under their own tenant. Reads are
-- effectively public anyway (that's the point of this bucket), but a select
-- policy is still added for consistency with every other bucket in the app.
create policy signature_assets_select on storage.objects for select
  using (bucket_id = 'signature-assets');
create policy signature_assets_insert on storage.objects for insert
  with check (
    bucket_id = 'signature-assets'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );
create policy signature_assets_update on storage.objects for update
  using (
    bucket_id = 'signature-assets'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );
create policy signature_assets_delete on storage.objects for delete
  using (
    bucket_id = 'signature-assets'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );
