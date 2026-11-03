import "server-only";
import type { createAdminClient } from "./supabase/admin";
import { renderAndSendTemplate } from "./emailTemplates";
import { amountDueNow } from "./quotePayments";
import { formatDate } from "./formatDate";
import {
  REMINDER_TEMPLATE_KEYS,
  earliestTravelDate,
  reminderAnchor,
  reminderKindForStatus,
  reminderSchedule,
  reminderStepLabel,
  type QuoteReminderKind,
} from "./quoteReminderSchedule";

type Admin = ReturnType<typeof createAdminClient>;

export const CUSTOMER_REPLIED_REASON = "Customer replied by email";

interface ReminderQuoteRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  quote_number: string;
  status: string;
  currency: string;
  sent_at: string | null;
  decided_at: string | null;
  expiry_at: string | null;
  public_token: string;
  created_by: string | null;
  reminders_resumed_at: string | null;
  customers: { contact_name: string; company_name: string | null; email: string | null; reminders_opted_out_at: string | null } | null;
  brands: { name: string } | null;
  enquiries: {
    assigned_user_id: string | null;
    enquiry_legs: { sequence: number; pickup_address: string; destination_address: string; pickup_date: string | null; vehicle_types: { name: string } | null }[];
  } | null;
  quote_versions: { selling_price: number; deposit_percentage: number | null; deposit_fixed_amount: number | null; vehicle_description: string | null } | null;
  quote_payment_milestones: { sequence: number; amount: number }[];
  customer_payments: { id: string }[];
  quote_reminders: { kind: QuoteReminderKind; step: number }[];
}

/**
 * Cron sweep (app/api/cron/quote-reminders/route.ts, every 15 minutes). For
 * every tenant with reminders switched on, each sent/viewed quote works
 * through the 5-step sales sequence and each accepted-but-unpaid quote
 * through the 3-step payment sequence (lib/quoteReminderSchedule.ts).
 *
 * It stops on its own: a quote leaving sent/viewed/accepted (accepted,
 * paid, rejected, cancelled, expired) simply stops matching. It pauses
 * when the customer has emailed back since the sequence started — that
 * conversation needs a sales agent, not another automated nudge — and
 * skips customers who used the "Stop reminders" link.
 *
 * Only the most recent due step is sent per run, so a sweep that was down
 * for a day sends one reminder, not a burst of every step it missed.
 */
