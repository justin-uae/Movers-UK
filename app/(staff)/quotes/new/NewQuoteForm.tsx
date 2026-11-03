"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { RichText } from "@/components/ui/RichText";
import { RichTextToolbar } from "@/components/ui/RichTextToolbar";
import { JourneyLegDetail, type JourneyLeg } from "@/components/pages/JourneyLegDetail";
import type { RouteDistance } from "@/lib/tripDistance";
import { CURRENCIES } from "@/lib/currencies";
import { STRIPE_PRICE_THRESHOLD, paymentMethodsForGbpValue } from "@/lib/quoteMoney";
import { grossFromNet } from "@/lib/vat";
import { createQuoteAction } from "./actions";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";

const STEPS = ["Enquiry", "Pricing", "Review & Send"];
const DEPOSIT_CHOICES = [25, 50, 75] as const;
type DepositMode = "full" | "percentage" | "fixed" | "milestones";
const LINE_ITEM_CATEGORIES = [
  { value: "waiting_time", label: "Waiting time" },
  { value: "toll", label: "Toll" },
  { value: "parking", label: "Parking" },
  { value: "other", label: "Other" },
] as const;

interface MilestoneRow {
  label: string;
  amount: string;
  dueDate: string;
}

interface LineItemRow {
  description: string;
  amount: string;
  category: (typeof LINE_ITEM_CATEGORIES)[number]["value"];
}

interface CustomerInfo {
  name: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  country: string | null;
}

