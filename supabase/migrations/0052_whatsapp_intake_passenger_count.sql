-- =============================================================================
-- Global Transport CRM — Passenger count for the WhatsApp guided lead intake.
--
-- Adds a step between pickup/destination and the travel date question — the
-- CRM's own manual lead/enquiry forms already treat passenger count as a
-- core journey field, and the spec asked for it here too.
-- =============================================================================

alter table whatsapp_intake_sessions add column passenger_count integer;

alter table whatsapp_intake_sessions drop constraint whatsapp_intake_sessions_step_check;
alter table whatsapp_intake_sessions add constraint whatsapp_intake_sessions_step_check
  check (step in (
    'awaiting_name', 'awaiting_email', 'awaiting_pickup', 'awaiting_destination',
    'awaiting_passengers', 'awaiting_date', 'done'
  ));
