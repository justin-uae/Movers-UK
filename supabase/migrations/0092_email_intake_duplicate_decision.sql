-- =============================================================================
-- Global Transport CRM — allow email_lead_intake_log.decision to record
-- "discarded_duplicate", for when the email sweep (lib/emailLeadIntake.ts)
-- recognises a forwarded copy of an enquiry that already created a lead
-- through another channel (e.g. a site's own contact-form webhook posts
-- directly to the CRM AND emails a copy to info@, which forwards into the
-- shared inbox this sweep polls) and skips creating a second lead for it.
-- =============================================================================

alter table email_lead_intake_log drop constraint email_lead_intake_log_decision_check;
alter table email_lead_intake_log add constraint email_lead_intake_log_decision_check
  check (decision in ('lead_created', 'discarded_not_travel', 'discarded_no_contact', 'discarded_duplicate', 'error'));
