-- =============================================================================
-- Global Transport CRM — Narrow Finance Manager's scope.
--
-- Finance Manager previously held finance.view_commissions and
-- finance.view_profit (unlocking the Commissions and Business Intelligence
-- nav items — neither used for anything else in the app, see nav.ts) plus
-- admin.manage_accounting_settings (the only thing giving Finance Manager
-- access to Settings at all — specifically Settings -> Bank Details).
-- Removing all three per the user's request: Finance Manager should not see
-- Business Intelligence, Commissions, or Settings.
--
-- Note: after applying this, an existing signed-in Finance Manager won't see
-- the change until either the app redeploys or a Master Admin opens
-- Settings -> Roles -> Finance Manager and hits Save — getGrantedPermissions
-- (lib/permissions.ts) caches a role's granted keys indefinitely and only
-- busts that cache via revalidateTag, which only the app's own Settings ->
-- Roles action calls, not a direct SQL write like this one.
-- =============================================================================

delete from role_permissions
where role_id = (select id from roles where name = 'Finance Manager')
  and permission_id in (
    select id from permissions
    where key in ('finance.view_commissions', 'finance.view_profit', 'admin.manage_accounting_settings')
  );
