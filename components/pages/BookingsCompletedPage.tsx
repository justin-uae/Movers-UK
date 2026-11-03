import Link from "next/link";
import { SendEmailButton } from "@/components/ui/SendEmailButton";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { Pagination } from "@/components/ui/Pagination";
import { SortSelect } from "@/components/ui/SortSelect";
import { AiBadge } from "@/components/ui/AiBadge";
import { BookingTabs, BookingsGuideButton } from "@/components/pages/BookingTabs";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import { SOURCE_LABEL } from "@/lib/leadSource";
import { BRAND } from "@/lib/brandConfig";

export type CompletedSortKey = "created_desc" | "created_asc" | "completed_desc" | "value_desc" | "value_asc";

const SORT_OPTIONS = [
  { value: "created_desc", label: "Newest created" },
  { value: "created_asc", label: "Oldest created" },
  { value: "completed_desc", label: "Recently completed" },
  { value: "value_desc", label: "Highest value" },
  { value: "value_asc", label: "Lowest value" },
];

export interface CompletedBookingJob {
  id: string;
  status: string;
  region: string | null;
  created_at: string;
  quotes: {
    quote_number: string;
    currency: string;
    customers: { company_name: string | null; contact_name: string; email: string | null } | null;
    enquiries: { leads: { source: keyof typeof SOURCE_LABEL } | null; enquiry_legs: { pickup_date: string | null }[] } | null;
    quote_versions: { selling_price: number } | null;
    ai_generated: boolean;
    ai_model: { provider: string; model: string } | null;
  } | null;
  job_allocations: { status: string; completed_at: string | null; suppliers: { name: string } | null }[];
}

function latestCompletion(allocations: CompletedBookingJob["job_allocations"]): string | null {
  const dates = allocations.map((a) => a.completed_at).filter((d): d is string => !!d).sort();
  return dates.length > 0 ? dates[dates.length - 1]! : null;
}

function sourceLabel(job: CompletedBookingJob): string {
  const source = job.quotes?.enquiries?.leads?.source;
  return source ? SOURCE_LABEL[source] : "—";
}

function supplierSummary(allocations: CompletedBookingJob["job_allocations"]): string {
  const names = allocations.map((a) => a.suppliers?.name).filter((n): n is string => !!n);
  return names.length > 0 ? `Supplier: ${names.join(", ")}` : "—";
}

function money(amount: number | undefined | null, currency: string) {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function BookingsCompletedPage({
  jobs,
  page,
  pageSize,
  total,
}: {
  jobs: CompletedBookingJob[];
  page: number;
  pageSize: number;
  total: number;
}) {
  return (
    <div>
      <PageHead
        eyebrow="Bookings"
        title="Completed Booking"
        text="Jobs the supplier has marked done."
        action={<BookingsGuideButton active="completed" />}
      />
      <BookingTabs active="completed" />
      <Panel>
        <div className="flex justify-end border-b pb-4">
          <SortSelect options={SORT_OPTIONS} />
        </div>
        <div className="mt-4 space-y-3">
          {jobs.map((job) => {
            const customer = job.quotes?.customers;
            return (
              <div key={job.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b>{customer?.company_name || customer?.contact_name || "Customer"}</b>
                    <div className="text-xs text-slate-500">
                      {job.quotes?.quote_number} · {job.region ?? "No region"} · Source: {sourceLabel(job)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {job.quotes?.ai_generated && <AiBadge model={job.quotes.ai_model} />}
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Completed</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                  <span>{supplierSummary(job.job_allocations)}</span>
                  <span className="font-bold">{money(job.quotes?.quote_versions?.selling_price, job.quotes?.currency ?? BRAND.defaultCurrency)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Travel date: {job.quotes?.enquiries?.enquiry_legs?.[0]?.pickup_date ? formatDate(job.quotes.enquiries.enquiry_legs[0].pickup_date!) : "—"}
                </p>
                {latestCompletion(job.job_allocations) && (
                  <p className="mt-1 text-xs text-slate-400">Completed {formatDateTime(latestCompletion(job.job_allocations)!)}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/dispatch/${job.id}`}
                    className="inline-block rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700"
                  >
                    View job
                  </Link>
                  <SendEmailButton email={job.quotes?.customers?.email} quoteNumber={job.quotes?.quote_number} variant="row" />
                </div>
              </div>
            );
          })}
          {jobs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No completed bookings yet.</p>}
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Panel>
    </div>
  );
}
