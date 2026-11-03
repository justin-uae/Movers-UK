import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile, Supplier } from "./supabase/database.types";

/**
 * `supabase.auth.getUser()` can throw — not just resolve with an `error`
 * field — when the refresh token in the session cookie is invalid (already
 * rotated, revoked, or just stale). Left unguarded, that crashes the whole
 * request with a raw AuthApiError stack trace instead of the intended "not
 * signed in" redirect. Treat any thrown error here the same as "no user",
 * and clear the now-dead session cookie so the next request doesn't hit the
 * same wall.
 */
async function getAuthUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    await supabase.auth.signOut().catch(() => {});
    return null;
  }
}

/**
 * Loads the signed-in user's profile (role, tenant, brand defaults, flags).
 * Redirects to /login if there is no session — call this at the top of any
 * (staff) Server Component/layout that requires auth.
 *
 * Wrapped in React.cache() so the several places that all need the profile
 * within one request (staff layout, settings layout, the page itself) share
 * a single Supabase round trip instead of repeating it per call — this is
 * request-scoped memoization, not a cross-request cache, so nothing needs
 * explicit invalidation when a profile changes.
 */
export const requireProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/login");
  }

  if (profile.status === "suspended" || profile.status === "disabled") {
    await supabase.auth.signOut();
    redirect("/login?reason=account_disabled");
  }

  return profile;
});

/**
 * Loads the signed-in supplier's row — the supplier-portal equivalent of
 * requireProfile(). A supplier account has no `profiles` row at all (it's a
 * separate identity space, see 0003_operations.sql); redirects to /login if
 * there's no session or no matching supplier.
 */
export const requireSupplier = cache(async (): Promise<Supplier> => {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data: supplier, error } = await supabase.from("suppliers").select("*").eq("id", user.id).single();

  if (error || !supplier) {
    redirect("/login");
  }

  if (supplier.status === "suspended" || supplier.status === "rejected") {
    await supabase.auth.signOut();
    redirect("/login?reason=account_disabled");
  }

  return supplier;
});

/** Non-redirecting variant for places that can render a fallback instead. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile ?? null;
});
