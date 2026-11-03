-- QTE-05: online acceptance evidence must capture which exact quote_version
-- (price/terms) was accepted, and a self-asserted identity — the public
-- accept flow is unauthenticated-token-based, so a typed confirmation name
-- is the only identity signal available (there's no login to attribute it
-- to). Date/time and IP were already captured.
alter table quote_decisions add column version_id uuid references quote_versions(id);
alter table quote_decisions add column accepted_by_name text;

comment on column quote_decisions.version_id is
  'The quote_versions row (price/terms) that was live when this decision was made — an immutable snapshot reference, independent of quotes.current_version_id which can move later.';
comment on column quote_decisions.accepted_by_name is
  'Self-asserted name typed by the customer to confirm acceptance. The public quote link is unauthenticated, so this is the only identity signal available — not verified against any account.';
