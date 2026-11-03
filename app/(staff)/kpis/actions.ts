"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import type { TargetMetric } from "@/lib/supabase/database.types";

async function requireCanManage() {
  const actor = await requireProfile();
  if (!(await hasPermission(actor, PERMISSIONS.ADMIN_VIEW_AUDIT_LOGS))) {
    throw new Error("You do not have permission to set targets.");
  }
  return actor;
}

export async function setTargetAction(input: {
  profileId: string;
  metric: TargetMetric;
  periodMonth: string;
  targetValue: number;
}) {
  const actor = await requireCanManage();
  const supabase = await createClient();

  if (!Number.isFinite(input.targetValue) || input.targetValue < 0) {
    throw new Error("Target must be a positive number.");
  }

  const { data: existing } = await supabase
    .from("targets")
    .select("id")
    .eq("tenant_id", actor.tenant_id)
    .eq("profile_id", input.profileId)
    .eq("metric", input.metric)
    .eq("period_month", input.periodMonth)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("targets")
      .update({ target_value: input.targetValue, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("targets").insert({
      tenant_id: actor.tenant_id,
      profile_id: input.profileId,
      metric: input.metric,
      period_month: input.periodMonth,
      target_value: input.targetValue,
      created_by: actor.id,
    });
    if (error) throw new Error(error.message);
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "target_set",
    entityType: "target",
    entityId: input.profileId,
    newValue: { metric: input.metric, periodMonth: input.periodMonth, targetValue: input.targetValue },
  });

  revalidatePath("/kpis");
}

export async function deleteTargetAction(id: string) {
  const actor = await requireCanManage();
  const supabase = await createClient();

  const { error } = await supabase.from("targets").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "target_deleted",
    entityType: "target",
    entityId: id,
  });

  revalidatePath("/kpis");
}
