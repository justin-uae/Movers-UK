-- Complex Booking form: AI-extracted, multi-leg lead intake. Adds a
-- provenance flag only — schema for multi-leg storage (enquiry_legs.sequence,
-- journey_type='multi_day') already exists (0002_sales_crm.sql); this is the
-- first code path to actually insert more than one leg per enquiry.
alter table leads add column is_complex_booking boolean not null default false;
alter table enquiries add column is_complex_booking boolean not null default false;

comment on column leads.is_complex_booking is
  'True when this lead was created via the AI-assisted Complex Booking form (paste/upload itinerary) rather than manual entry or an inbound channel.';
comment on column enquiries.is_complex_booking is
  'Mirrors leads.is_complex_booking, set at creation time so the badge can render without joining back to leads.';
