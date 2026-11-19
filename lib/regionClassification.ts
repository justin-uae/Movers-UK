import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { classifyRegion, GEO_TIMEOUT_MS, resolveLeadGeo, type LeadGeoColumns } from "./geoLookup";

type AdminClient = SupabaseClient<Database>;

/** Cap per call, so a tenant with many legacy regions is classified over a few page loads / intakes, not all at once. */
const MAX_PER_CALL = 15;

interface PendingRegion {
  id: string;
  region: string;
  lat: number | null;
  lng: number | null;
}

/**
 * Classifies (once) any of the tenant's user regions that haven't been checked
 * yet — see 0122_geo_lead_routing.sql. Must be given the service-role client:
 * there's no update policy on user_regions for regular users.
 *
 * Fail-open and silent: if migration 0122 isn't applied (the geo columns
 * don't exist), Google fails, or anything else goes wrong, it just returns
 * and routing keeps word-matching those regions. A region whose lookup
 * failed stays unchecked and is retried next time.
 */
export async function classifyPendingRegions(admin: AdminClient, tenantId: string, onlyRegionIds?: string[]): Promise<void> {
  try {
    let query = admin
      .from("user_regions")
      .select("id, region, lat, lng, profiles!inner(tenant_id)")
      .is("geo_checked_at", null)
      .eq("profiles.tenant_id", tenantId)
      .limit(MAX_PER_CALL);
    if (onlyRegionIds?.length) query = query.in("id", onlyRegionIds);
    const { data, error } = await query;
    if (error || !data?.length) return;

    const signal = AbortSignal.timeout(GEO_TIMEOUT_MS);
    await Promise.all(
      (data as unknown as PendingRegion[]).map(async (row) => {
        const result = await classifyRegion(row.region, signal);
        if (!result) return; // lookup failed — leave unchecked, retry later
        // Coordinates picked on the region map are what the person actually
        // meant — keep them over Google's centre point for the same text.
        const lat = result.geo_type === "locality" ? (row.lat ?? result.lat) : row.lat;
        const lng = result.geo_type === "locality" ? (row.lng ?? result.lng) : row.lng;
        const { error: updateError } = await admin
          .from("user_regions")
          .update({
            geo_type: result.geo_type,
            country_code: result.country_code,
            admin_area: result.admin_area,
            radius_km: result.radius_km,
            lat,
            lng,
            geo_checked_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (updateError) console.error("classifyPendingRegions: update failed:", updateError.message);
      }),
    );
  } catch (err) {
    console.error("classifyPendingRegions failed:", err);
  }
}

/**
 * Everything a routed lead insert needs before it runs, in parallel: the
 * pickup/destination geo columns to spread into the insert, plus a lazy pass
 * over the tenant's unclassified regions so route_lead() can match them
 * geographically. Never throws; all-null geo on failure.
 */
export async function prepareLeadRouting(
  admin: AdminClient,
  tenantId: string,
  pickupText: string | null | undefined,
  destinationText: string | null | undefined,
): Promise<LeadGeoColumns> {
  const [geo] = await Promise.all([resolveLeadGeo(pickupText, destinationText), classifyPendingRegions(admin, tenantId)]);
  return geo;
}
