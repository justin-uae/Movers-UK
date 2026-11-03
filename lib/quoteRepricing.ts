import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { convertToGbp } from "@/lib/fxRates";
import { STRIPE_PRICE_THRESHOLD, paymentMethodsForGbpValue } from "@/lib/quoteMoney";
import { recordAudit } from "@/lib/audit";
import { renderAndSendTemplate } from "@/lib/emailTemplates";
import { generateQuotePdf } from "@/lib/quotePdf";
import { persistGeneratedPdf } from "@/lib/documentArchive";
export { SPECIAL_DEAL_STATUSES } from "@/lib/quoteSpecialDeal";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Shared by Edit Price, Today's Special Deal (app/(staff)/quotes/priceActions.ts)
 * and the automatic "Too expensive" discount (offerAutoDiscountAfterRejection
 * below): every price change on a not-yet-accepted quote is a new
 * quote_version the quote switches to, with the same card-limit, deposit and
 * payment-schedule handling.
 */

export interface RepriceVersion {
  id: string;
  version_number: number;
  vehicle_type_id: string | null;
  vehicle_description: string | null;
  supplier_estimated_cost: number | null;
  selling_price: number;
  vat_rate: number;
  currency: string;
  deposit_percentage: number | null;
  deposit_fixed_amount: number | null;
  payment_methods: { stripe: boolean; bank_transfer: boolean };
  customer_notes: string | null;
  terms_snapshot: string | null;
  brand_snapshot: unknown;
  original_price: number | null;
  discount_percent: number | null;
  discount_source: DiscountSource | null;
  quote_line_items: { sequence: number; description: string; amount: number; category: string }[];
}

export interface RepriceQuote {
  id: string;
  tenant_id: string;
  quote_number: string;
  status: string;
  currency: string;
  created_by: string | null;
  expiry_at: string | null;
  quote_payment_milestones: { id: string; sequence: number; amount: number }[];
  quote_versions: RepriceVersion | null;
}

export type DiscountSource = "special_deal" | "too_expensive_auto";

/** The columns RepriceQuote needs — select with the client that should decide visibility. */
export const REPRICE_QUOTE_COLUMNS =
  "id, tenant_id, quote_number, status, currency, created_by, expiry_at, quote_payment_milestones(id, sequence, amount), " +
  "quote_versions!quotes_current_version_id_fkey(id, version_number, vehicle_type_id, vehicle_description, supplier_estimated_cost, selling_price, vat_rate, currency, deposit_percentage, deposit_fixed_amount, payment_methods, customer_notes, terms_snapshot, brand_snapshot, original_price, discount_percent, discount_source, quote_line_items(sequence, description, amount, category))";

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

/**
 * The price after `percent` off the current price. The struck-through "was"
 * price stays the one before any deal, so a second deal on top of a first
 * shows the combined saving.
 */
export function discountedPrice(version: Pick<RepriceVersion, "selling_price" | "original_price">, percent: number) {
  const originalPrice = Number(version.original_price ?? version.selling_price);
  const newPrice = round2(Number(version.selling_price) * (1 - percent / 100));
  const totalPercent = round2((1 - newPrice / originalPrice) * 100);
  return { originalPrice, newPrice, totalPercent };
}

async function gbpOrThreshold(amount: number, currency: string) {
  try {
    return await convertToGbp(amount, currency);
  } catch {
    // Same fail-safe as createQuoteAction — an unconfirmable conversion is
    // treated as "at the card limit", so card payment is never offered on it.
    return STRIPE_PRICE_THRESHOLD;
  }
}

/**
 * Saves `newPrice` as a new version of the quote and switches the quote to
 * it. Callers have already checked who may do this and recorded nothing yet
 * — the Timeline/audit entry is theirs to write, using the returned notes.
 */
