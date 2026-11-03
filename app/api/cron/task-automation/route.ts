import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/formatDate";

// Render Cron Job hits this on a schedule (render.yaml) — sweeps for four
// automated task triggers (TSK-02): quote follow-up, payment due, supplier
// confirmation, and travel prep. Every insert is tagged tasks.source so a
// re-run never creates a duplicate for the same record (see hasOpenTask) —
// a task a staff member has actioned (done/cancelled) is fair game to
// recreate if the underlying condition is still true, since that reflects a
// fresh problem, not a repeat of the one they already closed.

const QUOTE_FOLLOWUP_DAYS = 3;
const PAYMENT_DUE_LEAD_DAYS = 2;
const SUPPLIER_CONFIRMATION_HOURS = 24;
const TRAVEL_PREP_LEAD_DAYS = 3;

type Admin = ReturnType<typeof createAdminClient>;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysFromNowIso(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function hasOpenTask(admin: Admin, source: string, quoteId: string, supplierId?: string | null) {
  let query = admin
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("source", source)
    .eq("quote_id", quoteId)
    .not("status", "in", "(done,cancelled)");
  if (supplierId) query = query.eq("supplier_id", supplierId);
  const { count } = await query;
  return (count ?? 0) > 0;
}

interface EnquiryOwner {
  assigned_user_id: string | null;
}

/** Quote follow-up: sent/viewed for QUOTE_FOLLOWUP_DAYS+ with no decision yet. */
async function runQuoteFollowUp(admin: Admin) {
  const cutoff = new Date(Date.now() - QUOTE_FOLLOWUP_DAYS * 86400000).toISOString();
  const { data: quotes } = await admin
    .from("quotes")
    .select("id, tenant_id, quote_number, customer_id, created_by, sent_at, customers(company_name, contact_name), enquiries(assigned_user_id)")
    .in("status", ["sent", "viewed"])
    .lte("sent_at", cutoff);

  let created = 0;
  for (const q of quotes ?? []) {
    if (await hasOpenTask(admin, "quote_followup", q.id)) continue;
    const enquiry = q.enquiries as unknown as EnquiryOwner | null;
    const customer = q.customers as unknown as { company_name: string | null; contact_name: string } | null;
    const assigneeId = enquiry?.assigned_user_id ?? q.created_by ?? null;
    const { error } = await admin.from("tasks").insert({
      tenant_id: q.tenant_id,
      title: `Follow up on quote ${q.quote_number}`,
      description: `Sent to ${customer?.company_name || customer?.contact_name || "the customer"}${q.sent_at ? ` on ${formatDate(q.sent_at)}` : ""} with no decision yet.`,
      priority: "medium",
      due_date: todayIso(),
      assignee_id: assigneeId,
      created_by: assigneeId,
      customer_id: q.customer_id,
      quote_id: q.id,
      source: "quote_followup",
    });
    if (!error) created++;
  }
  return created;
}

/** Payment due: an accepted/partially-paid quote has a milestone due soon. */
async function runPaymentDue(admin: Admin) {
  const soon = daysFromNowIso(PAYMENT_DUE_LEAD_DAYS);
  const { data: quotes } = await admin
    .from("quotes")
    .select(
      "id, tenant_id, quote_number, customer_id, created_by, enquiries(assigned_user_id), quote_payment_milestones(label, amount, due_date)",
    )
    .in("status", ["accepted", "partially_paid"]);

  let created = 0;
  for (const q of quotes ?? []) {
    const milestones = (q.quote_payment_milestones as unknown as { label: string; amount: number; due_date: string | null }[]) ?? [];
    const upcoming = milestones
      .filter((m) => m.due_date && m.due_date <= soon)
      .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))[0];
    if (!upcoming) continue;
    if (await hasOpenTask(admin, "payment_due", q.id)) continue;

    const enquiry = q.enquiries as unknown as EnquiryOwner | null;
    const assigneeId = enquiry?.assigned_user_id ?? q.created_by ?? null;
    const { error } = await admin.from("tasks").insert({
      tenant_id: q.tenant_id,
      title: `Payment due: ${upcoming.label} on quote ${q.quote_number}`,
      description: `Milestone "${upcoming.label}" is due ${formatDate(upcoming.due_date as string)}.`,
      priority: "high",
      due_date: upcoming.due_date,
      assignee_id: assigneeId,
      created_by: assigneeId,
      customer_id: q.customer_id,
      quote_id: q.id,
      source: "payment_due",
    });
    if (!error) created++;
  }
  return created;
}

