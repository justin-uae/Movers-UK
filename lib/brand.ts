import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { createAdminClient } from "./supabase/admin";
import type { Brand, Profile } from "./supabase/database.types";

const ACTIVE_BRAND_COOKIE = "gtc_active_brand";

/** Tag for a user's cached brand list — bust when their user_brands rows change. */
export const brandsUserTag = (userId: string) => `brands:${userId}`;

const fetchBrands = async (userId: string): Promise<Brand[]> => {
  // Service-role client: this runs inside unstable_cache, which can't read
  // cookies() (needed for the RLS-scoped client). The explicit .eq("user_id")
  // filter reproduces what the user_brands RLS policy already scoped to.
  const supabase = createAdminClient();
  const { data: brandLinks } = await supabase
    .from("user_brands")
    .select("brand_id, brands(*)")
    .eq("user_id", userId);

  return (brandLinks ?? []).map((row) => row.brands as unknown as Brand).filter(Boolean);
};

/**
 * Resolves the brand context for the current request: every brand the user
 * is authorised for, and which one is currently active. The active brand
 * drives quote/invoice identity, templates and reporting scope (Part 14) —
 * it is never implicit.
 *
 * The brand list is wrapped in unstable_cache so it survives across
 * navigations instead of re-querying on every tab click; React's cache()
 * still dedupes the cookie read within a single request. No time-based
 * revalidate — inviteUserAction (settings/users/actions.ts) tags on insert.
 * There's currently no UI to edit an existing user's brand access after
 * invite; if that's added later, it must call revalidateTag(brandsUserTag(...))
 * too, or that user's brand list will stay stale until the server restarts.
 */
export const getBrandContext = cache(async (
  profile: Profile,
): Promise<{
  brands: Brand[];
  activeBrandId: string | null;
}> => {
  const cached = unstable_cache(() => fetchBrands(profile.id), ["user-brands", profile.id], {
    tags: [brandsUserTag(profile.id)],
    revalidate: false,
  });
  const brands = await cached();

  const cookieStore = await cookies();
  const cookieBrandId = cookieStore.get(ACTIVE_BRAND_COOKIE)?.value ?? null;
  const activeBrandId =
    (cookieBrandId && brands.some((b) => b.id === cookieBrandId) ? cookieBrandId : null) ??
    profile.default_brand_id ??
    brands[0]?.id ??
    null;

  return { brands, activeBrandId };
});

export { ACTIVE_BRAND_COOKIE };
