import "server-only";
import { resolveEndpointPair, GEO_TIMEOUT_MS } from "./geoLookup";

export interface MoveDistance {
  distanceKm: number;
  durationMinutes: number;
}

/**
 * Real driving distance/duration between two addresses via Google's
 * Routes API — grounds the AI price estimate (lib/aiPriceEstimate.ts,
 * lib/aiAutoQuote.ts) in an actual number instead of asking the model to
 * guess both the geography AND the price from two address strings alone,
 * which is what made repeated estimates for the same unchanged move swing
 * wildly (e.g. MXN 25,000 on one call, MXN 4,500 on the very next). Returns
 * null on any failure (no key, API error, no route found, addresses too
 * vague to resolve) so the caller falls back to an ungrounded estimate
 * rather than the whole feature breaking — same fail-open pattern as
 * lib/reverseGeocode.ts, which already uses this same key server-side.
 */
export interface RouteSegment {
  from: string;
  to: string;
  distance: MoveDistance | null;
}

export interface RouteDistance {
  segments: RouteSegment[];
  /** Null when any segment couldn't be resolved — a partial sum would understate the route. */
  total: MoveDistance | null;
}

/** Stop-by-stop driving distance along an ordered list of stops (A→B, B→C, …). */
export async function estimateRouteDistance(stops: (string | null)[]): Promise<RouteDistance> {
  const clean = stops.map((s) => s?.trim() ?? "").filter(Boolean);
  const pairs = clean.slice(1).map((to, i) => ({ from: clean[i]!, to }));
  const segments = await Promise.all(
    pairs.map(async ({ from, to }) => ({ from, to, distance: await estimateMoveDistance(from, to) })),
  );
  const total =
    segments.length > 0 && segments.every((s) => s.distance)
      ? {
          distanceKm: Math.round(segments.reduce((sum, s) => sum + s.distance!.distanceKm, 0) * 10) / 10,
          durationMinutes: segments.reduce((sum, s) => sum + s.distance!.durationMinutes, 0),
        }
      : null;
  return { segments, total };
}

/**
 * Pickup → destination driving distance per move, index-aligned with
 * `legs` — what every page showing MoveDetailCard passes as its
 * `distance` prop (lead, quote, new-quote, dispatch job, supplier job).
 */
export function moveRouteDistances(legs: { pickup_address: string; destination_address: string }[]): Promise<RouteDistance[]> {
  return Promise.all(legs.map((leg) => estimateRouteDistance([leg.pickup_address, leg.destination_address])));
}

/** Recent results per address pair — pages re-render often and every lookup is billed. */
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 500;
const distanceCache = new Map<string, { at: number; value: MoveDistance | null }>();

export async function estimateMoveDistance(pickup: string | null, destination: string | null): Promise<MoveDistance | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey || !pickup?.trim() || !destination?.trim()) return null;

  const cacheKey = `${pickup.trim().toLowerCase()} -> ${destination.trim().toLowerCase()}`;
  const cached = distanceCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  // Each address on its own can resolve somewhere absurd ("Bergamo hotel"
  // alone → a hotel called Bergamo in Yerevan, so Bergamo Airport → Bergamo
  // hotel came out at 3,679 km). resolveEndpointPair re-searches a vague end
  // near the other one when the two land implausibly far apart; only then do
  // we route between its coordinates. Otherwise — and on any lookup failure
  // or timeout — the route is computed from the address strings exactly as
  // before (fail-open).
  let origin: object = { address: pickup };
  let dest: object = { address: destination };
  try {
    const pair = await resolveEndpointPair(pickup, destination, AbortSignal.timeout(GEO_TIMEOUT_MS));
    if (pair.reResolved && pair.pickup && pair.destination) {
      origin = { location: { latLng: { latitude: pair.pickup.lat, longitude: pair.pickup.lng } } };
      dest = { location: { latLng: { latitude: pair.destination.lat, longitude: pair.destination.lng } } };
    }
  } catch (err) {
    console.error("estimateMoveDistance: context lookup failed, using plain addresses:", err);
  }

  const value = await computeRoute(apiKey, origin, dest);
  if (!value) return null; // don't cache failures — a transient Google error shouldn't stick
  if (distanceCache.size >= CACHE_MAX) distanceCache.delete(distanceCache.keys().next().value!);
  distanceCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

async function computeRoute(apiKey: string, origin: object, destination: object): Promise<MoveDistance | null> {
  // Routes API (computeRoutes), not the legacy Distance Matrix API, which
  // Google no longer enables on new Cloud projects. The key's project needs
  // "Routes API" enabled.
  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({ origin, destination, travelMode: "DRIVE" }),
    });
    if (!res.ok) {
      console.error("estimateMoveDistance: Routes API returned", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { routes?: { distanceMeters?: number; duration?: string }[] };
    const route = data.routes?.[0];
    // duration comes back as seconds in a string, e.g. "1843s".
    const seconds = route?.duration ? parseFloat(route.duration) : NaN;
    if (!route?.distanceMeters || !Number.isFinite(seconds)) return null;
    return {
      distanceKm: Math.round((route.distanceMeters / 1000) * 10) / 10,
      durationMinutes: Math.round(seconds / 60),
    };
  } catch (err) {
    console.error("estimateMoveDistance failed:", err);
    return null;
  }
}
