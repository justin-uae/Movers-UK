-- =============================================================================
-- Renames the "Global Transport" brand (the seeded default from
-- scripts/bootstrap-master-admin.mjs) to "GLOBAL BUS RENTAL LIMITED" — the
-- name customers actually see as the letterhead on quote/invoice PDFs and
-- the public quote pages. Also backfills already-created quote_versions'
-- frozen brand_snapshot JSON so a resend of an older quote/invoice picks up
-- the new name too, consistent with this app's "sent quotes get overwritten,
-- not versioned" rule.
-- =============================================================================

update brands
set name = 'GLOBAL BUS RENTAL LIMITED'
where name = 'Global Transport';

update quote_versions
set brand_snapshot = jsonb_set(brand_snapshot, '{name}', '"GLOBAL BUS RENTAL LIMITED"')
where brand_snapshot ->> 'name' = 'Global Transport';
