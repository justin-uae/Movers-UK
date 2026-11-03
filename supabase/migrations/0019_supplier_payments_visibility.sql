-- =============================================================================
-- Global Transport CRM — Sales User can see supplier payment history on a
-- job they can already view.
--
-- jobs_select and job_supplier_invoices_select both already let a
-- bookings.view holder see the job and its invoice (0008/0009), but
-- supplier_payments_select never got the same bookings.view clause added —
-- so a Sales Manager could see "invoice forwarded to accounting" but never
-- the payment(s) Finance later recorded against it. Same fix as those two
-- policies: add has_permission('bookings.view') alongside the existing
-- finance permissions.
-- =============================================================================

drop policy if exists supplier_payments_select on supplier_payments;
create policy supplier_payments_select on supplier_payments for select
  using (
    exists (select 1 from jobs j where j.id = job_id and j.assigned_supplier_id = auth.uid())
    or (
      tenant_id = current_tenant_id()
      and (
        is_master_admin()
        or has_permission('finance.view_invoices')
        or has_permission('finance.view_bank_details')
        or has_permission('bookings.view')
      )
    )
  );
