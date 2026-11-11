"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { getStripeClient, toStripeAmount } from "@/lib/stripe";
import { amountDueNow } from "@/lib/quotePayments";
import { resolveDisplayCurrency, convertForDisplay } from "@/lib/localCurrency";
import { sendTemplatedEmail } from "@/lib/emailTemplates";
import { sendWhatsAppTemplate, normalizeWhatsAppNumber, WHATSAPP_TEMPLATE_HEADER_IMAGE_URL } from "@/lib/whatsapp360";
import { formatDateAndTime } from "@/lib/formatDate";
import { generateQuotePdf } from "@/lib/quotePdf";
import { scheduleAutoDiscountAfterRejection } from "@/lib/quoteRepricing";

interface PayableLeg {
  sequence: number;
  pickup_address: string;
  destination_address: string;
  pickup_date: string | null;
  pickup_time: string | null;
}

/**
 * One line for the move — "A → B (date/time)" — so the full job
 * shows up wherever Stripe surfaces it (Dashboard payment detail, receipts),
 * instead of just a bare "Quote payment" line item. Stripe caps metadata
 * values at 500 characters, hence the truncation.
 */
function formatMoveSummary(legs: PayableLeg[]): string {
  if (legs.length === 0) return "No move details on file";
  const summary = [...legs]
    .sort((a, b) => a.sequence - b.sequence)
    .map((leg) => {
      const when = leg.pickup_date ? formatDateAndTime(leg.pickup_date, leg.pickup_time) : "date TBC";
      return `${leg.pickup_address} → ${leg.destination_address} (${when})`;
    })
    .join(" | ");
  return summary.length > 500 ? `${summary.slice(0, 497)}...` : summary;
}

async function loadDecidableQuote(admin: ReturnType<typeof createAdminClient>, token: string) {
  const { data: quote } = await admin
    .from("quotes")
    .select(
      "id, tenant_id, status, quote_number, currency, public_token, created_by, current_version_id, brands(name), customers(email), enquiries(assigned_user_id, customers(contact_name, company_name, phone, whatsapp)), quote_versions!quotes_current_version_id_fkey(selling_price)",
    )
    .eq("public_token", token)
    .single();
  return quote;
}

/** The enquiry's assigned salesperson, falling back to the quote's creator if it was never assigned — see app/(staff)/quotes/new/actions.ts's createQuoteAction for the equivalent customer-facing send. */
async function resolveStaffEmail(admin: ReturnType<typeof createAdminClient>, assignedUserId: string | null, createdBy: string | null) {
  const profileId = assignedUserId ?? createdBy;
  if (!profileId) return null;
  const { data } = await admin.from("profiles").select("email").eq("id", profileId).maybeSingle();
  return data?.email ?? null;
}

const PAYABLE = new Set(["accepted", "partially_paid"]);

async function loadPayableQuote(admin: ReturnType<typeof createAdminClient>, token: string) {
  const { data: quote } = await admin
    .from("quotes")
    .select(
      "id, tenant_id, status, currency, quote_number, created_by_profile:profiles!quotes_created_by_fkey(full_name), customers(company_name, contact_name), enquiries(enquiry_legs(sequence, pickup_address, destination_address, pickup_date, pickup_time)), quote_versions!quotes_current_version_id_fkey(selling_price, deposit_percentage, deposit_fixed_amount, payment_methods), customer_payments(amount), quote_payment_milestones(sequence, amount)",
    )
    .eq("public_token", token)
    .single();
  return quote;
}

export async function choosePaymentMethodAction(token: string, method: "stripe" | "bank_transfer" | null) {
  const admin = createAdminClient();
  const quote = await loadDecidableQuote(admin, token);
  if (!quote || !PAYABLE.has(quote.status)) {
    return { error: "This quote is not awaiting payment." };
  }

  await admin.from("quotes").update({ payment_method_chosen: method }).eq("id", quote.id);
  revalidatePath(`/q/${token}`);
  return { error: null };
}

