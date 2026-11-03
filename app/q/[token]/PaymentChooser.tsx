"use client";

import { useEffect, useState, useTransition } from "react";
import { choosePaymentMethodAction, createStripeCheckoutAction } from "./actions";

export interface BankAccountRow {
  profile_label: string | null;
  account_name: string;
  bank_name: string;
  account_number: string | null;
  iban: string | null;
  sort_code: string | null;
  swift_bic: string | null;
  bank_address: string | null;
  payment_notes: string | null;
  currency: string;
}

/**
 * Normally only ever one of stripe/bankTransfer is true — the selling price
 * threshold (lib/quoteMoney.ts) picks exactly one, so this renders a single
 * path with no real either/or choice. The one case both are true is a
 * Master-Admin-approved card payment request on an otherwise bank-transfer-
 * only quote (card_payment_override_requests, 0102_card_payment_override_requests.sql)
 * — approving ADDS Stripe rather than replacing bank transfer, so the
 * customer gets an actual choice between the two in that case.
 */
export function PaymentChooser({
  token,
  amountDueLabel,
  bankAmountDueLabel,
  checkoutCurrency,
  stripeAvailable,
  bankTransferAvailable,
  bankAccounts,
  reference,
}: {
  token: string;
  /** In the currency the page is showing (the customer's local one, usually) — what a card payment is charged in. */
  amountDueLabel: string;
  /** Same amount in the quote's own currency — bank transfers are always made in that, since the bank details are per currency. */
  bankAmountDueLabel: string;
  /** Currency the card checkout charges in — see lib/localCurrency.ts. */
  checkoutCurrency: string;
  stripeAvailable: boolean;
  bankTransferAvailable: boolean;
  bankAccounts: BankAccountRow[];
  reference: string;
}) {
  const bothAvailable = stripeAvailable && bankTransferAvailable;
  const [method, setMethod] = useState<"stripe" | "bank_transfer">(stripeAvailable ? "stripe" : "bank_transfer");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Best-effort record of which method the customer is being shown, for
  // staff visibility — only fires automatically when bank transfer is the
  // ONLY option (there's no real choice being made, just being told how to
  // pay). When both are available, this instead fires when the customer
  // actively switches to the bank transfer tab below — recording the
  // method shown unconditionally here would wrongly log "bank_transfer"
  // even for a customer about to pay by card.
  useEffect(() => {
    if (bankTransferAvailable && !stripeAvailable) {
      choosePaymentMethodAction(token, "bank_transfer").catch(() => {});
    }
  }, [token, bankTransferAvailable, stripeAvailable]);

  function selectBankTransfer() {
    setMethod("bank_transfer");
    choosePaymentMethodAction(token, "bank_transfer").catch(() => {});
  }

  function payOnline() {
    setError(null);
    startTransition(async () => {
      const result = await createStripeCheckoutAction(token, checkoutCurrency);
      if (result.error || !result.url) {
        setError(result.error ?? "Could not start Stripe checkout.");
        return;
      }
      window.location.href = result.url;
    });
  }

  function renderBankTransfer() {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-center font-bold text-emerald-700">Please complete payment by bank transfer to confirm your booking.</p>
        <div className="mt-4 space-y-4">
          {bankAccounts.length === 0 && (
            <div className="rounded-xl bg-white p-4 text-center text-sm text-slate-500">
              No payment details are currently configured — please contact us to arrange payment.
            </div>
          )}
          {bankAccounts.map((account, i) => (
            <div key={i} className="rounded-xl bg-white p-4 text-sm">
              {account.profile_label && (
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-emerald-700">{account.profile_label}</div>
              )}
              <Row label="Account name" value={account.account_name} />
              <Row label="Bank" value={account.bank_name} />
              {account.iban && <Row label="IBAN" value={account.iban} />}
              {account.account_number && <Row label="Account number" value={account.account_number} />}
              {account.sort_code && <Row label="Sort code" value={account.sort_code} />}
              {account.swift_bic && <Row label="SWIFT / BIC" value={account.swift_bic} />}
              {account.bank_address && (
                <div className="border-b py-1.5 text-xs text-slate-500 last:border-0">Bank address: {account.bank_address}</div>
              )}
              {account.payment_notes && <p className="mt-2 text-xs text-slate-500">{account.payment_notes}</p>}
            </div>
          ))}
          <div className="flex justify-between rounded-xl bg-white p-4 text-sm">
            <span className="text-slate-500">Payment reference</span>
            <b>{reference}</b>
          </div>
          <div className="flex justify-between rounded-xl bg-white p-4 text-sm">
            <span className="text-slate-500">Amount due now</span>
            <b className="text-primary-600">{bankAmountDueLabel}</b>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-emerald-700">
          Please use <b>{reference}</b> as your payment reference so we can match your transfer quickly.
          {bankAmountDueLabel !== amountDueLabel && <> Bank transfers are made in the quote's own currency: <b>{bankAmountDueLabel}</b>.</>}
        </p>
      </div>
    );
  }

  function renderStripe() {
    return (
      <div>
        {error && <p className="mb-3 text-center text-sm font-semibold text-red-600">{error}</p>}
        <button
          onClick={payOnline}
          disabled={pending}
          className="w-full rounded-xl bg-primary-500 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
        >
          {pending ? "Please wait…" : "Pay Online (Card)"}
        </button>
      </div>
    );
  }

  if (!stripeAvailable && !bankTransferAvailable) {
    return (
      <div className="rounded-2xl bg-amber-50 p-5 text-center font-bold text-amber-700">
        No payment method is currently configured for this quote — please contact us.
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-center text-sm font-semibold text-slate-600">
        Amount due now: <b className="text-primary-600">{amountDueLabel}</b>
      </p>

      {bothAvailable && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMethod("stripe")}
            className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${method === "stripe" ? "border-primary-400 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-500"}`}
          >
            Pay by Card
          </button>
          <button
            type="button"
            onClick={selectBankTransfer}
            className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${method === "bank_transfer" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}`}
          >
            Pay by Bank Transfer
          </button>
        </div>
      )}

      {method === "bank_transfer" ? renderBankTransfer() : renderStripe()}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 border-b py-1.5 last:border-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <b className="text-right break-all">{value}</b>
    </div>
  );
}