export async function runQuoteReminderSweep(admin: Admin) {
  const { data: tenants } = await admin.from("tenants").select("id, quote_reminders_enabled_at").eq("quote_reminders_enabled", true);

  let sent = 0;
  let paused = 0;
  let failed = 0;

  for (const tenant of tenants ?? []) {
    const { data: quotes, error } = await admin
      .from("quotes")
      .select(
        "id, tenant_id, customer_id, quote_number, status, currency, sent_at, decided_at, expiry_at, public_token, created_by, reminders_resumed_at, customers(contact_name, company_name, email, reminders_opted_out_at), brands(name), enquiries(assigned_user_id, enquiry_legs(sequence, pickup_address, destination_address, pickup_date, vehicle_types(name))), quote_versions!quotes_current_version_id_fkey(selling_price, deposit_percentage, deposit_fixed_amount, vehicle_description), quote_payment_milestones(sequence, amount), customer_payments(id), quote_reminders(kind, step)",
      )
      .eq("tenant_id", tenant.id)
      .in("status", ["sent", "viewed", "accepted"])
      .is("reminders_paused_at", null)
      .not("sent_at", "is", null);
    if (error) {
      console.error(`quote-reminders: loading quotes for tenant ${tenant.id} failed: ${error.message}`);
      continue;
    }

    for (const q of (quotes ?? []) as unknown as ReminderQuoteRow[]) {
      const kind = reminderKindForStatus(q.status);
      if (!kind) continue;
      const customer = q.customers;
      if (!customer?.email || customer.reminders_opted_out_at) continue;
      // An accepted quote with any payment on it (even a bank transfer still
      // awaiting verification) has paid — chasing it would be wrong.
      if (kind === "payment" && q.customer_payments.length > 0) continue;

      const start = kind === "sales" ? q.sent_at : q.decided_at;
      if (!start) continue;
      const anchor = reminderAnchor(start, tenant.quote_reminders_enabled_at);

      // Customer emailed back since this sequence started (or since staff
      // last resumed it) — hand it to a human.
      const repliesSince = new Date(Math.max(anchor.getTime(), q.reminders_resumed_at ? new Date(q.reminders_resumed_at).getTime() : 0));
      const { count: replies } = await admin
        .from("email_messages")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", q.tenant_id)
        .eq("customer_id", q.customer_id)
        .eq("direction", "inbound")
        .gt("occurred_at", repliesSince.toISOString());
      if ((replies ?? 0) > 0) {
        await admin
          .from("quotes")
          .update({ reminders_paused_at: new Date().toISOString(), reminders_pause_reason: CUSTOMER_REPLIED_REASON })
          .eq("id", q.id);
        await admin.from("quote_events").insert({ quote_id: q.id, event: "reminders_paused", detail: `${CUSTOMER_REPLIED_REASON} — a sales agent should pick this up` });
        paused++;
        continue;
      }

      const legs = [...(q.enquiries?.enquiry_legs ?? [])].sort((a, b) => a.sequence - b.sequence);
      const schedule = reminderSchedule(kind, anchor, earliestTravelDate(legs), q.expiry_at);
      const lastSentStep = Math.max(0, ...q.quote_reminders.filter((r) => r.kind === kind).map((r) => r.step));
      const now = Date.now();
      const due = schedule.filter((s) => s.step > lastSentStep && s.dueAt.getTime() <= now).pop();
      if (!due) continue;

      // Claim the step first — the unique (quote_id, kind, step) key means a
      // second overlapping run can never send it again.
      const { data: claimed, error: claimError } = await admin
        .from("quote_reminders")
        .insert({ tenant_id: q.tenant_id, quote_id: q.id, kind, step: due.step })
        .select("id")
        .maybeSingle();
      if (claimError || !claimed) continue;

      const version = q.quote_versions;
      const firstLeg = legs[0];
      const travelDate = earliestTravelDate(legs);
      const amountDue = version ? amountDueNow(version, 0, q.quote_payment_milestones) : 0;

      const result = await renderAndSendTemplate(admin, {
        tenantId: q.tenant_id,
        key: REMINDER_TEMPLATE_KEYS[kind][due.step - 1]!,
        to: customer.email,
        variables: {
          customer_name: customer.contact_name || customer.company_name || "there",
          quote_number: q.quote_number,
          brand_name: q.brands?.name ?? "",
          travel_date: travelDate ? formatDate(travelDate) : "your travel date",
          vehicle: version?.vehicle_description || firstLeg?.vehicle_types?.name || "As quoted",
          pickup: firstLeg?.pickup_address ?? "",
          destination: firstLeg?.destination_address ?? "",
          currency: q.currency,
          selling_price: (version?.selling_price ?? 0).toFixed(2),
          amount_due: amountDue.toFixed(2),
          link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/q/${q.public_token}`,
          stop_link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/q/${q.public_token}/stop-reminders`,
        },
        // Sent as (and signed by) the quote's salesperson — From their own
        // address when they have a mailbox connected (via SendGrid, see
        // lib/email.ts) — so a reply lands in a CRM-synced inbox, which is
        // what lets the reply check above pause the sequence.
        senderId: q.enquiries?.assigned_user_id ?? q.created_by ?? undefined,
      });

      if (result.error) {
        await admin.from("quote_reminders").update({ error: result.error }).eq("id", claimed.id);
        console.error(`quote-reminders: ${reminderStepLabel(kind, due.step)} for ${q.quote_number} failed: ${result.error}`);
        failed++;
        continue;
      }

      await admin.from("quote_events").insert({ quote_id: q.id, event: "reminder_sent", detail: `${reminderStepLabel(kind, due.step)} to ${customer.email}` });
      sent++;
    }
  }

  return { sent, paused, failed };
}
