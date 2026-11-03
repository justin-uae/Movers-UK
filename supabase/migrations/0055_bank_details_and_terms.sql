-- =============================================================================
-- Global Transport CRM — Bank details become a standalone, tenant-wide,
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

-- Seed the company's real payment profiles for every existing tenant —
-- tenant-wide (brand_id null), one row per profile. This is real business
-- data for the one company running this CRM, not generic starter content,
-- so it's a one-time backfill here rather than something seed_tenant_defaults()
-- perpetuates for hypothetical future tenants.
insert into bank_accounts (
  tenant_id, brand_id, profile_label, account_name, bank_name, currency,
  account_number, iban, swift_bic, sort_code, bank_address, payment_notes, sort_order, is_default
)
select
  t.id, null::uuid, 'UK Local Payments', 'Global Bus Rental Limited', 'Wise', 'GBP',
  '31066305', null, null, '23-69-72', null, null, 1, true
from tenants t
union all
select
  t.id, null::uuid, 'International GBP Payments', 'Global Bus Rental Limited', 'Wise', 'GBP',
  null, 'GB04 TRWI 2314 7053 0375 95', 'TRWIGB2LXXX', null,
  'Wise, 56 Shoreditch High Street, London, E1 6JJ, United Kingdom', null, 2, false
from tenants t
union all
select
  t.id, null::uuid, 'European Bank Details (SEPA / Domestic EU)', 'Global Bus Rental Limited', 'Wise', 'EUR',
  '4078788', 'BE43 9674 0787 8801', 'TRWIBEB1XXX', null,
  'Wise, Avenue Louise 54, Room S52, Brussels 1050, Belgium',
  'EUR payments usually take 1-2 working days to arrive. If you''re asked for a bank address, you can use Wise''s address. You can use Wise as the bank name.',
  3, true
from tenants t
union all
select
  t.id, null::uuid, 'International Payments (outside EU/SEPA)', 'Global Bus Rental Limited', 'Wise', 'EUR',
  '4078788', 'BE43 9674 0787 8801', 'TRWIBEB1XXX', null,
  'Wise, Avenue Louise 54, Room S52, Brussels 1050, Belgium',
  'International SWIFT payments usually take 4-5 working days to arrive. If you''re asked for a bank address, you can use Wise''s address. You can use Wise as the bank name.',
  4, false
from tenants t;

-- ---------------------------------------------------------------------------
-- Terms & Conditions: a real, admin-editable, tenant-wide setting. Today
-- there was no single source of truth — a per-quote terms_snapshot text
-- field (usually left blank) and a hardcoded fallback array baked into
-- lib/quotePdf.ts that the public quote web page never used at all (it just
-- showed nothing when terms_snapshot was blank). This becomes the fallback
-- both the PDF and the public page use whenever a quote has no per-quote
-- override, so the two finally show consistent text.
-- ---------------------------------------------------------------------------

alter table tenants add column terms_and_conditions text default $tc$Terms & Conditions
All bookings are made subject to both Global Bus Rental Limited terms below and the specific booking conditions of your relevant Travel Supplier. It is your responsibility to ensure that you have read, understood and agree both prior to booking.

Delays to Service: No responsibility or liability whatsoever can be accepted by Global Bus Rental Limited for traffic congestion, road accidents, adverse weather conditions or other matters outside its reasonable control which may cause delay. Both parties expressly recognise in transport such as coach hire that buses can be late as a normal cause of business without negligence on behalf of the coach hire company (typically due to previous customer delays, traffic, accidents and mechanical problems).

If for any reason the driver has to re-route the journey due to traffic, adverse weather conditions or any unforeseen reasons and cannot get the passengers to the destination on time, neither the driver or Global Bus Rental Limited will be held liable for any loss incurred for e.g. missed flights, paying extra for alternative transport, missed events or lateness to meetings etc. Also if the vehicle allocated to the journey has a mechanical issue prior to the journey or on the journey and we cannot find an alternative vehicle, Global Bus Rental Limited will not be held liable for any loss incurred and will not pay out any compensation under any circumstance; at management's discretion they may allow the deposit to be refunded.

Cancellation Policy: If a booking is cancelled in writing by the Customer before the date of travel or on the day of travel there will be no refund to the customer as the booking is a 100% non refundable booking.

Coach Bookings: All payments to be 7 days prior travel date stated before finalisation the booking process. If payment is not successfully in the 7 days we have the right to cancel your booking and your deposit is non refundable. In emergency circumstances where vehicles have been taken off the road due to accident or mechanical failure, we may use multiple smaller vehicles to carry out the journey.

Damages / Spillage: Any damage/spillage caused by the passengers will be charged accordingly by the driver at a minimum rate 5% of booking value this also includes soft drinks water wine spirits or any form of liquid. Any fines for misuse, damage or spillages have to be paid in cash to the driver. Drinking is not permitted unless it has been agreed prior to booking; also it MAY be allowed at drivers discretion but only if driver has agreed for passengers to do so.

Extra drop offs / re route / extra hours: Any extra drop offs which are not included on the initial booking will be charged at a minimum of 10% of booking value per drop at the drivers discretion, any amount charged will have to be paid in cash to the driver. If for any reason the customer requires extra stay by the driver, if the driver can accommodate their requirements, they have to pay 15% of booking rate per hour minimum charge and an hourly rate of 115% of booking value thereafter.

Vehicle Breakdown Policy: If for whatever reason we have a mechanical breakdown of a vehicle, we will be authorised to send a different vehicle as agreed or multiple smaller vehicles to fulfil the journey. This allows us to deliver transportation to our customers through partnerships with external suppliers.$tc$;

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
