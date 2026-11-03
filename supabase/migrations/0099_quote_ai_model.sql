-- =============================================================================
-- Global Transport CRM — record which AI provider/model actually priced each
-- AI-generated quote.
--
-- quotes.ai_generated (existing) only says "AI created this", not which
-- model — now that Settings -> AI Models lets Pricing & Auto-Quote be
-- switched between providers over time, a quote needs its own permanent
-- record of what was actually used to price it, not just a lookup against
-- the tenant's CURRENT setting (which may have changed since). Set once, at
-- creation, by lib/aiAutoQuote.ts's createAndSendQuote — never updated after.
--
-- Null for every quote created before this migration, and for any quote not
-- AI-generated at all.
-- =============================================================================

alter table quotes add column ai_model jsonb null;
