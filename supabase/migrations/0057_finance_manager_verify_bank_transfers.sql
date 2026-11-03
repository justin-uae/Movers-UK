-- =============================================================================
-- Global Transport CRM — Finance Manager should always be able to both
-- record a customer payment AND verify a bank transfer, not just one or the
-- other. finance.record_payments has been on this role since it was first
-- seeded, but finance.verify_bank_transfers (added by PAY-04) evidently
-- never made it onto at least one existing tenant's Finance Manager role —
-- same backfill pattern as 0011_backfill_admin_role_permissions.sql and
-- 0055_bank_details_and_terms.sql's Finance Manager grant.
-- =============================================================================

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'finance.verify_bank_transfers'
where r.name = 'Finance Manager'
on conflict (role_id, permission_id) do nothing;
