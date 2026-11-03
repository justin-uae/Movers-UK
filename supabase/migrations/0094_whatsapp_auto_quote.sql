-- =============================================================================
-- Global Transport CRM — WhatsApp Auto-Quote.
--
-- A second, separate on/off switch alongside AI Assistant's SLA-breach sweep
-- (0087_ai_auto_quote.sql) — when enabled, a lead captured over WhatsApp
-- (app/api/webhooks/360dialog/route.ts, once the AI intake conversation has
-- gathered everything it needs) gets priced and sent a quote by AI
-- immediately at creation, over both email and WhatsApp, rather than sitting
-- in the pool until the SLA sweep eventually reaches it.
--
-- No enabled_at/backlog-floor column needed here, unlike ai_auto_quote_*:
-- this only ever fires once, at the exact moment a brand-new WhatsApp lead
-- is created, so there's no pre-existing backlog it could suddenly sweep up
-- the way flipping the SLA switch on could.
-- =============================================================================

alter table tenants add column whatsapp_auto_quote_enabled boolean not null default false;
