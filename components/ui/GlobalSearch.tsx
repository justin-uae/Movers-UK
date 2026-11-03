"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, Users, FileText, MapPin, Truck, Loader2 } from "lucide-react";
import { globalSearchAction, type SearchResult, type SearchResults } from "@/app/(staff)/search/actions";

const GROUPS: { key: keyof SearchResults; label: string; icon: typeof Users }[] = [
  { key: "customers", label: "Customers", icon: Users },
  { key: "enquiries", label: "Leads", icon: MapPin },
  { key: "quotes", label: "Quotes", icon: FileText },
  { key: "suppliers", label: "Suppliers", icon: Truck },
];

const EMPTY: SearchResults = { customers: [], enquiries: [], quotes: [], suppliers: [] };

/**
 * Global search (SRCH-01) — a command-palette-style overlay reachable via
 * the header's search icon or Cmd/Ctrl+K from anywhere in the staff app.
 * Self-contained: owns its own open/query/results state so it drops into
 * Header.tsx without needing any new prop plumbing through StaffShell.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [pending, setPending] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const flatResults = useMemo(() => {
    const flat: (SearchResult & { group: string })[] = [];
    for (const g of GROUPS) {
      for (const r of results[g.key]) flat.push({ ...r, group: g.label });
    }
    return flat;
  }, [results]);

  function close() {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    setActiveIndex(0);
  }

  // Cmd/Ctrl+K opens from anywhere; Escape closes while open.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === "Escape" && open) close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(EMPTY);
      setPending(false);
      return;
    }
    setPending(true);
    const handle = setTimeout(async () => {
      const data = await globalSearchAction(query);
      setResults(data);
      setActiveIndex(0);
      setPending(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function select(result: SearchResult) {
    close();
    router.push(result.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatResults[activeIndex]) {
      e.preventDefault();
      select(flatResults[activeIndex]);
    }
  }

  const totalCount = flatResults.length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-slate-500 hover:bg-slate-50"
        aria-label="Search"
        title="Search (Ctrl/Cmd+K)"
      >
        <Search size={18} />
        <span className="hidden text-xs font-bold text-slate-400 lg:inline">Search…</span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[300] overflow-y-auto bg-slate-900/40 p-4 pt-[10vh]" onClick={close}>
            <div
              className="mx-auto flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                <Search size={18} className="shrink-0 text-slate-400" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Search customers, leads, quotes, suppliers…"
                  className="w-full text-sm outline-none"
                />
                {pending && <Loader2 size={16} className="shrink-0 animate-spin text-slate-400" />}
              </div>

              <div className="overflow-y-auto">
                {query.trim().length < 2 ? (
                  <p className="p-6 text-center text-sm text-slate-400">Type at least 2 characters to search.</p>
                ) : totalCount === 0 && !pending ? (
                  <p className="p-6 text-center text-sm text-slate-400">No results for &ldquo;{query}&rdquo;.</p>
                ) : (
                  GROUPS.map((g) => {
                    const rows = results[g.key];
                    if (rows.length === 0) return null;
                    const Icon = g.icon;
                    return (
                      <div key={g.key} className="border-b border-slate-100 last:border-0">
                        <div className="px-5 pt-3 text-xs font-black uppercase tracking-wide text-slate-400">{g.label}</div>
                        <div className="pb-2">
                          {rows.map((r) => {
                            const flatIndex = flatResults.findIndex((f) => f.href === r.href && f.id === r.id);
                            const active = flatIndex === activeIndex;
                            return (
                              <button
                                key={r.id}
                                onClick={() => select(r)}
                                onMouseEnter={() => setActiveIndex(flatIndex)}
                                className={
                                  "flex w-full items-center gap-3 px-5 py-2.5 text-left " +
                                  (active ? "bg-primary-50" : "hover:bg-slate-50")
                                }
                              >
                                <Icon size={15} className="shrink-0 text-slate-400" />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-bold text-slate-800">{r.title}</div>
                                  {r.subtitle && <div className="truncate text-xs text-slate-500">{r.subtitle}</div>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
