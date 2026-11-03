"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { recordCustomerPayment, finalizeQuoteFromVerifiedPayments } from "@/lib/quotePayments";
import { renderAndSendTemplate, sendTemplatedEmail } from "@/lib/emailTemplates";
import { generateQuotePdf } from "@/lib/quotePdf";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { cancelAllocation } from "@/lib/dispatchAllocations";
import { persistGeneratedPdf } from "@/lib/documentArchive";
import { sendWhatsAppTemplate, normalizeWhatsAppNumber, WHATSAPP_TEMPLATE_HEADER_IMAGE_URL } from "@/lib/whatsapp360";
import { estimateQuoteTripPrice } from "@/lib/aiPriceEstimate";
import { convertCurrency, convertToGbp } from "@/lib/fxRates";
import { computeHistoricalRatePerKm } from "@/lib/quotePricingBenchmark";
import { getAiModelSetting } from "@/lib/aiProviders";
import { STRIPE_PRICE_THRESHOLD } from "@/lib/quoteMoney";

/**
 * Reassign who owns a quote — admin/sales manager only (enquiries.reassign,
 * same permission that already gates lead reassignment). Visibility for
 * quotes, jobs and everything else downstream is all inherited from the
 * parent enquiry's assigned_user_id (can_view_assignment, 0002_sales_crm.sql
 * / 0009_payment_legs.sql) rather than quotes.created_by, so updating it here
 * is what actually moves the quote (at any stage — pending, partially paid,
 * or its Dispatch job) onto the new owner's "mine" view, not just a cosmetic
 * label change.
 */
export async function assignQuoteAction(quoteId: string, targetUserId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_REASSIGN);
  if (!allowed) return { error: "You do not have permission to assign quotes." };

  const supabase = await createClient();

  const { data: target } = await supabase.from("profiles").select("id, full_name").eq("id", targetUserId).maybeSingle();
  if (!target) return { error: "That user could not be found." };

  const { data: quote } = await supabase.from("quotes").select("id, enquiry_id, quote_number").eq("id", quoteId).maybeSingle();
  if (!quote) return { error: "Quote not found." };

  const { error } = await supabase.from("enquiries").update({ assigned_user_id: targetUserId }).eq("id", quote.enquiry_id);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "quote_reassigned",
    entityType: "quote",
    entityId: quoteId,
    newValue: { assignedTo: targetUserId, assignedToName: target.full_name },
  });

  // quote_events has no insert RLS policy for the request-scoped client (only
  // quote_events_select exists, 0002_sales_crm.sql/0009_payment_legs.sql) —
  // the admin client is used here for the same reason the Stripe webhook's
  // "paid"/"partially_paid" events already go through it, so this one
  // actually lands on the Timeline instead of silently no-opping.
  await createAdminClient()
    .from("quote_events")
    .insert({ quote_id: quoteId, event: "reassigned", detail: `Assigned to ${target.full_name}` });

  revalidatePath("/quotes");
  revalidatePath("/quotes/partially-paid");
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/dispatch");
  return { error: null };
}

/**
 * Manual bank-transfer payment recording, for a deposit, the remaining
 * balance, or the full amount — whichever is currently due. Delegates the
 * "sum payments so far, flip to paid + generate invoice + create the
 * dispatch job once fully covered" logic to lib/quotePayments.ts, the same
 * path the Stripe webhook uses, so both payment methods behave identically.
 */
export async function recordCustomerPaymentAction(
  quoteId: string,
  input: {
    amount: number;
    currency: string;
    proofStoragePath: string;
    proofFileName: string;
    /** Staff has already seen and dismissed the zero/negative or
        above-balance warning (see CustomerPaymentsPage) — skip re-warning
        and save it. These amounts stay permitted after a warning, never
        hard-blocked (PAY-01/PAY-02). */
    confirmedOverride?: boolean;
  },
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.FINANCE_RECORD_PAYMENTS);
  if (!allowed) {
    return { error: "You do not have permission to record a customer payment.", status: null };
  }
  if (!input.proofStoragePath || !input.proofFileName) {
    return { error: "Attach proof of payment before recording it.", status: null };
  }
  if (Number.isNaN(input.amount)) {
    return { error: "Enter a valid amount.", status: null };
  }
  const supabase = await createClient();

  if (!input.confirmedOverride) {
    if (input.amount <= 0) {
      return { error: "This amount is zero or negative — confirm to save it anyway.", status: null };
    }
    const { data: quote } = await supabase
      .from("quotes")
      .select("quote_versions!quotes_current_version_id_fkey(selling_price), customer_payments(amount)")
      .eq("id", quoteId)
      .single();
    const version = quote?.quote_versions as unknown as { selling_price: number } | null;
    if (version) {
      const alreadyPaid = ((quote?.customer_payments as unknown as { amount: number }[] | null) ?? []).reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );
      const remaining = Math.max(0, Math.round((version.selling_price - alreadyPaid) * 100) / 100);
      if (input.amount > remaining) {
        return { error: "This amount is more than the outstanding balance — confirm to save it anyway.", status: null };
      }
    }
  }

  const result = await recordCustomerPayment(supabase, {
    quoteId,
    amount: input.amount,
    currency: input.currency,
    method: "bank_transfer",
    proofStoragePath: input.proofStoragePath,
    proofFileName: input.proofFileName,
    recordedBy: actor.id,
  });
  if (result.error) return result;

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: result.status === "paid" ? "quote_marked_paid" : "quote_payment_recorded",
    entityType: "quote",
    entityId: quoteId,
    newValue: { amount: input.amount, status: result.status, pendingVerification: result.pendingVerification ?? false },
  });

  revalidatePath("/quotes");
  revalidatePath("/dispatch");
  revalidatePath("/bookings");
  return result;
}

/**
 * Finance confirms a pending bank-transfer payment actually arrived — only
 * then does it count toward the quote's balance (PAY-04). Gated on
 * finance.verify_bank_transfers, separate from finance.record_payments
 * (recording and verifying can be different people/roles).
 */
