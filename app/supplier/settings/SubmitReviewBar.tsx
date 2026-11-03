"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { submitVerificationAction } from "./actions";
import type { Supplier } from "@/lib/supabase/database.types";

const STATUS_TEXT: Record<Supplier["status"], string> = {
  invited: "Not submitted yet — fill in your business details and documents, then submit for review.",
  submitted: "Submitted — awaiting review by the operator.",
  approved: "Approved — you can now receive jobs.",
  rejected: "Rejected — update your details below and resubmit.",
  suspended: "Your account has been suspended.",
};

const STATUS_STYLE: Record<Supplier["status"], string> = {
  invited: "bg-slate-100 text-slate-600",
  submitted: "bg-blue-50 text-blue-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  suspended: "bg-amber-50 text-amber-700",
};

export function SubmitReviewBar({ status }: { status: Supplier["status"] }) {
  const notify = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const canSubmit = status === "invited" || status === "rejected";

  function submit() {
    startTransition(async () => {
      try {
        await submitVerificationAction();
        notify("Submitted for review");
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not submit.");
      }
    });
  }

  return (
    <div className={`mb-6 flex flex-col gap-3 rounded-2xl px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${STATUS_STYLE[status]}`}>
      <div>
        <span className="font-bold capitalize">{status}</span> · {STATUS_TEXT[status]}
      </div>
      {canSubmit && (
        <button
          onClick={submit}
          disabled={pending}
          className="w-fit shrink-0 rounded-xl bg-primary-500 px-4 py-2 text-xs font-black text-white disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit for review"}
        </button>
      )}
    </div>
  );
}
