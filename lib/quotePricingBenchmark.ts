import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { estimateTripDistance } from "./tripDistance";

export interface PricingBenchmark {
  ratePerKm: number;
  sampleSize: number;
}

/**
 * Looks at this tenant's own recent accepted/paid quotes for a similarly-
 * sized vehicle, in the same currency, and derives a real empirical rate
 * per km from their actual selling price ÷ actual driving distance —
 * grounding a new estimate in this specific business's own pricing history
 * instead of an LLM's generic world knowledge of regional commercial-
 * vehicle rates, which real-world testing showed is not reliable (a
 * gpt-4o-mini estimate for a 15-seat coach came back at roughly taxi
 * per-km rates). Returns null when there isn't enough real comparable data
 * to trust (fewer than 3 usable matches) — the caller falls back to the
 * model's own reasoning in that case.
 */
export async function computeHistoricalRatePerKm(
  supabase: SupabaseClient<Database>,
  params: { tenantId: string; currency: string; passengerCount: number | null; excludeQuoteId: string },
): Promise<PricingBenchmark | null> {
  const { data } = await supabase
    .from("quotes")
    .select(
      "id, quote_versions!quotes_current_version_id_fkey(selling_price), enquiries(enquiry_legs(pickup_address, destination_address, passenger_count, journey_type))",
    )
    .eq("tenant_id", params.tenantId)
    .eq("currency", params.currency)
    .in("status", ["accepted", "partially_paid", "paid"])
    .neq("id", params.excludeQuoteId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (!data) return null;

  // Every leg, not just the first — a historical quote that was itself a
  // multi-leg trip would otherwise have its real total distance understated
  // (only leg 1 measured) against its FULL selling price, silently
  // inflating the computed rate/km for every quote that happens to be
  // multi-leg.
  const candidates: {
    sellingPrice: number;
    legs: { pickup: string; destination: string; isReturn: boolean }[];
    maxPassengerCount: number | null;
  }[] = [];
  for (const row of data) {
    const version = row.quote_versions as unknown as { selling_price: number } | null;
    const legs = (
      row.enquiries as unknown as {
        enquiry_legs: { pickup_address: string; destination_address: string; passenger_count: number | null; journey_type: string | null }[];
      } | null
    )?.enquiry_legs;
    if (!version?.selling_price || !legs || legs.length === 0) continue;
    const usableLegs = legs.filter((l) => l.pickup_address && l.destination_address);
    if (usableLegs.length === 0) continue;

    const maxPassengerCount = legs.reduce<number | null>((max, l) => (l.passenger_count != null ? Math.max(max ?? 0, l.passenger_count) : max), null);
    // Similar vehicle size only — a 4-seat car's per-km rate says nothing
    // about a 50-seat coach's. Loose ±60% band around the target passenger
    // count; any size counts if either side's count isn't known.
    if (params.passengerCount && maxPassengerCount) {
      const ratio = maxPassengerCount / params.passengerCount;
      if (ratio < 0.4 || ratio > 1.6) continue;
    }

    candidates.push({
      sellingPrice: version.selling_price,
      legs: usableLegs.map((l) => ({ pickup: l.pickup_address, destination: l.destination_address, isReturn: l.journey_type === "return" })),
      maxPassengerCount,
    });
    if (candidates.length >= 8) break; // caps how many Distance Matrix calls this can trigger
  }
  if (candidates.length < 3) return null;

  const rates = (
    await Promise.all(
      candidates.map(async (c) => {
        // Same fix as estimateQuoteTripPrice (lib/aiPriceEstimate.ts): a
        // round trip is one leg row carrying its own return time, so the
        // measured pickup->destination distance only covers the outbound
        // half — left uncorrected, a tenant whose history is mostly return
        // trips would get a rate/km roughly double the real one (full
        // round-trip price ÷ half the real distance).
        const legDistances = await Promise.all(
          c.legs.map(async (l) => {
            const d = await estimateTripDistance(l.pickup, l.destination);
            if (!d) return null;
            return l.isReturn ? { ...d, distanceKm: d.distanceKm * 2 } : d;
          }),
        );
        const resolved = legDistances.filter((d): d is NonNullable<typeof d> => d !== null && d.distanceKm >= 1);
        if (resolved.length === 0) return null;
        const totalDistanceKm = resolved.reduce((sum, d) => sum + d.distanceKm, 0);
        return c.sellingPrice / totalDistanceKm;
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
