-- =============================================================================
-- Global Transport CRM — Supplier suspension.
--
-- 'suspended' already existed as a supplier_status enum value (0003_
-- operations.sql) and dispatch already only ever offers jobs to status =
-- 'approved' suppliers (app/(staff)/dispatch/[id]/page.tsx), so a suspended
-- supplier is automatically excluded from dispatch with no further change
-- there — what was actually missing was a reason (and who/when) to go with
-- the status flip, and the UI to set/clear it at all.
-- =============================================================================

alter table suppliers
  add column suspension_reason text,
  add column suspended_by uuid references profiles(id) on delete set null,
  add column suspended_at timestamptz;
