-- =============================================================================
-- Global Transport CRM — AI-estimated price for a quote, computed on demand
-- (Master Admin only, see estimateQuotePriceAction in
-- app/(staff)/quotes/actions.ts and lib/aiPriceEstimate.ts) from the
-- journey's own details, purely as an internal pricing benchmark against
-- what a human/AI Auto-Quote actually charged. Cached on the quote row so
-- viewing it again doesn't re-call OpenAI — only clicking "Estimate" again
-- does.
-- =============================================================================

alter table quotes
  add column ai_estimated_price numeric(10, 2),
  add column ai_estimated_price_currency text,
  add column ai_estimated_price_computed_at timestamptz;
