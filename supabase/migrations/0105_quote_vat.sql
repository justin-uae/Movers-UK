-- VAT on quotes.
--
-- Staff enter the selling price before VAT plus a VAT % (default 0) on the
-- New Quote form; selling_price keeps meaning "the total the customer
-- pays" (now including VAT), so payments, deposits, Stripe, balances and
-- reminders all keep working on the same number unchanged. Only the rate is
-- stored — the net/VAT split is always derived from selling_price and
-- vat_rate (lib/vat.ts), so a booking amendment that changes the total (and
-- carries vat_rate forward) keeps the breakdown correct automatically.
-- Profit and commission figures use the net (ex-VAT) amount, since VAT is
-- owed to the tax authority, not earned.
--
-- Every existing quote gets 0%, i.e. exactly what it was before.

alter table quote_versions
  add column if not exists vat_rate numeric(5,2) not null default 0
    check (vat_rate >= 0 and vat_rate <= 100);
