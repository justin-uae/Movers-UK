"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import type { WhatsAppTakeoverSettings } from "@/lib/whatsappConversations";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function updateWhatsAppTakeoverSettingsAction(input: WhatsAppTakeoverSettings) {
  const actor = await requireProfile();
  // tenants_update RLS is Master Admin only (0001_foundation.sql).
  if (!actor.is_master_admin) return { error: "Only Master Admin can change this setting." };

  if (!TIME_RE.test(input.start) || !TIME_RE.test(input.end)) return { error: "Enter a start and end time." };
  if (input.start === input.end) return { error: "Start and end time can't be the same." };
  const days = [...new Set(input.days)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort();
  if (input.enabled && days.length === 0) return { error: "Pick at least one day." };
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: input.timezone });
  } catch {
    return { error: "Pick a valid timezone." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      whatsapp_takeover_enabled: input.enabled,
      whatsapp_takeover_start: input.start,
      whatsapp_takeover_end: input.end,
      whatsapp_takeover_days: days,
      whatsapp_takeover_timezone: input.timezone,
    })
    .eq("id", actor.tenant_id);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "whatsapp_takeover_settings_updated",
    entityType: "tenant",
    entityId: actor.tenant_id,
    newValue: { ...input, days },
  });

  revalidatePath("/settings/whatsapp-takeover");
  revalidatePath("/", "layout");
  return { error: null };
}
