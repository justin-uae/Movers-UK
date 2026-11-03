"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { grossFromNet, formatVatRate } from "@/lib/vat";
import {
  REPRICE_QUOTE_COLUMNS,
  SPECIAL_DEAL_STATUSES,
  discountedPrice,
  formatMoney as money,
  reopenForDeal,
  saveRepricedVersion,
  type RepriceQuote,
} from "@/lib/quoteRepricing";
import { resendQuoteEmailAction } from "./actions";

/**
 * Edit Price only applies before the customer has said yes. Once a quote is
 * accepted/paid, money is (or is about to be) involved and a price change is
 * a booking amendment instead — "Edit Booking" (amendBookingAction), which
 * handles balances, refunds and the customer/supplier notices.
 */
const PRICE_EDITABLE_STATUSES = ["draft", "sent", "viewed"];

/** Any sales-side role can edit a quote's price — see editQuotePriceAction. */
async function canEditQuotePrices(actor: Awaited<ReturnType<typeof requireProfile>>) {
  const checks = await Promise.all([
    hasPermission(actor, PERMISSIONS.QUOTES_CREATE),
    hasPermission(actor, PERMISSIONS.QUOTES_EDIT),
    hasPermission(actor, PERMISSIONS.QUOTES_SEND),
  ]);
  return checks.some(Boolean);
}

/** Read through the viewer's own client so RLS decides whether they can see it. */
async function loadQuoteForRepricing(quoteId: string): Promise<RepriceQuote | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("quotes").select(REPRICE_QUOTE_COLUMNS).eq("id", quoteId).single();
  return (data as unknown as RepriceQuote | null) ?? null;
}

export interface EditQuotePriceInput {
  /** Selling price before VAT, same as the New Quote form. */
  netPrice: number;
  vatRate: number;
  supplierEstimatedCost: number | null;
  reason: string;
  /** Re-send the quote email (with the regenerated PDF) once saved. */
  emailCustomer: boolean;
}

/**
 * Sets a new price on a quote that hasn't been accepted yet. Saves it as a
 * new quote_version (the old one stays, visible in the quote's Versions
 * table), switches the quote to it, records "Price changed" on the Timeline
 * with old -> new, who and why, and optionally re-sends the quote email.
 * A manual price clears any Special Deal (the new version has no discount).
 *
 * Allowed for anyone on the sales side — Master Admin, or any role holding
 * quotes.create, quotes.edit or quotes.send (Sales User, Sales Manager…) —
 * on any quote they can see (the read below goes through RLS, so a quote
 * outside their visibility is simply "not found"). Not limited to the
 * quote's own salesperson.
 */
export async function editQuotePriceAction(quoteId: string, input: EditQuotePriceInput) {
  const actor = await requireProfile();
  const reason = input.reason.trim();
  if (!reason) return { error: "A reason is required." };
  if (!Number.isFinite(input.netPrice) || input.netPrice <= 0) return { error: "Enter a selling price greater than zero." };
  if (!Number.isFinite(input.vatRate) || input.vatRate < 0 || input.vatRate > 100) return { error: "VAT must be between 0 and 100%." };
  if (input.supplierEstimatedCost != null && (!Number.isFinite(input.supplierEstimatedCost) || input.supplierEstimatedCost < 0)) {
    return { error: "Supplier cost can't be negative." };
  }

  const quote = await loadQuoteForRepricing(quoteId);
  if (!quote) return { error: "Quote not found." };

  const allowed = actor.is_master_admin || (await canEditQuotePrices(actor));
  if (!allowed) return { error: "You don't have permission to change this quote's price." };
  if (!PRICE_EDITABLE_STATUSES.includes(quote.status)) {
    return { error: "This quote has already been accepted or closed — use Edit Booking to change the price of a booking." };
  }
  const version = quote.quote_versions;
  if (!version) return { error: "This quote has no priced version to edit." };

  const newPrice = grossFromNet(input.netPrice, input.vatRate);
  const newSupplierCost = input.supplierEstimatedCost;
  const priceChanged = Math.abs(newPrice - version.selling_price) > 0.001 || Number(version.vat_rate) !== input.vatRate;
  const costChanged = (newSupplierCost ?? null) !== (version.supplier_estimated_cost ?? null);
  if (!priceChanged && !costChanged) return { error: "Nothing changed — enter a different price, VAT or supplier cost." };

  const admin = createAdminClient();
  const saved = await saveRepricedVersion(admin, quote, {
    newPrice,
    vatRate: input.vatRate,
    supplierEstimatedCost: newSupplierCost,
    createdBy: actor.id,
    discount: null,
  });
  if (saved.error !== null) return { error: saved.error };

  // ---- Timeline + audit --------------------------------------------------
  const vatNote = input.vatRate > 0 ? ` incl. ${formatVatRate(input.vatRate)} VAT` : "";
  const parts = [
    priceChanged ? `${money(version.selling_price, quote.currency)} → ${money(newPrice, quote.currency)}${vatNote}` : null,
    costChanged
      ? `supplier cost ${version.supplier_estimated_cost != null ? money(version.supplier_estimated_cost, quote.currency) : "—"} → ${newSupplierCost != null ? money(newSupplierCost, quote.currency) : "—"}`
      : null,
  ].filter(Boolean);
  await admin.from("quote_events").insert({
    quote_id: quote.id,
    event: "price_changed",
    detail: `${parts.join(", ")} by ${actor.full_name} (version ${saved.versionNumber}) — ${reason}${saved.notes.length ? ` · ${saved.notes.join("; ")}` : ""}`,
  });
  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "quote_price_changed",
    entityType: "quote",
    entityId: quote.id,
    reason,
    previousValue: { sellingPrice: version.selling_price, vatRate: version.vat_rate, supplierEstimatedCost: version.supplier_estimated_cost, versionId: version.id },
    newValue: { sellingPrice: newPrice, vatRate: input.vatRate, supplierEstimatedCost: newSupplierCost, versionId: saved.versionId, paymentMethods: saved.paymentMethods },
  });

  // ---- Optional re-send --------------------------------------------------
  let warning: string | null = null;
  if (input.emailCustomer && quote.status !== "draft") {
    const sent = await resendQuoteEmailAction(quote.id);
    if (sent?.error) warning = `Price updated, but the email to the customer failed: ${sent.error}`;
  }

  revalidatePath(`/quotes/${quote.id}`);
  revalidatePath("/quotes");
  return { error: null, warning };
}

