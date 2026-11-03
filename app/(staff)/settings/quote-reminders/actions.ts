"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function updateQuoteRemindersSettingsAction(enabled: boolean) {
  const actor = await requireProfile();
  // tenants_update RLS is is_master_admin() only — mirrored here so the
  // error is readable instead of a silent no-op update.
  if (!actor.is_master_admin) {
    return { error: "Only Master Admin can change this setting." };
  }
  const supabase = await createClient();

  const { data: current } = await supabase.from("tenants").select("quote_reminders_enabled").eq("id", actor.tenant_id).single();

  // Stamp the backlog floor only on off -> on, same as ai_auto_quote_enabled_at
  // — every open quote's schedule counts from here, so switching on never
  // fires reminders that were "due" days ago all at once.
  const justEnabled = enabled && !current?.quote_reminders_enabled;

  const { error } = await supabase
    .from("tenants")
    .update({
      quote_reminders_enabled: enabled,
      ...(justEnabled ? { quote_reminders_enabled_at: new Date().toISOString() } : {}),
    })
    .eq("id", actor.tenant_id);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "quote_reminders_settings_updated",
    entityType: "tenant",
    entityId: actor.tenant_id,
    newValue: { enabled },
  });

  revalidatePath("/settings/quote-reminders");
  return { error: null };
}
