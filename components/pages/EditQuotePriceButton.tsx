"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { grossFromNet, vatBreakdown } from "@/lib/vat";
import { editQuotePriceAction } from "@/app/(staff)/quotes/priceActions";

/**
 * "Edit Price" on the quote page — for a quote the customer hasn't accepted
 * yet (draft/sent/viewed). Saves a new version and a "Price changed"
 * Timeline entry; see editQuotePriceAction. Accepted/paid bookings change
 * price through Edit Booking instead.
 */
export function EditQuotePriceButton({
  quoteId,
  status,
  currency,
  sellingPrice,
  vatRate,
  supplierEstimatedCost,
}: {
  quoteId: string;
  status: string;
  currency: string;
  sellingPrice: number;
  vatRate: number;
  supplierEstimatedCost: number | null;
}) {
  const router = useRouter();
  const notify = useToast();
  const current = vatBreakdown(sellingPrice, vatRate);
  const [open, setOpen] = useState(false);
  const [netPrice, setNetPrice] = useState(String(current.net));
  const [vat, setVat] = useState(String(Number(vatRate) || 0));
  const [supplierCost, setSupplierCost] = useState(supplierEstimatedCost != null ? String(supplierEstimatedCost) : "");
  const [reason, setReason] = useState("");
  const [emailCustomer, setEmailCustomer] = useState(status !== "draft");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const money = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  const netNum = Number(netPrice) || 0;
  const vatNum = Number(vat) || 0;
  const newTotal = grossFromNet(netNum, vatNum);
  const difference = Math.round((newTotal - sellingPrice) * 100) / 100;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await editQuotePriceAction(quoteId, {
        netPrice: netNum,
        vatRate: vatNum,
        supplierEstimatedCost: supplierCost.trim() === "" ? null : Number(supplierCost),
        reason,
        emailCustomer,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      notify(result?.warning ?? (emailCustomer && status !== "draft" ? "Price updated and quote re-sent" : "Price updated"));
      setOpen(false);
      setReason("");
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
        className="mt-2 w-full rounded-xl border px-4 py-2.5 text-sm font-bold"
      >
        Edit Price
      </button>

      {open && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setOpen(false)}
          title="Edit quote price"
          description="Saves the new price as a new version of this quote — the old version stays in the Versions list, and the change is recorded on the Timeline with your reason."
          pending={pending}
          error={error}
          confirmLabel="Save New Price"
          onConfirm={submit}
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-bold">
                Selling price (before VAT)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={netPrice}
                  onChange={(e) => setNetPrice(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                />
              </label>
              <label className="block text-sm font-bold">
                VAT (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={vat}
                  onChange={(e) => setVat(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                />
              </label>
              <label className="block text-sm font-bold sm:col-span-2">
                Estimated supplier cost
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={supplierCost}
                  onChange={(e) => setSupplierCost(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                />
              </label>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Current total</span>
                <span className="font-semibold">{money(sellingPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">New total{vatNum > 0 ? " incl. VAT" : ""}</span>
                <span className="font-black text-primary-600">{netNum > 0 ? money(newTotal) : "—"}</span>
              </div>
              {netNum > 0 && difference !== 0 && (
                <div className={`text-right text-xs font-bold ${difference > 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {difference > 0 ? "+" : ""}
                  {money(difference)}
                </div>
              )}
            </div>

            <label className="block text-sm font-bold">
              Reason (required)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 min-h-16 w-full rounded-xl border px-3 py-2 font-normal"
                placeholder="e.g. Customer negotiated, supplier price changed, vehicle upgraded"
              />
            </label>

            {status !== "draft" && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={emailCustomer} onChange={(e) => setEmailCustomer(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary-500" />
                <span>
                  <span className="font-bold">Email the updated quote to the customer</span>
                  <span className="block text-xs text-slate-500">Sends the quote email again with the new price and a fresh PDF. Their quote link shows the new price either way.</span>
                </span>
              </label>
            )}
          </div>
        </ConfirmDetailModal>
      )}
    </>
  );
}
