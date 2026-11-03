"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { exitImpersonationAction } from "@/app/(staff)/settings/users/actions";

/**
 * Persistent, impossible-to-miss strip shown across every page while a
 * Master Admin is impersonating someone (loginAsUserAction) — so an action
 * taken while impersonating is never mistaken for something the admin did
 * under their own account, and there's always a one-click way back.
 */
export function ImpersonationBanner({ targetName, adminName }: { targetName: string; adminName: string }) {
  const [pending, startTransition] = useTransition();

  function exit() {
    startTransition(async () => {
      await exitImpersonationAction();
    });
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-bold text-white">
      <span>
        Viewing as <b>{targetName}</b> — logged in by {adminName}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={exit}
        className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30 disabled:opacity-60"
      >
        <LogOut size={13} />
        {pending ? "Exiting…" : "Exit impersonation"}
      </button>
    </div>
  );
}
