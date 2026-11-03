-- =============================================================================
-- Leads left in the open pool after their pickup date has passed are no longer
-- actionable. They move to this status (lazily, see lib/leadExpiry.ts) and
-- show on Lost Booking with an "Expired — pickup date passed" description
-- instead of sitting in the pool for someone to claim.
-- ADD VALUE is kept alone in this file: a new enum value can't be used in the
-- same transaction that creates it.
-- =============================================================================

alter type lead_status add value if not exists 'expired';
