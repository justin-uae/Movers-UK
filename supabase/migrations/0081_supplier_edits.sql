-- =============================================================================
-- Lets staff with suppliers.edit correct a supplier's business details after
-- onboarding — previously there was no way to fix a typo'd email/phone/VAT
-- number etc. without going around the app directly. Every edit requires a
-- reason and is logged here, append-only, same pattern as lead_edits
-- (0076_lead_edits.sql), so the supplier detail page can show a proper
-- history of what changed, when, and why.
-- =============================================================================

create table supplier_edits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  edited_by uuid references profiles(id) on delete set null,
  reason text not null,
  -- { field_name: { from: ..., to: ... } } — only the fields that actually changed.
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index supplier_edits_supplier_id_idx on supplier_edits(supplier_id, created_at desc);
create index supplier_edits_tenant_id_idx on supplier_edits(tenant_id);

alter table supplier_edits enable row level security;

-- Same visibility as the supplier record itself (suppliers_select, 0003_operations.sql).
create policy supplier_edits_select on supplier_edits for select
  using (
    tenant_id = current_tenant_id()
    and (
      has_permission('suppliers.add') or has_permission('suppliers.edit')
      or has_permission('suppliers.approve') or has_permission('suppliers.view_performance')
      or has_permission('suppliers.send_jobs')
    )
  );

-- The app layer (editSupplierAction) is the real access gate — only
-- suppliers.edit holders can call it. This is a backstop against a direct
-- client-side insert, same reasoning as lead_edits_insert.
create policy supplier_edits_insert on supplier_edits for insert
  with check (tenant_id = current_tenant_id() and edited_by = auth.uid());
