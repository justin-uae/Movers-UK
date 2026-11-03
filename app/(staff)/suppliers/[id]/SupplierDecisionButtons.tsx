"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { decideSupplierAction } from "../actions";

export function SupplierDecisionButtons({ supplierId }: { supplierId: string }) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await decideSupplierAction(supplierId, decision);
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify(decision === "approved" ? "Supplier approved" : "Supplier rejected");
    });
  }

  return (
    <div className="flex gap-2">
      <button
        disabled={pending}
        onClick={() => decide("approved")}
        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        Approve
      </button>
      <button
        disabled={pending}
        onClick={() => decide("rejected")}
        className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-60"
      >
        Reject
      </button>
    </div>
  );
}
