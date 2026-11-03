"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "lucide-react";
import clsx from "clsx";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { applySpecialDealAction } from "@/app/(staff)/quotes/priceActions";

const QUICK_PERCENTS = [5, 10, 15, 20];

/**
 * "Today's Special Deal" on the quote page — a percentage off the current
 * price for any quote the customer hasn't accepted yet (applySpecialDealAction).
 * The customer's quote page and PDF then show the old price struck through.
 */
export function SpecialDealButton({
  quoteId,
  status,
  currency,
  sellingPrice,
  originalPrice,
  supplierEstimatedCost,
}: {
  quoteId: string;
  status: string;
  currency: string;
  sellingPrice: number;
  /** The pre-deal price if a deal is already on this quote. */
  originalPrice: number | null;
  supplierEstimatedCost: number | null;
}) {
  const router = useRouter();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState("10");
  const [note, setNote] = useState("");
  const [emailCustomer, setEmailCustomer] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reopens = status === "rejected" || status === "expired";
  const money = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  const pct = Number(percent) || 0;
  const valid = pct >= 1 && pct <= 90;
  const newPrice = Math.round(sellingPrice * (1 - pct / 100) * 100) / 100;
  const wasPrice = originalPrice ?? sellingPrice;
  const saving = Math.round((wasPrice - newPrice) * 100) / 100;
  const margin = supplierEstimatedCost != null ? Math.round((newPrice - supplierEstimatedCost) * 100) / 100 : null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await applySpecialDealAction(quoteId, { percent: pct, emailCustomer, note });
      if (result?.error) {
        setError(result.error);
        return;
      }
      notify(result?.warning ?? (status !== "draft" && (reopens || emailCustomer) ? `${pct}% special deal sent to the customer` : `${pct}% special deal applied`));
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
      >
        <Tag size={16} />
        Today&apos;s Special Deal
      </button>

      {open && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setOpen(false)}
          title="Today's Special Deal"
          description="Takes a percentage off this quote. The customer sees the old price struck through next to the new one on their quote page and PDF. It's saved as a new version and recorded on the Timeline."
          pending={pending}
          error={error}
          confirmLabel={valid ? `Apply ${pct}% off` : "Apply discount"}
          onConfirm={valid ? submit : undefined}
        >
          <div className="space-y-4">
            <div>
              <div className="text-sm font-bold">Discount</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {QUICK_PERCENTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPercent(String(p))}
                    className={clsx(
                      "rounded-full border px-3.5 py-1.5 text-sm font-bold",
                      pct === p ? "border-emerald-600 bg-emerald-600 text-white" : "hover:bg-slate-50",
                    )}
                  >
                    {p}%
                  </button>
                ))}
                <label className="flex items-center gap-1.5 text-sm font-bold">
                  <input
                    type="number"
                    min={1}
                    max={90}
                    step="0.5"
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                    className="w-20 rounded-xl border px-3 py-1.5 font-normal"
                    aria-label="Discount percentage"
                  />
                  %
                </label>
              </div>
              {!valid && <p className="mt-1 text-xs font-semibold text-red-600">Enter a discount between 1% and 90%.</p>}
            </div>

            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slate-600">Customer sees</span>
                <span>
                  <span className="mr-2 text-slate-400 line-through">{money(wasPrice)}</span>
                  <span className="text-lg font-black text-emerald-700">{valid ? money(newPrice) : "—"}</span>
                </span>
              </div>
              {valid && (
                <div className="mt-1 text-right text-xs font-bold text-emerald-700">
                  They save {money(saving)}
                  {originalPrice != null && " (including the earlier deal)"}
                </div>
              )}
              {valid && margin != null && (
                <div className={clsx("mt-2 flex justify-between border-t border-emerald-200 pt-2 text-xs", margin < 0 ? "font-bold text-red-600" : "text-slate-600")}>
                  <span>Margin after discount (vs supplier cost {money(supplierEstimatedCost!)})</span>
                  <span>{money(margin)}</span>
                </div>
              )}
            </div>

            <label className="block text-sm font-bold">
              Note for the Timeline (optional)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                placeholder="e.g. Agreed on the phone"
              />
            </label>

            {reopens ? (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
                This quote is {status}. The deal re-opens it and emails it to the customer so they can accept the new price.
              </p>
            ) : (
              status !== "draft" && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={emailCustomer} onChange={(e) => setEmailCustomer(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary-500" />
                  <span>
                    <span className="font-bold">Email the deal to the customer</span>
                    <span className="block text-xs text-slate-500">Sends the quote email again. Their quote link shows the deal either way.</span>
                  </span>
                </label>
              )
            )}
          </div>
        </ConfirmDetailModal>
      )}
    </>
  );
}
