"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Stop reminders" from a reminder email's footer — opts the quote's
 * customer out of every automatic quote/payment reminder (all their quotes,
 * not just this one; see customers.reminders_opted_out_at in
 * 0103_quote_reminders.sql). A POST behind a button rather than a plain GET
 * link, because mail security scanners pre-fetch every link in an email and
 * would otherwise opt customers out without them ever clicking.
 */
export async function stopRemindersAction(token: string) {
  const admin = createAdminClient();
  const { data: quote } = await admin.from("quotes").select("id, customer_id, customers(reminders_opted_out_at)").eq("public_token", token).single();
  if (!quote) return;

  const customer = quote.customers as unknown as { reminders_opted_out_at: string | null } | null;
  if (!customer?.reminders_opted_out_at) {
    await admin.from("customers").update({ reminders_opted_out_at: new Date().toISOString() }).eq("id", quote.customer_id);
    await admin.from("quote_events").insert({ quote_id: quote.id, event: "reminders_opted_out", detail: "Customer used the Stop reminders link in a reminder email" });
  }
  revalidatePath(`/q/${token}/stop-reminders`);
}
