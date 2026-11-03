import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { healExpiredQuotes } from "@/lib/quoteExpiry";
import { getAssignableSalesUsers } from "@/lib/leadAssignees";
import { QuotesPage, type QuoteRow, type QuoteSortKey } from "@/components/pages/QuotesPage";
import { BRAND } from "@/lib/brandConfig";

const PAGE_SIZE = 25;

function time(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

// Sorted in JS rather than via `.order()` at the DB level: pickup date and
// selling price both live on joined tables (enquiry_legs / quote_versions),
// and PostgREST can't order top-level rows by an embedded resource's column.
// The Pending Quotes set is already bounded to draft/sent/viewed/accepted
// (not the full historical quotes table), and this same page already does
// one unpaginated fetch of the whole quotes table for its KPI cards, so
// fetching this already-filtered subset in one shot to sort/paginate in JS
// doesn't add a new performance concern.
function comparatorFor(sort: QuoteSortKey): (a: QuoteRow, b: QuoteRow) => number {
  const pickupDateOf = (q: QuoteRow) => q.enquiries?.enquiry_legs?.[0]?.pickup_date ?? null;
  const valueOf = (q: QuoteRow) => q.quote_versions?.selling_price ?? null;
  switch (sort) {
    case "created_asc":
      return (a, b) => time(a.created_at) - time(b.created_at);
    case "pickup_asc":
      return (a, b) => (pickupDateOf(a) ? time(pickupDateOf(a)) : Infinity) - (pickupDateOf(b) ? time(pickupDateOf(b)) : Infinity);
    case "pickup_desc":
      return (a, b) => (pickupDateOf(b) ? time(pickupDateOf(b)) : -Infinity) - (pickupDateOf(a) ? time(pickupDateOf(a)) : -Infinity);
    case "sent_desc":
      return (a, b) => time(b.sent_at) - time(a.sent_at);
    case "viewed_desc":
      return (a, b) => time(b.viewed_at) - time(a.viewed_at);
    case "value_desc":
      return (a, b) => (valueOf(b) ?? -Infinity) - (valueOf(a) ?? -Infinity);
    case "value_asc":
      return (a, b) => (valueOf(a) ?? Infinity) - (valueOf(b) ?? Infinity);
    case "expiry_asc":
      return (a, b) => (a.expiry_at ? time(a.expiry_at) : Infinity) - (b.expiry_at ? time(b.expiry_at) : Infinity);
    case "created_desc":
    default:
      return (a, b) => time(b.created_at) - time(a.created_at);
  }
}

const SORT_KEYS: QuoteSortKey[] = [
  "created_desc",
  "created_asc",
  "pickup_asc",
  "pickup_desc",
  "sent_desc",
  "viewed_desc",
  "value_desc",
  "value_asc",
  "expiry_asc",
];

const STATUS_FILTER_TO_STATUSES: Record<string, string[]> = {
  draft: ["draft"],
  awaiting_response: ["sent", "viewed"],
  accepted: ["accepted"],
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; sort?: string; status?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  await healExpiredQuotes(supabase);

  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const sort: QuoteSortKey = (SORT_KEYS as string[]).includes(params.sort ?? "") ? (params.sort as QuoteSortKey) : "created_desc";
  // KPI cards link here with a status filter (e.g. "Accepted — awaiting
  // payment" -> ?status=accepted) so clicking one narrows the list to
  // exactly what it counted, on top of the page's normal draft/sent/
  // viewed/accepted scope — an unrecognised value just falls back to "all".
  const statusFilter = STATUS_FILTER_TO_STATUSES[params.status ?? ""] ?? null;

  // Pending Quotes covers everything up to customer payment — draft/sent/
  // viewed (no decision yet) and accepted (decided, but not yet paid at
  // all). A quote that's had a partial payment moves to its own Partially
  // Paid tab (/quotes/partially-paid) instead of staying listed here. Once
  // fully paid a job gets created and the booking moves to the Confirmed
  // Booking tab; rejected/expired move to Lost Booking.
  let listQuery = supabase
    .from("quotes")
    .select(
      "id, quote_number, status, currency, expiry_at, invoice_number, public_token, created_at, sent_at, viewed_at, ai_generated, ai_model, ai_estimated_price, ai_estimated_price_currency, customers(company_name, contact_name, email), enquiries(assigned_user_id, leads(source), enquiry_legs(pickup_address, destination_address, pickup_date, pickup_time)), quote_versions!quotes_current_version_id_fkey(selling_price, original_price, discount_percent, discount_source), profiles!quotes_created_by_fkey(full_name)",
    )
    .in("status", statusFilter ?? ["draft", "sent", "viewed", "accepted"]);
  if (q) {
    listQuery = listQuery.or(`quote_number.ilike.%${q}%,invoice_number.ilike.%${q}%`);
  }

  // The 4 separate count queries + the pipeline-value query this page used
  // to fire were each independently re-running the same per-row RLS check
  // (can_view_assignment) across the whole quotes table — 5 full passes
  // instead of 1. Fetching status + selling_price once and deriving every
  // KPI from that single result set cuts this page from 7 concurrent
  // queries to 3, which is what was pushing Postgres into a statement
  // timeout (57014) under load.
  const [{ data: allMatching }, canCreateQuote, canResend, canAssign, { data: statsRows }] = await Promise.all([
    listQuery,
    hasPermission(profile, PERMISSIONS.QUOTES_CREATE),
    hasPermission(profile, PERMISSIONS.QUOTES_SEND),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_REASSIGN),
    supabase.from("quotes").select("status, currency, quote_versions!quotes_current_version_id_fkey(selling_price)"),
  ]);
  const assignableUsers = canAssign ? await getAssignableSalesUsers(supabase) : [];

  const sorted = ((allMatching ?? []) as unknown as QuoteRow[]).slice().sort(comparatorFor(sort));
  const total = sorted.length;
  const quotes = sorted.slice(from, from + PAGE_SIZE);

  const rows = statsRows ?? [];
  const draftCount = rows.filter((r) => r.status === "draft").length;
  const sentRows = rows.filter((r) => r.status === "sent" || r.status === "viewed");
  const sentCount = sentRows.length;
  const acceptedCount = rows.filter((r) => r.status === "accepted" || r.status === "converted").length;
  const totalCount = rows.length;

  const pipelineValue = sentRows.reduce(
    (sum, r) => sum + ((r.quote_versions as unknown as { selling_price: number } | null)?.selling_price ?? 0),
    0,
  );
  const pipelineCurrency = sentRows[0]?.currency ?? BRAND.defaultCurrency;

  return (
    <QuotesPage
      quotes={quotes}
      canCreateQuote={canCreateQuote}
      canResend={canResend}
      canAssign={canAssign}
      assignableUsers={assignableUsers}
      canViewAiEstimate={profile.is_master_admin}
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
      draftCount={draftCount}
      sentCount={sentCount}
      acceptedCount={acceptedCount}
      totalCount={totalCount}
      pipelineValue={pipelineValue}
      pipelineCurrency={pipelineCurrency}
    />
  );
}