export async function verifyBankTransferAction(paymentId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.FINANCE_VERIFY_BANK_TRANSFERS);
  if (!allowed) {
    return { error: "You do not have permission to verify bank transfers.", status: null };
  }
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("customer_payments")
    .select(
      "id, quote_id, amount, method, verification_status, quotes(id, tenant_id, brand_id, customer_id, enquiry_id, quote_number, public_token, currency, invoice_number, brands(invoice_number_prefix), quote_versions!quotes_current_version_id_fkey(selling_price, deposit_percentage))",
    )
    .eq("id", paymentId)
    .single();

  if (!payment) return { error: "Payment not found.", status: null };
  if (payment.method !== "bank_transfer" || payment.verification_status !== "pending") {
    return { error: "This payment is not awaiting verification.", status: null };
  }

  const { error: updateError } = await supabase
    .from("customer_payments")
    .update({ verification_status: "verified", verified_by: actor.id, verified_at: new Date().toISOString() })
    .eq("id", paymentId);
  if (updateError) return { error: updateError.message, status: null };

  const quote = payment.quotes as unknown as {
    id: string;
    tenant_id: string;
    brand_id: string;
    customer_id: string;
    enquiry_id: string;
    quote_number: string;
    public_token: string;
    currency: string;
    invoice_number: string | null;
    brands: { invoice_number_prefix: string } | null;
    quote_versions: { selling_price: number; deposit_percentage: number | null } | null;
  } | null;
  if (!quote || !quote.quote_versions) return { error: "This quote has no priced version.", status: null };

  const result = await finalizeQuoteFromVerifiedPayments(supabase, {
    id: quote.id,
    tenant_id: quote.tenant_id,
    brand_id: quote.brand_id,
    customer_id: quote.customer_id,
    enquiry_id: quote.enquiry_id,
    quote_number: quote.quote_number,
    public_token: quote.public_token,
    currency: quote.currency,
    invoiceNumber: quote.invoice_number,
    brands: quote.brands,
    version: quote.quote_versions,
    recordedBy: actor.id,
    paymentAmount: payment.amount,
  });
  if (result.error) return result;

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "bank_transfer_verified",
    entityType: "quote",
    entityId: quote.id,
    newValue: { paymentId, amount: payment.amount, status: result.status },
  });

  revalidatePath("/quotes");
  revalidatePath("/accounting/customer-payments");
  revalidatePath("/dispatch");
  revalidatePath("/bookings");
  return result;
}

/**
 * Re-sends the "quote sent" email on demand — surfaces the actual failure
 * reason (no email on file, unset SMTP config, rejected by the mail
 * server, ...) via its return value, unlike the automatic send in
 * createQuoteAction which deliberately swallows errors so a mail problem
 * never blocks quote creation itself.
 */
export async function resendQuoteEmailAction(quoteId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.QUOTES_SEND);
  if (!allowed) return { error: "You do not have permission to send quotes." };

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, public_token, currency, customers(contact_name, company_name, email), brands(name), quote_versions!quotes_current_version_id_fkey(selling_price)",
    )
    .eq("id", quoteId)
    .single();
  if (!quote) return { error: "Quote not found." };

  const customer = quote.customers as unknown as { contact_name: string; company_name: string | null; email: string | null } | null;
  const brand = quote.brands as unknown as { name: string } | null;
  const version = quote.quote_versions as unknown as { selling_price: number } | null;

  // Same non-fatal-on-failure treatment as the initial send in
  // quotes/new/actions.ts.
  const quotePdf = await generateQuotePdf(supabase, quoteId).catch((err) => {
    console.error(`generateQuotePdf failed for quote ${quoteId}:`, err);
    return null;
  });

  const result = await renderAndSendTemplate(supabase, {
    tenantId: actor.tenant_id,
    key: "quote_sent",
    to: customer?.email,
    variables: {
      customer_name: customer?.company_name || customer?.contact_name || "Customer",
      quote_number: quote.quote_number,
      brand_name: brand?.name ?? "",
      currency: quote.currency,
      selling_price: version ? version.selling_price.toFixed(2) : "",
      link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/q/${quote.public_token}`,
    },
    // No PDF attached on purpose — it shows the price, and the email deliberately
    // doesn't, so the customer opens the quote page to see it (0108_hide_price_in_quote_emails.sql).
    // The PDF is still generated and archived on the quote below.
    senderId: actor.id,
  });

  if (!result.error) {
    if (quotePdf) {
      await persistGeneratedPdf(supabase, {
        tenantId: actor.tenant_id,
        uploadedBy: actor.id,
        docType: "quote",
        label: `Quote ${quote.quote_number}`,
        fileName: `${quote.quote_number}.pdf`,
        quoteId,
        pdf: quotePdf,
      });
    }
    await recordAudit({
      tenantId: actor.tenant_id,
      actorId: actor.id,
      action: "quote_email_resent",
      entityType: "quote",
      entityId: quoteId,
    });
  }

  return result;
}

/**
 * Bulk version of resendQuoteEmailAction for the Pending Quotes table's
 * multi-select resend — reuses that same action per quote (same permission
 * check, same PDF regeneration, same audit log entry) rather than
 * duplicating its logic, since a handful of individual sends is cheap
 * enough not to need a batched/optimized path.
 */
export async function resendQuoteEmailsBulkAction(quoteIds: string[]) {
  const outcomes = await Promise.all(
    quoteIds.map(async (id) => ({ id, result: await resendQuoteEmailAction(id) })),
  );
  const failed = outcomes.filter((o) => o.result?.error).map((o) => ({ id: o.id, error: o.result!.error as string }));
  return { sent: outcomes.length - failed.length, failed };
}

/**
 * Resends the quote_sent_customer WhatsApp template — a separate action
 * (not folded into resendQuoteEmailAction) so staff can retry whichever
 * channel actually failed rather than always resending both. Unlike the
 * best-effort send in createQuoteAction (which never blocks quote
 * creation), an explicit staff-triggered resend reports failure back so
 * they know it didn't go out.
 */
export async function resendQuoteWhatsAppAction(quoteId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.QUOTES_SEND);
  if (!allowed) return { error: "You do not have permission to send quotes." };

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, public_token, currency, customers(contact_name, company_name, phone, whatsapp), brands(name), quote_versions!quotes_current_version_id_fkey(selling_price)",
    )
    .eq("id", quoteId)
    .single();
  if (!quote) return { error: "Quote not found." };

  const customer = quote.customers as unknown as {
    contact_name: string;
    company_name: string | null;
    phone: string | null;
    whatsapp: string | null;
  } | null;
  const brand = quote.brands as unknown as { name: string } | null;
  const version = quote.quote_versions as unknown as { selling_price: number } | null;

  const whatsappNumber = customer?.whatsapp || customer?.phone;
  if (!whatsappNumber) return { error: "This customer has no phone or WhatsApp number on file." };

  const result = await sendWhatsAppTemplate(
    normalizeWhatsAppNumber(whatsappNumber),
    "quote_sent_customer",
    [customer?.company_name || customer?.contact_name || "Customer", brand?.name ?? "", quote.quote_number, `${version ? version.selling_price.toFixed(2) : "0.00"} ${quote.currency}`],
    quote.public_token,
    WHATSAPP_TEMPLATE_HEADER_IMAGE_URL,
  );

  if (!result.ok) return { error: result.error ?? "WhatsApp send failed." };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "quote_whatsapp_resent",
    entityType: "quote",
    entityId: quoteId,
  });

  return { error: null };
}

/**
 * Emails the invoice PDF to the customer on demand (DOC-01/02) — separate
 * from resendQuoteEmailAction, which resends the pre-payment quote. Reuses
 * the existing "payment_received" template (the receipt content already
 * fits a "here's your invoice" resend) rather than adding a new template
 * key for what's otherwise the same email. Persists a copy of the generated
 * PDF into the Documents module each time, the same way any other document
 * upload is recorded — so every resend leaves a dated, downloadable trail
 * (DOC-04's "regenerate, audited" without needing a real edit flow, since
 * nothing about a paid quote's invoice is ever edited).
 */
export async function resendInvoiceEmailAction(quoteId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.QUOTES_RESEND);
  if (!allowed) return { error: "You do not have permission to resend invoices." };

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, public_token, invoice_number, currency, customer_id, customers(contact_name, company_name, email), brands(name), quote_versions!quotes_current_version_id_fkey(selling_price), customer_payments(amount)",
    )
    .eq("id", quoteId)
    .single();
  if (!quote) return { error: "Quote not found." };
  if (quote.status !== "paid" || !quote.invoice_number) return { error: "This quote has not been invoiced yet." };

  const customer = quote.customers as unknown as { contact_name: string; company_name: string | null; email: string | null } | null;
  const brand = quote.brands as unknown as { name: string } | null;
  const totalPaid = ((quote.customer_payments as unknown as { amount: number }[] | null) ?? []).reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );

  const invoicePdf = await generateInvoicePdf(supabase, quoteId).catch((err) => {
    console.error(`generateInvoicePdf failed for quote ${quoteId}:`, err);
    return null;
  });

  const result = await renderAndSendTemplate(supabase, {
    tenantId: actor.tenant_id,
    key: "payment_received",
    to: customer?.email,
    variables: {
      customer_name: customer?.company_name || customer?.contact_name || "Customer",
      quote_number: quote.quote_number,
      brand_name: brand?.name ?? "",
      currency: quote.currency,
      amount: totalPaid.toFixed(2),
      balance: "0.00",
      link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/q/${quote.public_token}`,
    },
    attachments: invoicePdf
      ? [{ filename: `${quote.invoice_number}.pdf`, content: invoicePdf, contentType: "application/pdf" }]
      : undefined,
    senderId: actor.id,
  });

  if (!result.error) {
    if (invoicePdf) {
      await persistGeneratedPdf(supabase, {
        tenantId: actor.tenant_id,
        uploadedBy: actor.id,
        docType: "invoice",
        label: `Invoice ${quote.invoice_number}`,
        fileName: `${quote.invoice_number}.pdf`,
        quoteId: quote.id,
        pdf: invoicePdf,
      });
    }
    await recordAudit({
      tenantId: actor.tenant_id,
      actorId: actor.id,
      action: "invoice_email_resent",
      entityType: "quote",
      entityId: quoteId,
      newValue: { invoiceNumber: quote.invoice_number },
    });
  }

  return result;
}

