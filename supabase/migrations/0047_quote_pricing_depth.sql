-- =============================================================================
-- Global Transport CRM — Quote pricing depth (P1: QTE-03 fixed-amount
-- deposit, QTE-04 payment milestones, FIN-02 itemised extras).
--
-- QTE-03 adds a fixed-amount alternative to the existing 25/50/75% deposit
-- choice — the two are mutually exclusive on a given version.
--
-- QTE-04 adds an optional payment-milestone schedule per quote. When present,
-- amountDueNow() (lib/quoteMoney.ts) walks the milestones in sequence instead
-- of the single deposit-or-full step, so a customer pays one milestone at a
-- time. This supersedes deposit_percentage/deposit_fixed_amount for that
-- quote — the app layer treats "has milestones" as a third payment-plan mode,
-- not something layered on top of a deposit.
--
-- FIN-02 adds an itemised breakdown of extras (waiting time, tolls, etc.)
-- attached to a quote version, purely for display on the quote/PDF/public
-- page. selling_price stays the one authoritative total staff enter by hand —
-- line items don't feed into any payment/finalize math, so nothing about how
-- a quote gets marked paid changes.
-- =============================================================================

alter table quote_versions add column deposit_fixed_amount numeric(12, 2) check (deposit_fixed_amount > 0);
alter table quote_versions add constraint quote_versions_deposit_exclusive
  check (deposit_percentage is null or deposit_fixed_amount is null);

create table quote_payment_milestones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  sequence integer not null,
  label text not null,
  amount numeric(12, 2) not null check (amount > 0),
  due_date date,
  created_at timestamptz not null default now()
);
create index quote_payment_milestones_quote_id_idx on quote_payment_milestones(quote_id);

alter table quote_payment_milestones enable row level security;

create policy quote_payment_milestones_select on quote_payment_milestones for select
  using (tenant_id = current_tenant_id());
create policy quote_payment_milestones_insert on quote_payment_milestones for insert
  with check (tenant_id = current_tenant_id() and has_permission('quotes.create'));

create table quote_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_version_id uuid not null references quote_versions(id) on delete cascade,
  sequence integer not null,
  description text not null,
  amount numeric(12, 2) not null,
  category text not null default 'other' check (category in ('waiting_time', 'toll', 'parking', 'other')),
  created_at timestamptz not null default now()
);
create index quote_line_items_version_id_idx on quote_line_items(quote_version_id);

alter table quote_line_items enable row level security;

create policy quote_line_items_select on quote_line_items for select
  using (tenant_id = current_tenant_id());
create policy quote_line_items_insert on quote_line_items for insert
  with check (tenant_id = current_tenant_id() and has_permission('quotes.create'));
