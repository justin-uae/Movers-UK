-- =============================================================================
-- Lets a lead's assigned owner correct that lead's linked customer's name/
-- contact details from the Lead detail page, even without the blanket
-- enquiries.edit permission — mirroring leads_update's own
-- `assigned_user_id = auth.uid()` carve-out (0002_sales_crm.sql). Previously
-- customers_update required enquiries.edit with no ownership path at all,
-- which the default Sales User role doesn't hold, silently blocking reps
-- from fixing a typo'd name/email on their own lead's customer.
-- =============================================================================

drop policy customers_update on customers;
create policy customers_update on customers for update
  using (
    tenant_id = current_tenant_id()
    and (
      has_permission('enquiries.edit')
      or exists (
        select 1 from leads l
        where l.customer_id = customers.id
          and l.assigned_user_id = auth.uid()
      )
    )
  );
