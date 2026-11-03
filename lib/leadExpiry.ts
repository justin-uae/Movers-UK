import type { createClient } from "@/lib/supabase/server";

/**
 * Lazily moves open-pool leads whose pickup date has passed to "expired" —
 * they can no longer be served, so they shouldn't sit in the pool for someone
 * to claim. Like healExpiredQuotes there's no scheduled job: it runs whenever
 * Customer Leads or Lost Booking loads. A lead with a return trip stays live
 * until the return date has passed too, and leads with no travel date are
 * never expired. Best-effort — RLS may silently no-op it for a viewer who
 * can't update leads, and the next eligible visitor will heal it.
 */
export async function healExpiredLeads(supabase: Awaited<ReturnType<typeof createClient>>) {
  const today = new Date().toISOString().slice(0, 10);
  await supabase
    .from("leads")
    .update({ status: "expired" })
    .eq("status", "open_pool")
    .lt("travel_date", today)
    .or(`return_date.is.null,return_date.lt.${today}`);
}
