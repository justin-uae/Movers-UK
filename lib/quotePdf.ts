import "server-only";
import { vatBreakdown, formatVatRate } from "./vat";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { moveDetailRows, type MoveDetails } from "./moveDetails";
import {
  createPdfDocument,
  money,
  formatDate,
  fetchLogoBuffer,
  sectionHeading,
  ensureSpace,
  drawKeyValueBox,
  drawFooterOnEveryPage,
  sanitizePdfText,
  writeRichText,
  FALLBACK_COLOR,
  INK,
  MUTED,
  PAGE_MARGIN,
  FONT_REGULAR,
  FONT_BOLD,
} from "./pdfDocument";

interface BrandSnapshot {
  name: string;
  logo_url: string | null;
  primary_color: string;
}

interface QuoteLineItemRow {
  description: string;
  amount: number;
}

interface QuoteMilestoneRow {
  sequence: number;
  label: string;
  amount: number;
  due_date: string | null;
}

interface VersionRow {
  van_size: string | null;
  selling_price: number;
  /** Special Deal (0114_special_deals.sql) — the struck-through "was" price and its % off. */
  original_price: number | null;
  discount_percent: number | null;
  vat_rate: number;
  deposit_percentage: number | null;
  deposit_fixed_amount: number | null;
  payment_methods: { stripe: boolean; bank_transfer: boolean } | null;
  customer_notes: string | null;
  terms_snapshot: string | null;
  brand_snapshot: BrandSnapshot | null;
  quote_line_items: QuoteLineItemRow[] | null;
}

interface LegRow extends MoveDetails {
  sequence: number;
  pickup_address: string;
  destination_address: string;
  pickup_date: string | null;
  pickup_time: string | null;
  special_requirements: string | null;
}

interface QuotePdfRow {
  id: string;
  quote_number: string;
  status: string;
  currency: string;
  expiry_at: string | null;
  created_at: string;
  brand_id: string;
  tenant_id: string;
  customers: { company_name: string | null; contact_name: string; email: string | null; phone: string | null } | null;
  enquiries: { enquiry_legs: LegRow[] } | null;
  quote_versions: VersionRow | null;
  quote_payment_milestones: QuoteMilestoneRow[] | null;
}

interface BankAccountRow {
  profile_label: string | null;
  account_name: string;
  bank_name: string;
  account_number: string | null;
  iban: string | null;
  sort_code: string | null;
  swift_bic: string | null;
  bank_address: string | null;
  payment_notes: string | null;
}

/**
 * Builds a branded PDF for a quote — attached to the "quote sent" email
 * (see createQuoteAction / resendQuoteEmailAction) so the customer has a
 * downloadable, printable copy alongside the online accept/reject link.
 * Self-contained: does its own fetch of everything it needs from `quoteId`,
 * so callers don't have to widen their own queries just to build this.
 */