const CANCELLABLE_STATUSES = ["accepted", "partially_paid", "paid"];

/**
 * OPS-01: cancel a booking that's already been accepted/paid — a distinct
 * staff-initiated action from a customer rejecting a quote (quote_decisions).
 * Reuses the 'cancelled' value already sitting unused on both the
 * quote_status and job_status enums. Any money already collected doesn't get
 * touched in customer_payments (append-only ledger) — it becomes a pending
 * `refunds` row for Finance to action separately via processRefundAction.
 *
 * Restricted to the enquiry's assigned owner or a Master Admin (mirrors
 * amendBookingAction's canAmend gate) — quotes.cancel alone used to let any
 * role holding that permission cancel any tenant's booking, not just their
 * own.
 */
export async function cancelBookingAction(quoteId: string, reason: string) {
  const actor = await requireProfile();
  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: "A reason is required to cancel a booking." };

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, tenant_id, status, currency, enquiries(assigned_user_id), customer_payments(amount, verification_status)")
    .eq("id", quoteId)
    .single();
  if (!quote) return { error: "Quote not found." };

  const isOwner = (quote.enquiries as unknown as { assigned_user_id: string | null } | null)?.assigned_user_id === actor.id;
  const allowed = actor.is_master_admin || ((await hasPermission(actor, PERMISSIONS.QUOTES_CANCEL)) && isOwner);
  if (!allowed) return { error: "Only a Master Admin or this booking's owner can cancel it." };

  if (!CANCELLABLE_STATUSES.includes(quote.status)) {
    return { error: "Only an accepted, partially paid, or paid booking can be cancelled." };
  }

  const { error: updateError } = await supabase
    .from("quotes")
    .update({
      status: "cancelled",
      decided_at: new Date().toISOString(),
      cancellation_reason: trimmedReason,
      cancelled_by: actor.id,
    })
    .eq("id", quoteId);
  if (updateError) return { error: updateError.message };

  await supabase.from("quote_events").insert({ quote_id: quoteId, event: "cancelled" });

  const { data: job } = await supabase.from("jobs").select("id").eq("quote_id", quoteId).maybeSingle();
  if (job) {
    // Set the booking's rollup status to 'cancelled' first — recalc_job_status()
    // guards against overwriting a 'cancelled' job, so this must land before
    // the allocation cancellations below, or their own status-change triggers
    // would otherwise bounce jobs.status back to 'unassigned'.
    await supabase.from("jobs").update({ status: "cancelled" }).eq("id", job.id);

    const { data: liveAllocations } = await supabase
      .from("job_allocations")
      .select("id")
      .eq("job_id", job.id)
      .not("status", "in", "(completed,cancelled)");
    for (const allocation of liveAllocations ?? []) {
      await cancelAllocation(supabase, allocation.id);
    }
  }

  const verifiedPaid = ((quote.customer_payments as unknown as { amount: number; verification_status: string }[] | null) ?? [])
    .filter((p) => p.verification_status === "verified")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  if (verifiedPaid > 0) {
    await supabase.from("refunds").insert({
      tenant_id: quote.tenant_id,
      quote_id: quoteId,
      amount: verifiedPaid,
      currency: quote.currency,
      reason: trimmedReason,
      requested_by: actor.id,
    });
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "booking_cancelled",
    entityType: "quote",
    entityId: quoteId,
    previousValue: { status: quote.status },
    newValue: { status: "cancelled" },
    reason: trimmedReason,
  });

  revalidatePath("/quotes");
  revalidatePath("/bookings");
  revalidatePath("/dispatch");
  revalidatePath(`/quotes/${quoteId}`);
  return { error: null };
}

// Editable at any stage of its life — draft through paid — right up until
// the job is completed (every allocation marked done by its supplier) or
// the booking itself has reached a dead end. Not gated on payment status:
// the user was explicit that a lead/booking should stay editable regardless
// of whether it's been paid, only closing off once there's nothing left to
// edit towards.
const UNEDITABLE_QUOTE_STATUSES = ["rejected", "expired", "cancelled"];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

