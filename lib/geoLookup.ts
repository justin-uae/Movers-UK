import "server-only";

// Google geography lookups shared by lead routing (resolve each lead endpoint
// to country / first-level admin area / lat-lng before insert, classify each
// user region once — see 0122_geo_lead_routing.sql) and driving distance
// (lib/moveDistance.ts — resolve both ends of a move in each other's context).
//
// Everything here is FAIL-OPEN: any Google error, timeout or missing key
// resolves to null, and every caller falls back to its previous behaviour
// (word-match routing, a plain address-to-address route). Nothing in here
// throws.
//
// Uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (the only Maps key in this app — see
// lib/reverseGeocode.ts). Its project needs Geocoding API, Places API (New)
// and Routes API enabled.

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/** Per-lookup ceiling; the lead-endpoint pair is looked up in parallel under the same budget. */
export const GEO_TIMEOUT_MS = 5000;

export interface GeoPlace {
  lat: number;
  lng: number;
  /** ISO 3166-1 alpha-2, upper case. */
  countryCode: string | null;
  /** The country's English long name, e.g. "Ireland". */
  countryName: string | null;
  /** First-level administrative area long name, e.g. "England", "Lombardy". */
  adminArea: string | null;
  /** Google result types of the top result, e.g. ["locality", "political"]. */
  types: string[];
}

function apiKey(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null;
}

interface GeocodeComponent {
  long_name: string;
  short_name: string;
  types: string[];
}
interface GeocodeResult {
  address_components?: GeocodeComponent[];
  geometry?: { location?: { lat: number; lng: number } };
  types?: string[];
}

function fromGeocodeResult(r: GeocodeResult | undefined): GeoPlace | null {
  const loc = r?.geometry?.location;
  if (!r || !loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
  const comps = r.address_components ?? [];
  const country = comps.find((c) => c.types.includes("country"));
  const admin = comps.find((c) => c.types.includes("administrative_area_level_1"));
  return {
    lat: loc.lat,
    lng: loc.lng,
    countryCode: country?.short_name?.toUpperCase() ?? null,
    countryName: country?.long_name ?? null,
    adminArea: admin?.long_name ?? null,
    types: r.types ?? [],
  };
}

interface PlacesComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}
interface PlacesPlace {
  location?: { latitude?: number; longitude?: number };
  addressComponents?: PlacesComponent[];
  types?: string[];
}

function fromPlacesPlace(p: PlacesPlace | undefined): GeoPlace | null {
  const lat = p?.location?.latitude;
  const lng = p?.location?.longitude;
  if (!p || typeof lat !== "number" || typeof lng !== "number") return null;
  const comps = p.addressComponents ?? [];
  const country = comps.find((c) => c.types?.includes("country"));
  const admin = comps.find((c) => c.types?.includes("administrative_area_level_1"));
  return {
    lat,
    lng,
    countryCode: country?.shortText?.toUpperCase() ?? null,
    countryName: country?.longText ?? null,
    adminArea: admin?.longText ?? null,
    types: p.types ?? [],
  };
}

type GeocodeOutcome = { status: "ok"; place: GeoPlace } | { status: "zero" } | { status: "error" };

async function geocodeOnce(address: string, signal: AbortSignal): Promise<GeocodeOutcome> {
  const key = apiKey();
  if (!key) return { status: "error" };
  try {
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&language=en&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return { status: "error" };
    const data = (await res.json()) as { status?: string; results?: GeocodeResult[] };
    if (data.status === "ZERO_RESULTS") return { status: "zero" };
    if (data.status !== "OK") {
      console.error("geoLookup: Geocoding API status", data.status);
      return { status: "error" };
    }
    const place = fromGeocodeResult(data.results?.[0]);
    return place ? { status: "ok", place } : { status: "zero" };
  } catch (err) {
    if (!(err instanceof Error && err.name === "AbortError")) console.error("geoLookup: geocode failed:", err);
    return { status: "error" };
  }
}

/**
 * Places Text Search (New). `bias` softly prefers results near a point —
 * Google may still return something far away, so callers check distance
 * themselves before trusting a biased result.
 */
