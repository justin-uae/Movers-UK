-- =============================================================================
-- Global Transport CRM — Backfill luggage count on enquiries created before
-- the fix.
--
-- createEnquiryFromLeadAction (app/(staff)/leads/actions.ts) only started
-- carrying lead.luggage_count into enquiry_legs.luggage_count once
-- migration 0035 added that column to leads — any enquiry converted from a
-- lead before that code shipped has a permanently-null luggage_count on its
-- leg, even though the source lead genuinely has a value (visible on the
-- Leads page, missing on the quote builder's Enquiry Summary). New
-- conversions are unaffected — this is a one-off catch-up for existing
-- rows.
-- =============================================================================

update enquiry_legs el
set luggage_count = l.luggage_count
from enquiries e
join leads l on l.id = e.lead_id
where el.enquiry_id = e.id
  and el.luggage_count is null
  and l.luggage_count is not null;
