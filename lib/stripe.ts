import "server-only";
import Stripe from "stripe";

/**
 * Server-only Stripe client. Only import from Server Actions/Route Handlers
 * — never a Client Component. Throws a clear error rather than silently
 * disabling Stripe if the secret key hasn't been configured yet (same
 * pattern as lib/supabase/admin.ts).
 */
export function getStripeClient() {
  const { secretKey, secretKeyName } = stripeKeys();
  if (!secretKey) {
    throw new Error(`${secretKeyName} is not configured — online payment is unavailable until it's set.`);
  }
  return new Stripe(secretKey);
}

/**
 * STRIPE_MODE picks which pair of keys is used: "sandbox" (development /
 * testing — SANDBOX_STRIPE_SECRET_KEY + SANDBOX_STRIPE_WEBHOOK_SECRET) or
 * "live" (the default — STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET). Both
 * pairs can sit in the environment at once; switching is one variable.
 */
export function stripeKeys() {
  const sandbox = process.env.STRIPE_MODE?.trim().toLowerCase() === "sandbox";
  return sandbox
    ? {
        mode: "sandbox" as const,
        secretKey: process.env.SANDBOX_STRIPE_SECRET_KEY,
        secretKeyName: "SANDBOX_STRIPE_SECRET_KEY",
        webhookSecret: process.env.SANDBOX_STRIPE_WEBHOOK_SECRET,
      }
    : {
        mode: "live" as const,
        secretKey: process.env.STRIPE_SECRET_KEY,
        secretKeyName: "STRIPE_SECRET_KEY",
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      };
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
