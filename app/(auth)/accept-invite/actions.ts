"use server";

import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { landingHrefForProfile } from "@/lib/landing";

export async function activateAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your invite link has expired. Ask an administrator to resend it.", redirectTo: null };
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  if (profile) {
    await supabase
      .from("profiles")
      .update({ status: "active", requires_password_reset: false })
      .eq("id", user.id);

    await recordAudit({
      tenantId: profile.tenant_id,
      actorId: user.id,
      action: "account_activated",
      entityType: "profile",
      entityId: user.id,
      previousValue: { status: profile.status },
      newValue: { status: "active" },
    });

    // profile.status is still the pre-update value here (activation flips it
    // to "active", but the granted-permissions computation only depends on
    // role_id/is_master_admin, unaffected by status) — safe to compute the
    // landing href from this same row.
    return { error: null, redirectTo: await landingHrefForProfile(profile) };
  }

  // Not a staff profile — this invite might belong to the separate supplier
  // identity space (0003_operations.sql), which shares this same page. A
  // supplier's `status` tracks verification/approval, not account
  // activation, so there's nothing to flip here beyond the audit entry —
  // they land on Settings to fill in their business details next.
  const { data: supplier } = await supabase.from("suppliers").select("tenant_id, status").eq("id", user.id).single();

  if (supplier) {
    await recordAudit({
      tenantId: supplier.tenant_id,
      actorId: user.id,
      action: "supplier_account_activated",
      entityType: "supplier",
      entityId: user.id,
    });

    return { error: null, redirectTo: "/supplier/settings" };
  }

  return { error: "No account found for this invite.", redirectTo: null };
}
