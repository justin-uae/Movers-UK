import { notFound } from "next/navigation";
import { Bus, Clock } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { amountDueNow } from "@/lib/quotePayments";
import { formatDateTime, formatDate, formatDateAndTime, formatTimeOnly } from "@/lib/formatDate";
import type { JourneyLeg } from "@/components/pages/JourneyLegDetail";
import { RichText } from "@/components/ui/RichText";
import { FormattedText } from "@/components/ui/FormattedText";
import { resolveDisplayCurrency, detectVisitorCurrency, convertForDisplay, displayCurrencyChoices } from "@/lib/localCurrency";
import { vatBreakdown, formatVatRate } from "@/lib/vat";
import { QuoteDecisionButtons } from "./QuoteDecisionButtons";
import { PaymentChooser, type BankAccountRow } from "./PaymentChooser";
import { CurrencySelector } from "./CurrencySelector";

interface BrandSnapshot {
  name: string;
  logo_url: string | null;
  primary_color: string;
}

interface LineItemRow {
  description: string;
  amount: number;
  category: string;
}

interface VersionRow {
  vehicle_description: string | null;
  selling_price: number;
  /** Set when a Special Deal is applied (0114_special_deals.sql) — the struck-through "was" price. */
  original_price: number | null;
  discount_percent: number | null;
  vat_rate: number;
  deposit_percentage: number | null;
  deposit_fixed_amount: number | null;
  payment_methods: { stripe: boolean; bank_transfer: boolean };
  customer_notes: string | null;
  terms_snapshot: string | null;
  brand_snapshot: BrandSnapshot;
  quote_line_items: LineItemRow[] | null;
}

interface MilestoneRow {
  sequence: number;
  label: string;
  amount: number;
  due_date: string | null;
}

const DECIDABLE = new Set(["sent", "viewed"]);
const AWAITING_PAYMENT = new Set(["accepted", "partially_paid"]);

