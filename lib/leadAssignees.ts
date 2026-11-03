import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

export interface AssignableUser {
  id: string;
  full_name: string;
}

/**
 * Who a lead can actually be handed to — anyone who holds
 * enquiries.claim_open_leads (directly on their role, or via a per-user
 * grant override), the same permission that lets someone claim a lead for
 * themselves from the open pool. Permission-driven rather than a hardcoded
 * list of role names ("Sales User", "Sales Manager", ...), matching this
 * app's convention everywhere else (lib/permissionKeys.ts) — stays correct
 * if roles are renamed or a new sales-ish role is added later. A per-user
 * revoke override excludes someone even if their role grants it, mirroring
 * has_permission()'s own precedence (0001_foundation.sql).
 */
export async function getAssignableSalesUsers(supabase: SupabaseClient<Database>): Promise<AssignableUser[]> {
  const { data: perm } = await supabase.from("permissions").select("id").eq("key", "enquiries.claim_open_leads").maybeSingle();
  if (!perm) return [];

  const [{ data: roleLinks }, { data: overrides }, { data: profiles }] = await Promise.all([
    supabase.from("role_permissions").select("role_id").eq("permission_id", perm.id),
    supabase.from("user_permission_overrides").select("user_id, effect").eq("permission_id", perm.id),
    supabase.from("profiles").select("id, full_name, role_id, is_master_admin").eq("status", "active").order("full_name"),
  ]);

  const roleIds = new Set((roleLinks ?? []).map((r) => r.role_id));
  const grantedUserIds = new Set((overrides ?? []).filter((o) => o.effect === "grant").map((o) => o.user_id));
  const revokedUserIds = new Set((overrides ?? []).filter((o) => o.effect === "revoke").map((o) => o.user_id));

  return (profiles ?? []).filter((p) => {
    if (p.is_master_admin) return false; // bypasses every check, but isn't "a sales user" to hand a lead to
    if (grantedUserIds.has(p.id)) return true;
    if (revokedUserIds.has(p.id)) return false;
    return p.role_id !== null && roleIds.has(p.role_id);
  });
}