interface AmendBookingLegChange {
  pickupAddress?: string;
  destinationAddress?: string;
  pickupDate?: string | null;
  pickupTime?: string | null;
  passengerCount?: number | null;
  luggageCount?: number | null;
  specialRequirements?: string | null;
}

export interface AmendBookingInput {
  reason: string;
  /** Which leg to edit, when there's more than one — defaults to sequence 1. */
  legId?: string;
  legChanges?: AmendBookingLegChange;
  /** Signed — positive charges the customer more, negative credits them (and auto-refunds any resulting overpayment). */
  priceAdjustment?: number | null;
  /** Signed — positive means the supplier is owed more, negative means less/a refund is owed back from them. */
  supplierAdjustment?: { amount: number; note: string } | null;
}

/**
 * Post-payment booking amendment — lets a Master Admin or the enquiry's
 * assigned owner edit an already-accepted/paid booking's journey details,
 * and optionally charge/credit the customer and/or adjust the supplier's
 * payout, all under one required reason. See
 * supabase/migrations/0067_booking_amendments.sql for the full design
 * rationale (why a new quote_versions row for a price change, why
 * job_allocation_adjustments is a ledger rather than an agreed_cost edit).
 */
export async function amendBookingAction(quoteId: string, input: AmendBookingInput) {
  const actor = await requireProfile();
  const reason = input.reason.trim();
  if (!reason) return { error: "A reason is required to edit a booking." };

  const hasLegChange = !!input.legChanges && Object.keys(input.legChanges).length > 0;
  const hasPriceAdjustment = !!input.priceAdjustment;
  const hasSupplierAdjustment = !!input.supplierAdjustment && input.supplierAdjustment.amount !== 0;
  if (!hasLegChange && !hasPriceAdjustment && !hasSupplierAdjustment) {
    return { error: "Change at least one journey detail, or enter a customer or supplier amount." };
  }

  const supabase = await createClient();

  const { data: quoteRaw } = await supabase
    .from("quotes")
    .select(
      "id, tenant_id, brand_id, customer_id, enquiry_id, status, quote_number, public_token, currency, invoice_number, " +
        "brands(name, invoice_number_prefix), customers(contact_name, company_name, email), " +
        "enquiries(assigned_user_id), " +
        "quote_versions!quotes_current_version_id_fkey(id, version_number, vehicle_type_id, vehicle_description, supplier_estimated_cost, selling_price, vat_rate, currency, payment_methods, customer_notes, terms_snapshot, brand_snapshot, deposit_percentage, deposit_fixed_amount, quote_line_items(sequence, description, amount, category)), " +
        "customer_payments(amount, verification_status)",
    )
    .eq("id", quoteId)
    .single();
  if (!quoteRaw) return { error: "Quote not found." };

  const quote = quoteRaw as unknown as {
    id: string;
    tenant_id: string;
    brand_id: string;
    customer_id: string;
    enquiry_id: string;
    status: string;
    quote_number: string;
    public_token: string;
    currency: string;
    invoice_number: string | null;
    brands: { name: string; invoice_number_prefix: string } | null;
    customers: { contact_name: string; company_name: string | null; email: string | null } | null;
    enquiries: { assigned_user_id: string | null } | null;
    quote_versions: {
      id: string;
      version_number: number;
      vehicle_type_id: string | null;
      vehicle_description: string | null;
      supplier_estimated_cost: number | null;
      selling_price: number;
      vat_rate: number;
      currency: string;
      payment_methods: unknown;
      customer_notes: string | null;
      terms_snapshot: string | null;
      brand_snapshot: unknown;
      deposit_percentage: number | null;
      deposit_fixed_amount: number | null;
      quote_line_items: { sequence: number; description: string; amount: number; category: string }[];
    } | null;
    customer_payments: { amount: number; verification_status: string }[];
  };

  if (quote.tenant_id !== actor.tenant_id) return { error: "Quote not found." };
  if (UNEDITABLE_QUOTE_STATUSES.includes(quote.status)) {
    return { error: "A rejected, expired, or cancelled booking can no longer be edited." };
  }

  const isOwner = quote.enquiries?.assigned_user_id === actor.id;
  const allowedToAmend = actor.is_master_admin || ((await hasPermission(actor, PERMISSIONS.BOOKINGS_AMEND)) && isOwner);
  if (!allowedToAmend) {
    return { error: "Only a Master Admin or this booking's owner can edit it." };
  }

  const version = quote.quote_versions;
  if (hasPriceAdjustment && !version) return { error: "This quote has no priced version." };

  const { data: job } = await supabase.from("jobs").select("id, status").eq("quote_id", quoteId).maybeSingle();
  // recalc_job_status rolls jobs.status up to 'completed' only once every
  // allocation on the booking has been marked done by its supplier — that's
  // the one hard stop on editing, everything earlier in the lifecycle stays open.
  if (job?.status === "completed") {
    return { error: "This job has been completed and can no longer be edited." };
  }

  // ---- Resolve which leg is being edited, if any -------------------------
  let targetLeg: {
    id: string;
    pickup_address: string;
    destination_address: string;
    pickup_date: string | null;
    pickup_time: string | null;
    passenger_count: number | null;
    luggage_count: number | null;
    special_requirements: string | null;
  } | null = null;
  if (hasLegChange) {
    const legQuery = supabase
      .from("enquiry_legs")
      .select("id, pickup_address, destination_address, pickup_date, pickup_time, passenger_count, luggage_count, special_requirements")
      .eq("enquiry_id", quote.enquiry_id);
    const { data: leg } = input.legId ? await legQuery.eq("id", input.legId).maybeSingle() : await legQuery.eq("sequence", 1).maybeSingle();
    if (!leg) return { error: "Journey leg not found." };
    targetLeg = leg;
  }

  let allocationId: string | null = null;
  let supplierId: string | null = null;
  let allocationStatus: string | null = null;
  if (job && (hasLegChange || hasSupplierAdjustment)) {
    // A multi-leg booking can be split across suppliers — one allocation per
    // supplier, each covering a distinct subset of legs — so when a specific
    // leg is being edited, the allocation that needs re-approval (and whose
    // supplier gets notified) is the one actually covering THAT leg, not
    // simply whichever allocation happens to have been created most
    // recently. Falls back to "most recent live allocation on the job" when
    // there's no leg in play (a supplier-payout-only edit) or that leg isn't
    // covered by any live allocation yet.
    let allocation: { id: string; assigned_supplier_id: string | null; status: string } | null = null;
    if (targetLeg) {
      const { data: links } = await supabase.from("job_allocation_legs").select("job_allocation_id").eq("enquiry_leg_id", targetLeg.id);
      const coveringIds = (links ?? []).map((l) => l.job_allocation_id);
      if (coveringIds.length > 0) {
        const { data } = await supabase
          .from("job_allocations")
          .select("id, assigned_supplier_id, status")
          .eq("job_id", job.id)
          .in("id", coveringIds)
          .not("status", "in", "(cancelled)")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        allocation = data;
      }
    }
    if (!allocation) {
      const { data } = await supabase
        .from("job_allocations")
        .select("id, assigned_supplier_id, status")
        .eq("job_id", job.id)
        .not("status", "in", "(cancelled)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      allocation = data;
    }
    allocationId = allocation?.id ?? null;
    supplierId = allocation?.assigned_supplier_id ?? null;
    allocationStatus = allocation?.status ?? null;
  }
  if (hasSupplierAdjustment && !allocationId) {
    return { error: "There's no active supplier allocation on this job to adjust." };
  }

  // A supplier who already committed to this job (accepted or confirmed)
  // gets pulled back to a pending state and has to explicitly re-approve
  // the edited job — rather than a change silently landing on a trip
  // they've already signed off on. An allocation still just 'offered' (no
  // commitment yet) or already rejected/unassigned doesn't need this.
  const requiresSupplierReapproval =
    (hasLegChange || hasSupplierAdjustment) &&
    !!allocationId &&
    (allocationStatus === "accepted_by_supplier" || allocationStatus === "confirmed");

  // ---- Journey changes ---------------------------------------------------
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (hasLegChange) {
    const leg = targetLeg!;
    const legUpdate: Record<string, unknown> = {};
    const lc = input.legChanges!;
    if (lc.pickupAddress !== undefined && lc.pickupAddress !== leg.pickup_address) {
      changes.pickup_address = { from: leg.pickup_address, to: lc.pickupAddress };
      legUpdate.pickup_address = lc.pickupAddress;
    }
    if (lc.destinationAddress !== undefined && lc.destinationAddress !== leg.destination_address) {
      changes.destination_address = { from: leg.destination_address, to: lc.destinationAddress };
      legUpdate.destination_address = lc.destinationAddress;
    }
    if (lc.pickupDate !== undefined && lc.pickupDate !== leg.pickup_date) {
      changes.pickup_date = { from: leg.pickup_date, to: lc.pickupDate };
      legUpdate.pickup_date = lc.pickupDate;
    }
    if (lc.pickupTime !== undefined && lc.pickupTime !== leg.pickup_time) {
      changes.pickup_time = { from: leg.pickup_time, to: lc.pickupTime };
      legUpdate.pickup_time = lc.pickupTime;
    }
    if (lc.passengerCount !== undefined && lc.passengerCount !== leg.passenger_count) {
      changes.passenger_count = { from: leg.passenger_count, to: lc.passengerCount };
      legUpdate.passenger_count = lc.passengerCount;
    }
    if (lc.luggageCount !== undefined && lc.luggageCount !== leg.luggage_count) {
      changes.luggage_count = { from: leg.luggage_count, to: lc.luggageCount };
      legUpdate.luggage_count = lc.luggageCount;
    }
    if (lc.specialRequirements !== undefined && lc.specialRequirements !== leg.special_requirements) {
      changes.special_requirements = { from: leg.special_requirements, to: lc.specialRequirements };
      legUpdate.special_requirements = lc.specialRequirements;
    }

    if (Object.keys(legUpdate).length > 0) {
      const { error: legError } = await supabase.from("enquiry_legs").update(legUpdate).eq("id", leg.id);
      if (legError) return { error: legError.message };
    }
  }

  // ---- Price adjustment (new quote_versions row) -------------------------
  let newVersionId: string | null = null;
  let newSellingPrice: number | null = null;
  let refundId: string | null = null;
  let newStatus = quote.status;

  if (hasPriceAdjustment && version) {
    const adjustment = round2(input.priceAdjustment!);
    newSellingPrice = round2(version.selling_price + adjustment);
    if (newSellingPrice < 0) return { error: "This adjustment would make the price negative." };

    const { data: maxVersion } = await supabase
      .from("quote_versions")
      .select("version_number")
      .eq("quote_id", quoteId)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();
    const nextVersionNumber = (maxVersion?.version_number ?? version.version_number) + 1;

    const { data: newVersion, error: versionError } = await supabase
      .from("quote_versions")
      .insert({
        quote_id: quoteId,
        version_number: nextVersionNumber,
        vehicle_type_id: version.vehicle_type_id,
        vehicle_description: version.vehicle_description,
        supplier_estimated_cost: version.supplier_estimated_cost,
        selling_price: newSellingPrice,
        // Same VAT rate as before — the adjustment is VAT-inclusive (it's
        // added straight onto the total), and the split is re-derived from
        // the new total (lib/vat.ts).
        vat_rate: version.vat_rate,
        currency: version.currency,
        payment_methods: version.payment_methods,
        customer_notes: version.customer_notes,
        terms_snapshot: version.terms_snapshot,
        brand_snapshot: version.brand_snapshot,
        // Deposit terms deliberately not carried forward — after an
        // amendment the new balance is simply "pay the new total", so a
        // stale deposit_percentage from the original version can't end up
        // hiding it (see the migration's comment).
        deposit_percentage: null,
        deposit_fixed_amount: null,
        created_by: actor.id,
      })
      .select("id")
      .single();
    if (versionError || !newVersion) return { error: versionError?.message ?? "Could not create the new version." };
    newVersionId = newVersion.id;

    // Carries the old itemisation forward plus one new line for the
    // amendment itself, so the invoice still reads as a full breakdown
    // instead of losing its history.
    const carriedItems = (version.quote_line_items ?? []).map((li) => ({
      tenant_id: actor.tenant_id,
      quote_version_id: newVersionId,
      sequence: li.sequence,
      description: li.description,
      amount: li.amount,
      category: li.category,
    }));
    const nextSequence = carriedItems.length > 0 ? Math.max(...carriedItems.map((i) => i.sequence)) + 1 : 1;
    await supabase.from("quote_line_items").insert([
      ...carriedItems,
      {
        tenant_id: actor.tenant_id,
        quote_version_id: newVersionId,
        sequence: nextSequence,
        description: `Booking update: ${reason}`.slice(0, 200),
        amount: adjustment,
        category: "other",
      },
    ]);

    const { error: quoteVersionUpdateError } = await supabase.from("quotes").update({ current_version_id: newVersionId }).eq("id", quoteId);
    if (quoteVersionUpdateError) return { error: quoteVersionUpdateError.message };

    changes.selling_price = { from: version.selling_price, to: newSellingPrice };

    const totalPaidVerified = round2(
      quote.customer_payments.filter((p) => p.verification_status === "verified").reduce((sum, p) => sum + Number(p.amount), 0),
    );
    const newBalance = round2(newSellingPrice - totalPaidVerified);

    if (newBalance > 0.01 && quote.status === "paid") {
      newStatus = "partially_paid";
      await supabase.from("quotes").update({ status: "partially_paid" }).eq("id", quoteId);
      await supabase.from("quote_events").insert({ quote_id: quoteId, event: "partially_paid" });
    } else if (newBalance <= 0.01 && totalPaidVerified > 0 && adjustment < 0) {
      // Mirror of the branch above — a reduction that clears the balance on
      // a quote an earlier increase knocked back to partially_paid puts it
      // back to paid. Its invoice number and job survived that round trip,
      // so only the status needs restoring (no finalize/receipt re-run).
      if (quote.status === "partially_paid") {
        newStatus = "paid";
        await supabase.from("quotes").update({ status: "paid" }).eq("id", quoteId);
        await supabase.from("quote_events").insert({ quote_id: quoteId, event: "paid" });
      }
      // The reduction leaves the customer having paid more than the new
      // total — record it as a pending refund via the same table/flow
      // cancelBookingAction already uses, rather than inventing a second one.
      const overpaid = round2(totalPaidVerified - newSellingPrice);
      if (overpaid > 0.01) {
        const { data: refund } = await supabase
          .from("refunds")
          .insert({
            tenant_id: actor.tenant_id,
            quote_id: quoteId,
            amount: overpaid,
            currency: quote.currency,
            reason: `Booking update: ${reason}`,
            requested_by: actor.id,
          })
          .select("id")
          .single();
        refundId = refund?.id ?? null;
      }
    }
  }

  // ---- Supplier adjustment -------------------------------------------------
  if (hasSupplierAdjustment && allocationId) {
    const { error: adjError } = await supabase.from("job_allocation_adjustments").insert({
      tenant_id: actor.tenant_id,
      job_allocation_id: allocationId,
      amount: round2(input.supplierAdjustment!.amount),
      reason: input.supplierAdjustment!.note?.trim() || reason,
      created_by: actor.id,
    });
    if (adjError) return { error: adjError.message };
  }

  // ---- Pull the job back to "pending" if the supplier already committed ----
  // Their original accept/confirm was for the trip as it stood then — an
  // edited leg or payout needs their eyes again before anything proceeds,
  // rather than quietly keeping their old sign-off. Approve/reject lives on
  // their own dashboard (see approveAmendedAllocationAction /
  // rejectAmendedAllocationAction in app/supplier/dashboard/actions.ts); a
  // rejection frees the job straight back to dispatch (recalc_job_status
  // rolls it to 'rejected_by_supplier', and the existing "re-offer a
  // rejected allocation" flow on Dispatch takes it from there).
  if (requiresSupplierReapproval) {
    const { error: pendingError } = await supabase
      .from("job_allocations")
      .update({ status: "pending_reapproval" })
      .eq("id", allocationId!);
    if (pendingError) return { error: pendingError.message };
  }

  // ---- Amendment record ----------------------------------------------------
  const { data: amendment } = await supabase
    .from("booking_amendments")
    .insert({
      tenant_id: actor.tenant_id,
      quote_id: quoteId,
      job_id: job?.id ?? null,
      job_allocation_id: allocationId,
      created_by: actor.id,
      reason,
      changes,
      previous_quote_version_id: version?.id ?? null,
      new_quote_version_id: newVersionId,
      customer_charge_amount: hasPriceAdjustment ? input.priceAdjustment : null,
      customer_charge_currency: hasPriceAdjustment ? quote.currency : null,
      refund_id: refundId,
      supplier_adjustment_amount: hasSupplierAdjustment ? input.supplierAdjustment!.amount : null,
      supplier_adjustment_note: hasSupplierAdjustment ? input.supplierAdjustment!.note : null,
      supplier_approval_status: requiresSupplierReapproval ? "pending" : "not_required",
    })
    .select("id")
    .single();

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "booking_amended",
    entityType: "quote",
    entityId: quoteId,
    previousValue: { status: quote.status },
    newValue: { status: newStatus, changes },
    reason,
  });

  // ---- Notifications ---------------------------------------------------
  const changesSummary = Object.entries(changes)
    .filter(([key]) => key !== "selling_price")
    .map(([key, { from, to }]) => `${key.replaceAll("_", " ")}: ${from ?? "—"} → ${to ?? "—"}`)
    .join("<br />");

  const customer = quote.customers;
  const brand = quote.brands;
  // Surfaced to the caller as a non-blocking warning — the edit itself has
  // already been saved by this point, so a mail failure shouldn't look like
  // the whole action failed, but it also shouldn't be invisible (previously
  // it was: swallowed with no logging and no way for staff to know a
  // customer/supplier never actually heard about the change).
  let notifyWarning: string | null = null;
  let notifiedCustomerAt: string | null = null;
  // A draft has never been sent to the customer — they don't know this
  // quote exists yet, so an "updated" email would be news to them for the
  // wrong reason. Notify only once they've actually seen/acted on it.
  if ((hasLegChange || hasPriceAdjustment) && customer?.email && quote.status !== "draft") {
    const totalPaidVerifiedNow = round2(
      quote.customer_payments.filter((p) => p.verification_status === "verified").reduce((sum, p) => sum + Number(p.amount), 0),
    );
    const newBalanceForEmail = Math.max(0, round2((newSellingPrice ?? version?.selling_price ?? 0) - totalPaidVerifiedNow));

    const invoicePdf = await generateInvoicePdf(supabase, quoteId).catch(() => null);
    if (invoicePdf && quote.invoice_number) {
      await persistGeneratedPdf(supabase, {
        tenantId: actor.tenant_id,
        uploadedBy: actor.id,
        docType: "invoice",
        label: `Invoice ${quote.invoice_number} (updated)`,
        fileName: `${quote.invoice_number}.pdf`,
        quoteId,
        pdf: invoicePdf,
      });
    }

    const result = await renderAndSendTemplate(supabase, {
      tenantId: actor.tenant_id,
      key: "booking_amended",
      to: customer.email,
      variables: {
        customer_name: customer.company_name || customer.contact_name || "Customer",
        quote_number: quote.quote_number,
        brand_name: brand?.name ?? "",
        reason,
        changes_summary: changesSummary,
        currency: quote.currency,
        adjustment_amount: hasPriceAdjustment ? Number(input.priceAdjustment).toFixed(2) : "0.00",
        new_balance: newBalanceForEmail.toFixed(2),
        link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/q/${quote.public_token}`,
      },
      attachments:
        invoicePdf && quote.invoice_number
          ? [{ filename: `${quote.invoice_number}.pdf`, content: invoicePdf, contentType: "application/pdf" }]
          : undefined,
      senderId: actor.id,
    });
    if (!result.error) {
      notifiedCustomerAt = new Date().toISOString();
    } else {
      console.error(`amendBookingAction: failed to email customer for quote ${quoteId}: ${result.error}`);
      notifyWarning = `The change was saved, but the customer couldn't be emailed: ${result.error}`;
    }
  }

  let notifiedSupplierAt: string | null = null;
  if ((hasLegChange || hasSupplierAdjustment) && supplierId) {
    const { data: supplier } = await supabase.from("suppliers").select("name, email").eq("id", supplierId).maybeSingle();
    if (supplier?.email) {
      const payoutNote = hasSupplierAdjustment
        ? `Your payout has been adjusted by ${quote.currency} ${Number(input.supplierAdjustment!.amount).toFixed(2)}.`
        : "";
      // Once they've committed to a job, an edit needs an explicit re-approve
      // — not just an FYI — so it gets its own template and sends them
      // straight to the allocation's own approve/reject buttons rather than
      // the generic dashboard.
      const result = await renderAndSendTemplate(supabase, {
        tenantId: actor.tenant_id,
        key: requiresSupplierReapproval ? "job_reapproval_required" : "job_amended",
        to: supplier.email,
        variables: {
          supplier_name: supplier.name,
          quote_number: quote.quote_number,
          brand_name: brand?.name ?? "",
          reason,
          changes_summary: changesSummary,
          payout_note: payoutNote,
          link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/supplier/dashboard${allocationId ? `/${allocationId}` : ""}`,
        },
      });
      if (!result.error) {
        notifiedSupplierAt = new Date().toISOString();
      } else {
        console.error(`amendBookingAction: failed to email supplier for quote ${quoteId}: ${result.error}`);
        notifyWarning = notifyWarning
          ? `${notifyWarning} The supplier couldn't be emailed either: ${result.error}`
          : `The change was saved, but the supplier couldn't be emailed: ${result.error}`;
      }
    }
  }

  if (amendment?.id && (notifiedCustomerAt || notifiedSupplierAt)) {
    await supabase
      .from("booking_amendments")
      .update({ customer_notified_at: notifiedCustomerAt, supplier_notified_at: notifiedSupplierAt })
      .eq("id", amendment.id);
  }

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/bookings");
  revalidatePath("/dispatch");
  if (job?.id) revalidatePath(`/dispatch/${job.id}`);
  revalidatePath("/accounting/customer-payments");
  revalidatePath("/accounting/supplier-payments");

  return { error: null, warning: notifyWarning };
}

/** Finance confirms a cancellation's pending refund has actually been paid out. */
export async function processRefundAction(refundId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.FINANCE_PROCESS_REFUNDS);
  if (!allowed) return { error: "You do not have permission to process refunds." };

  const supabase = await createClient();
  const { data: refund } = await supabase.from("refunds").select("id, quote_id, status").eq("id", refundId).single();
  if (!refund) return { error: "Refund not found." };
  if (refund.status !== "pending") return { error: "This refund has already been processed." };

  const { error } = await supabase
    .from("refunds")
    .update({ status: "processed", processed_by: actor.id, processed_at: new Date().toISOString() })
    .eq("id", refundId);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "refund_processed",
    entityType: "refund",
    entityId: refundId,
    previousValue: { status: "pending" },
    newValue: { status: "processed" },
  });

  revalidatePath(`/quotes/${refund.quote_id}`);
  revalidatePath("/accounting/customer-payments");
  return { error: null };
}

