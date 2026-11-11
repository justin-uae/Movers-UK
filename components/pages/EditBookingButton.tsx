"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { amendBookingAction, type AmendBookingInput } from "@/app/(staff)/quotes/actions";
import type { QuoteStatus, JobStatus } from "@/lib/supabase/database.types";
import { MoveDetailsEditor, VanSizeSelect } from "@/components/ui/MoveDetailsEditor";
import { moveDetailChanges, type MoveDetails } from "@/lib/moveDetails";

/** The move being edited — the booking's one enquiry_legs row. */
export interface EditableMove {
  id: string;
  pickupAddress: string;
  destinationAddress: string;
  pickupDate: string | null;
  pickupTime: string | null;
  vanSize: string | null;
  moveDetails: MoveDetails;
  specialRequirements: string | null;
}

// Editable from a fresh draft right through to paid — only a dead-end quote
// status, or a job every supplier has marked completed, closes it off. See
// UNEDITABLE_QUOTE_STATUSES in app/(staff)/quotes/actions.ts — the server
// action is the authoritative check, this just mirrors it so the button
// doesn't render somewhere it would only fail.
const UNEDITABLE_QUOTE_STATUSES: QuoteStatus[] = ["rejected", "expired", "cancelled"];

/**
 * Shared "Edit Booking" trigger + form — lets a Master Admin or the
 * booking's owner change the move details and/or charge the customer or
 * adjust a supplier's payout on a lead/quote/booking at any stage, right up
 * until its job has been completed. Used from both the Quote detail page and
 * the Dispatch job detail page (see amendBookingAction).
 */
