-- =============================================================================
-- Global Transport CRM — Pickup/return time as real lead fields.
--
-- app/api/leads/website/route.ts already accepted pickupTime/returnTrip/
-- returnDate/returnTime from both the quote and contact form types, but
-- with nowhere structured to put them, folded them into the free-text
-- notes field. That's hard to scan at a glance in the Leads workspace —
-- give them real columns instead, alongside the existing travel_date.
-- =============================================================================

alter table leads add column pickup_time text;
alter table leads add column return_trip boolean not null default false;
alter table leads add column return_date date;
alter table leads add column return_time text;
