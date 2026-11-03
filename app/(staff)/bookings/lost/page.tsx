import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { healExpiredQuotes } from "@/lib/quoteExpiry";
import { healExpiredLeads } from "@/lib/leadExpiry";
import {
  BookingsLostPage,
  type ExpiredLead,
  type LostBookingQuote,
  type LeadSortKey,
  type LostQuoteSortKey,
  type LostFilterKey,
} from "@/components/pages/BookingsLostPage";

const LEAD_SORT_KEYS: LeadSortKey[] = ["travel_desc", "travel_asc"];
const QUOTE_SORT_KEYS: LostQuoteSortKey[] = ["decided_desc", "decided_asc", "value_desc", "value_asc"];
const FILTER_KEYS: LostFilterKey[] = ["all", "expired_leads", "rejected", "expired_quotes", "cancelled"];

function time(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

function sortLeads(leads: ExpiredLead[], sort: LeadSortKey): ExpiredLead[] {
  const sorted = leads.slice();
  if (sort === "travel_asc") sorted.sort((a, b) => time(a.travel_date) - time(b.travel_date));
  else sorted.sort((a, b) => time(b.travel_date) - time(a.travel_date));
  return sorted;
}

// selling_price lives on a table joined through quotes, so — same reasoning
// as QuotesPage — Value can't be ordered at the DB level; this list is
// already a single unpaginated fetch, so sorting the array in JS after the
// fact adds no new query.
function sortQuotes(quotes: LostBookingQuote[], sort: LostQuoteSortKey): LostBookingQuote[] {
  const sorted = quotes.slice();
  const valueOf = (q: LostBookingQuote) => q.quote_versions?.selling_price ?? null;
  switch (sort) {
    case "decided_asc":
      sorted.sort((a, b) => time(a.decided_at) - time(b.decided_at));
      break;
    case "value_desc":
      sorted.sort((a, b) => (valueOf(b) ?? -Infinity) - (valueOf(a) ?? -Infinity));
      break;
    case "value_asc":
      sorted.sort((a, b) => (valueOf(a) ?? Infinity) - (valueOf(b) ?? Infinity));
      break;
    case "decided_desc":
    default:
      sorted.sort((a, b) => time(b.decided_at) - time(a.decided_at));
  }
  return sorted;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ leadSort?: string; quoteSort?: string; show?: string }> }) {
  const params = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  await Promise.all([healExpiredQuotes(supabase), healExpiredLeads(supabase)]);

  const leadSort: LeadSortKey = (LEAD_SORT_KEYS as string[]).includes(params.leadSort ?? "") ? (params.leadSort as LeadSortKey) : "travel_desc";
  const quoteSort: LostQuoteSortKey = (QUOTE_SORT_KEYS as string[]).includes(params.quoteSort ?? "")
    ? (params.quoteSort as LostQuoteSortKey)
    : "decided_desc";
  const filter: LostFilterKey = (FILTER_KEYS as string[]).includes(params.show ?? "") ? (params.show as LostFilterKey) : "all";

  const { data: expiredLeads } = await supabase
    .from("leads")
    .select(
      "id, source, pickup_text, destination_text, travel_date, pickup_time, passenger_count, notes, created_at, customers(company_name, contact_name), profiles(full_name)",
    )
    .eq("status", "expired");

  const { data: quotes } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, currency, status, decided_at, expiry_at, ai_generated, ai_model, customers(company_name, contact_name, email), enquiries(leads(source), enquiry_legs(pickup_address, destination_address, pickup_date)), quote_versions!quotes_current_version_id_fkey(selling_price), quote_decisions(decision, reason, free_text), profiles!quotes_created_by_fkey(full_name)",
    )
    .in("status", ["rejected", "expired", "cancelled"]);

  return (
    <BookingsLostPage
      quotes={sortQuotes((quotes ?? []) as unknown as LostBookingQuote[], quoteSort)}
      expiredLeads={sortLeads((expiredLeads ?? []) as unknown as ExpiredLead[], leadSort)}
      filter={filter}
    />
  );
}
