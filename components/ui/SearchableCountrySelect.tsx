"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

interface CountryOption {
  value?: string;
  label: string;
  divider?: boolean;
}

/**
 * Custom `countrySelectComponent` for react-phone-number-input — the
 * library's built-in selector is a plain native <select>, which isn't
 * searchable. Prop shape (value/options/onChange/iconComponent/...) is
 * dictated by the library itself (see PhoneInputWithCountry.js), not chosen
 * here.
 */
export function SearchableCountrySelect({
  value,
  options,
  onChange,
  disabled,
  iconComponent: Icon,
}: {
  value?: string;
  options: CountryOption[];
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  readOnly?: boolean;
  iconComponent?: React.ComponentType<{ country?: string; label?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const real = options.filter((o) => !o.divider);
    if (!q) return real;
    return real.filter((o) => o.label.toLowerCase().includes(q) || (o.value ?? "").toLowerCase().includes(q));
  }, [options, query]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className="PhoneInputCountry relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {Icon && <Icon country={value} label={selected?.label ?? value} />}
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search country…"
            className="w-full border-b border-slate-100 px-3 py-2 text-sm outline-none"
          />
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No matches</div>}
            {filtered.map((o) => (
              <button
                key={o.value ?? "ZZ"}
                type="button"
                // Selecting an option blurs the auto-focused search input first
                // — on mobile that blur (closing the on-screen keyboard) can
                // race with the click that's supposed to follow it, so the tap
                // visibly changes the value but the panel doesn't close.
                // preventDefault on mousedown stops that blur from happening
                // at all, so the click below always fires cleanly.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery("");
                }}
                className={
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 " +
                  (o.value === value ? "bg-primary-50 font-bold text-primary-700" : "")
                }
              >
                {Icon && <Icon country={o.value} label={o.label} />}
                <span className="flex-1 truncate">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
