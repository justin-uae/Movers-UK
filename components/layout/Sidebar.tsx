"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import clsx from "clsx";
import { NAV, SETTINGS_NAV_ITEM, groupNavItems, type NavGroupKey, type NavItem } from "./nav";
import { BRAND } from "@/lib/brandConfig";

const COLLAPSE_STORAGE_KEY = "sidebar-collapsed-groups";

function loadCollapsedGroups(): Set<NavGroupKey> {
  try {
    const raw = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as NavGroupKey[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsedGroups(groups: Set<NavGroupKey>) {
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...groups]));
  } catch {
    // Private browsing / storage disabled — collapse state just won't persist across visits.
  }
}

export function Sidebar({
  mobileOpen,
  onCloseMobile,
  userName,
  roleName,
  visibleHrefs,
  canSeeSettings,
  navCounts = {},
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userName: string;
  roleName: string;
  visibleHrefs: string[];
  canSeeSettings: boolean;
  /** Badge number per nav href — how many things there need this user (lib/navCounts.ts, computed per user in app/(staff)/layout.tsx). Missing/0 = no badge. */
  navCounts?: Record<string, number>;
}) {
  const pathname = usePathname();
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const [collapsed, setCollapsed] = useState<Set<NavGroupKey>>(() => new Set());
  useEffect(() => {
    setCollapsed(loadCollapsedGroups());
  }, []);

  function toggleGroup(key: NavGroupKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveCollapsedGroups(next);
      return next;
    });
  }

  // Pick only the most specific (longest) matching href as active —
  // otherwise a nested route like /accounting/supplier-payments would light
  // up both "Accounting" and "Supplier Payments" at once, since the latter's
  // path also starts with the former's.
  function isActive(href: string, candidates: string[]) {
    const activeHref = candidates
      .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
      .sort((a, b) => b.length - a.length)[0];
    return href === activeHref;
  }

  const pinnedItem = NAV.find((item) => !item.group && visibleHrefs.includes(item.href));
  const groupableItems = NAV.filter((item) => item.group && visibleHrefs.includes(item.href));
  const groups = useMemo(() => {
    const withSettings = canSeeSettings ? [...groupableItems, SETTINGS_NAV_ITEM as NavItem] : groupableItems;
    return groupNavItems(withSettings);
  }, [groupableItems, canSeeSettings]);

  const allHrefs = useMemo(() => [pinnedItem?.href, ...groups.flatMap((g) => g.items.map((i) => i.href))].filter((h): h is string => !!h), [pinnedItem, groups]);

  // A group containing the active route always renders expanded, regardless
  // of stored collapse state — "retain the active location" per UI-NAV-01,
  // even if the user had previously collapsed that section.
  const activeGroupKey = groups.find((g) => g.items.some((item) => isActive(item.href, allHrefs)))?.key;

  function renderItem(item: NavItem) {
    const active = isActive(item.href, allHrefs);
    const Icon = item.icon;
    const count = navCounts[item.href] ?? 0;
    const badge = count > 0 ? (count > 99 ? "99+" : String(count)) : null;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onCloseMobile}
        className={clsx(
          "mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
          active
            ? "bg-primary-500 font-semibold text-white shadow-lg shadow-orange-950/20"
            : "text-slate-300 hover:bg-white/5 hover:text-white",
        )}
      >
        <Icon size={18} />
        <span className="flex-1">{item.label}</span>
        {badge != null && (
          <span
            className={clsx(
              "inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none tabular-nums",
              // Quiet translucent chip rather than a loud solid colour — with
              // several items counting at once, solid chips turn the whole
              // sidebar into noise. Slightly stronger on the active row so it
              // still reads against the orange.
              active ? "bg-white/25 text-white" : "bg-white/10 text-slate-200",
            )}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  }

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/45 lg:hidden"
        />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-white shadow-2xl transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5">
          <Link href="/dashboard" onClick={onCloseMobile} className="flex h-full min-w-0 flex-1 items-center">
            <img
              src={BRAND.logoPathOnDark}
              alt={BRAND.companyName}
              width={881}
              height={182}
              className="h-auto max-h-12 w-full object-contain object-left"
            />
          </Link>
          <button className="shrink-0 lg:hidden" onClick={onCloseMobile} aria-label="Close menu">
            <X />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {pinnedItem && (
            <div className="mb-3 border-b border-white/10 pb-3">{renderItem(pinnedItem)}</div>
          )}
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.key) && group.key !== activeGroupKey;
            // A collapsed section still shows how much is waiting inside it.
            const groupTotal = group.items.reduce((sum, item) => sum + (navCounts[item.href] ?? 0), 0);
            return (
              <div key={group.key} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-[.2em] text-slate-500 hover:text-slate-300"
                >
                  <span className="flex items-center gap-2">
                    {group.label}
                    {isCollapsed && groupTotal > 0 && (
                      <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-white/10 px-1 text-[10px] font-semibold leading-none tracking-normal text-slate-300 tabular-nums">
                        {groupTotal > 99 ? "99+" : groupTotal}
                      </span>
                    )}
                  </span>
                  <ChevronDown size={14} className={clsx("transition-transform", isCollapsed && "-rotate-90")} />
                </button>
                {!isCollapsed && <div className="mt-0.5">{group.items.map(renderItem)}</div>}
              </div>
            );
          })}
        </div>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary-500 font-bold">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{userName}</div>
              <div className="text-xs text-slate-400">{roleName}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
