-- The currency every AI-priced quote is created in (Settings -> AI
-- Assistant, Master Admin only). Previously the AI chose the currency of
-- the country the trip takes place in, which left quotes spread across
-- dozens of currencies; now it always prices in this one. USD by default.
-- The customer still sees their own local currency on the quote page
-- (converted at the current rate), so this only fixes what the quote is
-- recorded in.

alter table tenants
  add column if not exists ai_quote_currency text not null default 'USD'
    check (ai_quote_currency ~ '^[A-Z]{3}$');