export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  /** ?currency= — the customer's own pick from the currency switcher below, overriding the IP-detected one. */
  searchParams: Promise<{ currency?: string }>;
}) {
  const { token } = await params;
  const { currency: requestedCurrency } = await searchParams;
  const admin = createAdminClient();

  const { data: quote } = await admin
    .from("quotes")
    .select(
      "id, quote_number, status, currency, expiry_at, brand_id, tenant_id, invoice_number, invoiced_at, payment_method_chosen, customers(company_name, contact_name), enquiries(enquiry_legs(sequence, journey_type, pickup_address, destination_address, via_points, pickup_date, pickup_time, return_date, return_time, passenger_count, luggage_count, wheelchair_required, child_seats, special_requirements, vehicle_types(name))), quote_versions!quotes_current_version_id_fkey(vehicle_description, selling_price, original_price, discount_percent, vat_rate, deposit_percentage, deposit_fixed_amount, payment_methods, customer_notes, terms_snapshot, brand_snapshot, quote_line_items(description, amount, category)), customer_payments(amount), quote_payment_milestones(sequence, label, amount, due_date)",
    )
    .eq("public_token", token)
    .single();

  if (!quote) notFound();

  // Bank details are tenant-wide payment profiles (0055_bank_details_and_terms.sql) —
  // every profile is shown on every quote, regardless of the quote's own currency.
  const { data: bankAccountsRaw } = await admin
    .from("bank_accounts")
    .select("profile_label, account_name, bank_name, account_number, iban, sort_code, swift_bic, bank_address, payment_notes, currency")
    .eq("tenant_id", quote.tenant_id)
    .order("sort_order");
  const bankAccounts: BankAccountRow[] = bankAccountsRaw ?? [];

  const { data: tenant } = await admin.from("tenants").select("terms_and_conditions").eq("id", quote.tenant_id).maybeSingle();

  const { data: brandRow } = await admin.from("brands").select("companies(legal_name, registered_address)").eq("id", quote.brand_id).single();
  const company = brandRow?.companies as unknown as { legal_name: string; registered_address: string | null } | null;

  let status = quote.status;
  if (status === "sent") {
    await admin
      .from("quotes")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", quote.id);
    await admin.from("quote_events").insert({ quote_id: quote.id, event: "viewed" });
    status = "viewed";
  }

  const customer = quote.customers as unknown as { company_name: string | null; contact_name: string } | null;
  const legs = [...((quote.enquiries as unknown as { enquiry_legs: JourneyLeg[] } | null)?.enquiry_legs ?? [])].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const version = quote.quote_versions as unknown as VersionRow | null;
  const brand = version?.brand_snapshot;
  // Every amount on this page is shown in the customer's local currency
  // (from their IP, or their own pick via ?currency=), converted from the
  // quote's own currency at today's rate — see lib/localCurrency.ts. Card
  // checkout charges that same converted amount. Bank transfer stays in the
  // quote's currency (the bank details are per currency), so it gets its own
  // unconverted label.
  const [display, localCurrency] = await Promise.all([resolveDisplayCurrency(quote.currency, requestedCurrency), detectVisitorCurrency()]);
  const currencyChoices = await displayCurrencyChoices(quote.currency, localCurrency);
  const format = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  const money = (amount: number) => format(convertForDisplay(amount, display), display.currency);
  const quoteMoney = (amount: number) => format(amount, quote.currency);

  const amountPaid = ((quote.customer_payments as unknown as { amount: number }[] | null) ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const milestones = [...((quote.quote_payment_milestones as unknown as MilestoneRow[] | null) ?? [])].sort((a, b) => a.sequence - b.sequence);
  const amountDue = version ? amountDueNow(version, amountPaid, milestones) : 0;
  let milestoneCumulative = 0;

  const hasBreakdown = !!version && ((version.quote_line_items?.length ?? 0) > 0 || version.vat_rate > 0);
  const terms = version?.terms_snapshot?.trim() || tenant?.terms_and_conditions?.trim();

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div
            className="grid h-11 w-11 place-items-center rounded-2xl text-white"
            style={{ backgroundColor: brand?.primary_color ?? "#f97316" }}
          >
            <Bus size={24} />
          </div>
          <div className="text-base font-black uppercase tracking-wide text-slate-900 sm:text-lg">{brand?.name ?? "Your quote"}</div>
        </div>

        {/* Boarding-pass layout: journey on top, a perforated tear line, then
            the "stub" with the price and the customer's next step. No
            overflow-hidden on the card — the currency dropdown overhangs it. */}
        <article className="relative rounded-[28px] bg-white shadow-[0_1px_2px_rgba(15,23,42,.06),0_12px_32px_rgba(15,23,42,.06)]">
          <header className="flex items-center justify-between gap-4 rounded-t-[28px] bg-slate-900 px-6 py-5 text-white sm:px-8">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-[.18em] text-orange-300">Quote {quote.quote_number}</div>
              <h1 className="mt-1 break-words text-xl font-black leading-tight sm:text-2xl">{customer?.company_name || customer?.contact_name}</h1>
            </div>
            <span className="flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold capitalize">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status] ?? "bg-slate-400"}`} />
              {status.replaceAll("_", " ")}
            </span>
          </header>

          <div className="space-y-8 px-6 py-7 sm:px-8">
            {legs.map((leg, i) => (
              <LegPass key={i} leg={leg} index={i} total={legs.length} />
            ))}
          </div>

          {/* Clipped so only the inner half of each notch shows — a bite out of the card edge. */}
          <div className="relative h-8 overflow-hidden" aria-hidden="true">
            <div className="absolute -left-4 top-0 h-8 w-8 rounded-full bg-slate-100 shadow-[inset_-1px_0_2px_rgba(15,23,42,.06)]" />
            <div className="absolute -right-4 top-0 h-8 w-8 rounded-full bg-slate-100 shadow-[inset_1px_0_2px_rgba(15,23,42,.06)]" />
            <div className="absolute inset-x-7 top-[15px] border-t-2 border-dashed border-slate-200" />
          </div>

          <div className="space-y-5 px-6 pb-8 pt-3 sm:px-8">
            {version?.original_price != null && version.discount_percent != null && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-emerald-700">
                <span className="font-black">Today&apos;s Special Deal</span>
                <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-black text-white">{Number(version.discount_percent)}% off</span>
              </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">
                  {version && version.vat_rate > 0 ? "Total price incl. VAT" : "Total price"}
                </div>
                {version?.original_price != null && (
                  <div className="mt-1 text-base font-semibold text-slate-400 line-through">{money(Number(version.original_price))}</div>
                )}
                <div className="text-4xl font-black tracking-tight text-slate-900 sm:text-[44px]">{version ? money(version.selling_price) : "—"}</div>
              </div>
              {version && currencyChoices.length > 1 && (
                <CurrencySelector current={display.currency} quoteCurrency={quote.currency} localCurrency={localCurrency} choices={currencyChoices} />
              )}
            </div>

            {hasBreakdown && version && (
              <div className="space-y-1.5 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                {version.quote_line_items?.map((li, i) => (
                  <div key={i} className="flex justify-between gap-3 text-slate-600">
                    <span>{li.description}</span>
                    <span className="shrink-0">{money(li.amount)}</span>
                  </div>
                ))}
                {version.vat_rate > 0 && (() => {
                  const { net, vat } = vatBreakdown(version.selling_price, version.vat_rate);
                  return (
                    <>
                      <div className="flex justify-between gap-3 text-slate-600">
                        <span>Subtotal (excl. VAT)</span>
                        <span>{money(net)}</span>
                      </div>
                      <div className="flex justify-between gap-3 text-slate-600">
                        <span>VAT ({formatVatRate(version.vat_rate)})</span>
                        <span>{money(vat)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {version && display.converted && (
              <p className="text-xs text-slate-500">
                Prices shown in {display.currency}, converted from {quoteMoney(version.selling_price)} at today's exchange rate — card payments are charged in{" "}
                {display.currency}.
              </p>
            )}

            {quote.expiry_at && DECIDABLE.has(status) && (
              <div className="flex items-center gap-2 rounded-xl bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-800">
                <Clock size={16} className="shrink-0" />
                Price held until {formatDateTime(quote.expiry_at)}
              </div>
            )}

            {DECIDABLE.has(status) ? (
              <QuoteDecisionButtons token={token} />
            ) : AWAITING_PAYMENT.has(status) && version ? (
              <>
                {status === "partially_paid" && (
                  <div className="mb-4 rounded-2xl bg-amber-50 p-4 text-center text-sm">
                    <span className="font-bold text-amber-700">
                      Deposit received: {money(amountPaid)} of {money(version.selling_price)}
                    </span>
                    <div className="text-amber-600">Remaining balance: {money(amountDue)}</div>
                  </div>
                )}
                <PaymentChooser
                  token={token}
                  amountDueLabel={money(amountDue)}
                  bankAmountDueLabel={quoteMoney(amountDue)}
                  checkoutCurrency={display.currency}
                  stripeAvailable={version.payment_methods.stripe}
                  bankTransferAvailable={version.payment_methods.bank_transfer}
                  bankAccounts={bankAccounts}
                  reference={quote.quote_number}
                />
              </>
            ) : status === "paid" ? (
              <InvoiceView
                token={token}
                invoiceNumber={quote.invoice_number}
                invoicedAt={quote.invoiced_at}
                amount={version ? money(version.selling_price) : "—"}
              />
            ) : status === "rejected" ? (
              <div className="rounded-2xl bg-slate-100 p-5 text-center font-bold text-slate-600">
                This quote has been marked as rejected.
              </div>
            ) : (
              <div className="rounded-2xl bg-amber-50 p-5 text-center font-bold text-amber-700">
                This quote is no longer available for a decision (status: {status}).
              </div>
            )}

            {milestones.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-slate-200 p-4 text-sm">
                <div className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">Payment schedule</div>
                {milestones.map((m) => {
                  milestoneCumulative += m.amount;
                  const covered = milestoneCumulative <= amountPaid + 0.01;
                  return (
                    <div key={m.sequence} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-100 py-1.5 last:border-0">
                      <span className={covered ? "text-slate-400 line-through" : "text-slate-600"}>
                        {m.label}
                        {m.due_date ? ` · due ${formatDate(m.due_date)}` : ""}
                      </span>
                      <b className={covered ? "text-slate-400" : ""}>{money(m.amount)}</b>
                    </div>
                  );
                })}
              </div>
            )}

            {version?.customer_notes && <RichText text={version.customer_notes} className="text-sm text-slate-600" />}

            {terms && (
              <details className="group">
                <summary className="cursor-pointer list-none text-sm font-bold text-primary-600 hover:underline [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">View Terms</span>
                  <span className="hidden group-open:inline">Hide Terms</span>
                </summary>
                <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-slate-500">{terms}</p>
              </details>
            )}
          </div>
        </article>

        <div className="mt-6 text-center text-sm leading-relaxed text-slate-500">
          <b className="text-slate-700">{company?.legal_name || brand?.name}</b>
          {company?.registered_address && <div className="whitespace-pre-line">{company.registered_address}</div>}
        </div>
      </div>
    </div>
  );
}

const STATUS_DOT: Record<string, string> = {
  sent: "bg-sky-400",
  viewed: "bg-sky-400",
  accepted: "bg-emerald-400",
  partially_paid: "bg-amber-400",
  paid: "bg-emerald-400",
  rejected: "bg-red-400",
};

/** "The Protea Hotel, Arthur's Road, Sea Point" → bold place name plus the rest of the address underneath. */
function splitAddress(address: string) {
  const comma = address.indexOf(",");
  return comma > 0 ? { place: address.slice(0, comma).trim(), rest: address.slice(comma + 1).trim() } : { place: address, rest: "" };
}

/** One journey leg as the top half of the boarding pass: pickup → destination, then the detail tiles. */
function LegPass({ leg, index, total }: { leg: JourneyLeg; index: number; total: number }) {
  const pickup = splitAddress(leg.pickup_address);
  const destination = splitAddress(leg.destination_address);
  const tiles: { label: string; value: string }[] = [];
  if (leg.pickup_date) tiles.push({ label: "Date", value: formatDate(leg.pickup_date) });
  if (leg.pickup_time) tiles.push({ label: "Pickup time", value: formatTimeOnly(leg.pickup_time) });
  tiles.push({ label: "Passengers", value: leg.passenger_count != null ? String(leg.passenger_count) : "—" });
  if (leg.journey_type === "return" && (leg.return_date || leg.return_time)) {
    tiles.push({ label: "Return", value: leg.return_date ? formatDateAndTime(leg.return_date, leg.return_time) : formatTimeOnly(leg.return_time!) });
  }
  if (leg.vehicle_types?.name) tiles.push({ label: "Vehicle", value: leg.vehicle_types.name });
  if (leg.luggage_count) tiles.push({ label: "Luggage", value: `${leg.luggage_count} bags` });
  if (leg.wheelchair_required) tiles.push({ label: "Accessibility", value: "Wheelchair access" });
  if (leg.child_seats > 0) tiles.push({ label: "Child seats", value: String(leg.child_seats) });

  return (
    <section className={index > 0 ? "border-t border-slate-100 pt-8" : ""}>
      {total > 1 && (
        <div className="mb-4 text-[11px] font-black uppercase tracking-[.14em] text-primary-600">
          Journey {index + 1} of {total} · {leg.journey_type.replaceAll("_", " ")}
        </div>
      )}

      {/* Phones: a vertical route — pickup dot, dashed line with the bus, destination dot. */}
      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 sm:hidden">
        <div className="flex flex-col items-center pt-1" aria-hidden="true">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full border-[3px] border-emerald-600 bg-white" />
          <span className="my-1 w-0 flex-1 border-l-2 border-dashed border-slate-300" />
          <Bus size={18} className="shrink-0 text-primary-600" />
          <span className="my-1 w-0 flex-1 border-l-2 border-dashed border-slate-300" />
          <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-slate-900" />
        </div>
        <div className="space-y-6">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">Pickup</div>
            <div className="mt-1 break-words text-lg font-black leading-snug">{pickup.place}</div>
            {pickup.rest && <div className="mt-0.5 text-sm text-slate-500">{pickup.rest}</div>}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">Destination</div>
            <div className="mt-1 break-words text-lg font-black leading-snug">{destination.place}</div>
            {destination.rest && <div className="mt-0.5 text-sm text-slate-500">{destination.rest}</div>}
          </div>
        </div>
      </div>

      {/* sm and up: pickup and destination side by side, bus line between. */}
      <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)] sm:items-start sm:gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">Pickup</div>
          <div className="mt-1.5 break-words text-lg font-black leading-snug sm:text-xl">{pickup.place}</div>
          {pickup.rest && <div className="mt-1 text-sm text-slate-500">{pickup.rest}</div>}
        </div>
        <div className="flex items-center gap-1.5 text-primary-600 sm:pt-6" aria-hidden="true">
          <span className="flex-1 border-t-2 border-dashed border-slate-300" />
          <Bus size={24} className="shrink-0" />
          <span className="flex-1 border-t-2 border-dashed border-slate-300" />
        </div>
        <div className="min-w-0 sm:text-right">
          <div className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">Destination</div>
          <div className="mt-1.5 break-words text-lg font-black leading-snug sm:text-xl">{destination.place}</div>
          {destination.rest && <div className="mt-1 text-sm text-slate-500">{destination.rest}</div>}
        </div>
      </div>

      {leg.via_points.length > 0 && (
        <div className="mt-4 text-sm text-slate-600">
          <span className="font-bold text-slate-500">Via </span>
          {leg.via_points.join(" → ")}
        </div>
      )}

      {/* Phones: one list, label left / value right. sm and up: separate tiles. */}
      <dl className="mt-6 divide-y divide-slate-200/70 rounded-2xl bg-slate-50 sm:grid sm:grid-cols-3 sm:gap-3 sm:divide-y-0 sm:bg-transparent">
        {tiles.map((t) => (
          <div key={t.label} className="flex min-w-0 items-baseline justify-between gap-4 px-4 py-3 sm:block sm:rounded-2xl sm:bg-slate-50">
            <dt className="shrink-0 text-[11px] font-bold uppercase tracking-[.12em] text-slate-500">{t.label}</dt>
            <dd className="min-w-0 break-words text-right text-[15px] font-bold text-slate-900 sm:mt-1 sm:text-left">{t.value}</dd>
          </div>
        ))}
      </dl>

      {leg.special_requirements && (
        <div className="mt-5">
          <div className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">Special requirements</div>
          <div className="mt-2 text-sm font-semibold text-slate-700">
            <FormattedText text={leg.special_requirements} />
          </div>
        </div>
      )}
    </section>
  );
}

function InvoiceView({
  token,
  invoiceNumber,
  invoicedAt,
  amount,
}: {
  token: string;
  invoiceNumber: string | null;
  invoicedAt: string | null;
  amount: string;
}) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
      <p className="font-bold text-emerald-700">Payment received — thank you.</p>
      <div className="mx-auto mt-4 max-w-xs space-y-2 rounded-xl bg-white p-4 text-left text-sm">
        <div className="flex justify-between border-b py-1.5">
          <span className="text-slate-500">Invoice number</span>
          <b>{invoiceNumber ?? "—"}</b>
        </div>
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-1.5">
          <span className="text-slate-500">Date</span>
          <b>{invoicedAt ? formatDateTime(invoicedAt) : "—"}</b>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-slate-500">Amount paid</span>
          <b className="text-emerald-700">{amount}</b>
        </div>
      </div>
      <a
        href={`/q/${token}/invoice`}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white"
      >
        Download Invoice
      </a>
    </div>
  );
}
