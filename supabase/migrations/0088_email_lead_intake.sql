-- =============================================================================
-- Global Transport CRM — Email Lead Intake.
--
-- 300+ transport-hire websites forward their contact-form enquiries into one
-- shared inbox. A new cron sweep (app/api/cron/email-lead-intake/route.ts,
-- lib/emailLeadIntake.ts) polls that inbox via IMAP (same imapflow +
-- mailparser mechanism as the per-user Email Centre sync,
-- app/api/cron/email-sync/route.ts), has OpenAI decide whether each message
-- is a genuine travel/transport enquiry or spam/irrelevant, and creates a
-- `leads` row (source 'email') for the genuine ones — extracting whatever
-- trip details are actually present. Not a genuine enquiry -> nothing is
-- created at all (per the user's explicit choice), only logged below so the
-- same email is never re-processed.
--
-- Every email-intake lead lands on one fixed brand (the user's choice, over
-- trying to auto-match one of 300+ sites from email content alone) —
-- default_lead_inbox_brand_id, backfilled below to whichever brand looks
-- like the company's own "GLOBAL BUS RENTAL LIMITED" entity (see
-- 0061_rename_brand_global_bus_rental.sql). Re-point it from Settings ->
-- Companies & Brands data if that guess is wrong for your tenant.
-- =============================================================================

alter table tenants add column default_lead_inbox_brand_id uuid references brands(id) on delete set null;

update tenants t
set default_lead_inbox_brand_id = (
  select b.id from brands b
  where b.tenant_id = t.id and b.name ilike '%global bus rental%'
  order by b.created_at asc
  limit 1
);

-- IMAP polling cursor for the shared inbox — defaults to the moment this
-- migration runs, not the mailbox's actual history, so applying it doesn't
-- suddenly sweep years of old inbox backlog into hundreds of leads on the
-- very first cron run (same reasoning as AI Auto-Quote's enabled-at floor,
-- 0087_ai_auto_quote.sql).
alter table tenants add column email_lead_inbox_synced_since timestamptz not null default now();

-- Dedup + lightweight processing log — every message the sweep has looked
-- at, genuine enquiry or not, keyed by its own Message-ID header so a
-- redelivered/re-scanned email is never turned into (or attempted as) a
-- second lead. Only the admin client (the cron) ever writes here; the
-- select policy lets Master Admin/Sales Manager (admin.view_audit_logs)
-- review what the filter has been doing.
create table email_lead_intake_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  message_id text not null,
  from_address text,
  subject text,
  decision text not null check (decision in ('lead_created', 'discarded_not_travel', 'discarded_no_contact', 'error')),
  lead_id uuid references leads(id) on delete set null,
  detail text,
  created_at timestamptz not null default now(),
  unique (tenant_id, message_id)
);
create index email_lead_intake_log_tenant_created_idx on email_lead_intake_log(tenant_id, created_at desc);

alter table email_lead_intake_log enable row level security;
create policy email_lead_intake_log_select on email_lead_intake_log for select
  using (tenant_id = current_tenant_id() and has_permission('admin.view_audit_logs'));
