-- Instant AI quote for new website, email and manual leads.
--
-- Same idea as whatsapp_auto_quote_enabled (0094_whatsapp_auto_quote.sql):
-- the moment a lead from that source is created, AI prices and sends a
-- quote for it straight away (lib/aiAutoQuote.ts -> instantAutoQuoteNewLead),
-- instead of waiting for a salesperson or the SLA time limit. One switch per
-- source, all Master-Admin-only (Settings -> AI Assistant), all off by
-- default so nothing changes until someone turns one on.

alter table tenants
  add column if not exists website_auto_quote_enabled boolean not null default false,
  add column if not exists email_auto_quote_enabled boolean not null default false,
  add column if not exists manual_auto_quote_enabled boolean not null default false;
