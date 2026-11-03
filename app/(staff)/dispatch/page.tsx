import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getAssignableSalesUsers } from "@/lib/leadAssignees";
import { DispatchBoard, type JobRow, type DispatchSortKey } from "@/components/pages/DispatchBoard";

const PAGE_SIZE = 25;

const SORT_KEYS: DispatchSortKey[] = ["pickup_asc", "pickup_desc", "created_desc", "created_asc"];

function time(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

// pickup_date lives on a table joined through quotes, so — same reasoning
// as QuotesPage — it can't be ordered at the DB level, hence sorting the
// whole fetched set in JS rather than a plain `.order()` + `.range()`.
function comparatorFor(sort: DispatchSortKey): (a: JobRow, b: JobRow) => number {
  const pickupOf = (j: JobRow) => j.quotes?.enquiries?.enquiry_legs?.[0]?.pickup_date ?? null;
  switch (sort) {
    case "pickup_desc":
      return (a, b) => (pickupOf(b) ? time(pickupOf(b)) : -Infinity) - (pickupOf(a) ? time(pickupOf(a)) : -Infinity);
    case "created_desc":
      return (a, b) => time(b.created_at) - time(a.created_at);
    case "created_asc":
      return (a, b) => time(a.created_at) - time(b.created_at);
    case "pickup_asc":
    default:
      return (a, b) => (pickupOf(a) ? time(pickupOf(a)) : Infinity) - (pickupOf(b) ? time(pickupOf(b)) : Infinity);
  }
}

export default async function DispatchPage({ searchParams }: { searchParams: Promise<{ page?: string; sort?: string }> }) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const sort: DispatchSortKey = (SORT_KEYS as string[]).includes(params.sort ?? "") ? (params.sort as DispatchSortKey) : "pickup_asc";

  const canAssign = await hasPermission(profile, PERMISSIONS.ENQUIRIES_REASSIGN);
  const assignableUsers = canAssign ? await getAssignableSalesUsers(supabase) : [];

  // Unpaginated fetch (not scoped to any status — this board spans every
  // job) so pickup date can be sorted/paginated in JS; kept consistent with
  // the rest of the Bookings pipeline (Confirmed/Completed) rather than
  // introducing a third pagination strategy just for this page.
  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      "id, status, region, created_at, quotes(id, quote_number, ai_generated, ai_model, customers(company_name, contact_name), profiles!quotes_created_by_fkey(full_name), enquiries(assigned_user_id, leads(source), enquiry_legs(pickup_date))), job_allocations(id, status, suppliers(name))",
    );

  const sorted = ((jobs ?? []) as unknown as JobRow[]).slice().sort(comparatorFor(sort));
  const total = sorted.length;
  const pageJobs = sorted.slice(from, from + PAGE_SIZE);

  return (
    <DispatchBoard jobs={pageJobs} page={page} pageSize={PAGE_SIZE} total={total} canAssign={canAssign} assignableUsers={assignableUsers} />
  );
}
