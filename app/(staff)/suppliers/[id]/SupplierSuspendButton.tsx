"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { suspendSupplierAction, unsuspendSupplierAction } from "../actions";

/** Suspend (reason required) / remove suspension — shown on the supplier detail page for anyone holding suppliers.suspend, only while the supplier is currently approved or already suspended. */
export function SupplierSuspendButton({ supplierId, status }: { supplierId: string; status: "approved" | "suspended" }) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function suspend() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await suspendSupplierAction(supplierId, reason);
      if (result?.error) {
        setError(result.error);
        notify(result.error);
        return;
      }
      notify("Supplier suspended");
      setOpen(false);
      setReason("");
    });
  }

  function unsuspend() {
    setError(null);
    startTransition(async () => {
      const result = await unsuspendSupplierAction(supplierId);
      if (result?.error) {
        setError(result.error);
        notify(result.error);
        return;
      }
      notify("Suspension removed — supplier is approved again");
      setOpen(false);
    });
  }

  if (status === "suspended") {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className="rounded-xl border border-emerald-300 px-4 py-2.5 text-sm font-bold text-emerald-700"
        >
          Remove suspension
        </button>
        {open && (
          <ConfirmDetailModal
            open
            onClose={() => !pending && setOpen(false)}
            title="Remove this suspension?"
            description="The supplier goes back to Approved and is eligible for dispatch again immediately."
            pending={pending}
            error={error}
            confirmLabel="Remove suspension"
            onConfirm={unsuspend}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setReason("");
          setOpen(true);
        }}
        className="rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-bold text-amber-700"
      >
        Suspend
      </button>
      {open && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setOpen(false)}
          title="Suspend this supplier?"
          description="They're immediately taken out of dispatch — no new jobs can be sent to them until the suspension is removed."
          pending={pending}
          error={error}
          destructive
          confirmLabel="Suspend supplier"
          onConfirm={suspend}
        >
          <label className="block text-sm font-bold">
            Reason (required)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 min-h-24 w-full rounded-xl border px-3 py-2 font-normal"
              placeholder="Why is this supplier being suspended?"
            />
          </label>
        </ConfirmDetailModal>
      )}
    </>
  );
}
