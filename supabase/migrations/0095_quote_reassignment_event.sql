-- Lets assignQuoteAction (app/(staff)/quotes/actions.ts) log a reassignment
-- onto the quote's own Timeline panel, the same way every other quote
-- lifecycle event already does (0002_sales_crm.sql / 0016_quote_payments.sql).
-- `detail` carries a short human-readable note ("Assigned to <name>") since,
-- unlike the other event kinds, "reassigned" alone doesn't say who it went
-- to — every other event type leaves this null.
alter table quote_events add column if not exists detail text;

alter table quote_events drop constraint if exists quote_events_event_check;
alter table quote_events add constraint quote_events_event_check
  check (event in ('sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled', 'partially_paid', 'paid', 'reassigned'));
