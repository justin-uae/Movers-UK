-- =============================================================================
-- Global Transport CRM — AI Auto-Quote.
--
-- If a lead sits unquoted for longer than a configurable number of business
-- hours (Monday-Saturday; the clock only pauses on Sundays), an automated sweep
-- (app/api/cron/ai-auto-quote/route.ts, lib/aiAutoQuote.ts) takes over:
--   - if the lead is currently assigned to a sales user, it's released back
--     to the open pool (same shape as a manual release — see
--     lead_released_sla_breach in the audit log / Assignment history),
--   - OpenAI estimates a selling price and supplier cost for the trip and a
--     quote is created and sent to the customer automatically, exactly like
--     a human-created quote (same quote_sent email, same PDF, same
--     quote_events/status lifecycle) — the only difference is who priced it
--     and who clicked send.
--
-- The SLA is tenant-wide and Master-Admin-only (Settings -> AI Auto-Quote),
-- defaulting to 24 hours. tenants_update's existing RLS policy (is_master_
-- admin() only, 0001_foundation.sql) already enforces "master admin only"
-- at the database layer, so no new permission key is introduced here.
-- =============================================================================

-- Defaults to OFF: existing tenants likely already have a backlog of old
-- "new"/"open_pool" leads sitting well past 24 business hours, and turning
-- this on by default would auto-quote and email every single one of them
-- the moment this migration runs. Master Admin switches it on deliberately
-- from Settings -> AI Auto-Quote once ready.
alter table tenants add column ai_auto_quote_enabled boolean not null default false;
alter table tenants add column ai_auto_quote_sla_hours integer not null default 24
  check (ai_auto_quote_sla_hours between 1 and 500);
-- When the switch was last turned on (set by updateAiAutoQuoteSettingsAction
-- whenever it flips false -> true, not on every save). The sweep floors each
-- lead's SLA countdown at this timestamp, not just its created_at, so
-- switching the feature on doesn't treat every pre-existing "new"/
-- "open_pool" lead as instantly overdue — they all get a fresh SLA window
-- starting from activation instead.
alter table tenants add column ai_auto_quote_enabled_at timestamptz;

alter table enquiries add column ai_generated boolean not null default false;
alter table quotes add column ai_generated boolean not null default false;

-- Sales tab (/quotes/ai-created) filters on this — cheap to keep it fast even
-- though most quotes will never match.
create index quotes_ai_generated_idx on quotes(tenant_id) where ai_generated;
