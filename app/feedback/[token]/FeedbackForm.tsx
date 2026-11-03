"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { submitFeedbackAction } from "./actions";

export function FeedbackForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit() {
    if (score === null) {
      setError("Choose a score from 0 to 10.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitFeedbackAction(token, score, comment);
      if (result?.error) setError(result.error);
      else setDone(true);
    });
  }

  if (done) {
    return (
      <div className="mt-6 text-center">
        <p className="font-bold text-slate-800">Thanks for letting us know!</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setScore(n)}
            className={clsx(
              "rounded-lg py-2 text-sm font-bold",
              score === n ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>Not likely</span>
        <span>Extremely likely</span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Anything you'd like to add? (optional)"
        className="mt-4 min-h-24 w-full rounded-xl border p-3 text-sm"
      />
      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={pending}
        className="mt-4 w-full rounded-xl bg-primary-500 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit Feedback"}
      </button>
    </div>
  );
}