export function EditBookingButton({
  quoteId,
  quoteStatus,
  jobStatus,
  currency,
  canEdit,
  move,
  className = "mt-2 w-full rounded-xl border px-4 py-2.5 text-sm font-bold",
}: {
  quoteId: string;
  quoteStatus: QuoteStatus;
  jobStatus: JobStatus | null;
  currency: string;
  canEdit: boolean;
  move: EditableMove | null;
  className?: string;
}) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pickupAddress, setPickupAddress] = useState(move?.pickupAddress ?? "");
  const [destinationAddress, setDestinationAddress] = useState(move?.destinationAddress ?? "");
  const [pickupDate, setPickupDate] = useState(move?.pickupDate ?? "");
  const [pickupTime, setPickupTime] = useState(move?.pickupTime ?? "");
  const [vanSize, setVanSize] = useState<string | null>(move?.vanSize ?? null);
  const [moveDetails, setMoveDetails] = useState<MoveDetails | null>(move?.moveDetails ?? null);
  const [specialRequirements, setSpecialRequirements] = useState(move?.specialRequirements ?? "");
  const [chargeAmount, setChargeAmount] = useState("");
  const [supplierAmount, setSupplierAmount] = useState("");
  const [supplierNote, setSupplierNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit || UNEDITABLE_QUOTE_STATUSES.includes(quoteStatus) || jobStatus === "completed") return null;

  /** Resets the form to the move as it currently stands — every time the dialog opens. */
  function resetMove() {
    setPickupAddress(move?.pickupAddress ?? "");
    setDestinationAddress(move?.destinationAddress ?? "");
    setPickupDate(move?.pickupDate ?? "");
    setPickupTime(move?.pickupTime ?? "");
    setVanSize(move?.vanSize ?? null);
    setMoveDetails(move?.moveDetails ?? null);
    setSpecialRequirements(move?.specialRequirements ?? "");
  }

  function submit() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    const input: AmendBookingInput = { reason };

    if (move) {
      input.legId = move.id;
      const legChanges: NonNullable<AmendBookingInput["legChanges"]> = {};
      if (pickupAddress !== move.pickupAddress) legChanges.pickupAddress = pickupAddress;
      if (destinationAddress !== move.destinationAddress) legChanges.destinationAddress = destinationAddress;
      if (pickupDate !== (move.pickupDate ?? "")) legChanges.pickupDate = pickupDate || null;
      if (pickupTime !== (move.pickupTime ?? "")) legChanges.pickupTime = pickupTime || null;
      if (vanSize !== move.vanSize) legChanges.vanSize = vanSize;
      if (moveDetails && Object.keys(moveDetailChanges(move.moveDetails, moveDetails)).length > 0) legChanges.moveDetails = moveDetails;
      const specialRequirementsValue = specialRequirements.trim() || null;
      if (specialRequirementsValue !== (move.specialRequirements ?? null)) legChanges.specialRequirements = specialRequirementsValue;
      if (Object.keys(legChanges).length > 0) input.legChanges = legChanges;
    }

    const chargeNum = chargeAmount.trim() === "" ? 0 : Number(chargeAmount);
    if (chargeNum) input.priceAdjustment = chargeNum;

    const supplierNum = supplierAmount.trim() === "" ? 0 : Number(supplierAmount);
    if (supplierNum) input.supplierAdjustment = { amount: supplierNum, note: supplierNote };

    if (!input.legChanges && !input.priceAdjustment && !input.supplierAdjustment) {
      setError("Change at least one move detail, or enter a customer or supplier amount.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await amendBookingAction(quoteId, input);
      if (result?.error) {
        setError(result.error);
        notify(result.error);
        return;
      }
      notify(result?.warning ? result.warning : "Booking updated");
      setOpen(false);
      setReason("");
      setChargeAmount("");
      setSupplierAmount("");
      setSupplierNote("");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          resetMove();
          setOpen(true);
        }}
        className={className}
      >
        Edit Booking
      </button>

      {open && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setOpen(false)}
          title="Edit this booking"
          description="Edit the move details and/or charge the customer or adjust the supplier's payout — every change here is logged with the reason below and, where relevant, emailed to the customer and supplier."
          pending={pending}
          error={error}
          confirmLabel="Save Changes"
          onConfirm={submit}
        >
          <div className="space-y-4">
            <label className="block text-sm font-bold">
              Reason (required)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 min-h-16 w-full rounded-xl border px-3 py-2 font-normal"
                placeholder="Why is this booking being edited?"
              />
            </label>

            {move && (
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Move details</div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-bold">
                    Moving from
                    <input
                      value={pickupAddress}
                      onChange={(e) => setPickupAddress(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Moving to
                    <input
                      value={destinationAddress}
                      onChange={(e) => setDestinationAddress(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Move date
                    <input
                      type="date"
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Start time
                    <input
                      type="time"
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold sm:col-span-2">
                    Van size
                    <VanSizeSelect value={vanSize} onChange={setVanSize} />
                  </label>
                </div>
                {moveDetails && (
                  <div className="mt-3">
                    <MoveDetailsEditor value={moveDetails} onChange={setMoveDetails} />
                  </div>
                )}
                <label className="mt-3 block text-sm font-bold">
                  Inventory and access notes
                  <textarea
                    value={specialRequirements}
                    onChange={(e) => setSpecialRequirements(e.target.value)}
                    className="mt-1 min-h-16 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    placeholder="e.g. piano in the lounge, permit parking needed"
                  />
                </label>
              </div>
            )}

            <div>
              <div className="text-xs font-black uppercase tracking-wide text-slate-400">Customer charge</div>
              <label className="mt-2 block text-sm font-bold">
                Amount ({currency}) — positive charges more, negative credits back
                <input
                  type="number"
                  step="0.01"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                />
              </label>
              <p className="mt-1 text-xs text-slate-400">
                A positive amount adds to the balance due. A negative amount lowers the price — if that leaves the
                customer overpaid, a refund is automatically queued for Finance.
              </p>
            </div>

            <div>
              <div className="text-xs font-black uppercase tracking-wide text-slate-400">Supplier payout</div>
              <label className="mt-2 block text-sm font-bold">
                Amount ({currency}) — positive pays them more, negative reduces/refunds
                <input
                  type="number"
                  step="0.01"
                  value={supplierAmount}
                  onChange={(e) => setSupplierAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="mt-2 block text-sm font-bold">
                Note (optional)
                <input
                  value={supplierNote}
                  onChange={(e) => setSupplierNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  placeholder="e.g. extra hour on site, extra crew member"
                />
              </label>
            </div>
          </div>
        </ConfirmDetailModal>
      )}
    </>
  );
}
