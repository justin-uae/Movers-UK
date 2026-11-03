import Link from "next/link";
import { SendEmailButton } from "@/components/ui/SendEmailButton";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SortSelect } from "@/components/ui/SortSelect";
import { AiBadge } from "@/components/ui/AiBadge";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import { BookingTabs, BookingsGuideButton } from "@/components/pages/BookingTabs";
import { formatDate, formatDateTime, isPastDate } from "@/lib/formatDate";
import { SOURCE_LABEL } from "@/lib/leadSource";
import type { JobStatus } from "@/lib/supabase/database.types";
import { BRAND } from "@/lib/brandConfig";

export type BookingSortKey = "created_desc" | "created_asc" | "pickup_asc" | "pickup_desc" | "value_desc" | "value_asc";

// Pickup date: soonest is first — that's this page's default (dispatch
// naturally cares about what's coming up next), so it's also what
// SortSelect falls back to whenever there's no ?sort= in the URL.
const SORT_OPTIONS = [
  { value: "pickup_asc", label: "Pickup date: soonest" },
  { value: "pickup_desc", label: "Pickup date: latest" },
  { value: "created_desc", label: "Newest created" },
  { value: "created_asc", label: "Oldest created" },
  { value: "value_desc", label: "Highest value" },
  { value: "value_asc", label: "Lowest value" },
];

type CustomerRef = { company_name: string | null; contact_name: string; email: string | null } | null;
type LegsRef = {
  leads: { source: keyof typeof SOURCE_LABEL } | null;
  enquiry_legs: { pickup_address: string; destination_address: string; pickup_date: string | null }[];
} | null;

function sourceLabel(legs: LegsRef) {
  const source = legs?.leads?.source;
  return source ? SOURCE_LABEL[source] : "—";
}
type VersionRef = { selling_price: number } | null;

export interface ConfirmedBookingJob {
  id: string;
  status: JobStatus;
  region: string | null;
  created_at: string;
  quotes: {
    quote_number: string;
    currency: string;
    customers: CustomerRef;
    enquiries: LegsRef;
    quote_versions: VersionRef;
    profiles: { full_name: string } | null;
    ai_generated: boolean;
    ai_model: { provider: string; model: string } | null;
  } | null;
  job_allocations: { status: JobStatus; offered_at: string | null; suppliers: { name: string } | null }[];
}

function allocationSummary(allocations: { status: JobStatus; offered_at: string | null; suppliers: { name: string } | null }[]) {
  const live = allocations.filter((a) => a.status !== "cancelled");
  if (live.length === 0) return null;
  if (live.length === 1) {
    const a = live[0]!;
    if (!a.suppliers) return null;
    return a.offered_at ? `Assigned to ${a.suppliers.name} · ${formatDateTime(a.offered_at)}` : `Assigned to ${a.suppliers.name}`;
  }
  const assigned = live.filter((a) => a.suppliers).length;
  return `${assigned} of ${live.length} suppliers assigned`;
}

const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  unassigned: "Awaiting supplier assignment",
  offered: "Offered to suppliers",
  accepted_by_supplier: "Accepted by supplier",
  rejected_by_supplier: "Rejected — needs redispatch",
  pending_reapproval: "Awaiting supplier re-approval",
  confirmed: "Confirmed with supplier",
  completed: "Completed",
  cancelled: "Cancelled",
};

const JOB_STATUS_STYLE: Record<JobStatus, string> = {
  unassigned: "bg-slate-100 text-slate-600",
  offered: "bg-blue-50 text-blue-700",
  accepted_by_supplier: "bg-amber-50 text-amber-700",
  rejected_by_supplier: "bg-red-50 text-red-700",
  pending_reapproval: "bg-orange-50 text-orange-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function money(amount: number | undefined | null, currency: string) {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function journeySummary(legs: LegsRef) {
  const leg = legs?.enquiry_legs?.[0];
  if (!leg) return "—";
  return `${leg.pickup_address} → ${leg.destination_address}`;
}

export function BookingsConfirmedPage({ jobs }: { jobs: ConfirmedBookingJob[] }) {
  return (
    <div>
      <PageHead
        eyebrow="Bookings"
        title="Confirmed Booking"
        text="Quotes marked as paid, through to job completion by the supplier."
        action={<BookingsGuideButton active="confirmed" />}
      />
      <BookingTabs active="confirmed" />
      <Panel>
        <div className="flex justify-end border-b pb-4">
          <SortSelect options={SORT_OPTIONS} />
        </div>
        <div className="mt-4 space-y-3">
          {jobs.map((job) => {
            const customer = job.quotes?.customers;
            const leg = job.quotes?.enquiries?.enquiry_legs?.[0];
            return (
              <div key={job.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b>{customer?.company_name || customer?.contact_name || "Customer"}</b>
                    <div className="text-xs text-slate-500">
                      {job.quotes?.quote_number} · {job.region ?? "No region"} · Sales rep: {job.quotes?.profiles?.full_name || "—"} · Source:{" "}
                      {sourceLabel(job.quotes?.enquiries ?? null)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {job.quotes?.ai_generated && <AiBadge model={job.quotes.ai_model} />}
                    {isPastDate(leg?.pickup_date) && <OverdueBadge />}
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${JOB_STATUS_STYLE[job.status]}`}>
                      {JOB_STATUS_LABEL[job.status]}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                  <span>{journeySummary(job.quotes?.enquiries ?? null)}</span>
                  <span className="font-bold">{money(job.quotes?.quote_versions?.selling_price, job.quotes?.currency ?? BRAND.defaultCurrency)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Travel date: {leg?.pickup_date ? formatDate(leg.pickup_date) : "—"}</p>
                {allocationSummary(job.job_allocations) && (
                  <p className="mt-1 text-xs text-slate-500">{allocationSummary(job.job_allocations)}</p>
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
          {jobs.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              No bookings in progress — they appear here once the customer's payment is confirmed.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
