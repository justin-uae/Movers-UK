-- The region allocation UI is being redesigned around a Google Map (pick a
-- place from Places Autocomplete or by clicking the map, see every
-- colleague's coverage as pins before adding your own). That needs real
-- coordinates per region rather than just the free-text label
-- 0006_multiregion_leads.sql started with — added nullable so every
-- existing region row (added through the old plain-text flow) keeps working
-- unmatched to a pin rather than needing a backfill; the UI falls back to
-- geocoding those on the fly for display only, never writing the result back
-- here unless a person re-adds/edits through the new picker.
alter table user_regions add column lat double precision;
alter table user_regions add column lng double precision;
