"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { updateQuoteValidityAction } from "./actions";

export function QuoteValidityForm({ initialDays, canManage }: { initialDays: number; canManage: boolean }) {
  const notify = useToast();
  const [days, setDays] = useState(String(initialDays));
  const [savedDays, setSavedDays] = useState(String(initialDays));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateQuoteValidityAction(Number(days));
      if (result?.error) {
        notify(result.error);
        return;
      }
      setSavedDays(days);
      notify("Default quote validity updated");
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-sm font-bold">
        Valid for (days)
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          readOnly={!canManage}
          className="mt-2 block w-32 rounded-xl border px-3 py-2.5 text-sm font-semibold"
        />
      </label>
      {canManage && days !== savedDays && (
        <button disabled={pending} onClick={save} className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}