export async function saveRepricedVersion(
  admin: AdminClient,
  quote: RepriceQuote,
  input: {
    newPrice: number;
    vatRate: number;
    supplierEstimatedCost: number | null;
    createdBy: string | null;
    discount: { originalPrice: number; percent: number; source: DiscountSource } | null;
  },
): Promise<{ error: string } | { error: null; versionId: string; versionNumber: number; notes: string[]; paymentMethods: { stripe: boolean; bank_transfer: boolean } }> {
  const version = quote.quote_versions;
  if (!version) return { error: "This quote has no priced version." };
  const newPrice = input.newPrice;
  const priceChanged = Math.abs(newPrice - version.selling_price) > 0.001;

  // ---- Payment methods: same £ card limit as at creation ------------------
  // Above the limit -> bank transfer only, unless Master Admin has approved
  // card payment for this specific quote (0102). Dropping from above to below
  // the limit gets the normal default for the new amount. Otherwise whatever
  // was chosen at creation (e.g. "force bank transfer") is kept.
  const [oldGbp, newGbp] = await Promise.all([gbpOrThreshold(version.selling_price, quote.currency), gbpOrThreshold(newPrice, quote.currency)]);
  let paymentMethods = version.payment_methods;
  if (newGbp >= STRIPE_PRICE_THRESHOLD) {
    const { data: approvedOverride } = await admin
      .from("card_payment_override_requests")
      .select("id")
      .eq("quote_id", quote.id)
      .eq("status", "approved")
      .limit(1)
      .maybeSingle();
    if (!approvedOverride) paymentMethods = { stripe: false, bank_transfer: true };
  } else if (oldGbp >= STRIPE_PRICE_THRESHOLD) {
    paymentMethods = paymentMethodsForGbpValue(newGbp);
  }

  // ---- Deposit terms -----------------------------------------------------
  // A percentage deposit scales on its own. A fixed deposit that would now be
  // the whole price (or more) no longer makes sense — dropped to "pay in full".
  const notes: string[] = [];
  let depositFixed = version.deposit_fixed_amount;
  if (depositFixed != null && depositFixed >= newPrice) {
    depositFixed = null;
    notes.push("fixed deposit removed (it was no longer less than the price)");
  }

  // ---- Payment schedule: rescale proportionally --------------------------
  // Milestones belong to the quote, not the version, and must keep adding up
  // to the full price — each keeps its share, the last absorbs the rounding.
  const milestones = [...quote.quote_payment_milestones].sort((a, b) => a.sequence - b.sequence);
  const milestoneUpdates: { id: string; amount: number }[] = [];
  if (priceChanged && milestones.length > 0) {
    const oldTotal = milestones.reduce((sum, m) => sum + Number(m.amount), 0);
    let allocated = 0;
    milestones.forEach((m, i) => {
      const amount = i === milestones.length - 1 ? round2(newPrice - allocated) : round2((Number(m.amount) / oldTotal) * newPrice);
      allocated = round2(allocated + amount);
      milestoneUpdates.push({ id: m.id, amount });
    });
    if (milestoneUpdates.some((m) => m.amount <= 0)) return { error: "The payment schedule can't be rescaled to this price — edit it to fewer steps first." };
    notes.push("payment schedule rescaled to the new price");
  }

  // ---- New version -------------------------------------------------------
  const { data: maxVersion } = await admin
    .from("quote_versions")
    .select("version_number")
    .eq("quote_id", quote.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();
  const { data: newVersion, error: versionError } = await admin
    .from("quote_versions")
    .insert({
      quote_id: quote.id,
      version_number: (maxVersion?.version_number ?? version.version_number) + 1,
      vehicle_type_id: version.vehicle_type_id,
      vehicle_description: version.vehicle_description,
      supplier_estimated_cost: input.supplierEstimatedCost,
      selling_price: newPrice,
      vat_rate: input.vatRate,
      currency: version.currency,
      deposit_percentage: version.deposit_percentage as 25 | 50 | 75 | null,
      deposit_fixed_amount: depositFixed,
      payment_methods: paymentMethods,
      customer_notes: version.customer_notes,
      terms_snapshot: version.terms_snapshot,
      brand_snapshot: version.brand_snapshot as Record<string, unknown>,
      created_by: input.createdBy,
      original_price: input.discount?.originalPrice ?? null,
      discount_percent: input.discount?.percent ?? null,
      discount_source: input.discount?.source ?? null,
    })
    .select("id, version_number")
    .single();
  if (versionError || !newVersion) return { error: versionError?.message ?? "Could not save the new price." };

  // Itemised extras are a breakdown, not part of the price — carried as-is.
  if (version.quote_line_items.length > 0) {
    await admin.from("quote_line_items").insert(
      version.quote_line_items.map((li) => ({
        tenant_id: quote.tenant_id,
        quote_version_id: newVersion.id,
        sequence: li.sequence,
        description: li.description,
        amount: li.amount,
        category: li.category,
      })),
    );
  }
  for (const m of milestoneUpdates) {
    await admin.from("quote_payment_milestones").update({ amount: m.amount }).eq("id", m.id);
  }

  const { error: switchError } = await admin.from("quotes").update({ current_version_id: newVersion.id }).eq("id", quote.id);
  if (switchError) return { error: switchError.message };

  return { error: null, versionId: newVersion.id, versionNumber: newVersion.version_number, notes, paymentMethods };
}

/**
 * Status/expiry for a quote a deal re-opens (rejected or expired): back to
 * "sent", undecided, valid for at least the tenant's default validity from
 * now (Settings -> Bank Details & Terms). Draft/sent/viewed quotes are left
 * as they are.
 */
export async function reopenForDeal(admin: AdminClient, quote: RepriceQuote): Promise<{ reopened: boolean }> {
  if (quote.status !== "rejected" && quote.status !== "expired") return { reopened: false };
  const { data: tenant } = await admin.from("tenants").select("quote_validity_days").eq("id", quote.tenant_id).single();
  const fresh = new Date(Date.now() + (tenant?.quote_validity_days ?? 30) * 24 * 60 * 60 * 1000);
  const expiry = quote.expiry_at && new Date(quote.expiry_at) > fresh ? quote.expiry_at : fresh.toISOString();
  await admin
    .from("quotes")
    .update({ status: "sent", decided_at: null, sent_at: new Date().toISOString(), expiry_at: expiry })
    .eq("id", quote.id);
  return { reopened: true };
}

/**
 * The quote_sent email sent without a signed-in user (the automatic discount
 * runs from the customer's own reject click) — from the quote owner's
 * mailbox and signature, like an AI auto-quote's send in lib/aiAutoQuote.ts.
 */
async function sendQuoteEmailAsOwner(admin: AdminClient, quoteId: string, ownerId: string | null) {
  const { data: quote } = await admin
    .from("quotes")
    .select(
      "id, tenant_id, quote_number, public_token, currency, customers(contact_name, company_name, email), brands(name), quote_versions!quotes_current_version_id_fkey(selling_price)",
    )
    .eq("id", quoteId)
    .single();
  if (!quote) return { error: "Quote not found." };
  const customer = quote.customers as unknown as { contact_name: string; company_name: string | null; email: string | null } | null;
  const brand = quote.brands as unknown as { name: string } | null;
  const version = quote.quote_versions as unknown as { selling_price: number } | null;

  const quotePdf = await generateQuotePdf(admin, quoteId).catch((err) => {
    console.error(`generateQuotePdf failed for quote ${quoteId}:`, err);
    return null;
  });
  const result = await renderAndSendTemplate(admin, {
    tenantId: quote.tenant_id,
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
    // No PDF attached on purpose — see resendQuoteEmailAction; archived below.
    senderId: ownerId ?? undefined,
  });
  if (!result.error && quotePdf) {
    await persistGeneratedPdf(admin, {
      tenantId: quote.tenant_id,
      uploadedBy: null,
      docType: "quote",
      label: `Quote ${quote.quote_number}`,
      fileName: `${quote.quote_number}.pdf`,
      quoteId,
      pdf: quotePdf,
    });
  }
  return result;
}

/** How long after a "Too expensive" rejection the automatic discount goes out. */
export const AUTO_DISCOUNT_DELAY_MINUTES = 30;

/**
 * Called right after a customer rejects a quote with "Too expensive". If
 * Master Admin has switched the automatic discount on (Settings -> Special
 * Deals) and it hasn't been offered on this quote before, books it for
 * AUTO_DISCOUNT_DELAY_MINUTES from now (quotes.special_deal_auto_due_at,
 * 0115_special_deal_delay.sql) — not sent instantly, so it doesn't read as
 * an automatic reply. runDueAutoDiscounts sends it when the time comes.
 */
export async function scheduleAutoDiscountAfterRejection(
  admin: AdminClient,
  quoteId: string,
): Promise<{ scheduled: boolean; note: string | null }> {
  const { data: quote } = await admin.from("quotes").select("id, tenant_id").eq("id", quoteId).single();
  if (!quote) return { scheduled: false, note: null };

  const { data: tenant } = await admin
    .from("tenants")
    .select("special_deal_auto_enabled, special_deal_auto_percent")
    .eq("id", quote.tenant_id)
    .single();
  if (!tenant?.special_deal_auto_enabled) return { scheduled: false, note: null };

  const { data: earlier } = await admin
    .from("quote_versions")
    .select("id")
    .eq("quote_id", quoteId)
    .eq("discount_source", "too_expensive_auto")
    .limit(1)
    .maybeSingle();
  if (earlier) return { scheduled: false, note: "The automatic discount was already offered once on this quote, so it won't be sent again." };

  const dueAt = new Date(Date.now() + AUTO_DISCOUNT_DELAY_MINUTES * 60 * 1000);
  await admin.from("quotes").update({ special_deal_auto_due_at: dueAt.toISOString() }).eq("id", quoteId);
  const percent = Number(tenant.special_deal_auto_percent);
  const note = `An automatic ${percent}% discount will be sent to the customer in ${AUTO_DISCOUNT_DELAY_MINUTES} minutes, unless the quote is re-opened, re-quoted or discounted before then.`;
  await admin.from("quote_events").insert({ quote_id: quoteId, event: "special_deal_auto", detail: `Scheduled — ${note}` });
  return { scheduled: true, note };
}

/**
 * Cron sweep (app/api/cron/special-deals, also run from email-sync every 5
 * minutes): sends every automatic discount whose 30 minutes are up. Each due
 * quote is claimed by clearing its due time first, so overlapping runs can't
 * send it twice. Skipped — with a Timeline note — if staff already moved the
 * quote on (re-opened it, gave their own deal, or it's no longer rejected).
 */
export async function runDueAutoDiscounts(admin: AdminClient): Promise<{ sent: number; skipped: number }> {
  const { data: due } = await admin
    .from("quotes")
    .select("id, status, quote_number")
    .lte("special_deal_auto_due_at", new Date().toISOString())
    .limit(50);

  let sent = 0;
  let skipped = 0;
  for (const q of due ?? []) {
    const { data: claimed } = await admin
      .from("quotes")
      .update({ special_deal_auto_due_at: null })
      .eq("id", q.id)
      .not("special_deal_auto_due_at", "is", null)
      .select("id");
    if (!claimed?.length) continue;

    if (q.status !== "rejected") {
      skipped++;
      await admin.from("quote_events").insert({
        quote_id: q.id,
        event: "special_deal_auto",
        detail: "Scheduled automatic discount not sent — staff had already moved the quote on.",
      });
      continue;
    }
    const result = await offerAutoDiscountAfterRejection(admin, q.id).catch((err) => {
      console.error(`runDueAutoDiscounts: ${q.quote_number}:`, err);
      return { offered: false as const, note: null };
    });
    if (result.offered) sent++;
    else skipped++;
  }
  return { sent, skipped };
}

/**
 * Sends the automatic "Too expensive" discount — runDueAutoDiscounts calls
 * this once its 30-minute delay is up. The same quote — same number, same
 * owner — gets a new version at the set discount, is re-opened and re-sent,
 * and the Timeline shows it. Only once per quote, and never below the
 * supplier cost.
 */
export async function offerAutoDiscountAfterRejection(
  admin: AdminClient,
  quoteId: string,
): Promise<{ offered: true; percent: number; newPrice: number; note: string } | { offered: false; note: string | null }> {
  const { data: quoteRaw } = await admin.from("quotes").select(REPRICE_QUOTE_COLUMNS).eq("id", quoteId).single();
  if (!quoteRaw) return { offered: false, note: null };
  const quote = quoteRaw as unknown as RepriceQuote;

  const { data: tenant } = await admin
    .from("tenants")
    .select("special_deal_auto_enabled, special_deal_auto_percent")
    .eq("id", quote.tenant_id)
    .single();
  if (!tenant?.special_deal_auto_enabled) return { offered: false, note: null };
  const percent = Number(tenant.special_deal_auto_percent);
  const version = quote.quote_versions;
  if (!version || !(percent > 0 && percent < 100)) return { offered: false, note: null };

  const { data: earlier } = await admin
    .from("quote_versions")
    .select("id")
    .eq("quote_id", quote.id)
    .eq("discount_source", "too_expensive_auto")
    .limit(1)
    .maybeSingle();
  if (earlier) return { offered: false, note: "The automatic discount was already offered once on this quote, so it wasn't sent again." };

  const { originalPrice, newPrice, totalPercent } = discountedPrice(version, percent);
  if (version.supplier_estimated_cost != null && newPrice < Number(version.supplier_estimated_cost)) {
    const note = `The automatic ${percent}% discount wasn't sent — ${formatMoney(newPrice, quote.currency)} would be below the supplier cost of ${formatMoney(Number(version.supplier_estimated_cost), quote.currency)}.`;
    await admin.from("quote_events").insert({ quote_id: quote.id, event: "special_deal_auto", detail: note });
    return { offered: false, note };
  }

  const saved = await saveRepricedVersion(admin, quote, {
    newPrice,
    vatRate: Number(version.vat_rate),
    supplierEstimatedCost: version.supplier_estimated_cost,
    createdBy: quote.created_by,
    discount: { originalPrice, percent: totalPercent, source: "too_expensive_auto" },
  });
  if (saved.error !== null) {
    console.error(`offerAutoDiscountAfterRejection: quote ${quote.id}: ${saved.error}`);
    return { offered: false, note: `The automatic discount couldn't be applied: ${saved.error}` };
  }
  await reopenForDeal(admin, quote);

  const sent = await sendQuoteEmailAsOwner(admin, quote.id, quote.created_by);
  const detail =
    `${percent}% off after the customer said "Too expensive": ${formatMoney(Number(version.selling_price), quote.currency)} → ${formatMoney(newPrice, quote.currency)} ` +
    `(version ${saved.versionNumber}) — quote re-opened and ${sent.error ? `the email failed: ${sent.error}` : "re-sent to the customer"}` +
    (saved.notes.length ? ` · ${saved.notes.join("; ")}` : "");
  await admin.from("quote_events").insert({ quote_id: quote.id, event: "special_deal_auto", detail });
  await admin.from("quote_events").insert({ quote_id: quote.id, event: "sent" });
  await recordAudit({
    client: admin,
    tenantId: quote.tenant_id,
    actorId: null,
    action: "quote_special_deal_auto",
    entityType: "quote",
    entityId: quote.id,
    previousValue: { sellingPrice: version.selling_price, versionId: version.id, status: quote.status },
    newValue: { sellingPrice: newPrice, discountPercent: totalPercent, versionId: saved.versionId, status: "sent" },
  });

  return {
    offered: true,
    percent,
    newPrice,
    note: `A ${percent}% discount (${formatMoney(newPrice, quote.currency)}) was sent to the customer automatically and the quote is open again.`,
  };
}
