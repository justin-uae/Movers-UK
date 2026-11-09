-- =============================================================================
-- Cheap Mover CRM — Bank details become a standalone, tenant-wide,
-- admin-only Settings tab (moved out of Companies & Brands), and quotes get
-- a real tenant-wide Terms & Conditions setting instead of only a hardcoded
-- PDF-only fallback.
--
-- Bank accounts were previously hard-tied to brand_id (one "is_default" row
-- per brand, filtered by currency nowhere). The real business need is 4
-- simultaneous payment profiles (UK domestic, international GBP, EU/SEPA
-- domestic, international non-EU/SEPA) belonging to the company as a whole,
-- not any one brand — so brand_id becomes optional, and a currency + label +
-- address + notes are added so each profile can carry the details a
-- customer actually needs (Wise's remittance address, SEPA-vs-SWIFT timing
-- notes) that the old single-row-per-brand shape had nowhere to put.
--
-- Write access moves off admin.manage_brands (a Companies & Brands concern)
-- onto admin.manage_accounting_settings — an existing permission key seeded
-- in 0001_foundation.sql but never wired to anything until now.
-- =============================================================================

alter table bank_accounts alter column brand_id drop not null;
alter table bank_accounts add column profile_label text;
alter table bank_accounts add column bank_address text;
alter table bank_accounts add column payment_notes text;
alter table bank_accounts add column sort_order integer not null default 0;

drop policy if exists bank_accounts_insert on bank_accounts;
create policy bank_accounts_insert on bank_accounts for insert
  with check (tenant_id = current_tenant_id() and has_permission('admin.manage_accounting_settings'));

drop policy if exists bank_accounts_update on bank_accounts;
create policy bank_accounts_update on bank_accounts for update
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_accounting_settings'));

-- No delete policy existed before this migration at all.
create policy bank_accounts_delete on bank_accounts for delete
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_accounting_settings'));

-- (No bank accounts are seeded — each tenant adds its own under
-- Settings -> Bank Details.)

-- ---------------------------------------------------------------------------
-- Terms & Conditions: a real, admin-editable, tenant-wide setting. Today
-- there was no single source of truth — a per-quote terms_snapshot text
-- field (usually left blank) and a hardcoded fallback array baked into
-- lib/quotePdf.ts that the public quote web page never used at all (it just
-- showed nothing when terms_snapshot was blank). This becomes the fallback
-- both the PDF and the public page use whenever a quote has no per-quote
-- override, so the two finally show consistent text.
-- ---------------------------------------------------------------------------

alter table tenants add column terms_and_conditions text;

-- ---------------------------------------------------------------------------
-- Finance Manager can also manage bank details/terms going forward (bank
-- details are a finance concern, not just an "administration" one) —
-- backfilled for existing tenants the same way 0011_backfill_admin_role_
-- permissions.sql backfilled a permission onto a role after the fact.
-- ---------------------------------------------------------------------------

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'admin.manage_accounting_settings'
where r.name = 'Finance Manager'
on conflict (role_id, permission_id) do nothing;
