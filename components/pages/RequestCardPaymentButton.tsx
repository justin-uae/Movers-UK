"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { requestCardPaymentOverrideAction } from "@/app/(staff)/quotes/actions";

/**
 * Sits under the Pricing panel's payment-method row on a bank-transfer-only
 * quote (amount at/above STRIPE_PRICE_THRESHOLD, lib/quoteMoney.ts) — lets
 * staff ask Master Admin to allow card payment on this one quote anyway.
 * Hidden entirely once a request is already pending, or once card payment
 * is already available (whether from the quote's own amount, or a past
 * approval) — see the three render states this file's caller switches on.
 */
export function RequestCardPaymentButton({ quoteId, quoteNumber }: { quoteId: string; quoteNumber: string }) {
  const router = useRouter();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await requestCardPaymentOverrideAction(quoteId, reason);
      if (result.error) {
        setError(result.error);
        return;
      }
      notify("Request sent to Master Admin");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setReason("");
          setError(null);
          setOpen(true);
        }}
        className="mt-2 rounded-xl border px-3.5 py-2 text-xs font-bold text-primary-600 hover:bg-primary-50"
      >
        Request card payment approval
      </button>

      <ConfirmDetailModal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={`Request card payment for ${quoteNumber}?`}
        description="Sends a request to every Master Admin — card payment only becomes available on this quote once one of them approves it. Bank transfer stays available either way."
        confirmLabel="Send Request"
        pending={pending}
        error={error}
        onConfirm={confirm}
      >
        <label className="block text-sm font-bold">
          Reason (optional)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm font-normal"
            placeholder="Why this customer should be offered card payment…"
          />
        </label>
      </ConfirmDetailModal>
    </>
  );
}
