-- =============================================================================
-- Global Transport CRM — Trigram indexes for the new server-side searches
--
-- Leads/Quotes/Suppliers/Users pages moved their search from client-side
-- JSON.stringify()-per-row filtering to server-side .ilike() queries (Part
-- of the performance pass). A leading-wildcard ilike ('%term%') can't use a
-- normal btree index and falls back to a sequential scan once a tenant has
-- real data volume — pg_trgm + GIN trigram indexes make those fast.
-- =============================================================================

create extension if not exists pg_trgm;

create index leads_pickup_text_trgm_idx on leads using gin (pickup_text gin_trgm_ops);
create index leads_destination_text_trgm_idx on leads using gin (destination_text gin_trgm_ops);
create index leads_notes_trgm_idx on leads using gin (notes gin_trgm_ops);

create index quotes_quote_number_trgm_idx on quotes using gin (quote_number gin_trgm_ops);
create index quotes_invoice_number_trgm_idx on quotes using gin (invoice_number gin_trgm_ops);

create index suppliers_name_trgm_idx on suppliers using gin (name gin_trgm_ops);
create index suppliers_region_trgm_idx on suppliers using gin (region gin_trgm_ops);
create index suppliers_email_trgm_idx on suppliers using gin (email gin_trgm_ops);

create index profiles_full_name_trgm_idx on profiles using gin (full_name gin_trgm_ops);
create index profiles_email_trgm_idx on profiles using gin (email gin_trgm_ops);
