import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { estimateMoveDistance } from "./moveDistance";

export interface PricingBenchmark {
  ratePerKm: number;
  sampleSize: number;
}

/**
 * Looks at this tenant's own recent accepted/paid quotes for the same van
 * size, in the same currency, and derives a real empirical rate per km from
 * their actual selling price ÷ actual driving distance — grounding a new
 * estimate in this specific business's own pricing history instead of an
 * LLM's generic world knowledge of removals rates. Returns null when there
 * isn't enough real comparable data to trust (fewer than 3 usable matches)
 * — the caller falls back to the model's own reasoning in that case.
 */
export async function computeHistoricalRatePerKm(
  supabase: SupabaseClient<Database>,
  params: { tenantId: string; currency: string; vanSize: string | null; excludeQuoteId: string },
): Promise<PricingBenchmark | null> {
  const { data } = await supabase
    .from("quotes")
    .select("id, quote_versions!quotes_current_version_id_fkey(selling_price, van_size), enquiries(enquiry_legs(sequence, pickup_address, destination_address))")
    .eq("tenant_id", params.tenantId)
    .eq("currency", params.currency)
    .in("status", ["accepted", "partially_paid", "paid"])
    .neq("id", params.excludeQuoteId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (!data) return null;

  const candidates: { sellingPrice: number; pickup: string; destination: string }[] = [];
  for (const row of data) {
    const version = row.quote_versions as unknown as { selling_price: number; van_size: string | null } | null;
    const move = (
      row.enquiries as unknown as { enquiry_legs: { sequence: number; pickup_address: string; destination_address: string }[] } | null
    )?.enquiry_legs?.sort((a, b) => a.sequence - b.sequence)[0];
    if (!version?.selling_price || !move?.pickup_address || !move.destination_address) continue;

    // Same van size only — a small van's per-km rate says nothing about a
    // 7.5 tonne lorry's. Any size counts if either side's isn't known.
    if (params.vanSize && version.van_size && params.vanSize !== version.van_size) continue;

    candidates.push({ sellingPrice: version.selling_price, pickup: move.pickup_address, destination: move.destination_address });
    if (candidates.length >= 8) break; // caps how many Routes API calls this can trigger
  }
  if (candidates.length < 3) return null;

  const rates = (
    await Promise.all(
      candidates.map(async (c) => {
        const d = await estimateMoveDistance(c.pickup, c.destination);
        return d && d.distanceKm >= 1 ? c.sellingPrice / d.distanceKm : null;
      }),
    )
  ).filter((r): r is number => r !== null && r > 0);
  if (rates.length < 3) return null;

  // Median, not mean — one unusually cheap/expensive historical booking
  // (a rush job, a loyal-customer discount, a data-entry error) shouldn't
  // skew the benchmark the way it would skew an average.
  rates.sort((a, b) => a - b);
  const mid = Math.floor(rates.length / 2);
  const median = rates.length % 2 === 0 ? (rates[mid - 1]! + rates[mid]!) / 2 : rates[mid]!;

  return { ratePerKm: Math.round(median * 100) / 100, sampleSize: rates.length };
}