export async function placesTextSearch(
  query: string,
  signal: AbortSignal,
  bias?: { lat: number; lng: number; radiusMeters: number },
): Promise<GeoPlace | null> {
  const key = apiKey();
  if (!key || !query.trim()) return null;
  try {
    const res = await fetch(PLACES_SEARCH_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.location,places.addressComponents,places.types",
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "en",
        pageSize: 1,
        ...(bias
          ? {
              locationBias: {
                circle: {
                  center: { latitude: bias.lat, longitude: bias.lng },
                  radius: Math.min(Math.max(bias.radiusMeters, 1), 50000),
                },
              },
            }
          : {}),
      }),
    });
    if (!res.ok) {
      console.error("geoLookup: Places searchText returned", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return null;
    }
    const data = (await res.json()) as { places?: PlacesPlace[] };
    return fromPlacesPlace(data.places?.[0]);
  } catch (err) {
    if (!(err instanceof Error && err.name === "AbortError")) console.error("geoLookup: Places searchText failed:", err);
    return null;
  }
}

/** Geocoding API (language=en); on ZERO_RESULTS, Places Text Search (New). Null on any failure. */
export async function geocodePlace(address: string | null | undefined, signal: AbortSignal): Promise<GeoPlace | null> {
  const text = address?.trim();
  if (!text) return null;
  const first = await geocodeOnce(text, signal);
  if (first.status === "ok") return first.place;
  if (first.status === "zero") return placesTextSearch(text, signal);
  return null;
}

