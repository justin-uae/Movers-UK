-- =============================================================================
-- Global Transport CRM — Phase 2.5 follow-up
--
-- Dispatch showed "No approved suppliers" for any user without a
-- suppliers.* permission (e.g. Sales User dispatching their own paid job) —
-- the suppliers RLS policy only let supplier-management roles see any
-- supplier row at all. Approved suppliers are the "who can I dispatch to"
-- directory and should be visible to any signed-in tenant member; suppliers
-- still under review (invited/submitted/rejected/suspended) stay restricted
-- to people who actually manage suppliers.
-- =============================================================================

drop policy if exists suppliers_select on suppliers;
create policy suppliers_select on suppliers for select
  using (
    id = auth.uid()
    or (tenant_id = current_tenant_id() and status = 'approved')
    or (
      tenant_id = current_tenant_id()
      and (
        has_permission('suppliers.add') or has_permission('suppliers.edit')
        or has_permission('suppliers.approve') or has_permission('suppliers.view_performance')
        or has_permission('suppliers.send_jobs')
      )
    )
  );
