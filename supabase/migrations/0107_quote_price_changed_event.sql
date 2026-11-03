-- "Price changed" on the quote Timeline — Edit Price on a quote the customer
-- hasn't accepted yet (app/(staff)/quotes/priceActions.ts) saves a new
-- quote_version and records old -> new price, who and why here. Carries
-- forward every value in the constraint as last redefined by
-- 0104_quote_validity_days.sql.

alter table quote_events drop constraint if exists quote_events_event_check;
alter table quote_events add constraint quote_events_event_check
  check (event in (
    'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled', 'partially_paid', 'paid', 'reassigned',
    'card_payment_requested', 'card_payment_approved', 'card_payment_rejected',
    'reminder_sent', 'reminders_paused', 'reminders_resumed', 'reminders_opted_out', 'reminders_opt_out_cleared',
    'expiry_changed',
    'price_changed'
  ));