/** Reverse geocode restricted to result_type=country — the country containing a point. */
async function reverseCountry(lat: number, lng: number, signal: AbortSignal): Promise<GeoPlace | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const url = `${GEOCODE_URL}?latlng=${lat},${lng}&result_type=country&language=en&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string; results?: GeocodeResult[] };
    return data.status === "OK" ? fromGeocodeResult(data.results?.[0]) : null;
  } catch {
    return null;
  }
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Context-aware endpoint pair (Fix 2 — also used for routing geo, so a lead
// is routed by the same place its distance is measured to).
// ---------------------------------------------------------------------------

/** Above this straight-line gap, a pair is suspicious enough to re-check each end in the other's context. */
const SUSPICIOUS_GAP_KM = 150;
/** How close a context-biased re-resolution must land to the other end to be believed. */
const CONTEXT_RADIUS_KM = 50;

export interface EndpointPair {
  pickup: GeoPlace | null;
  destination: GeoPlace | null;
  /** Which end, if any, was re-resolved near the other one. */
  reResolved: "pickup" | "destination" | null;
}

/**
 * Resolves both ends of a move. Each address is first looked up on its own;
 * if they land implausibly far apart, each is re-searched with a location
 * bias around the other end — "Bergamo hotel" next to a resolved Bergamo
 * Airport finds the hotel in Bergamo, not one in Yerevan. A re-resolution is
 * only accepted if it lands within CONTEXT_RADIUS_KM of the other end, so a
 * genuinely long move (London → Edinburgh) keeps its independent results:
 * a bias is a preference, and Google still returns Edinburgh for
 * "Edinburgh". The destination is re-checked first (intake text is usually
 * vaguer at the drop-off end), then the pickup.
 */
export async function resolveEndpointPair(
  pickupText: string | null | undefined,
  destinationText: string | null | undefined,
  signal: AbortSignal,
): Promise<EndpointPair> {
  const [pickup, destination] = await Promise.all([geocodePlace(pickupText, signal), geocodePlace(destinationText, signal)]);
  if (!pickup || !destination || haversineKm(pickup, destination) <= SUSPICIOUS_GAP_KM) {
    return { pickup, destination, reResolved: null };
  }

  const bias = (p: GeoPlace) => ({ lat: p.lat, lng: p.lng, radiusMeters: CONTEXT_RADIUS_KM * 1000 });
  const [destNearPickup, pickupNearDest] = await Promise.all([
    destinationText ? placesTextSearch(destinationText, signal, bias(pickup)) : Promise.resolve(null),
    pickupText ? placesTextSearch(pickupText, signal, bias(destination)) : Promise.resolve(null),
  ]);

  if (destNearPickup && haversineKm(destNearPickup, pickup) <= CONTEXT_RADIUS_KM) {
    return { pickup, destination: destNearPickup, reResolved: "destination" };
  }
  if (pickupNearDest && haversineKm(pickupNearDest, destination) <= CONTEXT_RADIUS_KM) {
    return { pickup: pickupNearDest, destination, reResolved: "pickup" };
  }
  return { pickup, destination, reResolved: null };
}

// ---------------------------------------------------------------------------
// Lead endpoints → lead columns
// ---------------------------------------------------------------------------

export interface LeadGeoColumns {
  pickup_country_code: string | null;
  pickup_admin_area: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  destination_country_code: string | null;
  destination_admin_area: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
}

const EMPTY_LEAD_GEO: LeadGeoColumns = {
  pickup_country_code: null,
  pickup_admin_area: null,
  pickup_lat: null,
  pickup_lng: null,
  destination_country_code: null,
  destination_admin_area: null,
  destination_lat: null,
  destination_lng: null,
};

/**
 * Pickup + destination geo columns for a lead insert, both looked up in
 * parallel under one GEO_TIMEOUT_MS budget. All-null on any failure — the
 * route_lead() trigger then word-matches exactly as it did before.
 */
export async function resolveLeadGeo(pickupText: string | null | undefined, destinationText: string | null | undefined): Promise<LeadGeoColumns> {
  if (!apiKey() || (!pickupText?.trim() && !destinationText?.trim())) return EMPTY_LEAD_GEO;
  try {
    const { pickup, destination } = await resolveEndpointPair(pickupText, destinationText, AbortSignal.timeout(GEO_TIMEOUT_MS));
    return {
      pickup_country_code: pickup?.countryCode ?? null,
      pickup_admin_area: pickup?.countryCode ? pickup.adminArea : null,
      pickup_lat: pickup?.lat ?? null,
      pickup_lng: pickup?.lng ?? null,
      destination_country_code: destination?.countryCode ?? null,
      destination_admin_area: destination?.countryCode ? destination.adminArea : null,
      destination_lat: destination?.lat ?? null,
      destination_lng: destination?.lng ?? null,
    };
  } catch (err) {
    console.error("resolveLeadGeo failed:", err);
    return EMPTY_LEAD_GEO;
  }
}

// ---------------------------------------------------------------------------
// User region classification
// ---------------------------------------------------------------------------

export type RegionGeoType = "country" | "admin_area" | "locality";

export interface RegionClassification {
  geo_type: RegionGeoType | null;
  country_code: string | null;
  admin_area: string | null;
  lat: number | null;
  lng: number | null;
  radius_km: number | null;
}

export const DEFAULT_REGION_RADIUS_KM = 50;

const WORD_MATCH_TYPES = ["continent", "colloquial_area", "natural_feature"];

/**
 * Classifies a user region from Google's result types. Returns null when the
 * lookup itself failed (so the row stays unchecked and is retried later);
 * a classification with geo_type null means "checked — keep the word match"
 * (continents, colloquial areas like "Caribbean", unresolvable text).
 */
export async function classifyRegion(region: string, signal: AbortSignal): Promise<RegionClassification | null> {
  const text = region.trim();
  if (!text || !apiKey()) return null;

  const first = await geocodeOnce(text, signal);
  let place: GeoPlace | null = null;
  if (first.status === "ok") place = first.place;
  else if (first.status === "zero") place = await placesTextSearch(text, signal);
  else return null;

  const wordMatch: RegionClassification = { geo_type: null, country_code: null, admin_area: null, lat: null, lng: null, radius_km: null };
  if (!place) return wordMatch;

  const types = place.types;
  if (types.includes("country")) {
    return { ...wordMatch, geo_type: "country", country_code: place.countryCode };
  }
  if (types.includes("administrative_area_level_1")) {
    return { ...wordMatch, geo_type: place.countryCode && place.adminArea ? "admin_area" : null, country_code: place.countryCode, admin_area: place.adminArea };
  }
  if (types.some((t) => WORD_MATCH_TYPES.includes(t))) {
    // Google reads some country names as the landmass ("Ireland" → the
    // island, a natural_feature). Accept it as a country only when the
    // country at its centre is literally named the same as the region.
    if (types.includes("natural_feature")) {
      const country = await reverseCountry(place.lat, place.lng, signal);
      if (country?.countryCode && country.countryName && country.countryName.trim().toLowerCase() === text.toLowerCase()) {
        return { ...wordMatch, geo_type: "country", country_code: country.countryCode };
      }
    }
    return wordMatch;
  }
  return { ...wordMatch, geo_type: "locality", country_code: place.countryCode, lat: place.lat, lng: place.lng, radius_km: DEFAULT_REGION_RADIUS_KM };
}