/**
 * On-demand OpenAI price benchmark for an existing quote — Master Admin
 * only, full stop (not permission-key-gated like everything else in this
 * file, since this is Master-Admin tooling for auditing pricing decisions,
 * not a role-assignable capability). Computes from the journey's own
 * details (pickup/destination/date/passengers/vehicle) and caches the
 * result on the quote row so viewing it again doesn't re-call OpenAI —
 * only clicking "Estimate" again does.
 */
export async function estimateQuotePriceAction(quoteId: string) {
  const actor = await requireProfile();
  if (!actor.is_master_admin) return { error: "Only a Master Admin can request an AI price estimate." };

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, currency, brands(name), enquiries(enquiry_legs(sequence, pickup_address, destination_address, via_points, pickup_date, pickup_time, journey_type, return_date, return_time, passenger_count, luggage_count, special_requirements, wheelchair_required, child_seats)), quote_versions!quotes_current_version_id_fkey(vehicle_description)",
    )
    .eq("id", quoteId)
    .single();
  if (!quote) return { error: "Quote not found." };

  const brand = quote.brands as unknown as { name: string } | null;
  const legs = (
    quote.enquiries as unknown as {
      enquiry_legs: {
        sequence: number;
        pickup_address: string;
        destination_address: string;
        via_points: string[] | null;
        pickup_date: string | null;
        pickup_time: string | null;
        journey_type: string | null;
        return_date: string | null;
        return_time: string | null;
        passenger_count: number | null;
        luggage_count: number | null;
        special_requirements: string | null;
        wheelchair_required: boolean | null;
        child_seats: number | null;
      }[];
    } | null
  )?.enquiry_legs;
  const sortedLegs = (legs ?? []).slice().sort((a, b) => a.sequence - b.sequence);
  const version = quote.quote_versions as unknown as { vehicle_description: string | null } | null;

  // Every leg's own passenger count, at its highest — sizes the vehicle for
  // the trip's peak load, not just whatever leg 1 happened to carry.
  const maxPassengerCount = sortedLegs.reduce<number | null>(
    (max, l) => (l.passenger_count != null ? Math.max(max ?? 0, l.passenger_count) : max),
    null,
  );

  const historicalRatePerKm = await computeHistoricalRatePerKm(supabase, {
    tenantId: actor.tenant_id,
    currency: quote.currency,
    passengerCount: maxPassengerCount,
    excludeQuoteId: quoteId,
  });

  const aiModel = await getAiModelSetting(supabase, actor.tenant_id, "pricing_engine");

  let result;
  try {
    result = await estimateQuoteTripPrice({
      aiModel,
      brandName: brand?.name ?? "the company",
      travelDate: sortedLegs[0]?.pickup_date ?? null,
      vehicleDescription: version?.vehicle_description ?? null,
      legs: sortedLegs.map((l) => ({
        sequence: l.sequence,
        pickup: l.pickup_address,
        destination: l.destination_address,
        pickupTime: l.pickup_time,
        returnDate: l.return_date,
        returnTime: l.return_time,
        isReturn: l.journey_type === "return",
        passengerCount: l.passenger_count,
        luggageCount: l.luggage_count,
        specialRequirements: l.special_requirements,
        wheelchairRequired: l.wheelchair_required ?? false,
        childSeats: l.child_seats ?? 0,
        viaPoints: l.via_points ?? [],
      })),
      historicalRatePerKm,
    });
  } catch (err) {
    console.error(`estimateQuotePriceAction: failed for quote ${quoteId}:`, err);
    return { error: "Could not get an AI price estimate right now — try again shortly." };
  }

  // The AI prices a trip in whatever currency it judges the route actually
  // trades in (worked out from the pickup/destination, e.g. GHS for a route
  // in Ghana) — that can differ from the quote's own currency (e.g. a UK
  // brand quoting in USD), making the two numbers shown side by side on
  // screen not directly comparable, and the "quoted below AI estimate" flag
  // actively misleading. Convert to the quote's own currency for display;
  // if the conversion itself fails (an unsupported/unrecognised code), fall
  // back to showing the AI's own currency unconverted rather than losing
  // the estimate entirely.
  let displayPrice = result.estimatedPrice;
  let displaySupplierCost = result.supplierEstimatedCost;
  let displayCurrency = result.currency;
  let originalPrice: number | null = null;
  let originalCurrency: string | null = null;
  if (result.currency.toUpperCase() !== quote.currency.toUpperCase()) {
    try {
      displayPrice = Math.round((await convertCurrency(result.estimatedPrice, result.currency, quote.currency)) * 100) / 100;
      displaySupplierCost = Math.round((await convertCurrency(result.supplierEstimatedCost, result.currency, quote.currency)) * 100) / 100;
      displayCurrency = quote.currency;
      originalPrice = result.estimatedPrice;
      originalCurrency = result.currency;
    } catch (err) {
      console.error(`estimateQuotePriceAction: currency conversion failed for quote ${quoteId}:`, err);
    }
  }

  const computedAt = new Date().toISOString();
  await supabase
    .from("quotes")
    .update({
      ai_estimated_price: displayPrice,
      ai_estimated_price_currency: displayCurrency,
      ai_estimated_price_computed_at: computedAt,
    })
    .eq("id", quoteId);

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);

  return {
    error: null,
    estimatedPrice: displayPrice,
    currency: displayCurrency,
    supplierEstimatedCost: displaySupplierCost,
    // Set only when a conversion actually happened — the popup uses this to
    // show "AI priced this at {originalPrice} {originalCurrency}, converted
    // at today's rate" instead of silently hiding that a conversion occurred.
    originalPrice,
    originalCurrency,
    vehicleDescription: result.vehicleDescription,
    rationale: result.rationale,
    distanceKm: result.distanceKm,
    pricePerKm: result.pricePerKm,
    legCount: result.legCount,
    historicalRatePerKm: result.historicalRatePerKm,
    historicalSampleSize: result.historicalSampleSize,
    computedAt,
  };
}

