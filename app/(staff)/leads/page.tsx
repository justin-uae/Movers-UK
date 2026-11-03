import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { healExpiredLeads } from "@/lib/leadExpiry";
import { LeadsPage, type LeadRow, type LeadTab } from "@/components/pages/LeadsPage";
import { getAssignableSalesUsers } from "@/lib/leadAssignees";

const PAGE_SIZE = 25;

export type LeadSortKey = "created_desc" | "created_asc" | "travel_asc" | "travel_desc";

const SORT_KEYS: LeadSortKey[] = ["created_desc", "created_asc", "travel_asc", "travel_desc"];

// travel_date and created_at are plain columns on the leads table itself
// (unlike Quotes' pickup date, which lives on a joined table) — so, unlike
// QuotesPage, this can sort at the DB level with a normal `.order()` and
// keep its existing range()-based pagination as-is.
const SORT_COLUMN: Record<LeadSortKey, { column: "created_at" | "travel_date"; ascending: boolean }> = {
  created_desc: { column: "created_at", ascending: false },
  created_asc: { column: "created_at", ascending: true },
  travel_asc: { column: "travel_date", ascending: true },
  travel_desc: { column: "travel_date", ascending: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  await healExpiredLeads(supabase);

  const tab: LeadTab = params.tab === "pool" || params.tab === "all" || params.tab === "quoted" ? params.tab : "mine";
  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const sort: LeadSortKey = (SORT_KEYS as string[]).includes(params.sort ?? "") ? (params.sort as LeadSortKey) : "created_desc";
  const { column: sortColumn, ascending: sortAscending } = SORT_COLUMN[sort];

  let listQuery = supabase
    .from("leads")
    .select(
      "id, source, status, priority, pickup_text, destination_text, travel_date, pickup_time, return_trip, return_date, return_time, passenger_count, luggage_count, is_complex_booking, vehicle_requested, notes, assigned_user_id, created_at, customers(company_name, contact_name, phone, whatsapp, email), profiles(full_name), brands(name), enquiries(quotes(ai_generated))",
      { count: "exact" },
    );

  // "converted" (lead.status flips the moment quotes/new actually creates a
  // quote from it — app/(staff)/quotes/new/actions.ts) is excluded from
  // "mine" and given its own "Quoted" tab instead, so a lead already turned
  // into a quote doesn't sit mixed in with ones still needing work.
  if (tab === "mine") {
    listQuery = listQuery.eq("assigned_user_id", profile.id).not("status", "in", "(closed,converted)");
  } else if (tab === "pool") {
    listQuery = listQuery.eq("status", "open_pool");
  } else if (tab === "quoted") {
    listQuery = listQuery.eq("assigned_user_id", profile.id).eq("status", "converted");
  }
  if (q) {
    listQuery = listQuery.or(`pickup_text.ilike.%${q}%,destination_text.ilike.%${q}%,notes.ilike.%${q}%`);
  }

  // mine/pool/quoted all need only status + assigned_user_id to count, and
  // every row any of them could possibly match is already covered by one
  // filter (assigned to me, OR open_pool — exactly what RLS lets a plain
  // Sales User see anyway) — so these 3 KPI counts, which used to be 3
  // separate queries, are now derived in JS from a single cheap fetch. This
  // mirrors the fix for the same 57014 statement-timeout bug on Pending
  // Quotes (app/(staff)/quotes/page.tsx) — too many concurrent queries on
  // this page was pushing Postgres over its timeout, silently leaving
  // mineCount/poolCount/quotedCount (and sometimes the leads list itself)
  // looking like "0 leads" when the data was there all along.
  const [
    { data: leads, count },
    { data: countRows },
    { data: openEnquiries },
    { count: openQuotesCount },
    canAddEnquiry,
    canClaim,
    canRelease,
    canViewAll,
    canAssign,
  ] = await Promise.all([
    listQuery.order(sortColumn, { ascending: sortAscending, nullsFirst: false }).range(from, to),
    supabase.from("leads").select("status, assigned_user_id").or(`assigned_user_id.eq.${profile.id},status.eq.open_pool`),
    supabase
      .from("enquiries")
      .select("id, status")
      .eq("assigned_user_id", profile.id)
      .not("status", "in", "(completed,cancelled,declined,converted_to_booking)"),
    // Pushed the assigned_user_id filter into the query (via the !inner
    // join on enquiries) and made it a head:true count instead of pulling
    // every sent/viewed quote in the tenant just to filter+count it in JS.
    supabase
      .from("quotes")
      .select("id, enquiries!inner(assigned_user_id)", { count: "exact", head: true })
      .in("status", ["sent", "viewed"])
      .eq("enquiries.assigned_user_id", profile.id),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_ADD),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_CLAIM_OPEN_LEADS),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_RETURN_TO_POOL),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_VIEW_ALL).then(
      async (viewAll) => viewAll || (await hasPermission(profile, PERMISSIONS.ENQUIRIES_VIEW_TEAM)),
    ),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_REASSIGN),
  ]);

  const rows = countRows ?? [];
  const mineCount = rows.filter((r) => r.assigned_user_id === profile.id && r.status !== "closed" && r.status !== "converted").length;
  const poolCount = rows.filter((r) => r.status === "open_pool").length;
  const quotedCount = rows.filter((r) => r.assigned_user_id === profile.id && r.status === "converted").length;

  const quotesAwaitingResponse = openQuotesCount ?? 0;
  const assignableUsers = canAssign ? await getAssignableSalesUsers(supabase) : [];

  // A lead the AI Auto-Quote sweep converted has no assigned_user_id (it
  // was released to the pool before being quoted, see lib/aiAutoQuote.ts) —
  // without this, the Owner column would otherwise read it as still sitting
  // unclaimed in the open pool instead of already quoted by AI.
  const leadRows = (leads ?? []).map((l) => {
    const enquiries = (l as unknown as { enquiries: { quotes: { ai_generated: boolean }[] }[] | null }).enquiries ?? [];
    const aiQuoted = enquiries.some((e) => e.quotes?.some((q) => q.ai_generated));
    return { ...l, ai_quoted: aiQuoted } as unknown as LeadRow;
  });

  return (
    <LeadsPage
      leads={leadRows}
      currentUserId={profile.id}
      myOpenEnquiries={openEnquiries?.length ?? 0}
      quotesAwaitingResponse={quotesAwaitingResponse}
      canAddEnquiry={canAddEnquiry}
      canClaim={canClaim}
      canRelease={canRelease}
      canViewAll={canViewAll}
      canAssign={canAssign}
      assignableUsers={assignableUsers}
      tab={tab}
      mineCount={mineCount}
      poolCount={poolCount}
      quotedCount={quotedCount}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
    />
  );
}
