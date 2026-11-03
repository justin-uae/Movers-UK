"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { pauseQuoteRemindersAction, resumeQuoteRemindersAction, clearReminderOptOutAction } from "@/app/(staff)/quotes/reminderActions";

const ACTIONS = {
  pause: { run: pauseQuoteRemindersAction, label: "Pause reminders", done: "Reminders paused" },
  resume: { run: resumeQuoteRemindersAction, label: "Resume reminders", done: "Reminders resumed" },
  allow: { run: clearReminderOptOutAction, label: "Allow reminders again", done: "Reminders allowed again for this customer" },
} as const;

export function QuoteRemindersButton({ quoteId, action }: { quoteId: string; action: keyof typeof ACTIONS }) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const { run, label, done } = ACTIONS[action];

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await run(quoteId);
          if (result?.error) {
            notify(result.error);
            return;
          }
          notify(done);
          router.refresh();
        })
      }
      className="mt-3 w-full rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-slate-50 disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
