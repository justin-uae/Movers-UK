import { notFound } from "next/navigation";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { PermissionGrid } from "./PermissionGrid";

export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const canManage = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_ROLES);

  const [{ data: role }, { data: permissions }, { data: grants }] = await Promise.all([
    supabase.from("roles").select("*").eq("id", id).single(),
    supabase.from("permissions").select("id, key, category, description").order("category").order("key"),
    supabase.from("role_permissions").select("permission_id").eq("role_id", id),
  ]);

  if (!role) notFound();

  const grantedIds = new Set((grants ?? []).map((g) => g.permission_id));
  const categories = (permissions ?? []).reduce<Record<string, { id: string; key: string; description: string | null }[]>>(
    (acc, perm) => {
      (acc[perm.category] ??= []).push(perm);
      return acc;
    },
    {},
  );

  return (
    <div>
      <PageHead
        eyebrow="Roles & Permissions"
        title={role.name}
        text={role.is_system ? "System role — permissions can still be adjusted for this tenant." : "Custom role."}
      />
      <Panel>
        <PermissionGrid roleId={role.id} categories={categories} grantedIds={grantedIds} readOnly={!canManage} />
      </Panel>
    </div>
  );
}
