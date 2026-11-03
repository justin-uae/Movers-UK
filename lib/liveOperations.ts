import "server-only";
import { createAdminClient } from "./supabase/admin";
import { centroidForCode } from "./countryCentroids";
import { resolveCityCountryCode } from "./cityCountryLookup";
import type { CountryLeadCluster } from "@/components/pages/LiveOperationsMap";

interface LeadRow {
  pickup_text: string | null;
  destination_text: string | null;
}

/**
 * All of the tenant's leads (any status — new, assigned, converted, closed,
 * spam, ...; any assignee) grouped by country, for the dashboard live map —
 * one bubble per country sized by lead count.
 *
 * Uses the service-role client rather than the caller's own RLS-scoped
 * session on purpose: `leads_select`'s RLS policy only lets a staff member
 * see leads assigned to them (or that they have enquiries.view_all/
 * view_team for), so querying through the normal per-request client here
 * would silently shrink this tenant-wide ops overview down to just that one
 * viewer's own leads. Still explicitly scoped to `tenantId` below since the
 * service-role client bypasses RLS (and therefore tenant isolation) entirely.
 *
 * Deliberately ignores `customers.country` — that field is no longer
 * captured at entry and old rows carry stale/leftover values that would
 * mask the real country. Country is guessed purely from the lead's own
 * pickup/destination text instead (usually a bare city name, e.g. "Dubai",
 * "Manchester"). Leads that don't resolve to a known city are silently
 * skipped rather than plotted at (0, 0).
 */
export async function getLeadsByCountry(tenantId: string): Promise<CountryLeadCluster[]> {
  const { data, error } = await createAdminClient()
    .from("leads")
    .select("pickup_text, destination_text")
    .eq("tenant_id", tenantId)
    .limit(5000);

  if (error || !data) return [];

  const clusters = new Map<string, CountryLeadCluster>();
  for (const lead of data as unknown as LeadRow[]) {
    const code = resolveCityCountryCode(lead.pickup_text) ?? resolveCityCountryCode(lead.destination_text);
    const centroid = code ? centroidForCode(code) : null;
    if (!centroid) continue;

    const existing = clusters.get(centroid.code);
    if (existing) existing.count += 1;
    else clusters.set(centroid.code, { code: centroid.code, name: centroid.name, lat: centroid.lat, lng: centroid.lng, count: 1 });
  }

  return [...clusters.values()].sort((a, b) => b.count - a.count);
}
