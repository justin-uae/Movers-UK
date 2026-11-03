-- The vehicle_types table is empty for most tenants and has no settings UI to
-- manage it yet, so the Complex Booking form's vehicle type field is free text
-- instead of a vehicle_types dropdown (same pattern as quote_versions.vehicle_description).
alter table enquiry_legs add column vehicle_description text;

comment on column enquiry_legs.vehicle_description is
  'Free-text vehicle type entered on the Complex Booking form (e.g. "45-seat coach"), used when vehicle_type_id is not set.';
