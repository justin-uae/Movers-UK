import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getAssignableSalesUsers } from "@/lib/leadAssignees";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { BackLink } from "@/components/ui/BackLink";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { RichText } from "@/components/ui/RichText";
import { QuoteDetailActions, type AmendableMove, type QuoteRefund } from "@/components/pages/QuoteDetailActions";
import { AssignQuoteButton } from "@/components/pages/AssignQuoteButton";
import { RequestCardPaymentButton } from "@/components/pages/RequestCardPaymentButton";
import { BookingEditHistory, type BookingEditRecord } from "@/components/pages/BookingEditHistory";
import { MoveDetailCard, type MoveLeg } from "@/components/pages/MoveDetailCard";
import { pickMoveDetails } from "@/lib/moveDetails";
import { formatDateTime, formatDate } from "@/lib/formatDate";
import type { QuoteStatus, QuoteEventType, QuoteDecisionType, CustomerPaymentMethod, JobStatus } from "@/lib/supabase/database.types";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_STYLE, QUOTE_EVENT_LABEL } from "@/lib/quoteStatus";
import { getAiModelLabel } from "@/lib/aiProviderRegistry";
import { moveRouteDistances } from "@/lib/moveDistance";
import { SendEmailButton } from "@/components/ui/SendEmailButton";
import { QuoteRemindersPanel, type QuoteReminderRow } from "@/components/pages/QuoteRemindersPanel";
import { QuoteExpiryEditor } from "@/components/pages/QuoteExpiryEditor";
import { EditQuotePriceButton } from "@/components/pages/EditQuotePriceButton";
import { SpecialDealButton } from "@/components/pages/SpecialDealButton";
import { ReopenQuoteButton } from "@/components/pages/ReopenQuoteButton";
import { SPECIAL_DEAL_STATUSES } from "@/lib/quoteSpecialDeal";
import { EXPIRY_EDITABLE_STATUSES } from "@/lib/quoteExpiry";
import { vatBreakdown, formatVatRate } from "@/lib/vat";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";

interface LineItemRow {
  id: string;
  description: string;
  amount: number;
  category: string;
}

interface VersionRow {
  id: string;
  version_number: number;
  van_size: string | null;
  supplier_estimated_cost: number | null;
  selling_price: number;
  /** Special Deal (0114_special_deals.sql) — the struck-through pre-deal price. */
  original_price: number | null;
  discount_percent: number | null;
  discount_source: "special_deal" | "too_expensive_auto" | null;
  vat_rate: number;
  currency: string;
  deposit_percentage: number | null;
  deposit_fixed_amount: number | null;
  payment_methods: { stripe: boolean; bank_transfer: boolean };
  customer_notes: string | null;
  terms_snapshot: string | null;
  created_at: string;
  quote_line_items: LineItemRow[];
}

interface MilestoneRow {
  id: string;
  sequence: number;
  label: string;
  amount: number;
  due_date: string | null;
}

interface PaymentRow {
  id: string;
  amount: number;
  method: CustomerPaymentMethod;
  paid_at: string;
}

interface QuoteDetailRow {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  expiry_at: string | null;
  invoice_number: string | null;
  invoiced_at: string | null;
  public_token: string;
  created_at: string;
  sent_at: string | null;
  viewed_at: string | null;
  decided_at: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  cancelled_by_profile: { full_name: string } | null;
  created_by: string | null;
  created_by_profile: { full_name: string } | null;
  ai_generated: boolean;
  ai_model: { provider: string; model: string } | null;
  customers: { id: string; company_name: string | null; contact_name: string; phone: string | null; whatsapp: string | null; email: string | null; reminders_opted_out_at: string | null } | null;
  enquiries: { id: string; lead_id: string | null; assigned_user_id: string | null; enquiry_legs: (MoveLeg & { id: string })[] } | null;
  quote_versions: VersionRow[];
  quote_events: { event: QuoteEventType; detail: string | null; created_at: string }[];
  quote_decisions: { decision: QuoteDecisionType; reason: string | null; free_text: string | null; decided_at: string }[];
  customer_payments: PaymentRow[];
  quote_payment_milestones: MilestoneRow[];
  reminders_paused_at: string | null;
  reminders_pause_reason: string | null;
  quote_reminders: QuoteReminderRow[];
}

const EVENT_LABEL = QUOTE_EVENT_LABEL;

