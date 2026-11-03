import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTemplatedEmail } from "@/lib/emailTemplates";
import type { Database } from "@/lib/supabase/database.types";

interface JobForFeedback {
  id: string;
  tenant_id: string;
  quote_id: string;
  customer_id: string | null;
  quotes: {
    customers: { email: string | null; contact_name: string; company_name: string | null } | null;
    brands: { name: string } | null;
  } | null;
}

/**
 * Creates the one-per-job feedback request and emails the customer a public,
 * no-login link (same public_token idiom as /q/[token]). Runs on the admin
 * (service-role) client — called from completeJobAction, a supplier-session
 * context with no RLS access to this table. Silently no-ops if the job can't
 * be found; email failures are swallowed by sendTemplatedEmail itself, same
 * as every other automatic trigger in this app.
 */
export async function createFeedbackRequest(admin: SupabaseClient<Database>, jobId: string) {
  const { data: job } = await admin
    .from("jobs")
    .select("id, tenant_id, quote_id, customer_id, quotes(customers(email, contact_name, company_name), brands(name))")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return;
  const typedJob = job as unknown as JobForFeedback;

  const { data: feedback, error } = await admin
    .from("customer_feedback")
    .insert({
      tenant_id: typedJob.tenant_id,
      job_id: typedJob.id,
      quote_id: typedJob.quote_id,
      customer_id: typedJob.customer_id,
    })
    .select("public_token")
    .single();
  if (error || !feedback) return;

  const customer = typedJob.quotes?.customers ?? null;
  await sendTemplatedEmail(admin, {
    tenantId: typedJob.tenant_id,
    key: "feedback_request",
    to: customer?.email,
    variables: {
      customer_name: customer?.company_name || customer?.contact_name || "there",
      brand_name: typedJob.quotes?.brands?.name ?? "",
      link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/feedback/${feedback.public_token}`,
    },
  });
}
