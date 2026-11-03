"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { FeedbackCategory } from "@/lib/supabase/database.types";

function categorize(score: number): FeedbackCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export async function submitFeedbackAction(token: string, score: number, comment: string) {
  const admin = createAdminClient();

  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return { error: "Choose a score between 0 and 10." };
  }

  const { data: feedback } = await admin
    .from("customer_feedback")
    .select("id, tenant_id, submitted_at, quote_id, customer_id, quotes(created_by), customers(contact_name, company_name)")
    .eq("public_token", token)
    .maybeSingle();
  if (!feedback) return { error: "This feedback link is not valid." };
  if (feedback.submitted_at) return { error: "This feedback has already been submitted." };

  const category = categorize(score);
  const trimmedComment = comment.trim() || null;

  const { error } = await admin
    .from("customer_feedback")
    .update({ submitted_at: new Date().toISOString(), score, category, comment: trimmedComment })
    .eq("id", feedback.id);
  if (error) return { error: error.message };

  if (category === "detractor") {
    const quote = feedback.quotes as unknown as { created_by: string | null } | null;
    const customer = feedback.customers as unknown as { contact_name: string; company_name: string | null } | null;
    const customerLabel = customer?.company_name || customer?.contact_name || "a customer";
    const dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: task } = await admin
      .from("tasks")
      .insert({
        tenant_id: feedback.tenant_id,
        title: `Follow up: low feedback from ${customerLabel}`,
        description: trimmedComment,
        priority: "high",
        due_date: dueDate,
        assignee_id: quote?.created_by ?? null,
        created_by: quote?.created_by ?? null,
        customer_id: feedback.customer_id,
        quote_id: feedback.quote_id,
      })
      .select("id")
      .single();

    if (task) {
      await admin.from("customer_feedback").update({ follow_up_task_id: task.id }).eq("id", feedback.id);
    }
  }

  return { error: null };
}
