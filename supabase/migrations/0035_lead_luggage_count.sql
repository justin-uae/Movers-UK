-- =============================================================================
-- Global Transport CRM — Luggage count as a real lead field.
--
-- enquiry_legs.luggage_count has always existed and the quote PDF already
-- has a dedicated "Luggage" row for it (lib/quotePdf.ts) — but `leads` had
-- no equivalent column, so a site sending luggage info (e.g. Global Bus
-- Rental's send.php) had nowhere to put it except free-text notes, and
-- createEnquiryFromLeadAction never had a value to carry across. Same fix
-- as 0034's pickup_time/return_trip/return_date/return_time.
-- =============================================================================

alter table leads add column luggage_count integer;
