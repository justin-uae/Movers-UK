"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/formatDate";
import { changeQuoteExpiryAction } from "@/app/(staff)/quotes/expiryActions";

/** "Valid until" on the quote page, with an inline date picker for anyone holding quotes.change_expiry. */
export function QuoteExpiryEditor({ quoteId, expiryAt, canChange }: { quoteId: string; expiryAt: string | null; canChange: boolean }) {
  const router = useRouter();
  const notify = useToast();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(expiryAt ? expiryAt.slice(0, 10) : "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await changeQuoteExpiryAction(quoteId, date);
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("Expiry date updated");
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm" />
        <button disabled={pending || !date} onClick={save} className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setEditing(false)} className="rounded-lg border px-3 py-1.5 text-xs font-bold">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <span>
      {expiryAt ? formatDateTime(expiryAt) : "—"}
      {canChange && (
        <button onClick={() => setEditing(true)} className="ml-2 text-xs font-bold text-primary-600 hover:underline">
          Change
        </button>
      )}
    </span>
  );
}
