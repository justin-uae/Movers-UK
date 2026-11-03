import Link from "next/link";
import { SendEmailButton } from "@/components/ui/SendEmailButton";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SortSelect } from "@/components/ui/SortSelect";
import { AiBadge } from "@/components/ui/AiBadge";
import { BookingTabs, BookingsGuideButton } from "@/components/pages/BookingTabs";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import { SOURCE_LABEL } from "@/lib/leadSource";
import type { QuoteStatus } from "@/lib/supabase/database.types";

export type LeadSortKey = "travel_desc" | "travel_asc";
export type LostQuoteSortKey = "decided_desc" | "decided_asc" | "value_desc" | "value_asc";
export type LostFilterKey = "all" | "expired_leads" | "rejected" | "expired_quotes" | "cancelled";

const FILTER_OPTIONS: { value: LostFilterKey; label: string }[] = [
  { value: "all", label: "All lost bookings" },
  { value: "expired_leads", label: "Expired leads" },
  { value: "rejected", label: "Rejected quotes" },
  { value: "expired_quotes", label: "Expired quotes" },
  { value: "cancelled", label: "Cancelled bookings" },
];

// Quote status each filter keeps; "all" keeps every lost status and
// "expired_leads" hides the quotes section entirely.
const FILTER_QUOTE_STATUS: Partial<Record<LostFilterKey, QuoteStatus>> = {
  rejected: "rejected",
  expired_quotes: "expired",
  cancelled: "cancelled",
};

export interface LostBookingQuote {
  id: string;
  quote_number: string;
  currency: string;
  status: QuoteStatus;
  decided_at: string | null;
  expiry_at: string | null;
  customers: { company_name: string | null; contact_name: string; email: string | null } | null;
  enquiries: {
    leads: { source: keyof typeof SOURCE_LABEL } | null;
    enquiry_legs: { pickup_address: string; destination_address: string; pickup_date: string | null }[];
  } | null;
  quote_versions: { selling_price: number } | null;
  quote_decisions: { decision: string; reason: string | null; free_text: string | null }[];
  profiles: { full_name: string } | null;
  ai_generated: boolean;
  ai_model: { provider: string; model: string } | null;
}

export interface ExpiredLead {
  id: string;
  source: keyof typeof SOURCE_LABEL;
  pickup_text: string | null;
  destination_text: string | null;
  travel_date: string | null;
  pickup_time: string | null;
  passenger_count: number | null;
  notes: string | null;
  created_at: string;
  customers: { company_name: string | null; contact_name: string } | null;
  profiles: { full_name: string } | null;
}

