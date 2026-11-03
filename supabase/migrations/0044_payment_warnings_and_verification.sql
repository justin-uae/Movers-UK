-- PAY-01/PAY-02: zero, negative and above-balance customer payments must
-- stay permitted after a staff warning (Section 5 of the approved spec),
-- never hard-blocked. The app layer already warns-then-allows as of this
-- change, but the DB itself still rejected non-positive amounts outright —
-- drop that check or the app-level "confirm to save it anyway" flow would
-- silently fail at the database.
alter table customer_payments drop constraint if exists customer_payments_amount_check;

-- PAY-04: bank-transfer payments must sit unverified until Finance
-- explicitly confirms them; other methods (Stripe) are confirmed the moment
-- the provider confirms them, so they start (and stay) verified.
alter table customer_payments add column verification_status text not null default 'verified'
  check (verification_status in ('pending', 'verified'));
alter table customer_payments add column verified_by uuid references profiles(id) on delete set null;
alter table customer_payments add column verified_at timestamptz;

comment on column customer_payments.verification_status is
  'Bank-transfer rows start pending and do not count toward the quote''s paid/partially_paid status until a finance.verify_bank_transfers holder verifies them. Stripe rows are inserted already verified.';

-- Finance verifies a pending bank-transfer payment.
create policy customer_payments_verify on customer_payments for update
  using (tenant_id = current_tenant_id() and has_permission('finance.verify_bank_transfers'))
  with check (tenant_id = current_tenant_id() and has_permission('finance.verify_bank_transfers'));
