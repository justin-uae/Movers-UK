import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime, formatDateAndTime } from "@/lib/formatDate";
import { PrintButton } from "./PrintButton";

interface BrandSnapshot {
  name: string;
  logo_url: string | null;
  primary_color: string;
}

interface VersionRow {
  vehicle_description: string | null;
  selling_price: number;
  brand_snapshot: BrandSnapshot;
  terms_snapshot: string | null;
}

interface LegRow {
  sequence: number;
  pickup_address: string;
  destination_address: string;
  pickup_date: string | null;
  pickup_time: string | null;
  passenger_count: number | null;
}

interface BankAccountRow {
  profile_label: string | null;
  account_name: string;
  bank_name: string;
  account_number: string | null;
  iban: string | null;
  sort_code: string | null;
  swift_bic: string | null;
}

export default async function InvoiceDownloadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: quote } = await admin
    .from("quotes")
    .select(
      "id, quote_number, status, currency, brand_id, tenant_id, invoice_number, invoiced_at, customers(company_name, contact_name, email, phone, billing_address), enquiries(enquiry_legs(sequence, pickup_address, destination_address, pickup_date, pickup_time, passenger_count)), quote_versions!quotes_current_version_id_fkey(vehicle_description, selling_price, brand_snapshot, terms_snapshot)",
    )
    .eq("public_token", token)
    .single();

  if (!quote || quote.status !== "paid") notFound();

  // Same fallback chain as the public quote page and quote PDF: a per-quote
  // override if one was set, else the tenant-wide Terms & Conditions.
  const { data: tenant } = await admin.from("tenants").select("terms_and_conditions").eq("id", quote.tenant_id).maybeSingle();

  const { data: brandRow } = await admin.from("brands").select("companies(legal_name, registered_address)").eq("id", quote.brand_id).single();
  const company = brandRow?.companies as unknown as { legal_name: string; registered_address: string | null } | null;

  // Tenant-wide payment profiles — every profile is shown, not just ones
  // matching the quote's currency.
  const { data: bankAccounts } = await admin
    .from("bank_accounts")
    .select("profile_label, account_name, bank_name, account_number, iban, sort_code, swift_bic")
    .eq("tenant_id", quote.tenant_id)
    .order("sort_order");

  const customer = quote.customers as unknown as {
    company_name: string | null;
    contact_name: string;
    email: string | null;
    phone: string | null;
    billing_address: string | null;
  } | null;
  const legs = [...((quote.enquiries as unknown as { enquiry_legs: LegRow[] } | null)?.enquiry_legs ?? [])].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const version = quote.quote_versions as unknown as VersionRow | null;
  const brand = version?.brand_snapshot;
  const money = (amount: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: quote.currency, maximumFractionDigits: 2 }).format(amount);

  return (
    <div className="min-h-screen bg-appbg px-4 py-10 print:bg-white print:p-0">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link href={`/q/${token}`} className="flex items-center gap-2 text-sm font-bold text-slate-500">
            <ArrowLeft size={16} />
            Back to quote
          </Link>
          <PrintButton />
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:shadow-none">
          <div className="flex items-center justify-between border-b pb-6">
            <div className="flex items-center gap-3">
              <div
                className="grid h-12 w-12 place-items-center rounded-2xl text-white"
                style={{ backgroundColor: brand?.primary_color ?? "#f97316" }}
              >
                <Bus size={26} />
              </div>
              <div className="text-lg font-black text-slate-900">{brand?.name ?? "Invoice"}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-black uppercase tracking-[.18em] text-primary-500">Invoice</div>
              <div className="text-lg font-black">{quote.invoice_number ?? "—"}</div>
              <div className="text-xs text-slate-400">
                {quote.invoiced_at ? formatDateTime(quote.invoiced_at) : "—"}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 text-sm sm:grid-cols-2">
            <div className="space-y-4">
              <div>
                <div className="text-xs font-bold uppercase text-slate-400">From</div>
                <div className="mt-1 font-bold">{company?.legal_name || brand?.name}</div>
                {company?.registered_address && (
                  <div className="whitespace-pre-line text-slate-500">{company.registered_address}</div>
                )}
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-slate-400">Billed to</div>
                <div className="mt-1 font-bold">{customer?.company_name || customer?.contact_name}</div>
                {customer?.billing_address && <div className="text-slate-500">{customer.billing_address}</div>}
                {customer?.email && <div className="text-slate-500">{customer.email}</div>}
                {customer?.phone && <div className="text-slate-500">{customer.phone}</div>}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-xs font-bold uppercase text-slate-400">Quote reference</div>
              <div className="mt-1 font-bold">{quote.quote_number}</div>
              <span className="mt-2 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                Paid
              </span>
            </div>
          </div>

          <table className="mt-8 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-400">
                <th className="pb-2">Description</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-4">
                  {legs.length > 0 ? (
                    <div className="space-y-2">
                      {legs.map((leg, i) => (
                        <div key={i}>
                          <div className="font-bold">
                            {legs.length > 1 && <span className="text-slate-400">Leg {leg.sequence} · </span>}
                            {leg.pickup_address} → {leg.destination_address}
                          </div>
                          <div className="text-xs text-slate-500">
                            {i === 0 && version?.vehicle_description ? `${version.vehicle_description} · ` : ""}
                            {leg.pickup_date && formatDateAndTime(leg.pickup_date, leg.pickup_time)}
                            {leg.passenger_count ? ` · ${leg.passenger_count} passengers` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="font-bold">Transport service</div>
                  )}
                </td>
                <td className="py-4 text-right font-bold">{version ? money(version.selling_price) : "—"}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-4 text-right font-bold text-slate-500">Total paid</td>
                <td className="pt-4 text-right text-lg font-black text-primary-600">
                  {version ? money(version.selling_price) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>

          {bankAccounts && bankAccounts.length > 0 && (
            <div className="mt-8 rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">
              <div className="font-bold text-slate-600">Paid via bank transfer to</div>
              {bankAccounts.map((account, i) => (
                <div key={i} className="mt-1">
                  {account.profile_label ? `${account.profile_label}: ` : ""}
                  {account.account_name} · {account.bank_name}
                  {account.iban && ` · IBAN ${account.iban}`}
                  {account.sort_code && ` · Sort code ${account.sort_code}`}
                </div>
              ))}
            </div>
          )}

          {(version?.terms_snapshot?.trim() || tenant?.terms_and_conditions?.trim()) && (
            <div className="mt-8 border-t pt-4">
              <div className="text-xs font-bold uppercase text-slate-400">Terms &amp; Conditions</div>
              <p className="mt-2 whitespace-pre-line text-xs text-slate-400">
                {version?.terms_snapshot?.trim() || tenant?.terms_and_conditions}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
