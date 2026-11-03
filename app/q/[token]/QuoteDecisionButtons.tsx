"use client";

import { useState, useTransition } from "react";
import { acceptQuoteAction, rejectQuoteAction } from "./actions";

const REJECT_REASONS = [
  "Too expensive",
  "Cancelled trip",
  "Booked elsewhere",
  "Dates changed",
  "Requirements changed",
  "Other",
];

export function QuoteDecisionButtons({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptedByName, setAcceptedByName] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REJECT_REASONS[0]!);
  const [freeText, setFreeText] = useState("");

  function confirmAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptQuoteAction(token, acceptedByName);
      if (result?.error) setError(result.error);
    });
  }

  function confirmReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectQuoteAction(token, freeText ? `${reason}: ${freeText}` : reason);
      if (result?.error) setError(result.error);
    });
  }

  if (accepting) {
    return (
      <div className="rounded-2xl border p-5">
        <label className="text-sm font-bold">
          Type your name to confirm acceptance
          <input
            value={acceptedByName}
            onChange={(e) => setAcceptedByName(e.target.value)}
            placeholder="Your full name"
            className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal"
          />
        </label>
        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={confirmAccept}
            disabled={pending}
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? "Submitting…" : "Confirm acceptance"}
          </button>
          <button onClick={() => setAccepting(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (rejecting) {
    return (
      <div className="rounded-2xl border p-5">
        <label className="text-sm font-bold">
          Why are you rejecting this quote?
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal">
            {REJECT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm font-bold">
          Additional comments (optional)
          <textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border p-3 font-normal" />
        </label>
        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={confirmReject}
            disabled={pending}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? "Submitting…" : "Confirm rejection"}
          </button>
          <button onClick={() => setRejecting(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <p className="mb-3 text-sm font-semibold text-red-600">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          onClick={() => setAccepting(true)}
          disabled={pending}
          className="h-14 rounded-2xl bg-emerald-700 px-5 text-base font-black text-white transition hover:bg-emerald-800 disabled:opacity-60"
        >
          Accept Quote
        </button>
        <button
          onClick={() => setRejecting(true)}
          disabled={pending}
          className="h-14 rounded-2xl border-[1.5px] border-slate-300 bg-white px-5 text-base font-black text-slate-900 transition hover:border-slate-400 disabled:opacity-60"
        >
          Reject Quote
        </button>
      </div>
    </div>
  );
}
