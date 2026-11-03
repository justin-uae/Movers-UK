"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export interface SpecialDealSettings {
  /** Automatically re-send a quote at a discount when the customer rejects it as "Too expensive". */
  autoEnabled: boolean;
  /** 1–90 (0114_special_deals.sql). */
  autoPercent: number;
}

export async function updateSpecialDealSettingsAction(input: SpecialDealSettings) {
  const actor = await requireProfile();
  // tenants_update RLS is Master Admin only (0001_foundation.sql).
  if (!actor.is_master_admin) return { error: "Only Master Admin can change this setting." };
  const percent = Math.round(Number(input.autoPercent) * 100) / 100;
  if (!Number.isFinite(percent) || percent < 1 || percent > 90) return { error: "Pick a discount between 1% and 90%." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({ special_deal_auto_enabled: input.autoEnabled, special_deal_auto_percent: percent })
    .eq("id", actor.tenant_id);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "special_deal_settings_updated",
    entityType: "tenant",
    entityId: actor.tenant_id,
    newValue: { autoEnabled: input.autoEnabled, autoPercent: percent },
  });

  revalidatePath("/settings/special-deals");
  return { error: null };
}
