import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CustomerExperiencePage, type FeedbackRow } from "@/components/pages/CustomerExperiencePage";
import type { FeedbackCategory } from "@/lib/supabase/database.types";

interface FeedbackListRow {
  id: string;
  score: number | null;
  category: FeedbackCategory | null;
  comment: string | null;
  requested_at: string;
  submitted_at: string | null;
  follow_up_task_id: string | null;
  customers: { contact_name: string; company_name: string | null } | null;
  quotes: { quote_number: string } | null;
  tasks: { status: string } | null;
}

export default async function CustomerExperienceRoutePage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: feedbackRows }, { data: jobRows }] = await Promise.all([
    supabase
      .from("customer_feedback")
      .select(
        "id, score, category, comment, requested_at, submitted_at, follow_up_task_id, customers(contact_name, company_name), quotes(quote_number), tasks(status)",
      )
      .order("requested_at", { ascending: false }),
    supabase.from("jobs").select("customer_id").eq("status", "completed").not("customer_id", "is", null),
  ]);

  const rows = (feedbackRows ?? []) as unknown as FeedbackListRow[];
  const submitted = rows.filter((r) => r.submitted_at);

  const promoters = submitted.filter((r) => r.category === "promoter").length;
  const detractors = submitted.filter((r) => r.category === "detractor").length;
  const nps = submitted.length > 0 ? Math.round(((promoters - detractors) / submitted.length) * 100) : null;
  const responseRate = rows.length > 0 ? Math.round((submitted.length / rows.length) * 100) : null;

  const detractorFollowUps = submitted.filter((r) => r.category === "detractor" && r.follow_up_task_id);
  const resolvedFollowUps = detractorFollowUps.filter((r) => r.tasks?.status === "done");
  const complaintResolutionRate =
    detractorFollowUps.length > 0 ? Math.round((resolvedFollowUps.length / detractorFollowUps.length) * 100) : null;

  const jobsByCustomer = new Map<string, number>();
  for (const j of jobRows ?? []) {
    if (!j.customer_id) continue;
    jobsByCustomer.set(j.customer_id, (jobsByCustomer.get(j.customer_id) ?? 0) + 1);
  }
  const repeatCustomers = [...jobsByCustomer.values()].filter((count) => count > 1).length;
  const repeatBookingRate = jobsByCustomer.size > 0 ? Math.round((repeatCustomers / jobsByCustomer.size) * 100) : null;

  const feedbackRowsForUi: FeedbackRow[] = rows.map((r) => ({
    id: r.id,
    customerName: r.customers?.company_name || r.customers?.contact_name || "Unknown",
    quoteNumber: r.quotes?.quote_number ?? null,
    score: r.score,
    category: r.category,
    comment: r.comment,
    requestedAt: r.requested_at,
    submittedAt: r.submitted_at,
    followUpTaskId: r.follow_up_task_id,
    followUpDone: r.tasks?.status === "done",
  }));

  return (
    <CustomerExperiencePage
      rows={feedbackRowsForUi}
      nps={nps}
      responseRate={responseRate}
      complaintResolutionRate={complaintResolutionRate}
      repeatBookingRate={repeatBookingRate}
    />
  );
}