/**
 * Card checkout for whatever is due now. `displayCurrency` is the currency
 * the quote page was showing (the customer's local one — lib/localCurrency.ts);
 * the amount is re-converted here server-side from the quote's own figures,
 * never taken from the browser. The quote-currency amount rides along in the
 * session metadata so the webhook records the payment in the quote's own
 * currency and the balance stays exact. If Stripe won't take that currency,
 * it falls back to charging in the quote's currency.
 */
export async function createStripeCheckoutAction(token: string, displayCurrency?: string) {
  const admin = createAdminClient();
  const quote = await loadPayableQuote(admin, token);
  if (!quote || !PAYABLE.has(quote.status)) {
    return { error: "This quote is not awaiting payment.", url: null };
  }

  const version = quote.quote_versions as unknown as {
    selling_price: number;
    deposit_percentage: number | null;
    deposit_fixed_amount: number | null;
    payment_methods: { stripe: boolean; bank_transfer: boolean };
  } | null;
  if (!version) return { error: "This quote has no priced version.", url: null };
  if (!version.payment_methods?.stripe) return { error: "Online payment is not available for this quote.", url: null };

  const alreadyPaid = ((quote.customer_payments as unknown as { amount: number }[] | null) ?? []).reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );
  const milestones = (quote.quote_payment_milestones as unknown as { sequence: number; amount: number }[] | null) ?? [];
  const due = amountDueNow(version, alreadyPaid, milestones);
  if (due <= 0) return { error: "This quote has already been paid in full.", url: null };

  await admin.from("quotes").update({ payment_method_chosen: "stripe" }).eq("id", quote.id);

  const customer = quote.customers as unknown as { company_name: string | null; contact_name: string } | null;
  const salesRep = (quote.created_by_profile as unknown as { full_name: string } | null)?.full_name ?? "Unassigned";
  const legs = (quote.enquiries as unknown as { enquiry_legs: PayableLeg[] } | null)?.enquiry_legs ?? [];
  const moveSummary = formatMoveSummary(legs);
  const paymentLabel =
    milestones.length > 0
      ? "instalment"
      : version.deposit_fixed_amount
        ? "deposit"
        : version.deposit_percentage
          ? `${version.deposit_percentage}% deposit`
          : "payment";

  // Set on both the Session and the underlying PaymentIntent: Session
  // metadata is what the webhook reads (see app/api/stripe/webhook/route.ts)
  // and what shows on the Checkout Session in the Dashboard; PaymentIntent
  // description/metadata is what actually shows front-and-centre on the
  // Payment itself (Dashboard → Payments, and on receipts) — previously
  // neither was set beyond a bare quoteId, so a payment showed almost no
  // context about which job it was for.
  const display = await resolveDisplayCurrency(quote.currency, displayCurrency ?? quote.currency);
  const stripeMetadata = {
    quoteId: quote.id,
    quote_number: quote.quote_number,
    sales_rep: salesRep,
    customer_name: customer?.company_name || customer?.contact_name || "—",
    move: moveSummary,
  };
  const description = `Quote ${quote.quote_number} — Sales rep: ${salesRep} — ${moveSummary}`.slice(0, 1000);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const stripe = getStripeClient();
  // What this payment is worth in the quote's own currency — read back by the webhook.
  const chargeMetadata = (chargeCurrency: string, chargeAmount: number) => ({
    quote_currency: quote.currency,
    quote_currency_amount: due.toFixed(2),
    charged_currency: chargeCurrency,
    charged_amount: String(chargeAmount),
  });
  const createSession = (chargeCurrency: string, chargeAmount: number) =>
    stripe.checkout.sessions.create({
      mode: "payment",
      // Pinned to card so payment always confirms synchronously at checkout
      // — leaving this to Stripe's automatic payment methods could enable a
      // delayed method (e.g. a bank debit), which completes the *session*
      // immediately but confirms the *payment* later via a separate
      // checkout.session.async_payment_succeeded event our webhook doesn't
      // listen for yet.
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: chargeCurrency,
            unit_amount: toStripeAmount(chargeAmount, chargeCurrency),
            product_data: {
              name: `Quote ${quote.quote_number} — ${paymentLabel}`,
              description: moveSummary,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/q/${token}?payment=success`,
      cancel_url: `${appUrl}/q/${token}?payment=cancelled`,
      metadata: { ...stripeMetadata, ...chargeMetadata(chargeCurrency, chargeAmount) },
      payment_intent_data: { description, metadata: { ...stripeMetadata, ...chargeMetadata(chargeCurrency, chargeAmount) } },
    });

  try {
    if (display.converted) {
      try {
        const session = await createSession(display.currency, convertForDisplay(due, display));
        return { error: null, url: session.url };
      } catch (err) {
        console.error(`createStripeCheckoutAction: ${display.currency} checkout failed for ${quote.quote_number}, falling back to ${quote.currency}:`, err);
      }
    }
    const session = await createSession(quote.currency, due);
    return { error: null, url: session.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the Stripe checkout.", url: null };
  }
}

export async function acceptQuoteAction(token: string, acceptedByName: string) {
  const admin = createAdminClient();
  const quote = await loadDecidableQuote(admin, token);
  if (!quote || (quote.status !== "sent" && quote.status !== "viewed")) {
    return { error: "This quote can no longer be accepted." };
  }
  const name = acceptedByName.trim();
  if (!name) {
    return { error: "Type your name to confirm acceptance." };
  }

  const headerList = await headers();
  await admin.from("quote_decisions").insert({
    quote_id: quote.id,
    decision: "accepted",
    ip_address: headerList.get("x-forwarded-for"),
    version_id: quote.current_version_id,
    accepted_by_name: name,
  });
  await admin
    .from("quotes")
    .update({ status: "accepted", decided_at: new Date().toISOString() })
    .eq("id", quote.id);
  await admin.from("quote_events").insert({ quote_id: quote.id, event: "accepted" });

  await recordAudit({
    client: admin,
    tenantId: quote.tenant_id,
    actorId: null,
    action: "quote_accepted",
    entityType: "quote",
    entityId: quote.id,
  });

  const enquiry = quote.enquiries as unknown as {
    assigned_user_id: string | null;
    customers: { contact_name: string; company_name: string | null; phone: string | null; whatsapp: string | null } | null;
  } | null;
  const brand = quote.brands as unknown as { name: string } | null;
  const version = quote.quote_versions as unknown as { selling_price: number } | null;
  const staffEmail = await resolveStaffEmail(admin, enquiry?.assigned_user_id ?? null, quote.created_by);
  await sendTemplatedEmail(admin, {
    tenantId: quote.tenant_id,
    key: "quote_accepted",
    to: staffEmail,
    variables: {
      customer_name: enquiry?.customers?.company_name || enquiry?.customers?.contact_name || "Customer",
      quote_number: quote.quote_number,
      brand_name: brand?.name ?? "",
      link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/quotes/${quote.id}`,
    },
  });

  // The customer's own confirmation, with the quote PDF attached. The quote
  // email deliberately carries neither the price nor the PDF (0108), so
  // this is the first document they get — with the price, bank details and
  // reference a bank-transfer payer needs. Best-effort like the rest: a
  // PDF or mail failure never blocks the acceptance itself.
  const customerEmail = (quote.customers as unknown as { email: string | null } | null)?.email;
  if (customerEmail) {
    const quotePdf = await generateQuotePdf(admin, quote.id).catch((err) => {
      console.error(`acceptQuoteAction: generateQuotePdf failed for quote ${quote.id}:`, err);
      return null;
    });
    await sendTemplatedEmail(admin, {
      tenantId: quote.tenant_id,
      key: "quote_accepted_customer",
      to: customerEmail,
      variables: {
        customer_name: enquiry?.customers?.company_name || enquiry?.customers?.contact_name || "Customer",
        quote_number: quote.quote_number,
        brand_name: brand?.name ?? "",
        currency: quote.currency,
        selling_price: version ? version.selling_price.toFixed(2) : "",
        link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/q/${quote.public_token}`,
      },
      attachments: quotePdf ? [{ filename: `${quote.quote_number}.pdf`, content: quotePdf, contentType: "application/pdf" }] : undefined,
      senderId: enquiry?.assigned_user_id ?? quote.created_by ?? undefined,
    });
  }

  // Best-effort, same as every other WhatsApp send — never blocks the
  // customer's own acceptance flow on a missing number or send failure.
  const customerWhatsapp = enquiry?.customers?.whatsapp || enquiry?.customers?.phone;
  if (customerWhatsapp) {
    const waResult = await sendWhatsAppTemplate(
      normalizeWhatsAppNumber(customerWhatsapp),
      "booking_confirmed_customer",
      [
        enquiry?.customers?.company_name || enquiry?.customers?.contact_name || "Customer",
        brand?.name ?? "",
        quote.quote_number,
        `${version ? version.selling_price.toFixed(2) : "0.00"} ${quote.currency}`,
      ],
      quote.public_token,
      WHATSAPP_TEMPLATE_HEADER_IMAGE_URL,
    );
    if (!waResult.ok) {
      console.error(`acceptQuoteAction: booking_confirmed_customer WhatsApp send failed for quote ${quote.id}: ${waResult.error}`);
    }
  }

  revalidatePath(`/q/${token}`);
  return { error: null };
}

export async function rejectQuoteAction(token: string, reason: string | null) {
  const admin = createAdminClient();
  const quote = await loadDecidableQuote(admin, token);
  if (!quote || (quote.status !== "sent" && quote.status !== "viewed")) {
    return { error: "This quote can no longer be rejected." };
  }

  const headerList = await headers();
  await admin.from("quote_decisions").insert({
    quote_id: quote.id,
    decision: "rejected",
    reason,
    ip_address: headerList.get("x-forwarded-for"),
  });
  await admin
    .from("quotes")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("id", quote.id);
  await admin.from("quote_events").insert({ quote_id: quote.id, event: "rejected" });

  await recordAudit({
    client: admin,
    tenantId: quote.tenant_id,
    actorId: null,
    action: "quote_rejected",
    entityType: "quote",
    entityId: quote.id,
    reason,
  });

  // "Too expensive" -> the automatic special deal, if Master Admin has it
  // switched on (Settings -> Special Deals): booked for 30 minutes from now
  // rather than sent instantly — same quote re-opened at a discount and
  // re-sent then (lib/quoteRepricing.ts -> runDueAutoDiscounts).
  const autoDeal = reason?.startsWith("Too expensive")
    ? await scheduleAutoDiscountAfterRejection(admin, quote.id).catch((err) => {
        console.error(`rejectQuoteAction: automatic discount failed for ${quote.quote_number}:`, err);
        return null;
      })
    : null;

  const enquiry = quote.enquiries as unknown as {
    assigned_user_id: string | null;
    customers: { contact_name: string; company_name: string | null } | null;
  } | null;
  const brand = quote.brands as unknown as { name: string } | null;
  const staffEmail = await resolveStaffEmail(admin, enquiry?.assigned_user_id ?? null, quote.created_by);
  await sendTemplatedEmail(admin, {
    tenantId: quote.tenant_id,
    key: "quote_rejected",
    to: staffEmail,
    variables: {
      customer_name: enquiry?.customers?.company_name || enquiry?.customers?.contact_name || "Customer",
      quote_number: quote.quote_number,
      brand_name: brand?.name ?? "",
      reason: (reason ?? "No reason given") + (autoDeal?.note ? ` — ${autoDeal.note}` : ""),
      link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/quotes/${quote.id}`,
    },
  });

  revalidatePath(`/q/${token}`);
  return { error: null };
}
