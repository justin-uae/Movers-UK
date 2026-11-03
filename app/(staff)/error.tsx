"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Catches an unhandled error from any (staff) page/nested route so it never
 * falls through to Next's bare default error overlay — the sidebar/header
 * (app/(staff)/layout.tsx) sit above this boundary and stay rendered, only
 * the page content area is replaced.
 */
export default function StaffError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Staff route error:", error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600">
          <AlertTriangle size={26} />
        </div>
        <h2 className="mt-4 text-lg font-black text-slate-900">Something went wrong</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          This page hit an unexpected error. You can try again, or head back and pick up where you left off.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={reset} className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-600">
            Try again
          </button>
          <a href="/dashboard" className="rounded-xl border px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
