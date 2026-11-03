-- =============================================================================
-- Global Transport CRM — Real Team Chat module (Part 24, §151, projectContext.md).
--
-- Public tenant-wide channels + direct messages, modeled as one schema: a DM
-- is just a private 2-person chat_channels row. Text messages with one
-- optional file attachment and an optional link to a customer/supplier/quote/
-- task. Deliberately out of scope for this pass: voice notes, polls,
-- announcement-only channels, private/invite-only channels, message
-- editing/deleting (messages are append-only, same posture as audit_log and
-- attendance_events), threaded replies, typing indicators, and push/email
-- notifications for mentions (no in-app notification infra exists anywhere
-- yet). Attachment storage access is tenant-wide (same simplification as the
-- `documents` bucket), not per-message-membership.
-- =============================================================================

create type chat_channel_type as enum ('channel', 'dm');

create table chat_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type chat_channel_type not null,
  name text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table chat_channel_members (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references chat_channels(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  unique (channel_id, profile_id)
);
create index chat_channel_members_profile_idx on chat_channel_members(profile_id);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel_id uuid not null references chat_channels(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  body text not null,
  attachment_storage_path text,
  attachment_file_name text,
  customer_id uuid references customers(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now()
);
create index chat_messages_channel_idx on chat_messages(channel_id, created_at);

alter table chat_channels enable row level security;
alter table chat_channel_members enable row level security;
alter table chat_messages enable row level security;

-- Security-definer helper, same convention as current_tenant_id()/
-- is_master_admin() (0001_foundation.sql) — needed so chat_channel_members'
-- own SELECT policy can check "am I a member of this channel" without a
-- policy that queries its own protected table directly (Postgres RLS
-- disallows that without recursion errors).
create or replace function is_chat_member(p_channel_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from chat_channel_members where channel_id = p_channel_id and profile_id = auth.uid());
$$;

create policy chat_channels_select on chat_channels for select
  using (tenant_id = current_tenant_id() and (
    (type = 'channel' and has_permission('general.workspace_access')) or is_chat_member(id)
  ));
create policy chat_channels_insert on chat_channels for insert
  with check (tenant_id = current_tenant_id() and has_permission('general.workspace_access') and created_by = auth.uid());

create policy chat_channel_members_select on chat_channel_members for select
  using (profile_id = auth.uid() or is_chat_member(channel_id));
create policy chat_channel_members_insert on chat_channel_members for insert
  with check (
    profile_id = auth.uid()
    or exists(select 1 from chat_channels c where c.id = channel_id and c.created_by = auth.uid())
  );
create policy chat_channel_members_update on chat_channel_members for update
  using (profile_id = auth.uid());

create policy chat_messages_select on chat_messages for select
  using (tenant_id = current_tenant_id() and is_chat_member(channel_id));
create policy chat_messages_insert on chat_messages for insert
  with check (tenant_id = current_tenant_id() and is_chat_member(channel_id) and sender_id = auth.uid());

-- First Realtime usage in this codebase — required for live message delivery.
alter publication supabase_realtime add table chat_messages;

insert into storage.buckets (id, name, public) values ('chat-files', 'chat-files', false)
on conflict (id) do nothing;

create policy chat_files_storage_read on storage.objects for select
  using (
    bucket_id = 'chat-files'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and has_permission('general.workspace_access')
  );
create policy chat_files_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'chat-files'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and has_permission('general.workspace_access')
  );
