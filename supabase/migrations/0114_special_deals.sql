-- =============================================================================
-- "Today's Special Deal" — a percentage discount on a quote the customer
-- hasn't accepted yet.
--
-- * Staff: the button on the quote page (app/(staff)/quotes/priceActions.ts,
--   applySpecialDealAction) saves a new quote_version at the discounted
--   price, like Edit Price does.
-- * Automatic: when a customer rejects a quote with "Too expensive", the
--   quote is re-opened and re-sent once at the tenant's discount
--   (lib/quoteRepricing.ts, offerAutoDiscountAfterRejection) — same quote,
--   same owner, new version.
--
-- quote_versions.original_price / discount_percent are what the customer
-- quote page, PDF and staff quote page show as "was £X, now £Y (N% off)".
-- A later Edit Price saves a version without them, i.e. clears the deal.
-- =============================================================================

alter table quote_versions
  add column original_price numeric(12, 2),
  add column discount_percent numeric(5, 2) check (discount_percent > 0 and discount_percent < 100),
  add column discount_source text check (discount_source in ('special_deal', 'too_expensive_auto'));

alter table tenants
  add column special_deal_auto_enabled boolean not null default false,
  add column special_deal_auto_percent numeric(5, 2) not null default 10
    check (special_deal_auto_percent >= 1 and special_deal_auto_percent <= 90);

-- Carries forward every value in the constraint as last redefined by
-- 0107_quote_price_changed_event.sql.
alter table quote_events drop constraint if exists quote_events_event_check;
alter table quote_events add constraint quote_events_event_check
  check (event in (
    'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled', 'partially_paid', 'paid', 'reassigned',
    'card_payment_requested', 'card_payment_approved', 'card_payment_rejected',
    'reminder_sent', 'reminders_paused', 'reminders_resumed', 'reminders_opted_out', 'reminders_opt_out_cleared',
    'expiry_changed',
    'price_changed',
    'special_deal',
    'special_deal_auto'
  ));
