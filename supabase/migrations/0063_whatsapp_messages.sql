-- =============================================================================
-- Persists a browsable WhatsApp conversation log. Until now, an inbound
-- message's text only ever lived transiently inside the guided-intake state
-- machine (whatsapp_intake_sessions) and was discarded once used to fill in
-- a lead field — there was nowhere to read back "what did this contact
-- actually say," so the WhatsApp staff tab (app/(staff)/whatsapp) has been a
-- bare placeholder. This table gives it a real conversation history: every
-- inbound message and every outbound send (both the automated intake
-- prompts and a staff-typed reply) gets a row.
-- =============================================================================

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  wa_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null default 'text',
  body text not null,
  sent_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index whatsapp_messages_tenant_wa_idx on whatsapp_messages(tenant_id, wa_id, created_at);
create index whatsapp_messages_customer_idx on whatsapp_messages(customer_id);

alter table whatsapp_messages enable row level security;

-- Matches the current nav gate on /whatsapp (general.workspace_access) —
-- anyone who can see the module can see every conversation in it, same
-- visibility model as the Documents and Team Chat modules.
create policy whatsapp_messages_select on whatsapp_messages for select
  using (tenant_id = current_tenant_id() and has_permission('general.workspace_access'));
create policy whatsapp_messages_insert on whatsapp_messages for insert
  with check (tenant_id = current_tenant_id() and has_permission('general.workspace_access'));

alter publication supabase_realtime add table whatsapp_messages;
