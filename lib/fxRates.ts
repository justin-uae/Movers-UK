import "server-only";

interface RatesCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

let cache: RatesCache | null = null;

// The upstream source (exchangerate-api.com's free tier) only refreshes
// daily — refetching more often than this would just hit the same numbers.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

async function fetchGbpRates(): Promise<Record<string, number>> {
  const response = await fetch("https://open.er-api.com/v6/latest/GBP");
  if (!response.ok) {
    throw new Error(`Exchange rate API responded with ${response.status}.`);
  }
  const data = (await response.json()) as { result?: string; rates?: Record<string, number> };
  if (data.result !== "success" || !data.rates) {
    throw new Error("Exchange rate API did not return usable rates.");
  }
  return data.rates;
}

/** GBP -> currency rates (e.g. rates.AED = how many AED equal 1 GBP), cached in-memory so a burst of quote/preview requests never each wait on their own network round trip. */
export async function getGbpRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rates;
  }
  const rates = await fetchGbpRates();
  cache = { rates, fetchedAt: Date.now() };
  return rates;
}

/**
 * Converts `amount` in `currency` to its GBP equivalent — used to decide
 * whether Stripe should be offered on a quote (see STRIPE_PRICE_THRESHOLD in
 * lib/quoteMoney.ts) regardless of which currency the quote itself is priced
 * in. Throws if `currency` isn't a code the exchange-rate source recognises
 * or the source is unreachable — callers decide the fallback.
 */
export async function convertToGbp(amount: number, currency: string): Promise<number> {
  const code = currency.toUpperCase();
  if (code === "GBP") return amount;
  const rates = await getGbpRates();
  const rate = rates[code];
  if (!rate) {
    throw new Error(`No GBP exchange rate available for ${code}.`);
  }
  return amount / rate;
}

/**
 * Converts `amount` from one currency to another via GBP as the common
 * anchor (the only rate table this source gives us) — e.g. the AI price
 * estimate tool (lib/aiPriceEstimate.ts) prices a trip in whatever currency
 * the model judges the route actually trades in (a Ghana route in GHS),
 * which can differ from the quote's own currency (priced in USD by staff) —
 * without converting, the two figures shown side by side on screen aren't
 * comparable at all. Throws if either currency isn't recognised; callers
 * decide the fallback.
 */
export async function convertCurrency(amount: number, from: string, to: string): Promise<number> {
  const fromCode = from.toUpperCase();
  const toCode = to.toUpperCase();
  if (fromCode === toCode) return amount;
  const gbp = await convertToGbp(amount, fromCode);
  if (toCode === "GBP") return gbp;
  const rates = await getGbpRates();
  const rate = rates[toCode];
  if (!rate) {
    throw new Error(`No GBP exchange rate available for ${toCode}.`);
  }
  return gbp * rate;
}
