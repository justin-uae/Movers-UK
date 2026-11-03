"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { updateQuoteRemindersSettingsAction } from "./actions";

export function QuoteRemindersForm({ initialEnabled }: { initialEnabled: boolean }) {
  const notify = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [savedEnabled, setSavedEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateQuoteRemindersSettingsAction(enabled);
      if (result?.error) {
        notify(result.error);
        return;
      }
      setSavedEnabled(enabled);
      notify(enabled ? "Quote reminders switched on" : "Quote reminders switched off");
    });
  }

  return (
    <div className="mt-4 max-w-md space-y-4">
      <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
        <span>
          <span className="block text-sm font-bold">Send automatic quote reminders</span>
          <span className="block text-xs text-slate-500">When off, no reminder or payment-reminder emails are sent to any customer.</span>
        </span>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 shrink-0 accent-primary-500" />
      </label>
      {enabled !== savedEnabled && (
        <button disabled={pending} onClick={save} className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}
