-- =============================================================================
-- Global Transport CRM — Remove Integrations/Automations.
--
-- Both were empty placeholder pages (ModulePlaceholder, never built out) —
-- removed from the sidebar, the routes deleted, and now their permission
-- rows too. role_permissions/user_permission_overrides both reference
-- permissions.id with on delete cascade, so any role that had either
-- toggled on just loses that (now meaningless) grant, nothing else.
-- =============================================================================

delete from permissions where key in ('admin.manage_integrations', 'admin.manage_automations');
