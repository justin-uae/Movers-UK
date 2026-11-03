import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import type { Profile } from "./supabase/database.types";

export { PERMISSIONS, ADMIN_SURFACE_PERMISSIONS, type PermissionKey } from "./permissionKeys";
import { PERMISSIONS, type PermissionKey } from "./permissionKeys";

/**
 * Checks a single permission for the current session via the database
 * `has_permission()` function (role grant minus/plus per-user overrides).
 * Master Admins always pass without a round trip.
 *
 * Cached per (profile, key) for the lifetime of the request — the same
 * permission is often checked from both a layout (nav gating) and the page
 * it wraps.
 */
export const hasPermission = cache(async (profile: Profile, key: PermissionKey): Promise<boolean> => {
  if (profile.is_master_admin) return true;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    permission_key: key,
  });

  if (error) return false;
  return Boolean(data);
});

/** Tag for the cached permission set of a single user — bust on role/override change for that user. */
export const permissionsUserTag = (userId: string) => `permissions:user:${userId}`;
/** Tag shared by every user on a role — bust once when the role's grants change instead of per-user. */
export const permissionsRoleTag = (roleId: string) => `permissions:role:${roleId}`;

const fetchGrantedPermissions = async (profile: Profile): Promise<PermissionKey[]> => {
  // Uses the service-role client rather than the cookie-scoped one: this
  // function runs inside unstable_cache, which forbids reading request-only
  // APIs like cookies() (createClient() reads cookies() to attach the
  // session). The explicit .eq() filters below reproduce what RLS would
  // have scoped anyway (a user's own role's grants, their own overrides),
  // so bypassing RLS here doesn't widen what's returned.
  const supabase = createAdminClient();
  const [{ data: roleGrants }, { data: overrides }] = await Promise.all([
    profile.role_id
      ? supabase.from("role_permissions").select("permissions(key)").eq("role_id", profile.role_id)
      : Promise.resolve({ data: [] as { permissions: { key: string } | null }[] }),
    supabase.from("user_permission_overrides").select("effect, permissions(key)").eq("user_id", profile.id),
  ]);

  const granted = new Set<string>();
  for (const row of roleGrants ?? []) {
    const key = (row.permissions as unknown as { key: string } | null)?.key;
    if (key) granted.add(key);
  }
  for (const row of overrides ?? []) {
    const key = (row.permissions as unknown as { key: string } | null)?.key;
    if (!key) continue;
    if (row.effect === "grant") granted.add(key);
    else granted.delete(key);
  }

  return [...granted] as PermissionKey[];
};

/**
 * Every permission key currently granted to the signed-in user — role
 * grants plus/minus per-user overrides, mirroring has_permission()'s SQL in
 * a single round trip instead of one RPC call per key. Used to filter the
 * sidebar and gate whole route groups (e.g. /settings) without N+1 checks.
 *
 * The DB fetch is wrapped in unstable_cache so it survives across
 * navigations (React's cache() alone only dedupes within one request, so
 * every tab click was re-running these two queries). No time-based
 * revalidate — every mutation path that can change a granted permission
 * (settings/roles/actions.ts, settings/users/actions.ts) calls revalidateTag
 * on write, so the cache never needs to expire on its own. If a permission
 * is ever changed outside those two actions (a direct DB edit, a future
 * admin feature that forgets to tag), it won't be picked up until the
 * server restarts — the tradeoff for zero background refetching.
 */
export const getGrantedPermissions = cache(async (profile: Profile): Promise<Set<PermissionKey>> => {
  if (profile.is_master_admin) return new Set(Object.values(PERMISSIONS));

  const cached = unstable_cache(() => fetchGrantedPermissions(profile), ["granted-permissions", profile.id], {
    tags: [permissionsUserTag(profile.id), ...(profile.role_id ? [permissionsRoleTag(profile.role_id)] : [])],
    revalidate: false,
  });

  return new Set(await cached());
});
