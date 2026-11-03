"use client";

import Link from "next/link";
import { Clock3, FileText, Menu, LogOut } from "lucide-react";
import clsx from "clsx";
import type { Brand } from "@/lib/supabase/database.types";
import { BrandSwitcher } from "./BrandSwitcher";
import { NewLeadMenu } from "../ui/NewLeadMenu";
import { GlobalSearch } from "../ui/GlobalSearch";
import { useAttendance } from "../ui/AttendanceState";
import { signOut } from "@/app/(staff)/actions";

export function Header({
  onOpenMobile,
  brands,
  activeBrandId,
  canCreateQuote,
  canAddLead,
  locked = false,
}: {
  onOpenMobile: () => void;
  brands: Brand[];
  activeBrandId: string | null;
  canCreateQuote: boolean;
  canAddLead: boolean;
  locked?: boolean;
}) {
  const { status, elapsedLabel, pending, clockIn, startBreak, endBreak } = useAttendance();

  // Clocking out is deliberately not reachable from this shortcut — only
  // the /attendance page's explicit button does that — so a stray header
  // click can never end someone's shift. Every other transition is safe to
  // one-click from anywhere in the app.
  const nextAction = status === "working" ? startBreak : status === "on_break" ? endBreak : clockIn;
  const statusLabel =
    status === "working" ? "Working" : status === "on_break" ? "On Break" : status === "clocked_out" ? "Clocked Out" : "Clock In";

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-8">
      <button
        onClick={onOpenMobile}
        className="rounded-xl p-2 hover:bg-slate-100 lg:hidden"
        aria-label="Open menu"
      >
        <Menu />
      </button>
      <div className="ml-auto flex items-center gap-2">
        <div inert={locked} className={clsx("flex items-center gap-2", locked && "opacity-40")}>
          <GlobalSearch />
          <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
        </div>
        <button
          onClick={nextAction}
          disabled={pending}
          title={status === "working" ? "Start break" : status === "on_break" ? "End break" : "Clock in"}
          className={clsx(
            "hidden items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold sm:flex disabled:opacity-60",
            status === "working"
              ? "bg-emerald-50 text-emerald-700"
              : status === "on_break"
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-600",
          )}
        >
          <Clock3 size={16} />
          {statusLabel}
          {elapsedLabel && <span className="font-normal text-inherit opacity-70">· {elapsedLabel}</span>}
        </button>
        <div inert={locked} className={clsx("flex items-center gap-2", locked && "opacity-40")}>
          {canCreateQuote && (
            <Link
              href="/quotes/new"
              className="hidden items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-bold text-primary-700 hover:bg-primary-100 md:flex"
            >
              <FileText size={18} />
              New Quote
            </Link>
          )}
          {canAddLead && <NewLeadMenu label="New Lead" labelClassName="hidden sm:inline" />}
        </div>
        <form action={signOut}>
          <button
            className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </form>
      </div>
    </header>
  );
}
