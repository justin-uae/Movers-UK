import "server-only";
import { estimateMoveDistance } from "./moveDistance";
import { estimatePricing, type LeadForSweep } from "./aiAutoQuote";
import type { PricingBenchmark } from "./quotePricingBenchmark";
import type { AiModelChoice } from "./aiProviders";
import { NO_MOVE_DETAILS, type MoveDetails } from "./moveDetails";

// An on-demand price benchmark for an EXISTING quote (Master Admin only, see
// estimateQuotePriceAction in app/(staff)/quotes/actions.ts) — a read-only
// sanity check against whatever price was actually charged, using the exact
// same pricing brain (lib/aiAutoQuote.ts's estimatePricing) that actually
// prices and sends a quote unattended, rather than a second, separately
// prompted pricing philosophy that would disagree with it. On top of that
// one function, this adds:
// 1. A real driving distance from Google's Routes API (lib/moveDistance.ts)
//    for the move, fed into the same call as grounding.
// 2. This tenant's own real historical rate/km for the same van size
//    (lib/quotePricingBenchmark.ts), shown alongside the model's own price
//    as context only — the estimate shown is always estimatePricing's own
//    selling_price, since the button is specifically for seeing what the AI
//    model thinks.

export interface QuoteEstimateMove {
  pickup: string | null;
  destination: string | null;
  pickupTime: string | null;
  moveDetails: MoveDetails | null;
  specialRequirements: string | null;
}

export interface QuoteEstimateInput {
  brandName: string;
  moveDate: string | null;
  /** The van size already on the quote — priced as-is rather than re-guessed. */
  vanSize: string | null;
  move: QuoteEstimateMove | null;
  /** This tenant's own real historical rate/km for the same van size, if
      lib/quotePricingBenchmark.ts found enough comparable past bookings to
      trust — shown alongside the model's own figure as context, never
      substituted for it. */
  historicalRatePerKm: PricingBenchmark | null;
  /** Resolved by the caller (Settings -> AI Models -> Pricing Engine) —
      this function has no supabase client of its own, so it can't look this
      up itself. */
  aiModel: AiModelChoice;
}

export interface QuoteEstimateResult {
  currency: string;
  estimatedPrice: number;
  /** Always the AI model's own supplier-cost estimate, for full transparency on the popup — never shown to customers. */
  supplierEstimatedCost: number;
  vanSize: string;
  /** The model's own explanation of how it reasoned about this price — shown verbatim on the popup, not a canned string. */
  rationale: string;
  /** Null when the distance couldn't be resolved (Routes API unavailable/addresses too vague). */
  distanceKm: number | null;
  pricePerKm: number | null;
  /** This tenant's own historical rate/km for comparison only — the
      estimate above is always the AI model's own number regardless of
      whether this is present. */
  historicalRatePerKm: number | null;
  historicalSampleSize: number | null;
}

export async function estimateQuoteMovePrice(input: QuoteEstimateInput): Promise<QuoteEstimateResult> {
  const move = input.move;
  const distance = await estimateMoveDistance(move?.pickup ?? null, move?.destination ?? null);

  // estimatePricing takes a LeadForSweep — most of its fields describe
  // things a quote doesn't have its own equivalent of (source channel, who
  // it's assigned to, ...), so this is a minimal stand-in built just to
  // reuse that one pricing brain rather than forking it.
  const leadLike: LeadForSweep = {
    id: "quote-price-estimate",
    tenant_id: "",
    brand_id: null,
    customer_id: null,
    assigned_user_id: null,
    claimed_at: null,
    source: "manual",
    pickup_text: move?.pickup ?? null,
    destination_text: move?.destination ?? null,
    travel_date: input.moveDate,
    pickup_time: move?.pickupTime ?? null,
    notes: move?.specialRequirements?.trim() || null,
    ...(move?.moveDetails ?? NO_MOVE_DETAILS),
    created_at: new Date().toISOString(),
  };

  const pricing = await estimatePricing(leadLike, input.brandName, input.aiModel, {
    realDistanceKm: distance?.distanceKm,
    realDurationMinutes: distance?.durationMinutes,
    vanSize: input.vanSize,
  });

  const distanceKm = distance?.distanceKm ?? null;
  const pricePerKm = distanceKm ? Math.round((pricing.selling_price / distanceKm) * 100) / 100 : null;

  return {
    currency: pricing.currency,
    estimatedPrice: pricing.selling_price,
    supplierEstimatedCost: pricing.supplier_estimated_cost,
    vanSize: pricing.van_size,
    rationale: pricing.pricing_rationale,
    distanceKm,
    pricePerKm,
    historicalRatePerKm: input.historicalRatePerKm?.ratePerKm ?? null,
    historicalSampleSize: input.historicalRatePerKm?.sampleSize ?? null,
  };
}
