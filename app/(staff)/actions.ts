"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";

export async function signOut() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (profile) {
      await recordAudit({
        tenantId: profile.tenant_id,
        actorId: user.id,
        action: "logout",
        entityType: "session",
      });

      // login_history's own check constraint and RLS already expect a
      // 'logout' event (see login_history_select's session-duration intent,
      // 0001_foundation.sql:216-228) — nothing ever wrote one until now.
      await supabase.from("login_history").insert({
        tenant_id: profile.tenant_id,
        user_id: user.id,
        event: "logout",
      });
    }
  }

  await supabase.auth.signOut();
  redirect("/login");
}