export async function generateQuotePdf(
  supabase: SupabaseClient<Database>,
  quoteId: string,
): Promise<Buffer | null> {
  const { data: quoteRaw } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, currency, expiry_at, created_at, brand_id, tenant_id, " +
        "customers(company_name, contact_name, email, phone), " +
        "enquiries(enquiry_legs(sequence, pickup_address, destination_address, pickup_date, pickup_time, special_requirements, move_type, property_type, rooms, estimated_boxes, pickup_floor, destination_floor, lift_available, packing_needed, dismantling_needed, assembly_needed, storage_needed, fragile_items)), " +
        "quote_versions!quotes_current_version_id_fkey(van_size, selling_price, original_price, discount_percent, vat_rate, deposit_percentage, deposit_fixed_amount, payment_methods, customer_notes, terms_snapshot, brand_snapshot, quote_line_items(description, amount)), " +
        "quote_payment_milestones(sequence, label, amount, due_date)",
    )
    .eq("id", quoteId)
    .single();

  if (!quoteRaw) return null;
  const quote = quoteRaw as unknown as QuotePdfRow;
  const version = quote.quote_versions;
  if (!version) return null;

  const { data: brandRow } = await supabase
    .from("brands")
    .select("company_id, companies(legal_name, registered_address, vat_number)")
    .eq("id", quote.brand_id)
    .single();
  const company = brandRow?.companies as unknown as
    | { legal_name: string; registered_address: string | null; vat_number: string | null }
    | null;

  // Tenant-wide payment profiles — every profile is shown (not filtered by
  // the quote's currency), only when bank transfer is actually an accepted
  // method for this quote.
  let bankAccounts: BankAccountRow[] = [];
  if (version.payment_methods?.bank_transfer) {
    const { data: bankAccountsRaw } = await supabase
      .from("bank_accounts")
      .select("profile_label, account_name, bank_name, account_number, iban, sort_code, swift_bic, bank_address, payment_notes")
      .eq("tenant_id", quote.tenant_id)
      .order("sort_order");
    bankAccounts = (bankAccountsRaw ?? []) as unknown as BankAccountRow[];
  }

  const { data: tenantRow } = await supabase.from("tenants").select("terms_and_conditions").eq("id", quote.tenant_id).maybeSingle();

  const brand = version.brand_snapshot;
  const brandName = brand?.name ?? "Quotation";
  const brandColor = brand?.primary_color ?? FALLBACK_COLOR;
  const customer = quote.customers;
  const move = [...(quote.enquiries?.enquiry_legs ?? [])].sort((a, b) => a.sequence - b.sequence)[0] ?? null;
  const logoBuffer = await fetchLogoBuffer(brand?.logo_url ?? null);

  const built = createPdfDocument("quotePdf");
  if (!built) return null;
  const { doc, done } = built;

  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  // ---- Header band --------------------------------------------------------
  doc.rect(0, 0, pageWidth, 110).fill(brandColor);
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, PAGE_MARGIN, 28, { fit: [54, 54] });
    } catch {
      // Corrupt/unsupported image data — skip it, header still reads fine
      // with just the brand name.
    }
  }
  doc
    .fillColor("#ffffff")
    .font(FONT_BOLD)
    .fontSize(20)
    .text(brandName, logoBuffer ? PAGE_MARGIN + 66 : PAGE_MARGIN, 40, { width: contentWidth - 160 });
  doc
    .font(FONT_BOLD)
    .fontSize(22)
    .text("QUOTATION", PAGE_MARGIN, 38, { width: contentWidth, align: "right" });
  doc
    .font(FONT_REGULAR)
    .fontSize(11)
    .text(quote.quote_number, PAGE_MARGIN, 66, { width: contentWidth, align: "right" });

  doc.y = 130;
  doc.fillColor(INK);

  // ---- From / bill to / quote details --------------------------------------
  const colWidth = contentWidth / 2 - 10;
  const infoTop = doc.y;

  doc.font(FONT_BOLD).fontSize(10).fillColor(MUTED).text("FROM", PAGE_MARGIN, infoTop);
  doc
    .font(FONT_BOLD)
    .fontSize(12)
    .fillColor(INK)
    .text(company?.legal_name || brandName, PAGE_MARGIN, infoTop + 14, { width: colWidth });
  doc.font(FONT_REGULAR).fontSize(10).fillColor(MUTED);
  let fromY = doc.y + 2;
  if (company?.registered_address) {
    doc.text(company.registered_address, PAGE_MARGIN, fromY, { width: colWidth });
    fromY = doc.y + 2;
  }
  if (company?.vat_number) {
    doc.text(`VAT ${company.vat_number}`, PAGE_MARGIN, fromY, { width: colWidth });
    fromY = doc.y + 2;
  }

  const billTop = fromY + 12;
  doc.font(FONT_BOLD).fontSize(10).fillColor(MUTED).text("BILL TO", PAGE_MARGIN, billTop);
  doc
    .font(FONT_BOLD)
    .fontSize(12)
    .fillColor(INK)
    .text(customer?.company_name || customer?.contact_name || "Customer", PAGE_MARGIN, billTop + 14, { width: colWidth });
  doc.font(FONT_REGULAR).fontSize(10).fillColor(MUTED);
  let billY = doc.y + 2;
  if (customer?.company_name && customer.contact_name) {
    doc.text(customer.contact_name, PAGE_MARGIN, billY, { width: colWidth });
    billY = doc.y + 2;
  }
  if (customer?.email) {
    doc.text(customer.email, PAGE_MARGIN, billY, { width: colWidth });
    billY = doc.y + 2;
  }
  if (customer?.phone) {
    doc.text(customer.phone, PAGE_MARGIN, billY, { width: colWidth });
  }

  const detailsX = PAGE_MARGIN + colWidth + 20;
  doc.font(FONT_BOLD).fontSize(10).fillColor(MUTED).text("QUOTE DETAILS", detailsX, infoTop);
  const detailRows: [string, string][] = [
    ["Issue date", formatDate(quote.created_at)],
    ["Valid until", formatDate(quote.expiry_at)],
  ];
  let detailY = infoTop + 14;
  for (const [label, value] of detailRows) {
    doc.font(FONT_REGULAR).fontSize(10).fillColor(MUTED).text(label, detailsX, detailY, { width: colWidth / 2, continued: false });
    doc
      .font(FONT_BOLD)
      .fillColor(INK)
      .text(value, detailsX + colWidth / 2, detailY, { width: colWidth / 2, align: "right" });
    detailY += 15;
  }

  doc.y = Math.max(billY, detailY) + 20;

  // ---- Move details ---------------------------------------------------------
  sectionHeading(doc, "Move Details", brandColor, contentWidth);
  if (!move) {
    doc.font(FONT_REGULAR).fontSize(10).fillColor(MUTED).text("No move details recorded.", PAGE_MARGIN);
  } else {
    const rows: [string, string][] = [
      ["Moving from", move.pickup_address],
      ["Moving to", move.destination_address],
      ["Move date", `${formatDate(move.pickup_date)}${move.pickup_time ? ` at ${move.pickup_time}` : ""}`],
    ];
    if (version.van_size) rows.push(["Van size", version.van_size]);
    for (const { label, value } of moveDetailRows(move)) rows.push([label, value]);
    if (move.special_requirements) rows.push(["Inventory & access notes", move.special_requirements]);
    drawKeyValueBox(doc, rows, contentWidth);
  }

  doc.moveDown(1);

  // ---- Pricing ---------------------------------------------------------------
  sectionHeading(doc, "Pricing", brandColor, contentWidth);

  if (version.quote_line_items && version.quote_line_items.length > 0) {
    ensureSpace(doc, 24 * version.quote_line_items.length + 10);
    drawKeyValueBox(
      doc,
      version.quote_line_items.map((li): [string, string] => [li.description, money(li.amount, quote.currency)]),
      contentWidth,
    );
    doc.moveDown(0.6);
  }

  if (version.vat_rate > 0) {
    const { net, vat } = vatBreakdown(version.selling_price, version.vat_rate);
    ensureSpace(doc, 58);
    drawKeyValueBox(
      doc,
      [
        ["Subtotal (excl. VAT)", money(net, quote.currency)],
        [`VAT (${formatVatRate(version.vat_rate)})`, money(vat, quote.currency)],
      ],
      contentWidth,
    );
    doc.moveDown(0.6);
  }

  if (version.original_price != null && version.discount_percent != null) {
    ensureSpace(doc, 64);
    const dealTop = doc.y;
    doc
      .font(FONT_BOLD)
      .fontSize(11)
      .fillColor("#047857")
      .text(`Today’s Special Deal — ${Number(version.discount_percent)}% off`, PAGE_MARGIN, dealTop);
    doc
      .font(FONT_REGULAR)
      .fontSize(11)
      .fillColor(MUTED)
      .text(`Was ${money(Number(version.original_price), quote.currency)}`, PAGE_MARGIN, dealTop + 15, { strike: true });
    doc.fillColor(INK);
    doc.y = dealTop + 34;
  }

  ensureSpace(doc, 44);
  const priceBoxTop = doc.y;
  doc.font(FONT_REGULAR).fontSize(11).fillColor(MUTED).text(version.vat_rate > 0 ? "Total price incl. VAT" : "Total price", PAGE_MARGIN, priceBoxTop);
  doc
    .font(FONT_BOLD)
    .fontSize(20)
    .fillColor(brandColor)
    .text(money(version.selling_price, quote.currency), PAGE_MARGIN, priceBoxTop + 14);
  doc.fillColor(INK);
  doc.y = priceBoxTop + 44;

  const milestones = [...(quote.quote_payment_milestones ?? [])].sort((a, b) => a.sequence - b.sequence);
  const pricingRows: [string, string][] = [];
  if (milestones.length > 0) {
    for (const m of milestones) {
      pricingRows.push([m.label + (m.due_date ? ` (due ${formatDate(m.due_date)})` : ""), money(m.amount, quote.currency)]);
    }
  } else if (version.deposit_fixed_amount) {
    const balance = Math.round((version.selling_price - version.deposit_fixed_amount) * 100) / 100;
    pricingRows.push(["Deposit due now", money(version.deposit_fixed_amount, quote.currency)]);
    pricingRows.push(["Balance (due before the move)", money(balance, quote.currency)]);
  } else if (version.deposit_percentage) {
    const deposit = Math.round(version.selling_price * (version.deposit_percentage / 100) * 100) / 100;
    const balance = Math.round((version.selling_price - deposit) * 100) / 100;
    pricingRows.push([`Deposit due now (${version.deposit_percentage}%)`, money(deposit, quote.currency)]);
    pricingRows.push(["Balance (due before the move)", money(balance, quote.currency)]);
  } else {
    pricingRows.push(["Payment plan", "Full payment due to confirm"]);
  }
  const methods = [
    version.payment_methods?.stripe ? "Card / online payment" : null,
    version.payment_methods?.bank_transfer ? "Bank transfer" : null,
  ].filter(Boolean);
  if (methods.length > 0) pricingRows.push(["Accepted payment methods", methods.join(" · ")]);
  drawKeyValueBox(doc, pricingRows, contentWidth);

  if (version.customer_notes) {
    doc.moveDown(0.8);
    writeRichText(doc, version.customer_notes, { x: PAGE_MARGIN, width: contentWidth, fontSize: 10, color: MUTED });
  }

  // ---- Payment details ---------------------------------------------------------
  if (bankAccounts.length > 0) {
    doc.moveDown(1.2);
    // Forces the whole section onto a fresh page (rather than starting it
    // wherever the previous section happened to end) whenever it wouldn't
    // otherwise fit as one block — a per-account ensureSpace call further
    // down only ever checks whether *that one* box fits, which is how 4
    // profiles used to end up split across two pages.
    ensureSpace(doc, bankAccounts.length * 130 + 40);
    sectionHeading(doc, "Payment Details", brandColor, contentWidth);
    for (const account of bankAccounts) {
      // The 4 possible account-identifier fields collapse into one "Details"
      // row (rather than one row each) so a profile with every field set
      // still only takes 3 box rows, not up to 6 — the height saving is
      // what actually keeps 4 profiles together on one page.
      const details = [
        account.iban ? `IBAN ${account.iban}` : null,
        account.account_number ? `Account ${account.account_number}` : null,
        account.sort_code ? `Sort code ${account.sort_code}` : null,
        account.swift_bic ? `SWIFT/BIC ${account.swift_bic}` : null,
      ]
        .filter(Boolean)
        .join("   ·   ");
      doc
        .font(FONT_BOLD)
        .fontSize(9)
        .fillColor(brandColor)
        .text((account.profile_label ?? "Bank transfer").toUpperCase(), PAGE_MARGIN, doc.y);
      doc.moveDown(0.2);
      const rows: [string, string][] = [["Account holder", account.account_name], ["Bank", account.bank_name]];
      if (details) rows.push(["Details", details]);
      drawKeyValueBox(doc, rows, contentWidth);
      if (account.bank_address || account.payment_notes) {
        doc.moveDown(0.2);
        doc
          .font(FONT_REGULAR)
          .fontSize(8)
          .fillColor(MUTED)
          .text(
            sanitizePdfText([account.bank_address, account.payment_notes].filter(Boolean).join(" — ")),
            PAGE_MARGIN,
            doc.y,
            { width: contentWidth },
          );
      }
      doc.moveDown(0.5);
    }
  }

  doc.moveDown(0.7);

  // ---- Terms & conditions -----------------------------------------------------
  // Per-quote override, else the tenant-wide text from Settings -> Bank
  // Details & Terms. No hardcoded fallback — same as the invoice PDF and the
  // public quote page, so all three always show the same terms.
  const terms = version.terms_snapshot?.trim() || tenantRow?.terms_and_conditions?.trim();
  if (terms) {
    sectionHeading(doc, "Terms & Conditions", brandColor, contentWidth);
    doc.font(FONT_REGULAR).fontSize(9).fillColor(MUTED);
    doc.text(sanitizePdfText(terms), PAGE_MARGIN, doc.y, { width: contentWidth, align: "left" });
  }

  // ---- Footer on every page ---------------------------------------------------
  drawFooterOnEveryPage(doc, contentWidth);

  doc.end();
  return done;
}
