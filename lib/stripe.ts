import "server-only";
import Stripe from "stripe";

/**
 * Server-only Stripe client. Only import from Server Actions/Route Handlers
 * — never a Client Component. Throws a clear error rather than silently
 * disabling Stripe if the secret key hasn't been configured yet (same
 * pattern as lib/supabase/admin.ts).
 */
export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured — online payment is unavailable until it's set.");
  }
  return new Stripe(secretKey);
}

// Stripe expects amounts in the currency's smallest unit (cents) except for
// a handful of zero-decimal currencies it bills in whole units — see
// https://docs.stripe.com/currencies#zero-decimal.
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
  "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

export function toStripeAmount(amount: number, currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())) return Math.round(amount);
  return Math.round(amount * 100);
}

// Inverse of toStripeAmount — converts a Stripe amount (smallest unit, or
// whole units for zero-decimal currencies) back to the app's decimal amount.
export function fromStripeAmount(amount: number, currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())) return amount;
  return amount / 100;
}