/** Pence-accurate — for the VAT breakdown, where whole-unit rounding would make net + VAT not visibly add up. */
function moneyExact(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function money(amount: number | undefined | null, currency: string) {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireProfile();
  const supabase = await createClient();
  const [canCancelPermission, canProcessRefunds, canAmendPermission, canCreateQuote, canAssign, canSendQuotes, canChangeExpiry, canEditQuotes, { data: tenantSettings }] = await Promise.all([
    hasPermission(actor, PERMISSIONS.QUOTES_CANCEL),
    hasPermission(actor, PERMISSIONS.FINANCE_PROCESS_REFUNDS),
    hasPermission(actor, PERMISSIONS.BOOKINGS_AMEND),
    hasPermission(actor, PERMISSIONS.QUOTES_CREATE),
    hasPermission(actor, PERMISSIONS.ENQUIRIES_REASSIGN),
    hasPermission(actor, PERMISSIONS.QUOTES_SEND),
    hasPermission(actor, PERMISSIONS.QUOTES_CHANGE_EXPIRY),
    hasPermission(actor, PERMISSIONS.QUOTES_EDIT),
    supabase.from("tenants").select("quote_reminders_enabled, quote_reminders_enabled_at, quote_validity_days").eq("id", actor.tenant_id).single(),
  ]);
  const assignableUsers = canAssign ? await getAssignableSalesUsers(supabase) : [];

  const { data: quoteRaw, error: quoteError } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, currency, expiry_at, invoice_number, invoiced_at, public_token, created_at, sent_at, viewed_at, decided_at, cancellation_reason, cancelled_by, cancelled_by_profile:profiles!quotes_cancelled_by_fkey(full_name), created_by, created_by_profile:profiles!quotes_created_by_fkey(full_name), ai_generated, ai_model, customers(id, company_name, contact_name, phone, whatsapp, email, reminders_opted_out_at), enquiries(id, lead_id, assigned_user_id, enquiry_legs(id, sequence, pickup_address, destination_address, pickup_date, pickup_time, van_size, special_requirements, move_type, property_type, rooms, estimated_boxes, pickup_floor, destination_floor, lift_available, packing_needed, dismantling_needed, assembly_needed, storage_needed, fragile_items)), quote_versions!quote_versions_quote_id_fkey(id, version_number, van_size, supplier_estimated_cost, selling_price, original_price, discount_percent, discount_source, vat_rate, currency, deposit_percentage, deposit_fixed_amount, payment_methods, customer_notes, terms_snapshot, created_at, quote_line_items(id, description, amount, category)), quote_events(event, detail, created_at), quote_decisions(decision, reason, free_text, decided_at), customer_payments(id, amount, method, paid_at), quote_payment_milestones(id, sequence, label, amount, due_date), reminders_paused_at, reminders_pause_reason, quote_reminders(kind, step, sent_at, error)",
    )
    .eq("id", id)
    .single();

  if (quoteError) console.error("quote detail fetch failed:", quoteError.message);
  if (!quoteRaw) notFound();
  const quote = quoteRaw as unknown as QuoteDetailRow;
  const canCancel = actor.is_master_admin || (canCancelPermission && quote.enquiries?.assigned_user_id === actor.id);

  const legs = [...(quote.enquiries?.enquiry_legs ?? [])].sort((a, b) => a.sequence - b.sequence);

  const [{ data: job }, { data: refunds }, { data: amendmentsRaw }, { data: latestCardPaymentRequest }, legDistances] = await Promise.all([
    supabase.from("jobs").select("id, status, suppliers(name)").eq("quote_id", id).maybeSingle(),
    supabase
      .from("refunds")
      .select(
        "id, quote_id, amount, currency, reason, status, created_at, processed_at, requested_by_profile:profiles!refunds_requested_by_fkey(full_name), processed_by_profile:profiles!refunds_processed_by_fkey(full_name)",
      )
      .eq("quote_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("booking_amendments")
      .select(
        "id, reason, changes, customer_charge_amount, supplier_adjustment_amount, supplier_approval_status, supplier_responded_at, created_at, profiles(full_name), job_allocation_adjustments(amount, reason, created_at)",
      )
      .eq("quote_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("card_payment_override_requests")
      .select("id, status")
      .eq("quote_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    moveRouteDistances(legs),
  ]);

  const canAmend = actor.is_master_admin || (canAmendPermission && quote.enquiries?.assigned_user_id === actor.id);

  const customer = quote.customers;
  const move = legs[0] ?? null;
  const amendableMove: AmendableMove | null = move
    ? {
        id: move.id,
        pickupAddress: move.pickup_address,
        destinationAddress: move.destination_address,
        pickupDate: move.pickup_date,
        pickupTime: move.pickup_time,
        vanSize: move.van_size,
        moveDetails: pickMoveDetails(move),
        specialRequirements: move.special_requirements,
      }
    : null;
  const amendments = (amendmentsRaw ?? []) as unknown as BookingEditRecord[];
  const assignedName = assignableUsers.find((u) => u.id === quote.enquiries?.assigned_user_id)?.full_name ?? null;
  const versions = [...(quote.quote_versions ?? [])].sort((a, b) => b.version_number - a.version_number);
  const currentVersion = versions[0] ?? null;
  const events = [...(quote.quote_events ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const decision = quote.quote_decisions?.[0] ?? null;
  const jobRow = job as unknown as { id: string; status: JobStatus; suppliers: { name: string } | null } | null;
  const payments = [...(quote.customer_payments ?? [])].sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime());
  const paidSoFar = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balanceRemaining = Math.max(0, (currentVersion?.selling_price ?? 0) - paidSoFar);
  const milestones = [...(quote.quote_payment_milestones ?? [])].sort((a, b) => a.sequence - b.sequence);
  let milestoneCumulative = 0;

  const paymentPlanLabel = milestones.length > 0
    ? `${milestones.length}-step payment schedule`
    : currentVersion?.deposit_fixed_amount
      ? `${money(currentVersion.deposit_fixed_amount, quote.currency)} fixed deposit`
      : currentVersion?.deposit_percentage
        ? `${currentVersion.deposit_percentage}% deposit plan`
        : "Full payment plan";

  return (
    <div>
      <Breadcrumb items={[{ label: "Pending Quotes", href: "/quotes" }, { label: quote.quote_number }]} />
      <PageHead
        eyebrow="Sales Workspace"
        title={quote.quote_number}
        text={customer?.company_name || customer?.contact_name || undefined}
        action={<BackLink fallbackHref="/quotes" label="Back to Quotes" />}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel>
            <div className="flex items-start justify-between">
              <SectionTitle title="Move" sub="Addresses, date and move details" />
              <span className={"rounded-full px-2.5 py-1 text-xs font-bold " + QUOTE_STATUS_STYLE[quote.status]}>
                {QUOTE_STATUS_LABEL[quote.status]}
              </span>
            </div>
            <div className="mt-4">
              {move ? (
                <MoveDetailCard leg={move} distance={legDistances[0]} />
              ) : (
                <p className="text-sm text-slate-500">No move details recorded.</p>
              )}
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="Pricing" sub="Current version details" />
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Van size</dt>
                <dd className="mt-0.5 font-semibold">{currentVersion?.van_size ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Valid until</dt>
                <dd className="mt-0.5 font-semibold">
                  <QuoteExpiryEditor
                    quoteId={quote.id}
                    expiryAt={quote.expiry_at}
                    canChange={canChangeExpiry && EXPIRY_EDITABLE_STATUSES.includes(quote.status)}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Supplier cost (est.)</dt>
                <dd className="mt-0.5 font-semibold">{money(currentVersion?.supplier_estimated_cost, quote.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">{currentVersion?.vat_rate ? "Selling price incl. VAT" : "Selling price"}</dt>
                <dd className="mt-0.5 text-base font-black text-primary-600">
                  {currentVersion?.original_price != null && (
                    <span className="mr-2 text-sm font-semibold text-slate-400 line-through">{money(currentVersion.original_price, quote.currency)}</span>
                  )}
                  {money(currentVersion?.selling_price, quote.currency)}
                </dd>
                {currentVersion?.discount_percent != null && (
                  <dd className="mt-1">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      {currentVersion.discount_source === "too_expensive_auto" ? "Automatic deal" : "Today's Special Deal"} · {Number(currentVersion.discount_percent)}% off
                    </span>
                  </dd>
                )}
                {currentVersion && currentVersion.vat_rate > 0 && (() => {
                  const { net, vat } = vatBreakdown(currentVersion.selling_price, currentVersion.vat_rate);
                  return (
                    <dd className="mt-0.5 text-xs text-slate-500">
                      {moneyExact(net, quote.currency)} + {formatVatRate(currentVersion.vat_rate)} VAT ({moneyExact(vat, quote.currency)})
                    </dd>
                  );
                })()}
              </div>
              <div className="col-span-2">
                <dt className="text-xs font-bold uppercase text-slate-400">Payment method</dt>
                <dd className="mt-0.5 font-semibold">
                  {currentVersion?.payment_methods?.stripe
                    ? currentVersion.payment_methods.bank_transfer
                      ? "Card or bank transfer"
                      : "Card payment"
                    : "Bank transfer only"}
                  {currentVersion?.payment_methods?.stripe && latestCardPaymentRequest?.status === "approved" && (
                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      Card approved by Master Admin
                    </span>
                  )}
                </dd>
                {!currentVersion?.payment_methods?.stripe && canCreateQuote && (
                  <>
                    {latestCardPaymentRequest?.status === "pending" ? (
                      <p className="mt-2 rounded-xl bg-amber-50 p-2.5 text-xs font-semibold text-amber-700">
                        Card payment requested — waiting on Master Admin approval.
                      </p>
                    ) : (
                      <>
                        {latestCardPaymentRequest?.status === "rejected" && (
                          <p className="mt-2 text-xs font-semibold text-red-600">A previous request for card payment was rejected.</p>
                        )}
                        <RequestCardPaymentButton quoteId={quote.id} quoteNumber={quote.quote_number} />
                      </>
                    )}
                  </>
                )}
              </div>
            </dl>
            {currentVersion && currentVersion.quote_line_items.length > 0 && (
              <div className="mt-4 space-y-1.5 rounded-2xl bg-slate-50 p-4 text-sm">
                <div className="text-xs font-bold uppercase text-slate-400">Itemised extras</div>
                {currentVersion.quote_line_items.map((li) => (
                  <div key={li.id} className="flex justify-between">
                    <span className="text-slate-500">{li.description}</span>
                    <b>{money(li.amount, quote.currency)}</b>
                  </div>
                ))}
              </div>
            )}
            {currentVersion?.customer_notes && <RichText text={currentVersion.customer_notes} className="mt-4 text-sm text-slate-600" />}
          </Panel>

          {milestones.length > 0 && (
            <Panel>
              <SectionTitle title="Payment schedule" sub="Milestones for this quote" />
              <div className="mt-4 space-y-2 text-sm">
                {milestones.map((m) => {
                  milestoneCumulative += Number(m.amount);
                  const covered = milestoneCumulative <= paidSoFar + 0.01;
                  return (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b py-1.5 last:border-0">
                      <span className={covered ? "text-slate-400 line-through" : "text-slate-600"}>
                        {m.label}
                        {m.due_date ? ` · due ${formatDate(m.due_date)}` : ""}
                      </span>
                      <b className={covered ? "text-slate-400" : ""}>{money(m.amount, quote.currency)}</b>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          <Panel>
            <SectionTitle title="Customer" />
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Name</dt>
                <dd className="mt-0.5 font-semibold">{customer?.company_name || customer?.contact_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Phone</dt>
                <dd className="mt-0.5 flex items-center gap-2 font-semibold">
                  {customer?.phone || "—"}
                  <WhatsAppLink number={customer?.whatsapp || customer?.phone} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Email</dt>
                <dd className="mt-0.5 font-semibold">
                  {customer?.email ? customer.email : <span className="text-amber-600">No email on file</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Sales rep</dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-2 font-semibold">
                  <span>{assignedName ?? quote.created_by_profile?.full_name ?? "—"}</span>
                  {canAssign && (
                    <AssignQuoteButton
                      quoteId={quote.id}
                      quoteNumber={quote.quote_number}
                      currentAssigneeId={quote.enquiries?.assigned_user_id ?? null}
                      currentAssigneeName={assignedName}
                      assignableUsers={assignableUsers}
                    />
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Sent Date</dt>
                <dd className="mt-0.5 font-semibold">{quote.sent_at ? formatDateTime(quote.sent_at) : "—"}</dd>
              </div>
            </dl>
            {quote.ai_generated && (
              <p className="mt-4 rounded-xl bg-primary-50 p-3 text-xs font-semibold text-primary-700">
                This quote was priced and sent automatically by AI Auto-Quote (Settings -&gt; AI Assistant)
                {getAiModelLabel(quote.ai_model) ? ` — ${getAiModelLabel(quote.ai_model)}` : ""}. Review the price before
                relying on it for anything beyond the customer&rsquo;s copy.
              </p>
            )}
            {customer?.id && (
              <Link
                href={`/customers/${customer.id}`}
                className="mt-4 inline-block rounded-xl border px-4 py-2 text-sm font-bold text-primary-600 hover:bg-primary-50"
              >
                View customer record →
              </Link>
            )}
            {quote.sent_at && !customer?.email && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-700">
                This quote is marked as sent, but the customer has no email on file — it was never actually emailed to
                them. Add an email address to the customer record above, then use &ldquo;Resend Quote Email&rdquo; to
                deliver it.
              </p>
            )}
          </Panel>

          <QuoteRemindersPanel
            quoteId={quote.id}
            status={quote.status}
            sentAt={quote.sent_at}
            decidedAt={quote.decided_at}
            expiryAt={quote.expiry_at}
            legs={legs}
            enabled={tenantSettings?.quote_reminders_enabled ?? false}
            enabledAt={tenantSettings?.quote_reminders_enabled_at ?? null}
            customerEmail={customer?.email ?? null}
            optedOutAt={customer?.reminders_opted_out_at ?? null}
            pausedAt={quote.reminders_paused_at}
            pauseReason={quote.reminders_pause_reason}
            hasPayments={quote.customer_payments.length > 0}
            reminders={quote.quote_reminders ?? []}
            // Mirrors loadManageableQuote in app/(staff)/quotes/reminderActions.ts.
            canManage={actor.is_master_admin || quote.enquiries?.assigned_user_id === actor.id || quote.created_by === actor.id || canSendQuotes}
            isMasterAdmin={actor.is_master_admin}
          />

          <Panel>
            <SectionTitle title="Timeline" sub="Every recorded event on this quote" />
            <ol className="mt-4 space-y-3">
              {events.map((e, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b pb-3 text-sm last:border-0">
                  <span className="font-semibold">
                    {EVENT_LABEL[e.event]}
                    {e.detail && <span className="font-normal text-slate-500"> — {e.detail}</span>}
                  </span>
                  <span className="text-xs text-slate-400">{formatDateTime(e.created_at)}</span>
                </li>
              ))}
              {events.length === 0 && <p className="text-sm text-slate-500">No events recorded yet.</p>}
            </ol>
            {decision && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
                <div className="font-bold capitalize">Customer {decision.decision}</div>
                {decision.reason && <p className="mt-1 text-slate-600">Reason: {decision.reason}</p>}
                {decision.free_text && <p className="mt-1 text-slate-600">&ldquo;{decision.free_text}&rdquo;</p>}
                <p className="mt-1 text-xs text-slate-400">{formatDateTime(decision.decided_at)}</p>
              </div>
            )}
            {quote.status === "cancelled" && (
              <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm">
                <div className="font-bold text-red-700">Booking cancelled</div>
                {quote.cancellation_reason && <p className="mt-1 text-slate-600">Reason: {quote.cancellation_reason}</p>}
                <p className="mt-1 text-xs text-slate-400">
                  {quote.cancelled_by_profile?.full_name ?? "Staff"}
                  {quote.decided_at && ` · ${formatDateTime(quote.decided_at)}`}
                </p>
              </div>
            )}
          </Panel>

          <BookingEditHistory amendments={amendments} currency={quote.currency} />

          {versions.length > 1 && (
            <Panel>
              <SectionTitle title="Version history" sub="Every price this quote has had — each Edit Price or booking amendment adds a version" />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="text-xs uppercase text-slate-400">
                    <tr>
                      <th className="pb-2">Version</th>
                      <th className="pb-2">Selling price</th>
                      <th className="pb-2">VAT</th>
                      <th className="pb-2">Supplier cost</th>
                      <th className="pb-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.id} className="border-t">
                        <td className="whitespace-nowrap py-2 font-bold">
                          v{v.version_number}
                          {v.id === currentVersion?.id && (
                            <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">Current</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-2">
                          {money(v.selling_price, v.currency)}
                          {v.discount_percent != null && (
                            <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">{Number(v.discount_percent)}% off</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-2 text-slate-500">{v.vat_rate > 0 ? formatVatRate(v.vat_rate) : "—"}</td>
                        <td className="whitespace-nowrap py-2 text-slate-500">{money(v.supplier_estimated_cost, v.currency)}</td>
                        <td className="min-w-[11rem] py-2 text-slate-500">{formatDateTime(v.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Invoice" />
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between border-b py-1.5">
                <span className="text-slate-500">Invoice number</span>
                <b>{quote.invoice_number ?? "—"}</b>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-1.5">
                <span className="text-slate-500">Invoiced</span>
                <b>{quote.invoiced_at ? formatDateTime(quote.invoiced_at) : "—"}</b>
              </div>
            </dl>
            <div className="mt-4">
              {quote.status === "expired" &&
                // Same people as Edit Price, plus anyone who can change expiry dates — mirrors reopenExpiredQuoteAction.
                (actor.is_master_admin || canChangeExpiry || canEditQuotes || canCreateQuote || canSendQuotes) && (
                  <div className="mb-3 rounded-xl border border-red-100 bg-red-50 p-3">
                    <p className="mb-2.5 text-sm text-red-700">
                      This quote expired before the customer decided. Re-open it to edit it and send it again.
                    </p>
                    <ReopenQuoteButton
                      quoteId={quote.id}
                      quoteNumber={quote.quote_number}
                      customerLabel={customer?.company_name || customer?.contact_name || "—"}
                      validityDays={tenantSettings?.quote_validity_days ?? 30}
                    />
                  </div>
                )}
              <QuoteDetailActions
                quote={{
                  id: quote.id,
                  quote_number: quote.quote_number,
                  status: quote.status,
                  currency: quote.currency,
                  public_token: quote.public_token,
                  invoice_number: quote.invoice_number,
                  customerLabel: customer?.company_name || customer?.contact_name || "—",
                  sellingPrice: currentVersion?.selling_price ?? null,
                }}
                canCancel={canCancel}
                canProcessRefunds={canProcessRefunds}
                canAmend={canAmend}
                canCreateQuote={canCreateQuote}
                enquiryId={quote.enquiries?.id ?? null}
                move={amendableMove}
                jobStatus={jobRow?.status ?? null}
                refunds={(refunds ?? []) as unknown as QuoteRefund[]}
              />
              <SendEmailButton email={customer?.email} quoteNumber={quote.quote_number} className="mt-2" />
              {currentVersion &&
                ["draft", "sent", "viewed"].includes(quote.status) &&
                // Any sales-side role — mirrors editQuotePriceAction (app/(staff)/quotes/priceActions.ts).
                (actor.is_master_admin || canEditQuotes || canCreateQuote || canSendQuotes) && (
                  <EditQuotePriceButton
                    quoteId={quote.id}
                    status={quote.status}
                    currency={quote.currency}
                    sellingPrice={currentVersion.selling_price}
                    vatRate={currentVersion.vat_rate}
                    supplierEstimatedCost={currentVersion.supplier_estimated_cost}
                  />
                )}
              {currentVersion &&
                SPECIAL_DEAL_STATUSES.includes(quote.status) &&
                // Same people as Edit Price — mirrors applySpecialDealAction.
                (actor.is_master_admin || canEditQuotes || canCreateQuote || canSendQuotes) && (
                  <SpecialDealButton
                    quoteId={quote.id}
                    status={quote.status}
                    currency={quote.currency}
                    sellingPrice={currentVersion.selling_price}
                    originalPrice={currentVersion.original_price}
                    supplierEstimatedCost={currentVersion.supplier_estimated_cost}
                  />
                )}
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="Payments" sub={paymentPlanLabel} />
            <div className="mt-4 space-y-2 text-sm">
              {payments.map((p) => (
                <div key={p.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-1.5 last:border-0">
                  <span className="capitalize text-slate-500">
                    {p.method.replace("_", " ")} · {formatDateTime(p.paid_at)}
                  </span>
                  <b>{money(p.amount, quote.currency)}</b>
                </div>
              ))}
              {payments.length === 0 && <p className="text-sm text-slate-500">No payments recorded yet.</p>}
              {payments.length > 0 && (
                <div className="flex justify-between pt-1.5 text-sm font-bold">
                  <span>Balance remaining</span>
                  <span className="text-primary-600">{money(balanceRemaining, quote.currency)}</span>
                </div>
              )}
            </div>
          </Panel>

          {jobRow && (
            <Panel>
              <SectionTitle title="Dispatch" />
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between border-b py-1.5">
                  <span className="text-slate-500">Job status</span>
                  <b className="capitalize">{jobRow.status.replaceAll("_", " ")}</b>
                </div>
                {jobRow.suppliers && (
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Supplier</span>
                    <b>{jobRow.suppliers.name}</b>
                  </div>
                )}
              </div>
              <Link
                href={`/dispatch/${jobRow.id}`}
                className="mt-4 block rounded-xl border border-primary-300 px-4 py-2.5 text-center text-sm font-bold text-primary-700"
              >
                View in Dispatch
              </Link>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
