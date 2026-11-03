"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bus, LayoutDashboard, Inbox, Truck, History, Settings, X } from "lucide-react";
import clsx from "clsx";
import type { SupplierStatus } from "@/lib/supabase/database.types";

const NAV = [
  { label: "Dashboard", href: "/supplier/dashboard", icon: LayoutDashboard },
  { label: "New Jobs", href: "/supplier/dashboard/new", icon: Inbox },
  { label: "Active Jobs", href: "/supplier/dashboard/active", icon: Truck },
  { label: "Job History", href: "/supplier/dashboard/history", icon: History },
];

const STATUS_STYLE: Record<SupplierStatus, string> = {
  invited: "bg-white/10 text-slate-300",
  submitted: "bg-blue-500/20 text-blue-300",
  approved: "bg-emerald-500/20 text-emerald-300",
  rejected: "bg-red-500/20 text-red-300",
  suspended: "bg-amber-500/20 text-amber-300",
};

export function SupplierSidebar({
  mobileOpen,
  onCloseMobile,
  supplierName,
  supplierStatus,
  newJobsCount,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  supplierName: string;
  supplierStatus: SupplierStatus;
  newJobsCount: number;
}) {
  const pathname = usePathname();
  // Nav items here have no nested sub-routes of their own (unlike job/[id]
  // detail pages), so an exact match is the right notion of "active" — a
  // startsWith check would incorrectly light up Dashboard while viewing an
  // arbitrary job detail page.
  const activeHref = NAV.find((item) => item.href === pathname)?.href;
  const settingsActive = pathname.startsWith("/supplier/settings");

  return (
    <>
      {mobileOpen && <div onClick={onCloseMobile} className="fixed inset-0 z-40 bg-slate-950/45 lg:hidden" />}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-white shadow-2xl transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary-500">
              <Bus size={22} />
            </div>
            <div className="min-w-0">
              <b className="block truncate text-lg">{supplierName}</b>
              <div className="text-[10px] uppercase tracking-[.22em] text-primary-300">Supplier Portal</div>
            </div>
          </div>
          <button className="shrink-0 lg:hidden" onClick={onCloseMobile} aria-label="Close menu">
            <X />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-slate-500">Jobs</div>
          {NAV.map(({ label, href, icon: Icon }) => {
            const active = href === activeHref;
            const badge = href === "/supplier/dashboard/new" && newJobsCount > 0 ? newJobsCount : null;
            return (
              <Link
                key={href}
                href={href}
                onClick={onCloseMobile}
                className={clsx(
                  "mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
                  active
                    ? "bg-primary-500 font-semibold text-white shadow-lg shadow-orange-950/20"
                    : "text-slate-300 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon size={18} />
                <span className="flex-1">{label}</span>
                {badge != null && <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">{badge}</span>}
              </Link>
            );
          })}
        </div>
        <div className="border-t border-white/10 p-4">
          <Link
            href="/supplier/settings"
            onClick={onCloseMobile}
            className={clsx(
              "mb-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
              settingsActive
                ? "bg-primary-500 font-semibold text-white shadow-lg shadow-orange-950/20"
                : "text-slate-300 hover:bg-white/5 hover:text-white",
            )}
          >
            <Settings size={18} />
            Settings
          </Link>
          <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{supplierName}</div>
              <div
                className={clsx(
                  "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  STATUS_STYLE[supplierStatus],
                )}
              >
                {supplierStatus}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