/**
 * "Today's Special Deal" — takes `percent` off the quote's current price.
 * Same people as Edit Price, on any quote not yet accepted/paid/cancelled.
 * The customer's quote page and PDF show the pre-deal price struck through
 * next to the new one. A rejected or expired quote is re-opened by it and
 * always re-sent (it has to reach the customer to mean anything); otherwise
 * re-sending is optional, and a draft is never sent from here.
 */
export async function applySpecialDealAction(quoteId: string, input: { percent: number; emailCustomer: boolean; note: string }) {
  const actor = await requireProfile();
  const percent = Math.round(Number(input.percent) * 100) / 100;
  if (!Number.isFinite(percent) || percent < 1 || percent > 90) return { error: "Enter a discount between 1% and 90%." };

  const quote = await loadQuoteForRepricing(quoteId);
  if (!quote) return { error: "Quote not found." };
  const allowed = actor.is_master_admin || (await canEditQuotePrices(actor));
  if (!allowed) return { error: "You don't have permission to change this quote's price." };
  if (!SPECIAL_DEAL_STATUSES.includes(quote.status)) {
    return { error: "This quote has already been accepted, paid or cancelled — a special deal can't be added now." };
  }
  const version = quote.quote_versions;
  if (!version) return { error: "This quote has no priced version." };

  const { originalPrice, newPrice, totalPercent } = discountedPrice(version, percent);
  if (newPrice <= 0) return { error: "That discount leaves nothing to pay." };

  const admin = createAdminClient();
  const saved = await saveRepricedVersion(admin, quote, {
    newPrice,
    vatRate: Number(version.vat_rate),
    supplierEstimatedCost: version.supplier_estimated_cost,
    createdBy: actor.id,
    discount: { originalPrice, percent: totalPercent, source: "special_deal" },
  });
  if (saved.error !== null) return { error: saved.error };

  const { reopened } = await reopenForDeal(admin, quote);
  const note = input.note.trim();
  const belowCost = version.supplier_estimated_cost != null && newPrice < Number(version.supplier_estimated_cost);
  await admin.from("quote_events").insert({
    quote_id: quote.id,
    event: "special_deal",
    detail:
      `${percent}% off by ${actor.full_name}: ${money(version.selling_price, quote.currency)} → ${money(newPrice, quote.currency)} (version ${saved.versionNumber})` +
      (totalPercent !== percent ? ` · ${totalPercent}% off the original ${money(originalPrice, quote.currency)}` : "") +
      (reopened ? " · quote re-opened" : "") +
      (belowCost ? " · below supplier cost" : "") +
      (note ? ` — ${note}` : "") +
      (saved.notes.length ? ` · ${saved.notes.join("; ")}` : ""),
  });
  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "quote_special_deal",
    entityType: "quote",
    entityId: quote.id,
    reason: note || null,
    previousValue: { sellingPrice: version.selling_price, versionId: version.id, status: quote.status },
    newValue: { sellingPrice: newPrice, discountPercent: totalPercent, originalPrice, versionId: saved.versionId, reopened },
  });

  let warning: string | null = null;
  if (quote.status !== "draft" && (reopened || input.emailCustomer)) {
    const sent = await resendQuoteEmailAction(quote.id);
    if (sent?.error) warning = `Special deal saved, but the email to the customer failed: ${sent.error}`;
    else if (reopened) await admin.from("quote_events").insert({ quote_id: quote.id, event: "sent" });
  }

  revalidatePath(`/quotes/${quote.id}`);
  revalidatePath("/quotes");
  return { error: null, warning };
}