/** Supplier confirmation: a job offer has sat unanswered too long. */
async function runSupplierConfirmation(admin: Admin) {
  const cutoff = new Date(Date.now() - SUPPLIER_CONFIRMATION_HOURS * 3600000).toISOString();
  const { data: offers } = await admin
    .from("job_allocation_offers")
    .select(
      "id, supplier_id, offered_at, job_allocations(jobs(tenant_id, quote_id, created_by, quotes(quote_number))), suppliers(name)",
    )
    .eq("status", "sent")
    .lte("offered_at", cutoff);

  let created = 0;
  for (const o of offers ?? []) {
    const allocation = o.job_allocations as unknown as {
      jobs: { tenant_id: string; quote_id: string; created_by: string | null; quotes: { quote_number: string } | null } | null;
    } | null;
    const job = allocation?.jobs ?? null;
    if (!job) continue;
    if (await hasOpenTask(admin, "supplier_confirmation", job.quote_id, o.supplier_id)) continue;

    const supplier = o.suppliers as unknown as { name: string } | null;
    const { error } = await admin.from("tasks").insert({
      tenant_id: job.tenant_id,
      title: `Chase supplier confirmation: ${supplier?.name ?? "supplier"} for ${job.quotes?.quote_number ?? "job"}`,
      description: `Offered ${formatDate(o.offered_at)} — still awaiting a response.`,
      priority: "high",
      due_date: todayIso(),
      assignee_id: job.created_by,
      created_by: job.created_by,
      quote_id: job.quote_id,
      supplier_id: o.supplier_id,
      source: "supplier_confirmation",
    });
    if (!error) created++;
  }
  return created;
}

interface LegRow {
  sequence: number;
  pickup_date: string | null;
}

/** Travel prep: pickup is within TRAVEL_PREP_LEAD_DAYS on a still-active job. */
async function runTravelPrep(admin: Admin) {
  const today = todayIso();
  const soon = daysFromNowIso(TRAVEL_PREP_LEAD_DAYS);
  const { data: jobs } = await admin
    .from("jobs")
    .select("id, tenant_id, quote_id, created_by, quotes(quote_number, enquiries(enquiry_legs(sequence, pickup_date)))")
    .in("status", ["unassigned", "offered", "accepted_by_supplier", "confirmed"]);

  let created = 0;
  for (const j of jobs ?? []) {
    const quote = j.quotes as unknown as { quote_number: string; enquiries: { enquiry_legs: LegRow[] } | null } | null;
    const legs = [...(quote?.enquiries?.enquiry_legs ?? [])].sort((a, b) => a.sequence - b.sequence);
    const pickupDate = legs[0]?.pickup_date;
    if (!pickupDate || pickupDate < today || pickupDate > soon) continue;
    if (await hasOpenTask(admin, "travel_prep", j.quote_id)) continue;

    const { error } = await admin.from("tasks").insert({
      tenant_id: j.tenant_id,
      title: `Prepare for travel: ${quote?.quote_number ?? "job"}`,
      description: `Pickup is scheduled for ${formatDate(pickupDate)} — confirm vehicle, driver and documents are ready.`,
      priority: "medium",
      due_date: today,
      assignee_id: j.created_by,
      created_by: j.created_by,
      quote_id: j.quote_id,
      source: "travel_prep",
    });
    if (!error) created++;
  }
  return created;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const [quoteFollowUp, paymentDue, supplierConfirmation, travelPrep] = await Promise.all([
    runQuoteFollowUp(admin),
    runPaymentDue(admin),
    runSupplierConfirmation(admin),
    runTravelPrep(admin),
  ]);

  return NextResponse.json({ quoteFollowUp, paymentDue, supplierConfirmation, travelPrep });
}
