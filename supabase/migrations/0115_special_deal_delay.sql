-- Automatic "Too expensive" discount is no longer sent the instant the
-- customer rejects (0114_special_deals.sql) — it's scheduled 30 minutes out,
-- so it reads like the sales team reconsidered rather than an instant bot
-- reply. The 5-minute cron sweep (lib/quoteRepricing.ts ->
-- runDueAutoDiscounts) picks up quotes whose time has come, and only sends
-- if the quote is still rejected by then.

alter table quotes add column if not exists special_deal_auto_due_at timestamptz;

create index if not exists quotes_special_deal_auto_due_idx
  on quotes (special_deal_auto_due_at)
  where special_deal_auto_due_at is not null;
