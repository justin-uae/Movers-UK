"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { decideCardPaymentOverrideAction } from "@/app/(staff)/card-payment-requests/actions";

/** Approve/Reject for one pending card-payment-override request — a small
    client island next to its row on the (server-rendered) requests list. */
export function CardPaymentRequestDecision({
  requestId,
  quoteNumber,
  amountGbp,
}: {
  requestId: string;
  quoteNumber: string;
  amountGbp: number;
}) {
  const router = useRouter();
  const notify = useToast();
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open(a: "approve" | "reject") {
    setAction(a);
    setNote("");
    setError(null);
  }

  function confirm() {
    if (!action) return;
    setError(null);
    startTransition(async () => {
      const result = await decideCardPaymentOverrideAction(requestId, action === "approve", note);
      if (result.error) {
        setError(result.error);
        return;
      }
      notify(action === "approve" ? `Card payment approved for ${quoteNumber}` : `Request rejected for ${quoteNumber}`);
      setAction(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => open("approve")}
          className="rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => open("reject")}
          className="rounded-xl border border-red-200 px-3.5 py-2 text-sm font-bold text-red-600"
        >
          Reject
        </button>
      </div>

      <ConfirmDetailModal
        open={action !== null}
        onClose={() => !pending && setAction(null)}
        title={action === "approve" ? `Approve card payment for ${quoteNumber}?` : `Reject card payment request for ${quoteNumber}?`}
        description={
          action === "approve"
            ? `Card payment will become an available option on this quote (£${amountGbp.toFixed(2)}) — bank transfer stays available too.`
            : "The requesting staff member will be told it was rejected, with your note below if you add one."
        }
        confirmLabel={action === "approve" ? "Approve" : "Reject"}
        destructive={action === "reject"}
        pending={pending}
        error={error}
        onConfirm={confirm}
      >
        <label className="block text-sm font-bold">
          Note {action === "reject" ? "(shown to the requester)" : "(optional)"}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm font-normal"
            placeholder={action === "approve" ? "Optional context for the record…" : "Why this request is being rejected…"}
          />
        </label>
      </ConfirmDetailModal>
    </>
  );
}
