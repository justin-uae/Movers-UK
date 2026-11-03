"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import clsx from "clsx";

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

/**
 * Generic searchable dropdown — a button showing the current selection that
 * opens a filterable option list. Submits like a native <select> via a
 * hidden input (`name`), so it drops into an existing uncontrolled <form>
 * read with `new FormData(form)` unchanged.
 */
export function SearchableSelect({
  name,
  options,
  value,
  onChange,
  placeholder = "Select…",
}: {
  name?: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-2 flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left font-normal"
      >
        <span className={selected ? "" : "text-slate-400"}>
          {selected ? `${selected.label}${selected.sublabel ? ` — ${selected.sublabel}` : ""}` : placeholder}
        </span>
        <ChevronsUpDown size={16} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full py-1 text-sm outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No matches</div>}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={clsx(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50",
                  o.value === value && "bg-primary-50 font-bold text-primary-700",
                )}
              >
                <span>{o.label}</span>
                {o.sublabel && <span className="text-xs text-slate-400">{o.sublabel}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
