"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { updateTermsAction } from "./actions";

export function TermsForm({ initialValue, canManage }: { initialValue: string; canManage: boolean }) {
  const notify = useToast();
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateTermsAction(value);
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("Terms & Conditions updated");
    });
  }

  return (
    <div className="mt-4">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        readOnly={!canManage}
        rows={16}
        className="w-full rounded-xl border px-3 py-3 text-sm font-normal"
      />
      {canManage && (
        <button
          disabled={pending}
          onClick={save}
          className="mt-3 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save Terms & Conditions"}
        </button>
      )}
    </div>
  );
}
