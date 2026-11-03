-- Quote validity: how long a new quote stays valid before it expires.
--
-- Was hardcoded at 7 days (the New Quote form's default, and every AI-sent
-- quote in lib/aiAutoQuote.ts). Now a tenant-wide default of 30 days,
-- editable from Settings -> Bank Details & Terms. Each quote can still be
-- given its own validity on the New Quote form, and an existing quote's
-- expiry can be changed from its page by anyone holding
-- quotes.change_expiry (defined in 0001_foundation.sql, unused until now).
-- Existing quotes keep the expiry they were sent with.

alter table tenants
  add column if not exists quote_validity_days int not null default 30
    check (quote_validity_days between 1 and 365);

-- Timeline entry for a changed expiry date. Carries forward every value in
-- the constraint as last redefined by 0103_quote_reminders.sql.
alter table quote_events drop constraint if exists quote_events_event_check;
alter table quote_events add constraint quote_events_event_check
  check (event in (
    'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled', 'partially_paid', 'paid', 'reassigned',
    'card_payment_requested', 'card_payment_approved', 'card_payment_rejected',
    'reminder_sent', 'reminders_paused', 'reminders_resumed', 'reminders_opted_out', 'reminders_opt_out_cleared',
    'expiry_changed'
  ));
