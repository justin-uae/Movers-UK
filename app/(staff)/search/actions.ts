"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { getGrantedPermissions } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/permissionKeys";

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

export interface SearchResults {
  customers: SearchResult[];
  enquiries: SearchResult[];
  quotes: SearchResult[];
  suppliers: SearchResult[];
}

const RESULT_LIMIT = 6;
const EMPTY: SearchResults = { customers: [], enquiries: [], quotes: [], suppliers: [] };

/**
 * Global search (SRCH-01) — one query per type, gated on the exact same
 * anyOf permission sets as that type's own nav item/page (components/layout/
 * nav.ts), so a result never surfaces something the user couldn't already
 * reach by clicking through the sidebar. RLS on each table narrows further
 * (row-level assignment for leads/quotes, ownership for suppliers) — this
 * function only decides whether to run the query at all.
 */
export async function globalSearchAction(rawQuery: string): Promise<SearchResults> {
  const q = rawQuery.trim();
  if (q.length < 2) return EMPTY;

  // `.or()` filter strings are comma/paren-delimited — strip characters that
  // would let user input break out of the filter syntax rather than just
  // fail to match anything.
  const term = q.replace(/[%,()]/g, "");
  if (!term) return EMPTY;

  const profile = await requireProfile();
  const supabase = await createClient();
  const granted = await getGrantedPermissions(profile);

  const canCustomers = [
    PERMISSIONS.ENQUIRIES_VIEW_OWN,
    PERMISSIONS.ENQUIRIES_VIEW_TEAM,
    PERMISSIONS.ENQUIRIES_VIEW_ALL,
    PERMISSIONS.BOOKINGS_VIEW,
  ].some((k) => granted.has(k));
  const canEnquiries = [
    PERMISSIONS.ENQUIRIES_VIEW_OWN,
    PERMISSIONS.ENQUIRIES_VIEW_TEAM,
    PERMISSIONS.ENQUIRIES_VIEW_ALL,
    PERMISSIONS.ENQUIRIES_ADD,
    PERMISSIONS.ENQUIRIES_CLAIM_OPEN_LEADS,
  ].some((k) => granted.has(k));
  const canQuotes = [PERMISSIONS.QUOTES_CREATE, PERMISSIONS.QUOTES_VIEW_SELLING_PRICE].some((k) => granted.has(k));
  const canSuppliers = [PERMISSIONS.SUPPLIERS_ADD, PERMISSIONS.SUPPLIERS_VIEW_PERFORMANCE, PERMISSIONS.SUPPLIERS_SEND_JOBS].some((k) =>
    granted.has(k),
  );

  const [customers, enquiries, quotes, suppliers] = await Promise.all([
    canCustomers
      ? supabase
          .from("customers")
          .select("id, company_name, contact_name, email")
          .or(`company_name.ilike.%${term}%,contact_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
          .limit(RESULT_LIMIT)
      : Promise.resolve({ data: [] }),
    canEnquiries
      ? supabase
          .from("leads")
          .select("id, pickup_text, destination_text, status, customers(company_name, contact_name)")
          .or(`pickup_text.ilike.%${term}%,destination_text.ilike.%${term}%,notes.ilike.%${term}%`)
          .limit(RESULT_LIMIT)
      : Promise.resolve({ data: [] }),
    canQuotes
      ? supabase
          .from("quotes")
          .select("id, quote_number, invoice_number, status, customers(company_name, contact_name)")
          .or(`quote_number.ilike.%${term}%,invoice_number.ilike.%${term}%`)
          .limit(RESULT_LIMIT)
      : Promise.resolve({ data: [] }),
    canSuppliers
      ? supabase.from("suppliers").select("id, name, email, region").or(`name.ilike.%${term}%,email.ilike.%${term}%`).limit(RESULT_LIMIT)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    customers: (customers.data ?? []).map((c) => ({
      id: c.id,
      title: c.company_name || c.contact_name,
      subtitle: c.email,
      href: `/customers/${c.id}`,
    })),
    enquiries: (enquiries.data ?? []).map((l) => {
      const customer = l.customers as unknown as { company_name: string | null; contact_name: string } | null;
      return {
        id: l.id,
        title:
          l.pickup_text && l.destination_text
            ? `${l.pickup_text} → ${l.destination_text}`
            : customer?.company_name || customer?.contact_name || "Lead",
        subtitle: [customer?.company_name || customer?.contact_name, String(l.status).replaceAll("_", " ")]
          .filter(Boolean)
          .join(" · "),
        href: `/leads/${l.id}`,
      };
    }),
    quotes: (quotes.data ?? []).map((qt) => {
      const customer = qt.customers as unknown as { company_name: string | null; contact_name: string } | null;
      return {
        id: qt.id,
        title: qt.quote_number,
        subtitle: [customer?.company_name || customer?.contact_name, String(qt.status)].filter(Boolean).join(" · "),
        href: `/quotes/${qt.id}`,
      };
    }),
    suppliers: (suppliers.data ?? []).map((s) => ({
      id: s.id,
      title: s.name,
      subtitle: s.region,
      href: `/suppliers/${s.id}`,
    })),
  };
}
