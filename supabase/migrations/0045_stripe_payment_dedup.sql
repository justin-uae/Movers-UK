-- PAY-05: a routine Stripe webhook retry (Stripe resends on any non-2xx
-- response, and does so regularly regardless) must not create a second
-- payment row for the same checkout. Partial unique index since the column
-- is null for non-Stripe (bank transfer) payments.
create unique index customer_payments_stripe_intent_unique
  on customer_payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
