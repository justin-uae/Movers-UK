-- =============================================================================
-- Global Transport CRM — BCC support for staff-sent email.
--
-- cc_addresses already existed (0022_email_accounts.sql); bcc was never
-- built. Unlike CC, a BCC recipient is deliberately never shown back to
-- anyone reading the sent copy later — sendUserEmail (lib/userEmail.ts) logs
-- it here purely so a sender can see who they BCC'd on their own sent
-- message, not because it's meant to be visible to other viewers of the
-- thread (there are none today; Email Centre is per-mailbox already).
-- =============================================================================

alter table email_messages add column bcc_addresses jsonb not null default '[]'::jsonb;
