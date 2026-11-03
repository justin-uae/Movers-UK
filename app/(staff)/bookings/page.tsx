import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BookingsConfirmedPage, type ConfirmedBookingJob, type BookingSortKey } from "@/components/pages/BookingsConfirmedPage";

const legsSelect = "enquiries(leads(source), enquiry_legs(pickup_address, destination_address, pickup_date))";
const versionSelect = "quote_versions!quotes_current_version_id_fkey(selling_price)";
const salesRepSelect = "profiles!quotes_created_by_fkey(full_name)";

const SORT_KEYS: BookingSortKey[] = ["created_desc", "created_asc", "pickup_asc", "pickup_desc", "value_desc", "value_asc"];

function time(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

// pickup_date and selling_price both live on tables joined through quotes,
// so — same reasoning as QuotesPage — they're sorted in JS rather than via
// a DB `.order()`, which can't reach into an embedded resource's column.
// This list was already an unpaginated single fetch (bounded to "still
// live" job statuses), so sorting the array in JS after the fact adds no
// new query.
function comparatorFor(sort: BookingSortKey): (a: ConfirmedBookingJob, b: ConfirmedBookingJob) => number {
  const pickupOf = (j: ConfirmedBookingJob) => j.quotes?.enquiries?.enquiry_legs?.[0]?.pickup_date ?? null;
  const valueOf = (j: ConfirmedBookingJob) => j.quotes?.quote_versions?.selling_price ?? null;
  switch (sort) {
    case "created_asc":
      return (a, b) => time(a.created_at) - time(b.created_at);
    case "pickup_asc":
      return (a, b) => (pickupOf(a) ? time(pickupOf(a)) : Infinity) - (pickupOf(b) ? time(pickupOf(b)) : Infinity);
    case "pickup_desc":
      return (a, b) => (pickupOf(b) ? time(pickupOf(b)) : -Infinity) - (pickupOf(a) ? time(pickupOf(a)) : -Infinity);
    case "value_desc":
      return (a, b) => (valueOf(b) ?? -Infinity) - (valueOf(a) ?? -Infinity);
    case "value_asc":
      return (a, b) => (valueOf(a) ?? Infinity) - (valueOf(b) ?? Infinity);
    case "created_desc":
    default:
      return (a, b) => time(b.created_at) - time(a.created_at);
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const params = await searchParams;
  await requireProfile();
  const supabase = await createClient();
  const sort: BookingSortKey = (SORT_KEYS as string[]).includes(params.sort ?? "") ? (params.sort as BookingSortKey) : "pickup_asc";

  // Jobs only exist once a quote has been marked paid — so this list is
  // naturally scoped to "payment confirmed" bookings already, through to
  // job completion (completed jobs move to the Completed Booking tab).
  // rejected_by_supplier/pending_reapproval both belong here too, not on
  // Lost Booking (that's keyed off quote status — rejected/expired/
  // cancelled — and a supplier rejecting a job doesn't touch the quote at
  // all) — the booking is still fully paid and alive, it just needs
  // redispatching to a different supplier. Leaving these out used to make
  // an already-paid booking disappear from every list the moment a
  // supplier rejected it — still reachable directly via Dispatch, but
  // effectively undiscoverable from here.
  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      `id, status, region, created_at, quotes(quote_number, currency, ai_generated, ai_model, customers(company_name, contact_name, email), ${legsSelect}, ${versionSelect}, ${salesRepSelect}), job_allocations(status, offered_at, suppliers(name))`,
    )
    .in("status", ["unassigned", "offered", "accepted_by_supplier", "confirmed", "rejected_by_supplier", "pending_reapproval"]);

  const sortedJobs = ((jobs ?? []) as unknown as ConfirmedBookingJob[]).slice().sort(comparatorFor(sort));

  return <BookingsConfirmedPage jobs={sortedJobs} />;
}
