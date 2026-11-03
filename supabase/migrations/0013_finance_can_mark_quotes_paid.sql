-- =============================================================================
-- Global Transport CRM — Finance can actually mark a quote as paid.
--
-- 0009 extended quotes_select (and related select policies) so finance
-- roles can view accepted/paid quotes on the Customer Payments page, but
-- never extended quotes_update to match. markQuotePaidAction's UPDATE was
-- silently affecting 0 rows for a Finance Manager (no created_by match, no
-- quotes.edit/send/cancel permission) — Supabase doesn't error on an
-- RLS-filtered 0-row update, so the button just stayed stuck on "accepted".
-- =============================================================================

drop policy if exists quotes_update on quotes;
create policy quotes_update on quotes for update
  using (
    tenant_id = current_tenant_id()
    and (
      created_by = auth.uid()
      or has_permission('quotes.edit')
      or has_permission('quotes.send')
      or has_permission('quotes.cancel')
      or has_permission('finance.record_payments')
    )
  );
