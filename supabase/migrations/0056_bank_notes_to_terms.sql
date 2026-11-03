-- =============================================================================
-- Global Transport CRM — moves the SEPA/SWIFT timing notes off the two EUR
-- bank profiles (seeded in 0055_bank_details_and_terms.sql) and into Terms &
-- Conditions instead. The bank-details cards should show only the payment
-- details themselves; timing/address guidance belongs in the T&Cs as a note,
-- not repeated per-profile.
-- =============================================================================

update bank_accounts
set payment_notes = null
where profile_label in ('European Bank Details (SEPA / Domestic EU)', 'International Payments (outside EU/SEPA)')
  and payment_notes is not null;

update tenants
set terms_and_conditions = terms_and_conditions || $note$

Bank Transfer Payments: EUR payments made via a domestic SEPA transfer usually take 1-2 working days to arrive; international SWIFT payments usually take 4-5 working days to arrive. If you're asked for a bank address, you can use Wise's address, and you can use Wise as the bank name.$note$
where terms_and_conditions is not null;
