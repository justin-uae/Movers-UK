import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, CustomerPaymentMethod, QuoteStatus } from "./supabase/database.types";
import { sendTemplatedEmail } from "./emailTemplates";
import { sendWhatsAppTemplate, normalizeWhatsAppNumber, WHATSAPP_TEMPLATE_HEADER_IMAGE_URL } from "./whatsapp360";
import { generateInvoicePdf } from "./invoicePdf";
import { persistGeneratedPdf } from "./documentArchive";

export { amountDueNow } from "./quoteMoney";

function round2(amount: number) {
  return Math.round(amount * 100) / 100;
}

interface VersionForDue {
  selling_price: number;
  deposit_percentage: number | null;
}

interface RecordCustomerPaymentInput {
  quoteId: string;
  amount: number;
  currency: string;
  method: CustomerPaymentMethod;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  proofStoragePath?: string | null;
  proofFileName?: string | null;
  recordedBy?: string | null;
}

/**
 * Single write path for recording a customer payment against a quote —
 * used by both the Stripe webhook (service-role client) and the manual
 * bank-transfer "record payment" Server Action (request-scoped client,
 * gated on finance.record_payments — see quotes_update/customer_payments_insert
 * RLS in 0013/0016). Sums every payment recorded so far against the
 * selling price and flips the quote to 'paid' — generating the invoice
 * number and creating the dispatch job, exactly like the pre-Stripe
 * markQuotePaidAction did — once the full amount has been received, or
 * 'partially_paid' otherwise.
 */
export async function recordCustomerPayment(
  supabase: SupabaseClient<Database>,
  input: RecordCustomerPaymentInput,
): Promise<{ error: string | null; status: QuoteStatus | null; pendingVerification?: boolean }> {
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, tenant_id, brand_id, customer_id, enquiry_id, status, quote_number, public_token, currency, invoice_number, brands(invoice_number_prefix), quote_versions!quotes_current_version_id_fkey(selling_price, deposit_percentage)",
    )
    .eq("id", input.quoteId)
    .single();

  if (!quote) return { error: "Quote not found.", status: null };
  if (quote.status !== "accepted" && quote.status !== "partially_paid") {
    return { error: "This quote is not awaiting payment.", status: null };
  }

  const version = quote.quote_versions as unknown as VersionForDue | null;
  if (!version) return { error: "This quote has no priced version.", status: null };

  // PAY-04: a bank transfer sits unverified until Finance confirms it — it
  // doesn't count toward the balance or flip the quote's status yet. Other
  // methods (Stripe, already provider-confirmed) are inserted pre-verified.
  const verificationStatus = input.method === "bank_transfer" ? "pending" : "verified";

  const { error: insertError } = await supabase.from("customer_payments").insert({
    tenant_id: quote.tenant_id,
    quote_id: quote.id,
    amount: input.amount,
    currency: input.currency,
    method: input.method,
    stripe_session_id: input.stripeSessionId ?? null,
    stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
    proof_storage_path: input.proofStoragePath ?? null,
    proof_file_name: input.proofFileName ?? null,
    recorded_by: input.recordedBy ?? null,
    verification_status: verificationStatus,
  });
  if (insertError) {
    // PAY-05: 23505 = unique_violation on customer_payments_stripe_intent_unique
    // — a routine Stripe webhook retry for a payment intent already recorded.
    // Treat as an idempotent no-op rather than an error, so Stripe doesn't
    // keep retrying and nothing gets double-counted.
    if (insertError.code === "23505" && input.stripePaymentIntentId) {
      return { error: null, status: quote.status };
    }
    return { error: insertError.message, status: null };
  }

  if (verificationStatus === "pending") {
    return { error: null, status: quote.status, pendingVerification: true };
  }

  return finalizeQuoteFromVerifiedPayments(supabase, {
    id: quote.id,
    tenant_id: quote.tenant_id,
    brand_id: quote.brand_id,
    customer_id: quote.customer_id,
    enquiry_id: quote.enquiry_id,
    quote_number: quote.quote_number,
    public_token: quote.public_token,
    currency: quote.currency,
    invoiceNumber: quote.invoice_number,
    brands: quote.brands as unknown as { invoice_number_prefix: string } | null,
    version,
    recordedBy: input.recordedBy ?? null,
    paymentAmount: input.amount,
  });
}

interface QuoteForFinalize {
  id: string;
  tenant_id: string;
  brand_id: string;
  customer_id: string;
  enquiry_id: string;
  quote_number: string;
  public_token: string;
  currency: string;
  /** Already set once a quote has been invoiced before — an amendment can
      send a quote back through this function a second time (paid ->
      partially_paid -> paid again), and it must keep the SAME invoice
      number rather than issuing a new one and orphaning the first. */
  invoiceNumber: string | null;
  brands: { invoice_number_prefix: string } | null;
  version: VersionForDue;
  recordedBy: string | null;
  /** The specific payment amount that just became verified — the receipt
      email reports this figure, not the running total. */
  paymentAmount: number;
}

/**
 * Sums every *verified* payment against a quote and flips it to 'paid'
 * (generating the invoice number and creating the dispatch job) once the
 * full amount has been received, or 'partially_paid' otherwise. Shared by
 * recordCustomerPayment (a freshly-verified insert — Stripe, or a bank
 * transfer that's somehow pre-verified) and verifyBankTransferAction (a
 * previously-pending bank transfer Finance has just confirmed) — both are
 * "a payment just became verified," so both need the same recompute.
 */
