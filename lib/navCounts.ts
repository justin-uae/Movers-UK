import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { getChannelList } from "./chat";

type Supabase = SupabaseClient<Database>;

/** A count query's result, normalised — a failed count just shows no badge rather than breaking the layout. */
function countOf(result: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  return Promise.resolve(result).then(
    ({ count, error }) => (error ? 0 : (count ?? 0)),
    () => 0,
  );
}

/**
 * Sidebar badge numbers — "how many things here need me", per nav href.
 * Every query runs through the viewer's own RLS-scoped client, so each
 * person sees counts for exactly what they can see on that page (a Sales
 * User's Pending Quotes count is their own quotes; Master Admin's is
 * everyone's). Only hrefs actually visible to this user are queried, all in
 * parallel. Each definition mirrors what its page lists by default, so the
 * number matches what's there when they click through.
 */
export async function getNavCounts(
  supabase: Supabase,
  profile: { id: string; tenant_id: string; is_master_admin: boolean },
  visibleHrefs: string[],
): Promise<Record<string, number>> {
  const count = (table: Parameters<Supabase["from"]>[0]) => supabase.from(table).select("id", { count: "exact", head: true });

  const definitions: Record<string, () => Promise<number>> = {
    // My active leads (the default "Mine" tab) plus everything waiting in
    // the open pool for someone to claim.
    "/leads": () =>
      countOf(count("leads").or(`and(assigned_user_id.eq.${profile.id},status.not.in.(closed,converted,spam,duplicate,expired)),status.eq.open_pool`)),
    // Same statuses Pending Quotes lists by default.
    "/quotes": () => countOf(count("quotes").in("status", ["draft", "sent", "viewed", "accepted"])),
    "/quotes/partially-paid": () => countOf(count("quotes").eq("status", "partially_paid")),
    // Jobs that still need a supplier — never allocated, or turned down.
    "/dispatch": () => countOf(count("jobs").in("status", ["unassigned", "rejected_by_supplier"])),
    // Unread mail in my own connected inbox.
    "/email": () =>
      countOf(
        supabase
          .from("email_messages")
          .select("id, email_accounts!inner(user_id)", { count: "exact", head: true })
          .eq("email_accounts.user_id", profile.id)
          .eq("direction", "inbound")
          .eq("folder", "inbox")
          .eq("is_read", false),
      ),
    // Channels/DMs with something I haven't read — same rule as Team Chat's own unread dots.
    "/team-chat": () =>
      getChannelList(supabase, profile.id).then(
        (channels) => channels.filter((c) => c.unread).length,
        () => 0,
      ),
    "/tasks": () => countOf(count("tasks").eq("assignee_id", profile.id).in("status", ["todo", "in_progress"])),
    "/complaints": () => countOf(count("complaints").in("status", ["open", "investigating"])),
    "/incidents": () => countOf(count("incidents").in("status", ["open", "investigating"])),
    // Bank transfers a customer says they've made, waiting for Finance to verify.
    "/accounting/customer-payments": () => countOf(count("customer_payments").eq("verification_status", "pending")),
    // Supplier invoices forwarded to accounting that aren't fully paid yet.
    "/accounting/supplier-payments": () =>
      countOf(
        supabase
          .from("job_supplier_invoices")
          .select("id, job_allocations!inner(supplier_payment_status)", { count: "exact", head: true })
          .eq("status", "forwarded_to_accounting")
          .neq("job_allocations.supplier_payment_status", "paid"),
      ),
    "/card-payment-requests": () =>
      countOf(count("card_payment_override_requests").eq("tenant_id", profile.tenant_id).eq("status", "pending")),
  };

  const hrefs = Object.keys(definitions).filter((href) => visibleHrefs.includes(href));
  const values = await Promise.all(hrefs.map((href) => definitions[href]!()));
  return Object.fromEntries(hrefs.map((href, i) => [href, values[i]!]).filter(([, n]) => (n as number) > 0));
}
