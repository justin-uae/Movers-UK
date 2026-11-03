import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BookingsCompletedPage, type CompletedBookingJob, type CompletedSortKey } from "@/components/pages/BookingsCompletedPage";

const PAGE_SIZE = 25;

const SORT_KEYS: CompletedSortKey[] = ["created_desc", "created_asc", "completed_desc", "value_desc", "value_asc"];

function time(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

function latestCompletedAt(job: CompletedBookingJob): number {
  const dates = (job.job_allocations ?? []).map((a) => a.completed_at).filter((d): d is string => !!d);
  return dates.length > 0 ? Math.max(...dates.map((d) => new Date(d).getTime())) : 0;
}

// selling_price lives on a table joined through quotes, so — same reasoning
// as QuotesPage — it can't be ordered at the DB level. Fetching every
// completed job (bounded to status='completed', not the whole quotes/jobs
// table) and sorting/paginating in JS keeps Value sortable without an extra
// query shape per sort key.
function comparatorFor(sort: CompletedSortKey): (a: CompletedBookingJob, b: CompletedBookingJob) => number {
  const valueOf = (j: CompletedBookingJob) => j.quotes?.quote_versions?.selling_price ?? null;
  switch (sort) {
    case "created_asc":
      return (a, b) => time(a.created_at) - time(b.created_at);
    case "completed_desc":
      return (a, b) => latestCompletedAt(b) - latestCompletedAt(a);
    case "value_desc":
      return (a, b) => (valueOf(b) ?? -Infinity) - (valueOf(a) ?? -Infinity);
    case "value_asc":
      return (a, b) => (valueOf(a) ?? Infinity) - (valueOf(b) ?? Infinity);
    case "created_desc":
    default:
      return (a, b) => time(b.created_at) - time(a.created_at);
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; sort?: string }> }) {
  const params = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const sort: CompletedSortKey = (SORT_KEYS as string[]).includes(params.sort ?? "") ? (params.sort as CompletedSortKey) : "created_desc";

  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      "id, status, region, created_at, quotes(quote_number, currency, ai_generated, ai_model, customers(company_name, contact_name, email), enquiries(leads(source), enquiry_legs(pickup_date)), quote_versions!quotes_current_version_id_fkey(selling_price)), job_allocations(status, completed_at, suppliers(name))",
    )
    .eq("status", "completed");

  const sorted = ((jobs ?? []) as unknown as CompletedBookingJob[]).slice().sort(comparatorFor(sort));
  const total = sorted.length;
  const pageJobs = sorted.slice(from, from + PAGE_SIZE);

  return <BookingsCompletedPage jobs={pageJobs} page={page} pageSize={PAGE_SIZE} total={total} />;
}
