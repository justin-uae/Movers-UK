import type { createClient } from "@/lib/supabase/server";

/**
 * Lazily flips quotes past their expiry_at from sent/viewed to expired.
 * There's no scheduled job for this — it just runs whenever Pending Quotes
 * or Lost Booking is loaded, so a quote can lag behind its real expiry until
 * someone opens one of those pages. Drafts are excluded: they were never
 * shown to the customer, so they haven't "expired" against a customer-facing
 * clock. Best-effort — RLS may silently no-op this for a viewer without
 * quotes.edit/send/cancel, which is fine since the next eligible visitor
 * will heal it.
 */
export async function healExpiredQuotes(supabase: Awaited<ReturnType<typeof createClient>>) {
  await supabase
    .from("quotes")
    .update({ status: "expired" })
    .in("status", ["sent", "viewed"])
    .lt("expiry_at", new Date().toISOString());
}

/** Statuses whose expiry still means something (changeQuoteExpiryAction, app/(staff)/quotes/expiryActions.ts) — once accepted/paid/rejected/cancelled it no longer applies. */
export const EXPIRY_EDITABLE_STATUSES: string[] = ["draft", "sent", "viewed", "expired"];
