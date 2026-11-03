import "server-only";
import { vatBreakdown, formatVatRate } from "./vat";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
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

interface LineItemRow {
  description: string;
  amount: number;
}

interface VersionRow {
  vehicle_description: string | null;
  selling_price: number;
  vat_rate: number;
  brand_snapshot: BrandSnapshot | null;
  quote_line_items: LineItemRow[] | null;
  terms_snapshot: string | null;
}

interface PaymentRow {
  amount: number;
  method: string;
  paid_at: string;
}

interface BankAccountRow {
  profile_label: string | null;
  account_name: string;
  bank_name: string;
  account_number: string | null;
  iban: string | null;
  sort_code: string | null;
  swift_bic: string | null;
}

interface InvoicePdfRow {
  id: string;
  quote_number: string;
  currency: string;
  brand_id: string;
  tenant_id: string;
  invoice_number: string | null;
  invoiced_at: string | null;
  customers: {
    company_name: string | null;
    contact_name: string;
    email: string | null;
    phone: string | null;
    billing_address: string | null;
  } | null;
  quote_versions: VersionRow | null;
  customer_payments: PaymentRow[] | null;
}

/**
 * Builds a branded invoice PDF for a *paid* quote — the customer-facing
 * `/q/[token]/invoice` page renders the same figures as live HTML (its own
 * print-to-PDF button), this is the persisted-document equivalent staff can
 * preview/download/resend from the quote detail page. Self-contained, same
 * shape as generateQuotePdf: takes only (supabase, quoteId) and does its own
 * queries. Returns null (never throws) on a missing/unpaid quote or a font
 * init failure, so callers can degrade to "no PDF" rather than a 500.
 */
