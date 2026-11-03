-- =============================================================================
-- Lets the assigned owner of a lead edit its journey/intake details (pickup,
-- destination, travel date, passengers, etc.) after it's been captured —
-- previously the only way to change any of this was to abandon the lead and
-- start a fresh one. Every edit requires a reason and is logged here,
-- append-only, so the Lead detail page can show a proper history of what
-- changed, when, and why. Deliberately no customer/supplier notification or
-- email — unlike booking_amendments (which touches money and live
-- supplier/customer commitments), a lead is pre-quote, internal-only, so
-- there's nobody outside the CRM to tell.
-- =============================================================================

create table lead_edits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  edited_by uuid references profiles(id) on delete set null,
  reason text not null,
  -- { field_name: { from: ..., to: ... } } — only the fields that actually changed.
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index lead_edits_lead_id_idx on lead_edits(lead_id, created_at desc);
create index lead_edits_tenant_id_idx on lead_edits(tenant_id);

alter table lead_edits enable row level security;

-- Same visibility as the lead itself (can_view_assignment, defined in
-- 0002_sales_crm.sql) — whoever can see the lead can see its edit history.
create policy lead_edits_select on lead_edits for select
  using (
    tenant_id = current_tenant_id()
    and exists (
      select 1 from leads l
      where l.id = lead_edits.lead_id
        and (can_view_assignment(l.assigned_user_id) or l.status = 'open_pool')
    )
  );

-- The app layer (editLeadAction) is the real access gate — only the lead's
-- assigned owner can call it, matching leads_update's own
-- `assigned_user_id = auth.uid()` clause. This is a backstop against a
-- direct client-side insert, same reasoning as booking_amendments_insert.
create policy lead_edits_insert on lead_edits for insert
  with check (tenant_id = current_tenant_id() and edited_by = auth.uid());
