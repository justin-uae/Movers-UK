"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { STRIPE_PRICE_THRESHOLD, paymentMethodsForGbpValue } from "@/lib/quoteMoney";
import { grossFromNet } from "@/lib/vat";
import { convertToGbp } from "@/lib/fxRates";
import { renderAndSendTemplate } from "@/lib/emailTemplates";
import { sendWhatsAppTemplate, normalizeWhatsAppNumber, WHATSAPP_TEMPLATE_HEADER_IMAGE_URL } from "@/lib/whatsapp360";
import { generateQuotePdf } from "@/lib/quotePdf";
import { persistGeneratedPdf } from "@/lib/documentArchive";

interface MilestoneInput {
  label: string;
  amount: number;
  dueDate: string | null;
}

interface LineItemInput {
  description: string;
  amount: number;
  category: "waiting_time" | "toll" | "parking" | "other";
}

export async function createQuoteAction(
  _prevState: { error: string | null; link: string | null; warnLowSupplierCost?: boolean },
  formData: FormData,
) {
  const actor = await requireProfile();
  const canCreate = await hasPermission(actor, PERMISSIONS.QUOTES_CREATE);
  if (!canCreate) {
    return { error: "You do not have permission to create quotes.", link: null };
  }

  const supabase = await createClient();

  const enquiryId = String(formData.get("enquiryId") ?? "");
  const { data: enquiry } = await supabase
    .from("enquiries")
    .select(
      "id, brand_id, customer_id, lead_id, customers(contact_name, company_name, email, phone, whatsapp), enquiry_legs(sequence, vehicle_type_id, vehicle_description, vehicle_types(name))",
    )
    .eq("id", enquiryId)
    .single();

  if (!enquiry || !enquiry.brand_id) {
    return { error: "This enquiry has no brand assigned yet — set a default brand first.", link: null };
  }

  const { data: brand } = await supabase.from("brands").select("*").eq("id", enquiry.brand_id).single();
  if (!brand) {
    return { error: "Brand not found.", link: null };
  }

  // The form's price is before VAT; selling_price stores the VAT-inclusive
  // total the customer actually pays (0105_quote_vat.sql), so everything
  // below — Stripe threshold, deposits, emails — works on that total.
  const netPrice = Number(formData.get("sellingPrice") ?? 0);
  const vatRate = Number(formData.get("vatRate") ?? 0) || 0;
  if (vatRate < 0 || vatRate > 100) {
    return { error: "VAT must be between 0 and 100%.", link: null };
  }
  const sellingPrice = grossFromNet(netPrice, vatRate);
  if (!netPrice || netPrice <= 0) {
    return { error: "Enter a selling price greater than zero.", link: null };
  }

  // QTE-02: missing/zero supplier cost is a warning, not a hard block —
  // staff can still save without one (e.g. the supplier isn't picked yet),
  // but has to explicitly acknowledge it first.
  const supplierEstimatedCostRaw = String(formData.get("supplierEstimatedCost") ?? "").trim();
  const supplierEstimatedCost = supplierEstimatedCostRaw ? Number(supplierEstimatedCostRaw) : null;
  if ((!supplierEstimatedCost || supplierEstimatedCost <= 0) && formData.get("confirmedLowSupplierCost") !== "true") {
    return {
      error: null,
      link: null,
      warnLowSupplierCost: true,
    };
  }

  const currency = String(formData.get("currency") ?? brand.default_currency).trim() || brand.default_currency;

  const { data: quoteNumber, error: numberError } = await supabase.rpc("next_document_number", {
    p_brand_id: brand.id,
    p_doc_type: "quote",
    p_prefix: brand.quote_number_prefix,
  });
  if (numberError || !quoteNumber) {
    return { error: numberError?.message ?? "Could not generate a quote number.", link: null };
  }

  // The form pre-fills the tenant default (Settings -> Bank Details & Terms);
  // anything missing or out of range falls back to that same default.
  const { data: tenantRow } = await supabase.from("tenants").select("quote_validity_days").eq("id", actor.tenant_id).single();
  const requestedDays = Math.round(Number(formData.get("expiryDays")));
  const expiryDays = requestedDays >= 1 && requestedDays <= 365 ? requestedDays : (tenantRow?.quote_validity_days ?? 30);

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      tenant_id: actor.tenant_id,
      brand_id: brand.id,
      enquiry_id: enquiry.id,
      customer_id: enquiry.customer_id,
      quote_number: quoteNumber,
      status: "draft",
      currency,
      expiry_at: new Date(Date.now() + expiryDays * 86400000).toISOString(),
      created_by: actor.id,
    })
    .select()
    .single();

  if (quoteError || !quote) {
    return { error: quoteError?.message ?? "Could not create the quote.", link: null };
  }

  // QTE-04: a milestone schedule, when provided, is a third payment-plan
  // mode that supersedes the simple deposit fields entirely (see
  // amountDueNow in lib/quoteMoney.ts) — so a deposit choice is ignored
  // whenever milestones are present.
  let milestones: MilestoneInput[] = [];
  const milestonesRaw = String(formData.get("milestones") ?? "").trim();
  if (milestonesRaw) {
    try {
      const parsed = JSON.parse(milestonesRaw) as unknown[];
      milestones = parsed
        .map((m) => {
          const row = m as { label?: unknown; amount?: unknown; dueDate?: unknown };
          const label = String(row.label ?? "").trim();
          const amount = Number(row.amount ?? 0);
          if (!label || !amount || amount <= 0) return null;
          return { label, amount, dueDate: row.dueDate ? String(row.dueDate) : null };
        })
        .filter((m): m is MilestoneInput => m !== null);
    } catch {
      milestones = [];
    }
  }

  const depositPercentageRaw = Number(formData.get("depositPercentage") ?? "");
  const depositFixedAmountRaw = Number(formData.get("depositFixedAmount") ?? "");
  const hasMilestones = milestones.length > 0;
  const depositPercentage = !hasMilestones && [25, 50, 75].includes(depositPercentageRaw) ? depositPercentageRaw : null;
  const depositFixedAmount = !hasMilestones && !depositPercentage && depositFixedAmountRaw > 0 ? depositFixedAmountRaw : null;

  // FIN-02: itemised extras — a display breakdown only, never fed into the
  // selling price or any payment math (see the migration's header comment).
  let lineItems: LineItemInput[] = [];
  const lineItemsRaw = String(formData.get("lineItems") ?? "").trim();
  if (lineItemsRaw) {
    try {
      const parsed = JSON.parse(lineItemsRaw) as unknown[];
      const categories = new Set(["waiting_time", "toll", "parking", "other"]);
      lineItems = parsed
        .map((li) => {
          const row = li as { description?: unknown; amount?: unknown; category?: unknown };
          const description = String(row.description ?? "").trim();
          const amount = Number(row.amount ?? 0);
          const category = categories.has(String(row.category)) ? (row.category as LineItemInput["category"]) : "other";
          if (!description || !amount) return null;
          return { description, amount, category };
        })
        .filter((li): li is LineItemInput => li !== null);
    } catch {
      lineItems = [];
    }
  }

  const forceBankTransfer = formData.get("forceBankTransfer") === "true";

  // Stripe is only offered once the selling price converts to under £2000
  // GBP, regardless of the quote's own currency — convert in the background
  // here rather than showing Stripe based on the raw (possibly non-GBP)
  // number. If the conversion can't be confirmed (rate source unreachable or
  // an unrecognised currency code), fall back to the threshold itself so
  // paymentMethodsForGbpValue resolves to bank-transfer-only rather than
  // risk offering Stripe on an unverified amount.
  let sellingPriceGbp: number;
  try {
    sellingPriceGbp = await convertToGbp(sellingPrice, currency);
  } catch (err) {
    console.error(`convertToGbp failed for ${sellingPrice} ${currency}:`, err);
    sellingPriceGbp = STRIPE_PRICE_THRESHOLD;
  }

  // Vehicle is chosen once, at lead/enquiry intake — the quote just inherits
  // whatever the enquiry's first leg already has, rather than asking staff
  // to pick it again.
  const legs = (enquiry.enquiry_legs as unknown as { sequence: number; vehicle_type_id: string | null; vehicle_description: string | null; vehicle_types: { name: string } | null }[]) ?? [];
  const firstLeg = [...legs].sort((a, b) => a.sequence - b.sequence)[0];

  const { data: version, error: versionError } = await supabase
    .from("quote_versions")
    .insert({
      quote_id: quote.id,
      version_number: 1,
      vehicle_type_id: firstLeg?.vehicle_type_id ?? null,
      vehicle_description: firstLeg?.vehicle_types?.name ?? firstLeg?.vehicle_description ?? null,
      supplier_estimated_cost: supplierEstimatedCost,
      selling_price: sellingPrice,
      vat_rate: vatRate,
      currency,
      deposit_percentage: depositPercentage,
      deposit_fixed_amount: depositFixedAmount,
      // Below the GBP-converted threshold defaults to Stripe-only, at or
      // above it defaults to bank-transfer-only — but staff can force bank
      // transfer regardless of amount (e.g. a regular corporate account that
      // always pays by transfer even on a small booking). There's no
      // override in the other direction at creation time: Stripe is never
      // offered above the threshold here, since that's a real card-
      // processing/fraud-risk limit, not just a default — the only way past
      // it is a Master-Admin-approved request on the quote afterwards (see
      // requestCardPaymentOverrideAction, app/(staff)/quotes/actions.ts).
      payment_methods:
        forceBankTransfer && sellingPriceGbp < STRIPE_PRICE_THRESHOLD
          ? { stripe: false, bank_transfer: true }
          : paymentMethodsForGbpValue(sellingPriceGbp),
      customer_notes: String(formData.get("customerNotes") ?? "").trim() || null,
      // Always null on creation — the customer-facing quote/invoice pages
      // and PDFs fall back to the tenant's own Terms & Conditions
      // (Settings -> Bank Details & Terms) whenever this is unset, so quote
      // creation no longer asks staff to type terms in by hand.
      terms_snapshot: null,
      brand_snapshot: {
        name: brand.name,
        logo_url: brand.logo_url,
        primary_color: brand.primary_color,
      },
      created_by: actor.id,
    })
    .select()
    .single();

  if (versionError || !version) {
    return { error: versionError?.message ?? "Could not price the quote.", link: null };
  }

  await supabase.from("quotes").update({ current_version_id: version.id }).eq("id", quote.id);

  if (milestones.length > 0) {
    await supabase.from("quote_payment_milestones").insert(
      milestones.map((m, i) => ({
        tenant_id: actor.tenant_id,
        quote_id: quote.id,
        sequence: i + 1,
        label: m.label,
        amount: m.amount,
        due_date: m.dueDate,
      })),
    );
  }

  if (lineItems.length > 0) {
    await supabase.from("quote_line_items").insert(
      lineItems.map((li, i) => ({
        tenant_id: actor.tenant_id,
        quote_version_id: version.id,
        sequence: i + 1,
        description: li.description,
        amount: li.amount,
        category: li.category,
      })),
    );
  }

  // A quote now genuinely exists for this enquiry — this is the point the
  // originating lead (if any) should read as "converted", not merely when
  // the enquiry was started.
  if (enquiry.lead_id) {
    await supabase.from("leads").update({ status: "converted" }).eq("id", enquiry.lead_id);
  }

  const canSend = await hasPermission(actor, PERMISSIONS.QUOTES_SEND);
  let publicLink: string | null = null;
  let emailWarning: string | null = null;

  if (canSend && formData.get("sendNow") === "on") {
    await supabase
      .from("quotes")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", quote.id);
    await supabase.from("quote_events").insert({ quote_id: quote.id, event: "sent" });
    publicLink = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/q/${quote.public_token}`;

    const customer = enquiry.customers as unknown as {
      contact_name: string;
      company_name: string | null;
      email: string | null;
      phone: string | null;
      whatsapp: string | null;
    } | null;
    // A PDF-generation failure (e.g. an unreachable brand logo URL) should
    // never block the quote from sending — fall back to no attachment, but
    // log it so a silent failure in production is still visible somewhere.
    const quotePdf = await generateQuotePdf(supabase, quote.id).catch((err) => {
      console.error(`generateQuotePdf failed for quote ${quote.id}:`, err);
      return null;
    });
    const emailResult = await renderAndSendTemplate(supabase, {
      tenantId: actor.tenant_id,
      key: "quote_sent",
      to: customer?.email,
      variables: {
        customer_name: customer?.company_name || customer?.contact_name || "Customer",
        quote_number: quote.quote_number,
        brand_name: brand.name,
        currency,
        selling_price: sellingPrice.toFixed(2),
        link: publicLink,
      },
      // No PDF attached on purpose — it shows the price, and the email deliberately
      // doesn't, so the customer opens the quote page to see it (0108_hide_price_in_quote_emails.sql).
      // The PDF is still generated and archived on the quote below.
      senderId: actor.id,
    });
    if (emailResult.error) {
      console.error(`createQuoteAction: quote_sent email failed for quote ${quote.id}: ${emailResult.error}`);
      emailWarning = `The quote was created, but the email could not be sent: ${emailResult.error}`;
    }

    // Best-effort, same as the email above — a customer with no phone/whatsapp
    // on file (or a send failure) never blocks the quote from going out.
    const whatsappNumber = customer?.whatsapp || customer?.phone;
    if (whatsappNumber) {
      const waResult = await sendWhatsAppTemplate(
        normalizeWhatsAppNumber(whatsappNumber),
        "quote_sent_customer",
        [customer?.company_name || customer?.contact_name || "Customer", brand.name, quote.quote_number, `${sellingPrice.toFixed(2)} ${currency}`],
        quote.public_token,
        WHATSAPP_TEMPLATE_HEADER_IMAGE_URL,
      );
      if (!waResult.ok) {
        console.error(`createQuoteAction: quote_sent WhatsApp template failed for quote ${quote.id}: ${waResult.error}`);
      }
    }

    if (quotePdf) {
      await persistGeneratedPdf(supabase, {
        tenantId: actor.tenant_id,
        uploadedBy: actor.id,
        docType: "quote",
        label: `Quote ${quote.quote_number}`,
        fileName: `${quote.quote_number}.pdf`,
        quoteId: quote.id,
        pdf: quotePdf,
      });
    }
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: publicLink ? "quote_sent" : "quote_created",
    entityType: "quote",
    entityId: quote.id,
    newValue: { quoteNumber: quote.quote_number, sellingPrice, vatRate, currency },
  });

  revalidatePath("/quotes");
  if (enquiry.lead_id) revalidatePath("/leads");
  return { error: null, link: publicLink, emailWarning };
}