function money(amount: number | undefined | null, currency: string) {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function BookingsLostPage({
  quotes: allQuotes,
  expiredLeads,
  filter,
}: {
  quotes: LostBookingQuote[];
  expiredLeads: ExpiredLead[];
  filter: LostFilterKey;
}) {
  const showLeads = filter === "all" || filter === "expired_leads";
  const showQuotes = filter !== "expired_leads";
  const quoteStatus = FILTER_QUOTE_STATUS[filter];
  const quotes = quoteStatus ? allQuotes.filter((q) => q.status === quoteStatus) : allQuotes;
  const quotesHeading = (quoteStatus && FILTER_OPTIONS.find((o) => o.value === filter)?.label) || "Lost Quotes";

  return (
    <div>
      <PageHead
        eyebrow="Bookings"
        title="Lost Booking"
        text="Quotes the customer rejected, that expired unanswered, a booking staff cancelled, or pool leads nobody claimed before the pickup date."
        action={<BookingsGuideButton active="lost" />}
      />
      <BookingTabs active="lost" />
      <Panel>
        <div className="mb-5 flex justify-end">
          <SortSelect options={FILTER_OPTIONS} paramName="show" />
        </div>
        {showLeads && (
        <>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Expired Leads</h3>
        </div>
        <div className="mt-4 space-y-3">
          {expiredLeads.map((l) => (
            <div key={l.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <b className="block truncate">{l.customers?.company_name || l.customers?.contact_name || "Unassigned enquiry"}</b>
                  <div className="text-xs text-slate-500">Lead · not quoted · Source: {SOURCE_LABEL[l.source]}</div>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Expired lead</span>
              </div>
              <div className="mt-2 text-sm text-slate-600">
                {l.pickup_text || l.destination_text
                  ? `${l.pickup_text ?? "—"} → ${l.destination_text ?? "—"}`
                  : l.notes || "General enquiry"}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Expired — no one claimed this lead before its pickup date
                {l.travel_date ? ` (${formatDate(l.travel_date)})` : ""} passed.
              </p>
              <Link
                href={`/leads/${l.id}`}
                className="mt-3 inline-block rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700"
              >
                View lead
              </Link>
            </div>
          ))}
          {expiredLeads.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No expired leads.</p>}
        </div>
        </>
        )}

        {showQuotes && (
        <>
        <div className={`${showLeads ? "mt-6 " : ""}flex flex-wrap items-center justify-between gap-2 border-b pb-4`}>
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">{quotesHeading}</h3>
        </div>
        <div className="mt-4 space-y-3">
          {quotes.map((q) => {
            const customer = q.customers;
            const leg = q.enquiries?.enquiry_legs?.[0];
            const decision = q.quote_decisions?.[0] ?? null;
            const isExpired = q.status === "expired";
            const isCancelled = q.status === "cancelled";
            const badgeLabel = isCancelled ? "Cancelled" : isExpired ? "Expired" : "Rejected";
            const badgeStyle = isCancelled
              ? "bg-slate-100 text-slate-500"
              : isExpired
                ? "bg-slate-100 text-slate-600"
                : "bg-red-50 text-red-700";
            return (
              <div key={q.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b>{customer?.company_name || customer?.contact_name || "Customer"}</b>
                    <div className="text-xs text-slate-500">
                      {q.quote_number} · Sales rep: {q.profiles?.full_name || "—"} · Source:{" "}
                      {q.enquiries?.leads?.source ? SOURCE_LABEL[q.enquiries.leads.source] : "—"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {q.ai_generated && <AiBadge model={q.ai_model} />}
                    <span className={"rounded-full px-2.5 py-1 text-xs font-bold " + badgeStyle}>{badgeLabel}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                  <span>
                    {leg ? `${leg.pickup_address} → ${leg.destination_address}` : "—"}
                    {leg?.pickup_date && <span className="text-slate-400"> · {formatDate(leg.pickup_date)}</span>}
                  </span>
                  <span className="font-bold">{money(q.quote_versions?.selling_price, q.currency)}</span>
                </div>
                {!isExpired && !isCancelled && decision && (decision.reason || decision.free_text) && (
                  <p className="mt-2 text-xs text-slate-500">
                    {decision.reason && <span className="capitalize">{decision.reason.replaceAll("_", " ")}</span>}
                    {decision.reason && decision.free_text && " — "}
                    {decision.free_text && `“${decision.free_text}”`}
                  </p>
                )}
                {isExpired && q.expiry_at && (
                  <p className="mt-2 text-xs text-slate-500">Expired {formatDateTime(q.expiry_at)}</p>
                )}
                {isCancelled && q.decided_at && (
                  <p className="mt-2 text-xs text-slate-500">Cancelled {formatDateTime(q.decided_at)}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/quotes/${q.id}`}
                    className="inline-block rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700"
                  >
                    View quote
                  </Link>
                  <SendEmailButton email={q.customers?.email} quoteNumber={q.quote_number} variant="row" />
                </div>
              </div>
            );
          })}
          {quotes.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No {quotesHeading.toLowerCase()}.</p>}
        </div>
        </>
        )}
      </Panel>
    </div>
  );
}
