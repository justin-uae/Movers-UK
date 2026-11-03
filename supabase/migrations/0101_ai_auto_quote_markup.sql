-- Settings -> AI Assistant gets a "price increase" lever (Master Admin
-- only, same gate as ai_auto_quote_sla_hours) — every quote AI prices and
-- sends on its own (lib/aiAutoQuote.ts createAndSendQuote, all three
-- triggers: SLA breach, instant WhatsApp lead, manual assign-to-AI) has its
-- selling price bumped by this percentage before it's saved/sent. Defaults
-- to 0 (no change from today's behaviour) so this is zero-risk until a
-- Master Admin explicitly sets it above zero.
alter table tenants add column ai_auto_quote_markup_percent numeric not null default 0;
