-- =============================================================================
-- Global Transport CRM — Quote payments: deposits, partial payments, Stripe.
--
-- Replaces the unused multi-select deposit_options/payment_methods toggles
-- with a single full-payment-vs-one-deposit-percentage choice per quote
-- version, and adds a customer_payments ledger (mirrors supplier_payments
-- in 0009_payment_legs.sql) so a deposit can be collected now and the
-- remaining balance collected later — either through Stripe Checkout or a
-- manually-recorded bank transfer — without losing track of what's been
-- paid so far. quotes.status gains 'partially_paid' between 'accepted' and
-- 'paid'.
--
-- Note: the ALTER TYPE below must not be followed, in this same file, by
-- any statement that uses the literal 'partially_paid' value — Postgres
-- disallows using a freshly-added enum value inside the transaction that
-- added it.
-- =============================================================================

alter type quote_status add value 'partially_paid' after 'accepted';

alter table quote_versions drop column deposit_options;
alter table quote_versions add column deposit_percentage integer check (deposit_percentage in (25, 50, 75));

alter table quotes add column payment_method_chosen text check (payment_method_chosen in ('stripe', 'bank_transfer'));

-- quote_events needs two new event kinds so the Stripe webhook / manual
-- bank-transfer recording can log what happened on the timeline shown on
-- the staff quote detail page.
alter table quote_events drop constraint if exists quote_events_event_check;
alter table quote_events add constraint quote_events_event_check
  check (event in ('sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled', 'partially_paid', 'paid'));

create table customer_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null,
  method text not null check (method in ('stripe', 'bank_transfer')),
  stripe_session_id text,
  stripe_payment_intent_id text,
  proof_storage_path text,
  proof_file_name text,
  recorded_by uuid references profiles(id) on delete set null,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index customer_payments_quote_id_idx on customer_payments(quote_id);
create index customer_payments_tenant_id_idx on customer_payments(tenant_id);

alter table customer_payments enable row level security;

-- Same audience as who can already see the accepted/paid quote itself
-- (0009_payment_legs.sql's quotes_select) plus anyone who can view
-- invoices/record payments — an accountant reconciling needs to see every
-- payment row, not just the parent quote.
create policy customer_payments_select on customer_payments for select
  using (
    tenant_id = current_tenant_id()
    and (
      has_permission('finance.view_invoices')
      or has_permission('finance.record_payments')
      or exists (select 1 from quotes q where q.id = customer_payments.quote_id and q.created_by = auth.uid())
    )
  );

-- Manual (bank transfer) rows are inserted by an authenticated staff member
-- holding finance.record_payments, same gate as markQuotePaidAction today.
-- Stripe rows are inserted by the webhook via the service-role client,
-- which bypasses RLS entirely, so no policy is needed for that path.
create policy customer_payments_insert on customer_payments for insert
  with check (tenant_id = current_tenant_id() and has_permission('finance.record_payments'));
