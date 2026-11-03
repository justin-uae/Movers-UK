-- New job_status value for a job a supplier already accepted/confirmed,
-- then got edited (Edit Booking) — they have to explicitly re-approve
-- before anything proceeds. Kept in its own migration: Postgres won't let a
-- freshly-added enum value be referenced by functions/policies in the same
-- transaction that added it, so everything that actually USES this value
-- (recalc_job_status, the new supplier actions, RLS) lives in
-- 0071_pending_reapproval_flow.sql instead.
alter type job_status add value 'pending_reapproval';
