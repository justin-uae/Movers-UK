-- =============================================================================
-- Booking cancellation (cancelBookingAction, OPS-01) already worked end to
-- end — status transitions, cancelling linked jobs/allocations, and logging
-- a pending `refunds` row when money was already collected — but the
-- cancellation reason itself only ever landed in audit_log, invisible
-- anywhere in the UI, and when nothing had been paid yet (so no refunds row
-- was created at all) the reason was lost from view entirely. These two
-- columns are a durable, always-present record of "who cancelled this and
-- why", shown on the quote detail page's Timeline panel next to the existing
-- customer-decision block, regardless of whether a refund exists.
--
-- Also fixes two real gaps: cancelBookingAction had no ownership check (any
-- role with quotes.cancel could cancel ANY tenant's booking, not just their
-- own — this migration doesn't change that by itself, the app-layer fix is
-- in app/(staff)/quotes/actions.ts), and cancellation never wrote a
-- quote_events row despite 'cancelled' already being a valid event value
-- with an unused label in the UI.
-- =============================================================================

alter table quotes add column cancellation_reason text;
alter table quotes add column cancelled_by uuid references profiles(id) on delete set null;