function CustomerSummary({ customer }: { customer: CustomerInfo }) {
  return (
    <dl className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
      <div>
        <dt className="text-xs font-bold uppercase text-slate-400">Name</dt>
        <dd className="mt-0.5 font-semibold">{customer.name}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold uppercase text-slate-400">Contact</dt>
        <dd className="mt-0.5 font-semibold">{customer.contactName}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold uppercase text-slate-400">Email</dt>
        <dd className="mt-0.5 font-semibold">{customer.email ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold uppercase text-slate-400">Phone</dt>
        <dd className="mt-0.5 flex items-center gap-2 font-semibold">
          {customer.phone ?? "—"}
          <WhatsAppLink number={customer.whatsapp || customer.phone} />
        </dd>
      </div>
      {customer.country && (
        <div className="sm:col-span-2">
          <dt className="text-xs font-bold uppercase text-slate-400">Country</dt>
          <dd className="mt-0.5 font-semibold">{customer.country}</dd>
        </div>
      )}
    </dl>
  );
}

export function NewQuoteForm({
  enquiryId,
  customer,
  legs,
  legDistances,
  defaultCurrency,
  canSend,
  defaultExpiryDays,
}: {
  enquiryId: string;
  customer: CustomerInfo;
  legs: JourneyLeg[];
  /** Stop-by-stop route distance per leg, index-aligned with `legs`. */
  legDistances: RouteDistance[];
  defaultCurrency: string;
  canSend: boolean;
  /** Tenant default from Settings -> Bank Details & Terms (0104_quote_validity_days.sql). */
  defaultExpiryDays: number;
}) {
  const notify = useToast();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [currency, setCurrency] = useState(defaultCurrency);
  const [supplierEstimatedCost, setSupplierEstimatedCost] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [vatRate, setVatRate] = useState("0");
  const [expiryDays, setExpiryDays] = useState(String(defaultExpiryDays));
  const [depositMode, setDepositMode] = useState<DepositMode>("full");
  const [depositPercentage, setDepositPercentage] = useState<25 | 50 | 75>(25);
  const [depositFixedAmount, setDepositFixedAmount] = useState("");
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [customerNotes, setCustomerNotes] = useState("");
  const customerNotesRef = useRef<HTMLTextAreaElement>(null);
  const [forceBankTransfer, setForceBankTransfer] = useState(false);
  const [sendNow, setSendNow] = useState(true);
  // Holds the warning text (not just a boolean) so it can double as the
  // "confirmed" flag and be shown inline — same warn-then-allow shape as
  // PAY-01/PAY-02 in CustomerPaymentsPage.tsx: an amber banner appears in
  // the modal body and the confirm button itself relabels to "anyway",
  // rather than a generic red error asking to click the same button again.
  const [lowSupplierCostWarning, setLowSupplierCostWarning] = useState<string | null>(null);

  // Fetched once on mount rather than per keystroke — the live "which
  // payment method will this get" preview below just does the arithmetic
  // itself from these cached rates. The authoritative conversion happens
  // server-side at submit time (see createQuoteAction), so a stale or
  // unavailable rate here only affects the preview, never the real decision.
  const [gbpRates, setGbpRates] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    fetch("/api/fx/rates")
      .then((r) => r.json())
      .then((data) => setGbpRates(data.rates ?? null))
      .catch(() => setGbpRates(null));
  }, []);

  // sellingPrice is entered before VAT; totalNum (incl. VAT) is what the
  // customer pays and what gets stored as selling_price — so the payment
  // method, deposit and schedule previews below all work off the total.
  const netPriceNum = Number(sellingPrice) || 0;
  const vatRateNum = Number(vatRate) || 0;
  const sellingPriceNum = grossFromNet(netPriceNum, vatRateNum);
  const vatAmountNum = Math.round((sellingPriceNum - netPriceNum) * 100) / 100;
  const currencyCode = currency.toUpperCase();
  const sellingPriceGbp =
    currencyCode === "GBP"
      ? sellingPriceNum
      : gbpRates?.[currencyCode]
        ? sellingPriceNum / gbpRates[currencyCode]
        : null;
  // Card payment is only ever offered under £2000 GBP at creation time — a
  // real processing/fraud-risk limit, not just a default, so there's no
  // override here. Below it, staff can still choose bank transfer instead
  // (e.g. a regular corporate account that always pays that way). The one
  // way past the limit is after the quote exists: its own detail page has a
  // "Request card payment approval" button that asks Master Admin to add
  // Stripe as an option for that specific quote (see
  // requestCardPaymentOverrideAction, app/(staff)/quotes/actions.ts).
  const stripeEligible = sellingPriceGbp !== null && sellingPriceGbp < STRIPE_PRICE_THRESHOLD;
  const methods =
    sellingPriceGbp === null
      ? { stripe: false, bank_transfer: true }
      : forceBankTransfer
        ? { stripe: false, bank_transfer: true }
        : paymentMethodsForGbpValue(sellingPriceGbp);

  const money = (amount: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);

  const validMilestones = milestones.filter((m) => m.label.trim() && Number(m.amount) > 0);
  const milestonesTotal = validMilestones.reduce((sum, m) => sum + Number(m.amount), 0);
  const validLineItems = lineItems.filter((li) => li.description.trim() && Number(li.amount) !== 0);

  function addMilestone() {
    setMilestones((prev) => [...prev, { label: "", amount: "", dueDate: "" }]);
  }
  function updateMilestone(index: number, patch: Partial<MilestoneRow>) {
    setMilestones((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }
  function removeMilestone(index: number) {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, { description: "", amount: "", category: "other" }]);
  }
  function updateLineItem(index: number, patch: Partial<LineItemRow>) {
    setLineItems((prev) => prev.map((li, i) => (i === index ? { ...li, ...patch } : li)));
  }
  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createQuoteAction({ error: null, link: null }, formData);
      if (result?.warnLowSupplierCost) {
        setLowSupplierCostWarning(
          "No supplier cost has been entered. The supplier will still be invoiced for whatever's set here later — go back and enter one now if you can, or continue without it.",
        );
        return;
      }
      if (result?.error) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
      if (result?.link) {
        setLink(result.link);
        notify(result.emailWarning ? result.emailWarning : "Quote sent — share the link below");
      } else {
        notify("Quote saved as a draft");
      }
    });
  }

  function openConfirm() {
    setError(null);
    setLowSupplierCostWarning(null);
    setConfirmOpen(true);
  }

  function confirmSubmit() {
    if (!formRef.current) return;
    handleSubmit(new FormData(formRef.current));
  }

  const willSend = canSend && sendNow;

  const reviewContent = (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-xs font-black uppercase tracking-wide text-primary-500">Customer</div>
        <CustomerSummary customer={customer} />
      </div>

      <div>
        <div className="mb-2 text-xs font-black uppercase tracking-wide text-primary-500">
          Journey{legs.length > 1 ? ` (${legs.length} legs)` : ""}
        </div>
        {legs.map((leg, i) => (
          <JourneyLegDetail key={leg.sequence} leg={leg} index={i} total={legs.length} distance={legDistances[i]} />
        ))}
        {legs.length === 0 && <p className="text-sm text-slate-500">No journey details recorded.</p>}
      </div>

      <div>
        <div className="mb-2 text-xs font-black uppercase tracking-wide text-primary-500">Pricing &amp; payment</div>
        <dl className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Currency</dt>
            <dd className="mt-0.5 font-semibold">{currency}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">{vatRateNum > 0 ? "Total incl. VAT" : "Selling price"}</dt>
            <dd className="mt-0.5 text-base font-black text-primary-600">{sellingPriceNum ? money(sellingPriceNum) : "—"}</dd>
            {vatRateNum > 0 && netPriceNum > 0 && (
              <dd className="mt-0.5 text-xs text-slate-500">
                {money(netPriceNum)} + {vatRateNum}% VAT ({money(vatAmountNum)})
              </dd>
            )}
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Payment plan</dt>
            <dd className="mt-0.5 font-semibold">
              {depositMode === "full" && "Full payment upfront"}
              {depositMode === "percentage" &&
                `${depositPercentage}% deposit now${sellingPriceNum ? ` (${money((sellingPriceNum * depositPercentage) / 100)})` : ""}, balance later`}
              {depositMode === "fixed" &&
                `${depositFixedAmount ? money(Number(depositFixedAmount)) : "—"} deposit now, balance later`}
              {depositMode === "milestones" && `${validMilestones.length}-step payment schedule (${money(milestonesTotal)} total)`}
            </dd>
          </div>
          {validLineItems.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-bold uppercase text-slate-400">Itemised extras</dt>
              <dd className="mt-1 space-y-1">
                {validLineItems.map((li, i) => (
                  <div key={i} className="flex justify-between text-sm font-semibold">
                    <span className="font-normal text-slate-500">{li.description}</span>
                    <span>{money(Number(li.amount))}</span>
                  </div>
                ))}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Payment method</dt>
            <dd className="mt-0.5 font-semibold">
              {sellingPriceGbp === null
                ? "Calculating — confirmed once the exchange rate loads"
                : methods.stripe
                  ? "Card payment (Stripe)"
                  : "Bank transfer"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Quote expiry</dt>
            <dd className="mt-0.5 font-semibold">{expiryDays || defaultExpiryDays} days</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Supplier cost (est.)</dt>
            <dd className="mt-0.5 font-semibold">{supplierEstimatedCost ? money(Number(supplierEstimatedCost)) : "—"}</dd>
          </div>
          {customerNotes && (
            <div className="col-span-2">
              <dt className="text-xs font-bold uppercase text-slate-400">Notes to customer</dt>
              <RichText text={customerNotes} className="mt-0.5 font-semibold" />
            </div>
          )}
        </dl>
      </div>
    </div>
  );

  if (link) {
    return (
      <Panel>
        <h2 className="text-xl font-black">Quote sent</h2>
        <p className="mt-2 text-sm text-slate-500">
          Share this link with the customer — it lets them view, accept or reject the quote without needing an account.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border bg-slate-50 p-3">
          <code className="flex-1 truncate text-sm">{link}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(link).then(() => notify("Link copied"))}
            className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white"
          >
            Copy
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <input type="hidden" name="confirmedLowSupplierCost" value={lowSupplierCostWarning ? "true" : "false"} />
      <input type="hidden" name="depositPercentage" value={depositMode === "percentage" ? depositPercentage : ""} />
      <input type="hidden" name="depositFixedAmount" value={depositMode === "fixed" ? depositFixedAmount : ""} />
      <input
        type="hidden"
        name="milestones"
        value={
          depositMode === "milestones"
            ? JSON.stringify(validMilestones.map((m) => ({ label: m.label.trim(), amount: Number(m.amount), dueDate: m.dueDate || null })))
            : ""
        }
      />
      <input
        type="hidden"
        name="lineItems"
        value={JSON.stringify(
          validLineItems.map((li) => ({ description: li.description.trim(), amount: Number(li.amount), category: li.category })),
        )}
      />
      <Panel>
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => setStep(i + 1)}
                aria-label={`Step ${i + 1}: ${s}`}
                aria-current={step === i + 1 ? "step" : undefined}
                className={clsx(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black transition-colors",
                  step >= i + 1 ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-400",
                )}
              >
                {i + 1}
              </button>
              {i < STEPS.length - 1 && (
                <div className={clsx("mx-1.5 h-0.5 flex-1 rounded-full", step > i + 1 ? "bg-primary-500" : "bg-slate-100")} />
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-sm font-bold text-primary-600">
          Step {step} of {STEPS.length} · {STEPS[step - 1]}
        </p>
      </Panel>

      <div className="mt-5">
        <Panel>
          <div className={clsx(step !== 1 && "hidden")}>
            <SectionTitle title="Enquiry Summary" sub="Customer and journey details captured on this enquiry" />
            <div className="mt-5 space-y-5">
              <CustomerSummary customer={customer} />
              {legs.map((leg, i) => (
                <JourneyLegDetail key={leg.sequence} leg={leg} index={i} total={legs.length} distance={legDistances[i]} />
              ))}
              {legs.length === 0 && <p className="text-sm text-slate-500">No journey details recorded.</p>}
            </div>
          </div>

          <div className={clsx(step !== 2 && "hidden")}>
            <SectionTitle title="Pricing" sub="Enter supplier cost and the customer selling price" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">
                Currency
                <SearchableSelect
                  name="currency"
                  value={currency}
                  onChange={setCurrency}
                  options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}`, sublabel: c.symbol }))}
                />
              </label>
              <label className="text-sm font-bold">
                Estimated supplier cost
                <input
                  name="supplierEstimatedCost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={supplierEstimatedCost}
                  onChange={(e) => setSupplierEstimatedCost(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
                <span className="mt-1 block text-xs font-normal text-slate-400">
                  This is what the supplier will see and be invoiced for. Leave blank if not known yet — you&apos;ll be asked to confirm.
                </span>
              </label>
              <label className="text-sm font-bold">
                Selling price (before VAT)
                <input
                  name="sellingPrice"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                VAT (%)
                <input
                  name="vatRate"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
                <span className="mt-1 block text-xs font-normal text-slate-400">
                  {vatRateNum > 0 && netPriceNum > 0
                    ? `VAT ${money(vatAmountNum)} — customer pays ${money(sellingPriceNum)} in total.`
                    : "Leave at 0 for no VAT. Added on top of the selling price."}
                </span>
              </label>
              <label className="text-sm font-bold">
                Quote expiry (days)
                <input
                  name="expiryDays"
                  type="number"
                  min={1}
                  max={365}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <div className="md:col-span-2">
                <div className="text-sm font-bold">How will the customer pay?</div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label
                    className={clsx(
                      "flex flex-col gap-1 rounded-xl border p-3",
                      !forceBankTransfer && stripeEligible ? "border-primary-400 bg-primary-50/40" : "border-slate-200",
                      stripeEligible ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="flex items-center gap-2 font-bold">
                      <input
                        type="radio"
                        name="paymentMethodChoice"
                        checked={!forceBankTransfer && stripeEligible}
                        disabled={!stripeEligible}
                        onChange={() => setForceBankTransfer(false)}
                      />
                      Card payment
                    </span>
                    <span className="text-xs font-normal text-slate-500">
                      {stripeEligible
                        ? `The customer gets a secure link to pay by card online. Available for bookings under £${STRIPE_PRICE_THRESHOLD.toLocaleString("en-GB")}.`
                        : `Not available for this amount — bookings of £${STRIPE_PRICE_THRESHOLD} or more must be paid by bank transfer. You can request Master Admin approval to allow card payment after creating this quote.`}
                    </span>
                  </label>
                  <label
                    className={clsx(
                      "flex cursor-pointer flex-col gap-1 rounded-xl border p-3",
                      forceBankTransfer || !stripeEligible ? "border-primary-400 bg-primary-50/40" : "border-slate-200",
                    )}
                  >
                    <span className="flex items-center gap-2 font-bold">
                      <input
                        type="radio"
                        name="paymentMethodChoice"
                        checked={forceBankTransfer || !stripeEligible}
                        onChange={() => setForceBankTransfer(true)}
                      />
                      Bank transfer
                    </span>
                    <span className="text-xs font-normal text-slate-500">
                      {stripeEligible
                        ? "The customer pays by bank transfer instead of card — choose this if they prefer to pay this way."
                        : "Required for this amount."}
                    </span>
                  </label>
                </div>
                <input type="hidden" name="forceBankTransfer" value={forceBankTransfer ? "true" : "false"} />
              </div>
              <fieldset className="text-sm font-bold md:col-span-2">
                How does the customer pay?
                <div className="mt-2 flex flex-wrap gap-3 font-normal">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="depositMode" checked={depositMode === "full"} onChange={() => setDepositMode("full")} />
                    Full payment
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="depositMode" checked={depositMode === "percentage"} onChange={() => setDepositMode("percentage")} />
                    Deposit %
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="depositMode" checked={depositMode === "fixed"} onChange={() => setDepositMode("fixed")} />
                    Fixed deposit
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="depositMode" checked={depositMode === "milestones"} onChange={() => setDepositMode("milestones")} />
                    Payment schedule
                  </label>
                </div>

                {depositMode === "percentage" && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {DEPOSIT_CHOICES.map((pct) => (
                      <label key={pct} className="flex items-center gap-1.5">
                        <input type="radio" name="depositPercentageChoice" checked={depositPercentage === pct} onChange={() => setDepositPercentage(pct)} />
                        {pct}% deposit
                      </label>
                    ))}
                  </div>
                )}

                {depositMode === "fixed" && (
                  <div className="mt-3">
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={depositFixedAmount}
                      onChange={(e) => setDepositFixedAmount(e.target.value)}
                      placeholder="Deposit amount"
                      className="w-full max-w-xs rounded-xl border px-3 py-2.5 font-normal"
                    />
                  </div>
                )}

                {depositMode === "milestones" && (
                  <div className="mt-3 space-y-2">
                    {milestones.map((m, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <input
                          value={m.label}
                          onChange={(e) => updateMilestone(i, { label: e.target.value })}
                          placeholder="e.g. Deposit, 2nd instalment, Balance"
                          className="min-w-0 flex-1 rounded-lg border px-3 py-2 font-normal"
                        />
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={m.amount}
                          onChange={(e) => updateMilestone(i, { amount: e.target.value })}
                          placeholder="Amount"
                          className="w-28 rounded-lg border px-3 py-2 font-normal"
                        />
                        <input
                          type="date"
                          value={m.dueDate}
                          onChange={(e) => updateMilestone(i, { dueDate: e.target.value })}
                          className="rounded-lg border px-3 py-2 font-normal"
                        />
                        <button type="button" onClick={() => removeMilestone(i)} className="rounded-lg px-2 py-2 text-xs font-bold text-red-600">
                          Remove
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={addMilestone} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                      + Add milestone
                    </button>
                    {validMilestones.length > 0 && sellingPriceNum > 0 && (
                      <p className="text-xs font-normal text-slate-400">
                        Schedule total {money(milestonesTotal)} of {money(sellingPriceNum)} {vatRateNum > 0 ? "total incl. VAT" : "selling price"}
                        {Math.abs(milestonesTotal - sellingPriceNum) > 0.01 ? " — doesn't add up to the full price yet" : ""}.
                      </p>
                    )}
                  </div>
                )}
              </fieldset>

              <div className="text-sm font-bold md:col-span-2">
                Itemised extras <span className="font-normal text-slate-400">(optional — waiting time, tolls, parking, shown as a breakdown)</span>
                <div className="mt-2 space-y-2">
                  {lineItems.map((li, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <select
                        value={li.category}
                        onChange={(e) => updateLineItem(i, { category: e.target.value as LineItemRow["category"] })}
                        className="rounded-lg border px-2 py-2 font-normal"
                      >
                        {LINE_ITEM_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={li.description}
                        onChange={(e) => updateLineItem(i, { description: e.target.value })}
                        placeholder="Description"
                        className="min-w-0 flex-1 rounded-lg border px-3 py-2 font-normal"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={li.amount}
                        onChange={(e) => updateLineItem(i, { amount: e.target.value })}
                        placeholder="Amount"
                        className="w-28 rounded-lg border px-3 py-2 font-normal"
                      />
                      <button type="button" onClick={() => removeLineItem(i)} className="rounded-lg px-2 py-2 text-xs font-bold text-red-600">
                        Remove
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addLineItem} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                    + Add line item
                  </button>
                </div>
              </div>
              <label className="text-sm font-bold md:col-span-2">
                Notes to customer
                <div className="mt-2">
                  <RichTextToolbar textareaRef={customerNotesRef} value={customerNotes} onChange={setCustomerNotes} />
                  <textarea
                    ref={customerNotesRef}
                    name="customerNotes"
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    className="min-h-20 w-full rounded-b-xl border p-3 font-normal"
                  />
                </div>
                <span className="mt-1 block text-xs font-normal text-slate-400">
                  Line breaks are kept exactly as typed or pasted — the box above only ever shows plain text while you type (that's a plain text box's own limit), so here's how it'll actually look on the quote:
                </span>
                {customerNotes.trim() && (
                  <div className="mt-2 rounded-xl border border-dashed bg-slate-50 p-3">
                    <RichText text={customerNotes} className="text-sm font-normal text-slate-700" />
                  </div>
                )}
              </label>
            </div>
          </div>

          <div className={clsx(step !== 3 && "hidden")}>
            <SectionTitle title="Review & Send" sub="Confirm details, then save as a draft or send immediately" />
            <div className="mt-5">{reviewContent}</div>
            {canSend ? (
              <label className="mt-4 flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" name="sendNow" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} />
                Send to customer immediately
              </label>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                You do not have permission to send quotes — this will be saved as a draft for a manager to send.
              </p>
            )}
          </div>

          <div className="mt-6 flex justify-between border-t pt-5">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep(Math.max(1, step - 1))}
              className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-40"
            >
              Previous
            </button>
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white"
              >
                Next Step →
              </button>
            ) : (
              <button
                type="button"
                onClick={openConfirm}
                disabled={pending}
                className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                Review & Save
              </button>
            )}
          </div>
        </Panel>
      </div>

      <ConfirmDetailModal
        open={confirmOpen}
        onClose={() => !pending && setConfirmOpen(false)}
        title={willSend ? "Send this quote to the customer?" : "Save this quote as a draft?"}
        description={
          willSend
            ? "The customer will receive a link to view, accept or reject this quote."
            : "This quote will be saved as a draft — a manager can send it later."
        }
        pending={pending}
        error={error}
        confirmLabel={
          lowSupplierCostWarning ? (willSend ? "Send anyway" : "Save anyway") : willSend ? "Send quote" : "Save draft"
        }
        onConfirm={confirmSubmit}
      >
        {lowSupplierCostWarning && (
          <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">{lowSupplierCostWarning}</div>
        )}
        {reviewContent}
      </ConfirmDetailModal>
    </form>
  );
}
