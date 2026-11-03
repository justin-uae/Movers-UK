-- =============================================================================
-- Global Transport CRM — Keep Master Admin / Administrator roles evergreen
--
-- seed_tenant_defaults() grants every permission in the catalog to a new
-- tenant's Master Admin and Administrator roles at creation time
-- (array_agg(key) from permissions), but that's a one-time snapshot — it
-- doesn't retroactively grant permissions introduced by later migrations.
-- 0008 and 0009 backfilled their new permission keys onto the specific
-- roles that needed them (Sales/Operations/Finance) but missed these two,
-- on the wrong assumption that "holds everything" roles wouldn't need it.
-- A user assigned the "Master Admin" role (not the same thing as the
-- profiles.is_master_admin flag, which bypasses permission checks entirely)
-- was therefore missing dispatch.transfer_supplier_invoice / finance.pay_suppliers.
--
-- Fix: grant every current permission to every role literally named
-- "Master Admin" or "Administrator", across all tenants — closes this gap
-- and any other one from between when a tenant was created and now.
-- =============================================================================

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
cross join permissions p
where r.name in ('Master Admin', 'Administrator')
on conflict (role_id, permission_id) do nothing;
