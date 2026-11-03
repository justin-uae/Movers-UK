-- =============================================================================
-- Global Transport CRM — Per-user IMAP/SMTP mailbox connections + synced mail
--
-- email_accounts: one mailbox per staff member (profiles.id), configured by
-- a Master Admin from Settings -> Users (admin.manage_users). IMAP/SMTP
-- passwords are stored as application-layer ciphertext (AES-256-GCM, see
-- lib/crypto.ts) in *_password_enc — the decryption key lives only in the
-- EMAIL_CREDENTIALS_KEY env var, never in the database, so DB access alone
-- can't recover a mailbox password. RLS still exists as defence in depth,
-- but the real secrecy boundary is "who can read the env var".
--
-- email_messages: synced INBOX mail (written by the /api/cron/email-sync
-- route, running as the service-role client, so no insert policy is needed
-- for that path) plus locally-recorded outbound mail (written by the send
-- Server Action, running as the sending user, so that path does need an
-- insert policy scoped to the account owner).
-- =============================================================================

create type email_security as enum ('ssl', 'starttls', 'none');

create table email_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null unique references profiles(id) on delete cascade,
  display_name text not null,
  email_address text not null,
  imap_host text not null,
  imap_port integer not null default 993,
  imap_security email_security not null default 'ssl',
  imap_username text not null,
  imap_password_enc text not null,
  smtp_host text not null,
  smtp_port integer not null default 587,
  smtp_security email_security not null default 'starttls',
  smtp_username text not null,
  smtp_password_enc text not null,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  last_sync_error text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index email_accounts_tenant_id_idx on email_accounts(tenant_id);
create index email_accounts_is_active_idx on email_accounts(is_active) where is_active;

alter table email_accounts enable row level security;

create policy email_accounts_select on email_accounts for select
  using (user_id = auth.uid() or (tenant_id = current_tenant_id() and has_permission('admin.manage_users')));
create policy email_accounts_insert on email_accounts for insert
  with check (tenant_id = current_tenant_id() and has_permission('admin.manage_users'));
create policy email_accounts_update on email_accounts for update
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_users'));
create policy email_accounts_delete on email_accounts for delete
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_users'));

create table email_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email_account_id uuid not null references email_accounts(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  folder text not null default 'inbox' check (folder in ('inbox', 'sent', 'archived')),
  message_uid text not null,
  message_id text,
  in_reply_to text,
  thread_key text,
  from_name text,
  from_address text not null,
  to_addresses jsonb not null default '[]'::jsonb,
  cc_addresses jsonb not null default '[]'::jsonb,
  subject text,
  body_text text,
  body_html text,
  snippet text,
  has_attachments boolean not null default false,
  attachment_meta jsonb not null default '[]'::jsonb,
  is_read boolean not null default false,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (email_account_id, folder, message_uid)
);
create index email_messages_account_folder_idx on email_messages(email_account_id, folder, occurred_at desc);
create index email_messages_thread_key_idx on email_messages(thread_key);

alter table email_messages enable row level security;

create policy email_messages_select on email_messages for select
  using (
    exists (
      select 1 from email_accounts ea
      where ea.id = email_messages.email_account_id
        and (ea.user_id = auth.uid() or (ea.tenant_id = current_tenant_id() and has_permission('admin.manage_users')))
    )
  );
create policy email_messages_insert on email_messages for insert
  with check (
    exists (select 1 from email_accounts ea where ea.id = email_messages.email_account_id and ea.user_id = auth.uid())
  );
create policy email_messages_update on email_messages for update
  using (
    exists (select 1 from email_accounts ea where ea.id = email_messages.email_account_id and ea.user_id = auth.uid())
  );
