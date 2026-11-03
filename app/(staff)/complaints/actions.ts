"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import type { ComplaintCategory, ServiceOpsSeverity, ServiceOpsStatus } from "@/lib/supabase/database.types";

async function requireCanManage() {
  const actor = await requireProfile();
  if (!(await hasPermission(actor, PERMISSIONS.COMPLAINTS_MANAGE))) {
    throw new Error("You do not have permission to manage complaints.");
  }
  return actor;
}

export interface FileComplaintInput {
  customerId: string | null;
  quoteId: string | null;
  category: ComplaintCategory;
  severity: ServiceOpsSeverity;
  description: string;
  assigneeId: string | null;
}

/** Anyone with workspace access can log a complaint — matching how a
    complaint is usually first heard (phone, email, in person), not just by
    whoever happens to hold the narrower COMPLAINTS_MANAGE permission. */
export async function fileComplaintAction(input: FileComplaintInput) {
  const actor = await requireProfile();
  if (!input.description.trim()) return { error: "Describe what happened." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("complaints")
    .insert({
      tenant_id: actor.tenant_id,
      customer_id: input.customerId,
      quote_id: input.quoteId,
      category: input.category,
      severity: input.severity,
      description: input.description.trim(),
      assigned_to: input.assigneeId,
      created_by: actor.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not file the complaint." };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "complaint_filed",
    entityType: "complaint",
    entityId: data.id,
    newValue: { category: input.category, severity: input.severity },
  });

  revalidatePath("/complaints");
  return { error: null };
}

export async function updateComplaintStatusAction(id: string, status: ServiceOpsStatus, resolutionNotes?: string) {
  const actor = await requireCanManage();
  const supabase = await createClient();

  const { data: complaint } = await supabase.from("complaints").select("status").eq("id", id).single();
  if (!complaint) throw new Error("Complaint not found.");

  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "resolved" || status === "closed") {
    updates.resolved_by = actor.id;
    updates.resolved_at = new Date().toISOString();
    if (resolutionNotes?.trim()) updates.resolution_notes = resolutionNotes.trim();
  }

  const { error } = await supabase.from("complaints").update(updates).eq("id", id);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "complaint_status_changed",
    entityType: "complaint",
    entityId: id,
    previousValue: { status: complaint.status },
    newValue: { status },
  });

  revalidatePath("/complaints");
}

export async function assignComplaintAction(id: string, assigneeId: string | null) {
  const actor = await requireCanManage();
  const supabase = await createClient();
  const { error } = await supabase
    .from("complaints")
    .update({ assigned_to: assigneeId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "complaint_assigned",
    entityType: "complaint",
    entityId: id,
    newValue: { assigneeId },
  });

  revalidatePath("/complaints");
}
