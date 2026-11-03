"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, permissionsRoleTag, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

async function requireRoleManager() {
  const profile = await requireProfile();
  const allowed = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_ROLES);
  if (!allowed) throw new Error("You do not have permission to manage roles.");
  return profile;
}

export async function createRoleAction(_prevState: { error: string | null }, formData: FormData) {
  const actor = await requireRoleManager();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) return { error: "Role name is required." };

  const supabase = await createClient();
  const { data: role, error } = await supabase
    .from("roles")
    .insert({ tenant_id: actor.tenant_id, name, description, is_system: false })
    .select()
    .single();

  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "role_created",
    entityType: "role",
    entityId: role.id,
    newValue: { name },
  });

  revalidatePath("/settings/roles");
  return { error: null };
}

/**
 * ADM-02: the permission grid batches every checkbox change locally and
 * commits them in one Save — unlike other admin toggles in this app that
 * still save immediately, a role's permission set is the one place a
 * half-finished edit (a manager unticking several sensitive keys mid-review)
 * is dangerous to apply one checkbox at a time. `nextPermissionIds` is the
 * full desired set; this diffs it against what's actually granted today
 * rather than trusting the client's idea of "before" for that diff.
 */
export async function savePermissionsAction(roleId: string, nextPermissionIds: string[]) {
  const actor = await requireRoleManager();
  const supabase = await createClient();

  const { data: role } = await supabase.from("roles").select("tenant_id, name").eq("id", roleId).single();
  if (!role || role.tenant_id !== actor.tenant_id) throw new Error("Role not found.");

  const { data: currentRows } = await supabase.from("role_permissions").select("permission_id").eq("role_id", roleId);
  const currentIds = new Set((currentRows ?? []).map((r) => r.permission_id));
  const nextIds = new Set(nextPermissionIds);

  const toAdd = [...nextIds].filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !nextIds.has(id));

  if (toAdd.length === 0 && toRemove.length === 0) return;

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("role_permissions")
      .insert(toAdd.map((permission_id) => ({ role_id: roleId, permission_id })));
    if (error) throw new Error(error.message);
  }
  if (toRemove.length > 0) {
    const { error } = await supabase.from("role_permissions").delete().eq("role_id", roleId).in("permission_id", toRemove);
    if (error) throw new Error(error.message);
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "permissions_updated",
    entityType: "role",
    entityId: roleId,
    previousValue: { permissionIds: [...currentIds] },
    newValue: { permissionIds: [...nextIds], granted: toAdd, revoked: toRemove },
  });

  // { expire: 0 } forces immediate invalidation (Next 16 requires a second
  // arg on revalidateTag; this is the non-deprecated equivalent of the old
  // single-arg call) — a revoked permission must take effect right away.
  revalidateTag(permissionsRoleTag(roleId), { expire: 0 });
  revalidatePath(`/settings/roles/${roleId}`);
}
