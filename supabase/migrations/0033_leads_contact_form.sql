-- =============================================================================
-- Global Transport CRM — Contact-form leads via the website intake API.
--
-- app/api/leads/website/route.ts now accepts two form types on the same
-- endpoint, picked by the body's "formType": the existing journey-specific
-- "quote" form (default, source 'website', unchanged) and a new general
-- "contact" form — name, email, phone and message required; service needed,
-- passenger count, travel date, pickup time and return-trip optional. No
-- journey (pickup/destination), so it gets its own source value rather than
-- reusing 'website', letting the Leads workspace and Control Centre label
-- and chart the two apart.
-- =============================================================================

alter type lead_source add value if not exists 'website_contact';
