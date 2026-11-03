"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import type { IncidentCategory, ServiceOpsSeverity, ServiceOpsStatus } from "@/lib/supabase/database.types";

async function requireCanManage() {
  const actor = await requireProfile();
  if (!(await hasPermission(actor, PERMISSIONS.INCIDENTS_MANAGE))) {
    throw new Error("You do not have permission to manage incidents.");
  }
  return actor;
}

export interface LogIncidentInput {
  jobId: string | null;
  quoteId: string | null;
  supplierId: string | null;
  category: IncidentCategory;
  severity: ServiceOpsSeverity;
  description: string;
  assigneeId: string | null;
}

/** Anyone with workspace access can log an incident — usually the person
    who first hears about it (dispatch, a driver's call, a customer email),
    not necessarily whoever holds the narrower INCIDENTS_MANAGE permission. */
export async function logIncidentAction(input: LogIncidentInput) {
  const actor = await requireProfile();
  if (!input.description.trim()) return { error: "Describe what happened." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incidents")
    .insert({
      tenant_id: actor.tenant_id,
      job_id: input.jobId,
      quote_id: input.quoteId,
      supplier_id: input.supplierId,
      category: input.category,
      severity: input.severity,
      description: input.description.trim(),
      assigned_to: input.assigneeId,
      created_by: actor.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not log the incident." };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "incident_logged",
    entityType: "incident",
    entityId: data.id,
    newValue: { category: input.category, severity: input.severity },
  });

  revalidatePath("/incidents");
  return { error: null };
}

export async function updateIncidentStatusAction(id: string, status: ServiceOpsStatus, resolutionNotes?: string) {
  const actor = await requireCanManage();
  const supabase = await createClient();

  const { data: incident } = await supabase.from("incidents").select("status").eq("id", id).single();
  if (!incident) throw new Error("Incident not found.");

  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "resolved" || status === "closed") {
    updates.resolved_by = actor.id;
    updates.resolved_at = new Date().toISOString();
    if (resolutionNotes?.trim()) updates.resolution_notes = resolutionNotes.trim();
  }

  const { error } = await supabase.from("incidents").update(updates).eq("id", id);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "incident_status_changed",
    entityType: "incident",
    entityId: id,
    previousValue: { status: incident.status },
    newValue: { status },
  });

  revalidatePath("/incidents");
}

export async function assignIncidentAction(id: string, assigneeId: string | null) {
  const actor = await requireCanManage();
  const supabase = await createClient();
  const { error } = await supabase
    .from("incidents")
    .update({ assigned_to: assigneeId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "incident_assigned",
    entityType: "incident",
    entityId: id,
    newValue: { assigneeId },
  });

  revalidatePath("/incidents");
}
