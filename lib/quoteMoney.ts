// Pure pricing math shared by server code (lib/quotePayments.ts, the Stripe
// webhook) and client components (CustomerPaymentsPage) — deliberately has
// no "server-only" import so it can be pulled into both.

function round2(amount: number) {
  return Math.round(amount * 100) / 100;
}

interface VersionForDue {
  selling_price: number;
  deposit_percentage: number | null;
  deposit_fixed_amount?: number | null;
}

interface MilestoneForDue {
  sequence: number;
  amount: number;
}

/**
 * The amount owed for the *current* payment step.
 *
 * With a milestone schedule (QTE-04), that's the running total of every
 * milestone up to and including the first one not yet covered by what's
 * already been paid — so the customer pays one milestone at a time in order.
 * Without one, it's a fixed deposit amount, a deposit percentage of the
 * selling price, or the full selling price — whichever was chosen — minus
 * whatever has already been paid. Milestones, when present, supersede the
 * deposit fields entirely rather than combining with them.
 */
export function amountDueNow(version: VersionForDue, alreadyPaid: number, milestones: MilestoneForDue[] = []): number {
  if (milestones.length > 0) {
    const ordered = [...milestones].sort((a, b) => a.sequence - b.sequence);
    let cumulative = 0;
    for (const m of ordered) {
      cumulative = round2(cumulative + m.amount);
      if (cumulative > alreadyPaid + 0.01) {
        return Math.max(0, round2(cumulative - alreadyPaid));
      }
    }
    // Every scheduled milestone is already covered by payments so far —
    // fall back to whatever's left of the full price rather than reporting
    // nothing due on an under-scheduled quote.
    return Math.max(0, round2(version.selling_price - alreadyPaid));
  }

  const target = version.deposit_fixed_amount
    ? version.deposit_fixed_amount
    : version.deposit_percentage
      ? round2((version.selling_price * version.deposit_percentage) / 100)
      : version.selling_price;
  const dueForDeposit = round2(target - alreadyPaid);
  if (dueForDeposit > 0.01) return dueForDeposit;
  // The deposit/fixed target has already been met — same fallback as the
  // milestone branch above: fall through to whatever of the full price is
  // still outstanding, rather than reporting nothing due just because this
  // one step is covered (a quote can be "partially_paid" — deposit in, full
  // balance still owed — long after this point).
  return Math.max(0, round2(version.selling_price - alreadyPaid));
}

/**
 * GBP. The quote's selling price is converted to its GBP equivalent (see
 * lib/fxRates.ts's convertToGbp — quotes are priced in whatever currency the
 * brand/customer uses) before this is applied: below it, the customer pays
 * online (Stripe) only; at or above it, bank transfer only by default — the
 * two are mutually exclusive at creation time, never both offered on the
 * same quote. The one exception is a Master-Admin-approved card payment
 * request (card_payment_override_requests, 0102_card_payment_override_requests.sql)
 * on an individual quote after the fact, which adds Stripe back in alongside
 * bank transfer rather than replacing it — see decideCardPaymentOverrideAction,
 * app/(staff)/card-payment-requests/actions.ts.
 */
export const STRIPE_PRICE_THRESHOLD = 2000;

export function paymentMethodsForGbpValue(gbpValue: number): { stripe: boolean; bank_transfer: boolean } {
  const stripeEligible = gbpValue < STRIPE_PRICE_THRESHOLD;
  return { stripe: stripeEligible, bank_transfer: !stripeEligible };
}
