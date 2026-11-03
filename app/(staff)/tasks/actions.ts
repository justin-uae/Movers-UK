"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import type { TaskChecklistItem, TaskPriority, TaskStatus } from "@/lib/supabase/database.types";

interface TaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeId: string | null;
  checklist: TaskChecklistItem[];
  customerId: string | null;
  supplierId: string | null;
  quoteId: string | null;
}

export async function createTaskAction(input: TaskInput) {
  const actor = await requireProfile();
  const supabase = await createClient();

  if (!input.title.trim()) throw new Error("Give the task a title.");

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      tenant_id: actor.tenant_id,
      title: input.title.trim(),
      description: input.description.trim() || null,
      priority: input.priority,
      due_date: input.dueDate,
      assignee_id: input.assigneeId,
      created_by: actor.id,
      checklist: input.checklist,
      customer_id: input.customerId,
      supplier_id: input.supplierId,
      quote_id: input.quoteId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "task_created",
    entityType: "task",
    entityId: data.id,
    newValue: { title: input.title, priority: input.priority },
  });

  revalidatePath("/tasks");
}

export async function updateTaskAction(id: string, input: TaskInput) {
  const actor = await requireProfile();
  const supabase = await createClient();

  if (!input.title.trim()) throw new Error("Give the task a title.");

  const { error } = await supabase
    .from("tasks")
    .update({
      title: input.title.trim(),
      description: input.description.trim() || null,
      priority: input.priority,
      due_date: input.dueDate,
      assignee_id: input.assigneeId,
      checklist: input.checklist,
      customer_id: input.customerId,
      supplier_id: input.supplierId,
      quote_id: input.quoteId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "task_updated",
    entityType: "task",
    entityId: id,
    newValue: { title: input.title, priority: input.priority },
  });

  revalidatePath("/tasks");
}

export async function setTaskStatusAction(id: string, status: TaskStatus) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase
    .from("tasks")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "task_status_changed",
    entityType: "task",
    entityId: id,
    newValue: { status },
  });

  revalidatePath("/tasks");
}

export async function deleteTaskAction(id: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const { data: task } = await supabase.from("tasks").select("title").eq("id", id).single();
  if (!task) throw new Error("Task not found.");

  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "task_deleted",
    entityType: "task",
    entityId: id,
    previousValue: { title: task.title },
  });

  revalidatePath("/tasks");
}
