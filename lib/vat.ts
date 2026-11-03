// VAT math for quotes (0105_quote_vat.sql). quote_versions.selling_price is
// always the VAT-inclusive total the customer pays; only vat_rate is stored,
// and the net/VAT split is derived here. No server-only imports — used by
// the New Quote form, quote pages, PDFs and the profit/commission reports.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Selling price before VAT + rate (%) -> the VAT-inclusive total that's stored as selling_price. */
export function grossFromNet(net: number, vatRate: number): number {
  return round2(net * (1 + vatRate / 100));
}

/** Split a stored VAT-inclusive total into its net and VAT parts. */
export function vatBreakdown(gross: number, vatRate: number | null | undefined): { net: number; vat: number } {
  const rate = Number(vatRate) || 0;
  if (rate <= 0) return { net: gross, vat: 0 };
  const net = round2(gross / (1 + rate / 100));
  return { net, vat: round2(gross - net) };
}

/** Net (ex-VAT) revenue — what profit and commission are calculated on. */
export function netOfVat(gross: number, vatRate: number | null | undefined): number {
  return vatBreakdown(gross, vatRate).net;
}

/** "20%" / "12.5%" — trims a trailing .00 off the stored numeric. */
export function formatVatRate(vatRate: number | null | undefined): string {
  return `${Number(vatRate) || 0}%`;
}
