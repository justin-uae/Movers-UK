"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { reopenExpiredQuoteAction } from "@/app/(staff)/quotes/expiryActions";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * "Re-open Quote" on an expired quote (see reopenExpiredQuoteAction): pick a
 * new valid-until date, and either email it straight away or leave it to edit
 * the price/move first and send it afterwards with Resend Quote Email.
 */
export function ReopenQuoteButton({
  quoteId,
  quoteNumber,
  customerLabel,
  validityDays,
}: {
  quoteId: string;
  quoteNumber: string;
  customerLabel: string;
  validityDays: number;
}) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => isoDate(new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000)));
  const [emailCustomer, setEmailCustomer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tomorrow = isoDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await reopenExpiredQuoteAction(quoteId, { date, emailCustomer });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (result.emailError) notify(`Quote re-opened, but the email failed: ${result.emailError}`);
      else notify(emailCustomer ? "Quote re-opened and emailed to the customer" : "Quote re-opened — edit it, then use Resend Quote Email");
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
      >
        <RotateCcw size={15} />
        Re-open Quote
      </button>

      {open && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setOpen(false)}
          title="Re-open this expired quote?"
          description="It goes back to the customer as an open quote with a new valid-until date. Once it's re-opened you can edit the price, give a Today's Special Deal, or change the move."
          details={[
            { label: "Quote", value: quoteNumber },
            { label: "Customer", value: customerLabel },
          ]}
          pending={pending}
          confirmLabel={emailCustomer ? "Re-open & email" : "Re-open quote"}
          onConfirm={confirm}
        >
          <label className="block text-sm font-bold">
            Valid until
            <input
              type="date"
              value={date}
              min={tomorrow}
              onChange={(e) => setDate(e.target.value)}
              className="mt-2 w-full rounded-xl border px-3 py-2 font-normal"
            />
          </label>
          <label className="mt-4 flex items-start gap-3 rounded-xl border p-3 text-sm">
            <input type="checkbox" checked={emailCustomer} onChange={(e) => setEmailCustomer(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>
              <span className="block font-bold">Email the quote to the customer now</span>
              <span className="block text-slate-500">
                Leave this off if you want to change the price or move first — then send it with <b>Resend Quote Email</b>.
              </span>
            </span>
          </label>
          {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        </ConfirmDetailModal>
      )}
    </>
  );
}
