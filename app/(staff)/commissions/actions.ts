"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

async function requireCanManage() {
  const actor = await requireProfile();
  if (!(await hasPermission(actor, PERMISSIONS.FINANCE_APPROVE_COMMISSIONS))) {
    throw new Error("You do not have permission to manage commissions.");
  }
  return actor;
}

export async function approveCommissionAction(commissionId: string) {
  const actor = await requireCanManage();
  const supabase = await createClient();

  const { data: commission } = await supabase.from("commissions").select("status").eq("id", commissionId).single();
  if (!commission || commission.status !== "pending_approval") {
    throw new Error("This commission cannot be approved right now.");
  }

  const { error } = await supabase
    .from("commissions")
    .update({ status: "approved", approved_by: actor.id, approved_at: new Date().toISOString() })
    .eq("id", commissionId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "commission_approved",
    entityType: "commission",
    entityId: commissionId,
    previousValue: { status: commission.status },
    newValue: { status: "approved" },
  });

  revalidatePath("/commissions");
}

export async function markCommissionPaidAction(commissionId: string, payrollReference: string) {
  const actor = await requireCanManage();
  const supabase = await createClient();

  const { data: commission } = await supabase.from("commissions").select("status").eq("id", commissionId).single();
  if (!commission || commission.status !== "approved") {
    throw new Error("This commission must be approved before it can be marked paid.");
  }

  const { error } = await supabase
    .from("commissions")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payroll_reference: payrollReference.trim() || null,
    })
    .eq("id", commissionId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "commission_paid",
    entityType: "commission",
    entityId: commissionId,
    previousValue: { status: commission.status },
    newValue: { status: "paid", payrollReference: payrollReference.trim() || null },
  });

  revalidatePath("/commissions");
}

export async function reverseCommissionAction(commissionId: string, reason: string) {
  const actor = await requireCanManage();
  const supabase = await createClient();

  if (!reason.trim()) throw new Error("A reason is required to reverse a commission.");

  const { data: commission } = await supabase.from("commissions").select("status").eq("id", commissionId).single();
  if (!commission || !["approved", "paid"].includes(commission.status)) {
    throw new Error("Only an approved or paid commission can be reversed.");
  }

  const { error } = await supabase
    .from("commissions")
    .update({
      status: "reversed",
      reversed_by: actor.id,
      reversed_at: new Date().toISOString(),
      reversed_reason: reason.trim(),
    })
    .eq("id", commissionId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "commission_reversed",
    entityType: "commission",
    entityId: commissionId,
    previousValue: { status: commission.status },
    newValue: { status: "reversed" },
    reason: reason.trim(),
  });

  revalidatePath("/commissions");
}

/** Upserts a rate override for `profileId`, or the tenant default when `profileId` is null. */
export async function setCommissionRateAction(profileId: string | null, ratePercent: number) {
  const actor = await requireCanManage();
  const supabase = await createClient();

  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new Error("Rate must be between 0 and 100.");
  }

  let existingQuery = supabase.from("commission_plans").select("id").eq("tenant_id", actor.tenant_id);
  existingQuery = profileId ? existingQuery.eq("profile_id", profileId) : existingQuery.is("profile_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("commission_plans")
      .update({ rate_percent: ratePercent, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("commission_plans").insert({
      tenant_id: actor.tenant_id,
      profile_id: profileId,
      rate_percent: ratePercent,
    });
    if (error) throw new Error(error.message);
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "commission_rate_updated",
    entityType: "commission_plan",
    entityId: profileId ?? undefined,
    newValue: { profileId, ratePercent },
  });

  revalidatePath("/commissions");
}
