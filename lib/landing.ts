import "server-only";
import { createClient } from "./supabase/server";
import { getGrantedPermissions } from "./permissions";
import { landingHref } from "@/components/layout/nav";
import type { Profile } from "./supabase/database.types";

/** Where to send a signed-in staff member with no more specific destination in mind — role-aware, so a role with a restricted nav (e.g. Finance Manager) never gets redirected to a page it can't see. */
export async function landingHrefForProfile(profile: Profile): Promise<string> {
  const supabase = await createClient();
  const [{ data: role }, granted] = await Promise.all([
    profile.role_id
      ? supabase.from("roles").select("name").eq("id", profile.role_id).single()
      : Promise.resolve({ data: null }),
    getGrantedPermissions(profile),
  ]);
  return landingHref(role?.name ?? null, profile.is_master_admin, granted);
}
