import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { getStripeClient, fromStripeAmount } from "@/lib/stripe";
import { recordCustomerPayment } from "@/lib/quotePayments";

// Stripe posts here with no Supabase session — authenticated by its own
// request signature instead (see proxy.ts's PUBLIC_PATHS). This is the
// source of truth for "the customer actually paid": the success_url
// redirect in app/q/[token]/actions.ts's createStripeCheckoutAction is only
// a best-effort UX nicety, since the customer can close the tab before it
// fires.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const quoteId = session.metadata?.quoteId;
    if (quoteId && session.payment_status === "paid") {
      const admin = createAdminClient();
      const chargedCurrency = (session.currency ?? "eur").toUpperCase();
      const chargedAmount = fromStripeAmount(session.amount_total ?? 0, chargedCurrency);
      // A card payment taken in the customer's local currency (lib/localCurrency.ts)
      // is recorded at what it's worth in the quote's own currency, as fixed
      // when the checkout was created — so the quote's balance stays exact
      // regardless of the conversion. Older sessions without this metadata
      // were always charged in the quote's currency already.
      const quoteCurrencyAmount = Number(session.metadata?.quote_currency_amount);
      const converted = !!session.metadata?.quote_currency && Number.isFinite(quoteCurrencyAmount) && quoteCurrencyAmount > 0;
      const currency = converted ? session.metadata!.quote_currency! : chargedCurrency;
      const amount = converted ? quoteCurrencyAmount : chargedAmount;
      const result = await recordCustomerPayment(admin, {
        quoteId,
        amount,
        currency,
        method: "stripe",
        stripeSessionId: session.id,
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
      });

      if (result.status) {
        const { data: quote } = await admin.from("quotes").select("tenant_id").eq("id", quoteId).single();
        if (quote) {
          await recordAudit({
            client: admin,
            tenantId: quote.tenant_id,
            actorId: null,
            action: "quote_payment_received_stripe",
            entityType: "quote",
            entityId: quoteId,
            newValue: { amount, currency, status: result.status, chargedAmount, chargedCurrency },
          });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
