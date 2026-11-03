-- =============================================================================
-- Global Transport CRM — Structured WhatsApp lead intake.
--
-- The first cut of the 360dialog webhook (no migration needed) created a
-- lead straight from whatever text a contact's first message contained.
-- This replaces that with a short guided Q&A run by the webhook itself,
-- sending outbound WhatsApp replies (lib/whatsapp360.ts) to collect name,
-- email, pickup, destination and travel date before creating the lead —
-- one session per WhatsApp contact per enquiry, tracked here so a multi-
-- message conversation doesn't need everything in one text.
-- =============================================================================

create table whatsapp_intake_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  wa_id text not null,
  customer_id uuid references customers(id) on delete set null,
  step text not null default 'awaiting_name'
    check (step in ('awaiting_name', 'awaiting_email', 'awaiting_pickup', 'awaiting_destination', 'awaiting_date', 'done')),
  name text,
  email text,
  pickup text,
  destination text,
  travel_date_raw text,
  lead_id uuid references leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index whatsapp_intake_sessions_contact_idx on whatsapp_intake_sessions(brand_id, wa_id, created_at desc);

alter table whatsapp_intake_sessions enable row level security;

-- Written only by the 360dialog webhook's service-role client (no
-- authenticated session exists for an inbound webhook call, same reasoning
-- as commissions' service-role-only insert) — this select policy exists
-- purely so staff could inspect an in-progress conversation for support/
-- debugging, not because any staff-facing UI reads it yet.
create policy whatsapp_intake_sessions_select on whatsapp_intake_sessions for select
  using (tenant_id = current_tenant_id() and has_permission('general.workspace_access'));