export async function generateInvoicePdf(
  supabase: SupabaseClient<Database>,
  quoteId: string,
): Promise<Buffer | null> {
  const { data: quoteRaw } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, currency, brand_id, tenant_id, invoice_number, invoiced_at, " +
        "customers(company_name, contact_name, email, phone, billing_address), " +
        "quote_versions!quotes_current_version_id_fkey(vehicle_description, selling_price, vat_rate, brand_snapshot, quote_line_items(description, amount), terms_snapshot), " +
        "customer_payments(amount, method, paid_at)",
    )
    .eq("id", quoteId)
    .eq("status", "paid")
    .single();

  if (!quoteRaw) return null;
  const quote = quoteRaw as unknown as InvoicePdfRow;
  const version = quote.quote_versions;
  if (!version || !quote.invoice_number) return null;

  const { data: brandRow } = await supabase
    .from("brands")
    .select("company_id, companies(legal_name, registered_address, vat_number)")
    .eq("id", quote.brand_id)
    .single();
  const company = brandRow?.companies as unknown as
    | { legal_name: string; registered_address: string | null; vat_number: string | null }
    | null;

  // Tenant-wide payment profiles — every profile is shown, not just ones
  // matching the quote's currency.
  const { data: bankAccountsRaw } = await supabase
    .from("bank_accounts")
    .select("profile_label, account_name, bank_name, account_number, iban, sort_code, swift_bic")
    .eq("tenant_id", quote.tenant_id)
    .order("sort_order");
  const bankAccounts = (bankAccountsRaw ?? []) as unknown as BankAccountRow[];

  const { data: tenantRow } = await supabase.from("tenants").select("terms_and_conditions").eq("id", quote.tenant_id).maybeSingle();

  const brand = version.brand_snapshot;
  const brandName = brand?.name ?? "Invoice";
  const brandColor = brand?.primary_color ?? FALLBACK_COLOR;
  const customer = quote.customers;
  const payments = [...(quote.customer_payments ?? [])].sort(
    (a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime(),
  );
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const logoBuffer = await fetchLogoBuffer(brand?.logo_url ?? null);

  const built = createPdfDocument("invoicePdf");
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
    .text("INVOICE", PAGE_MARGIN, 38, { width: contentWidth, align: "right" });
  doc
    .font(FONT_REGULAR)
    .fontSize(11)
    .text(quote.invoice_number, PAGE_MARGIN, 66, { width: contentWidth, align: "right" });

  doc.y = 130;
  doc.fillColor(INK);

  // ---- From / bill to / invoice details --------------------------------------
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
  if (customer?.billing_address) {
    doc.text(customer.billing_address, PAGE_MARGIN, billY, { width: colWidth });
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
  doc.font(FONT_BOLD).fontSize(10).fillColor(MUTED).text("INVOICE DETAILS", detailsX, infoTop);
  const detailRows: [string, string][] = [
    ["Invoice date", formatDate(quote.invoiced_at)],
    ["Quote reference", quote.quote_number],
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

  // ---- Line items -------------------------------------------------------------
  sectionHeading(doc, "Summary", brandColor, contentWidth);
  // With VAT, the service line is the net amount and VAT + the VAT-inclusive
  // total follow as their own rows (0105_quote_vat.sql, lib/vat.ts).
  const { net, vat } = vatBreakdown(version.selling_price, version.vat_rate);
  const summaryRows: [string, string][] = [
    [version.vehicle_description ?? "Transport service", money(net, quote.currency)],
  ];
  if (version.quote_line_items && version.quote_line_items.length > 0) {
    for (const li of version.quote_line_items) {
      summaryRows.push([li.description, money(li.amount, quote.currency)]);
    }
  }
  if (version.vat_rate > 0) {
    summaryRows.push([`VAT (${formatVatRate(version.vat_rate)})`, money(vat, quote.currency)]);
    summaryRows.push(["Total incl. VAT", money(version.selling_price, quote.currency)]);
  }
  drawKeyValueBox(doc, summaryRows, contentWidth);
  doc.moveDown(0.6);

  ensureSpace(doc, 44);
  const priceBoxTop = doc.y;
  doc.font(FONT_REGULAR).fontSize(11).fillColor(MUTED).text("Total paid", PAGE_MARGIN, priceBoxTop);
  doc
    .font(FONT_BOLD)
    .fontSize(20)
    .fillColor(brandColor)
    .text(money(totalPaid, quote.currency), PAGE_MARGIN, priceBoxTop + 14);
  doc.fillColor(INK);
  doc.y = priceBoxTop + 44;

  // ---- Payment history -----------------------------------------------------
  if (payments.length > 0) {
    doc.moveDown(0.6);
    sectionHeading(doc, "Payment history", brandColor, contentWidth);
    drawKeyValueBox(
      doc,
      payments.map((p): [string, string] => [
        `${p.method.replaceAll("_", " ")} · ${formatDate(p.paid_at)}`,
        money(p.amount, quote.currency),
      ]),
      contentWidth,
    );
  }

  if (bankAccounts.length > 0) {
    doc.moveDown(0.8);
    doc.font(FONT_REGULAR).fontSize(9).fillColor(MUTED);
    for (const account of bankAccounts) {
      const label = account.profile_label ? `${account.profile_label} — ` : "";
      const details = [
        account.iban ? `IBAN ${account.iban}` : null,
        account.account_number ? `Account ${account.account_number}` : null,
        account.sort_code ? `Sort code ${account.sort_code}` : null,
        account.swift_bic ? `SWIFT/BIC ${account.swift_bic}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      doc.text(`Paid via bank transfer to ${label}${account.account_name} (${account.bank_name})${details ? ` — ${details}` : ""}.`, PAGE_MARGIN, doc.y, {
        width: contentWidth,
      });
    }
  }

  // ---- Terms & conditions -----------------------------------------------------
  const terms = version.terms_snapshot?.trim() || tenantRow?.terms_and_conditions?.trim();
  if (terms) {
    doc.moveDown(1);
    sectionHeading(doc, "Terms & Conditions", brandColor, contentWidth);
    doc.font(FONT_REGULAR).fontSize(9).fillColor(MUTED).text(sanitizePdfText(terms), PAGE_MARGIN, doc.y, { width: contentWidth });
  }

  // ---- Footer on every page ---------------------------------------------------
  drawFooterOnEveryPage(doc, contentWidth);

  doc.end();
  return done;
}