export async function finalizeQuoteFromVerifiedPayments(
  supabase: SupabaseClient<Database>,
  quote: QuoteForFinalize,
): Promise<{ error: string | null; status: QuoteStatus | null }> {
  const { data: payments } = await supabase
    .from("customer_payments")
    .select("amount")
    .eq("quote_id", quote.id)
    .eq("verification_status", "verified");
  const totalPaid = round2((payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0));
  const fullyPaid = totalPaid >= quote.version.selling_price - 0.01;
  const balanceRemaining = Math.max(0, round2(quote.version.selling_price - totalPaid));

  // PAY-06: fire-and-forget receipt — never blocks the actual status
  // update/job creation below on a mail failure.
  const sendReceipt = async () => {
    const [{ data: customer }, { data: brand }] = await Promise.all([
      supabase.from("customers").select("contact_name, company_name, email, phone, whatsapp").eq("id", quote.customer_id).maybeSingle(),
      supabase.from("brands").select("name").eq("id", quote.brand_id).maybeSingle(),
    ]);
    await sendTemplatedEmail(supabase, {
      tenantId: quote.tenant_id,
      key: "payment_received",
      to: customer?.email,
      variables: {
        customer_name: customer?.company_name || customer?.contact_name || "Customer",
        quote_number: quote.quote_number,
        brand_name: brand?.name ?? "",
        currency: quote.currency,
        amount: quote.paymentAmount.toFixed(2),
        balance: balanceRemaining.toFixed(2),
        link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/q/${quote.public_token}`,
      },
    });

    const customerWhatsapp = customer?.whatsapp || customer?.phone;
    if (customerWhatsapp) {
      const waResult = await sendWhatsAppTemplate(
        normalizeWhatsAppNumber(customerWhatsapp),
        "payment_received_customer",
        [
          customer?.company_name || customer?.contact_name || "Customer",
          quote.quote_number,
          brand?.name ?? "",
          `${quote.paymentAmount.toFixed(2)} ${quote.currency}`,
          `${balanceRemaining.toFixed(2)} ${quote.currency}`,
        ],
        quote.public_token,
        WHATSAPP_TEMPLATE_HEADER_IMAGE_URL,
      );
      if (!waResult.ok) {
        console.error(`finalizeQuoteFromVerifiedPayments: payment_received_customer WhatsApp send failed for quote ${quote.id}: ${waResult.error}`);
      }
    }
  };

  if (!fullyPaid) {
    const { error: updateError } = await supabase.from("quotes").update({ status: "partially_paid" }).eq("id", quote.id);
    if (updateError) return { error: updateError.message, status: null };
    await supabase.from("quote_events").insert({ quote_id: quote.id, event: "partially_paid" });
    await sendReceipt();
    return { error: null, status: "partially_paid" };
  }

  // jobs.quote_id is unique — a job can already exist here if this quote
  // was somehow finalized once before, so guard against a duplicate insert.
  const { data: existingJob } = await supabase.from("jobs").select("id").eq("quote_id", quote.id).maybeSingle();

  let invoiceNumber = quote.invoiceNumber;
  if (!invoiceNumber) {
    const { data, error: numberError } = await supabase.rpc("next_document_number", {
      p_brand_id: quote.brand_id,
      p_doc_type: "invoice",
      p_prefix: quote.brands?.invoice_number_prefix ?? "INV",
    });
    if (numberError || !data) return { error: numberError?.message ?? "Could not generate an invoice number.", status: null };
    invoiceNumber = data;
  }

  const { error: updateError } = await supabase
    .from("quotes")
    .update({ status: "paid", invoice_number: invoiceNumber, invoiced_at: new Date().toISOString() })
    .eq("id", quote.id);
  if (updateError) return { error: updateError.message, status: null };

  if (!existingJob) {
    const { data: leg } = await supabase
      .from("enquiry_legs")
      .select("pickup_address")
      .eq("enquiry_id", quote.enquiry_id)
      .eq("sequence", 1)
      .single();

    const { error: jobError } = await supabase.from("jobs").insert({
      tenant_id: quote.tenant_id,
      quote_id: quote.id,
      brand_id: quote.brand_id,
      customer_id: quote.customer_id,
      region: leg?.pickup_address ?? null,
      status: "unassigned",
      created_by: quote.recordedBy,
    });
    // 23505 = unique_violation — belt-and-suspenders against a genuine race.
    if (jobError && jobError.code !== "23505") return { error: jobError.message, status: null };
  }

  await supabase.from("quote_events").insert({ quote_id: quote.id, event: "paid" });
  await sendReceipt();

  // Archive the invoice PDF as soon as it exists, so a quote paid via a
  // customer-initiated Stripe confirmation (no staff action at all) still
  // leaves a stored, downloadable invoice in Documents — not only ones a
  // staff member later resends by hand.
  const invoicePdf = await generateInvoicePdf(supabase, quote.id).catch((err) => {
    console.error(`generateInvoicePdf failed for quote ${quote.id}:`, err);
    return null;
  });
  if (invoicePdf) {
    await persistGeneratedPdf(supabase, {
      tenantId: quote.tenant_id,
      uploadedBy: quote.recordedBy,
      docType: "invoice",
      label: `Invoice ${invoiceNumber}`,
      fileName: `${invoiceNumber}.pdf`,
      quoteId: quote.id,
      pdf: invoicePdf,
    });
  }

  return { error: null, status: "paid" };
}