/**
 * Card payment is never offered on a quote at/above STRIPE_PRICE_THRESHOLD
 * (lib/quoteMoney.ts) — a real card-processing/fraud-risk limit, not just a
 * default. This is the one deliberate override path: staff asks, Master
 * Admin decides (decideCardPaymentOverrideAction,
 * app/(staff)/card-payment-requests/actions.ts) — never
 * self-approved, and never silent (recorded on both this quote's own
 * Timeline, quote_events, and — since that's the lead's actual complaint
 * channel — the originating lead's Assignment history, same dual-audit
 * pattern lib/aiAutoQuote.ts already uses for its own quote-vs-lead split).
 */
export async function requestCardPaymentOverrideAction(quoteId: string, reason: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.QUOTES_CREATE);
  if (!allowed) return { error: "You do not have permission to do this." };

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, enquiries(lead_id), quote_versions!quote_versions_quote_id_fkey(id, version_number, selling_price, currency, payment_methods)",
    )
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return { error: "Quote not found." };

  type VersionRow = { id: string; version_number: number; selling_price: number; currency: string; payment_methods: { stripe: boolean; bank_transfer: boolean } };
  const versions = (quote.quote_versions as unknown as VersionRow[]) ?? [];
  const currentVersion = [...versions].sort((a, b) => b.version_number - a.version_number)[0];
  if (!currentVersion) return { error: "This quote has no pricing yet." };
  if (currentVersion.payment_methods?.stripe) return { error: "Card payment is already available for this quote." };

  const { data: existingPending } = await supabase
    .from("card_payment_override_requests")
    .select("id")
    .eq("quote_id", quoteId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingPending) return { error: "A request is already pending Master Admin approval for this quote." };

  let amountGbp: number;
  try {
    amountGbp = await convertToGbp(currentVersion.selling_price, currentVersion.currency);
  } catch {
    amountGbp = STRIPE_PRICE_THRESHOLD;
  }

  const trimmedReason = reason.trim();
  const { error: insertError } = await supabase
    .from("card_payment_override_requests")
    .insert({ tenant_id: actor.tenant_id, quote_id: quoteId, requested_by: actor.id, reason: trimmedReason || null, amount_gbp: amountGbp });
  if (insertError) return { error: insertError.message };

  const requesterName = actor.full_name ?? "A staff member";
  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "card_payment_override_requested",
    entityType: "quote",
    entityId: quoteId,
    newValue: { amountGbp, reason: trimmedReason || null },
  });

  const leadId = (quote.enquiries as unknown as { lead_id: string | null } | null)?.lead_id;
  if (leadId) {
    await recordAudit({
      tenantId: actor.tenant_id,
      actorId: actor.id,
      action: "card_payment_override_requested",
      entityType: "lead",
      entityId: leadId,
      newValue: { quoteNumber: quote.quote_number, amountGbp, reason: trimmedReason || null },
    });
  }

  // quote_events has no insert RLS policy for the request-scoped client (see
  // assignQuoteAction above) — admin client, same reason.
  const admin = createAdminClient();
  await admin.from("quote_events").insert({
    quote_id: quoteId,
    event: "card_payment_requested",
    detail: `${requesterName} requested card payment approval (£${amountGbp.toFixed(2)})${trimmedReason ? ` — ${trimmedReason}` : ""}`,
  });

  const { data: masterAdmins } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("tenant_id", actor.tenant_id)
    .eq("is_master_admin", true)
    .eq("status", "active");
  for (const ma of masterAdmins ?? []) {
    if (!ma.email) continue;
    await sendTemplatedEmail(admin, {
      tenantId: actor.tenant_id,
      key: "card_payment_override_requested",
      to: ma.email,
      variables: {
        admin_name: ma.full_name ?? "there",
        quote_number: quote.quote_number,
        requested_by: requesterName,
        amount: amountGbp.toFixed(2),
        reason: trimmedReason || "No reason given",
        link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/card-payment-requests`,
      },
    });
  }

  revalidatePath(`/quotes/${quoteId}`);
  return { error: null };
}

