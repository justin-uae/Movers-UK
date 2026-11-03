"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, FileText, Wand2 } from "lucide-react";

/**
 * Shared "start a new lead" entry point — used from the Header's global
 * shortcut and the Leads list's own "Add Enquiry" button. Complex Booking
 * used to be its own sidebar item; it's reached from here instead now, as a
 * second option alongside the standard single-journey form, since both are
 * just different ways to start the same lead-intake flow.
 */
export function NewLeadMenu({
  label,
  buttonClassName,
  labelClassName,
}: {
  label: string;
  buttonClassName?: string;
  labelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={
          buttonClassName ??
          "flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-primary-600"
        }
      >
        <Plus size={18} />
        <span className={labelClassName}>{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <Link
            href="/leads/new"
            onClick={() => setOpen(false)}
            className="flex items-start gap-3 rounded-xl p-3 hover:bg-slate-50"
          >
            <FileText size={18} className="mt-0.5 shrink-0 text-slate-500" />
            <span>
              <span className="block text-sm font-bold text-slate-900">Standard lead</span>
              <span className="block text-xs text-slate-500">Enter one journey manually</span>
            </span>
          </Link>
          <Link
            href="/leads/complex-booking"
            onClick={() => setOpen(false)}
            className="flex items-start gap-3 rounded-xl p-3 hover:bg-slate-50"
          >
            <Wand2 size={18} className="mt-0.5 shrink-0 text-primary-500" />
            <span>
              <span className="block text-sm font-bold text-slate-900">Complex Booking</span>
              <span className="block text-xs text-slate-500">Paste or upload an itinerary — AI builds every leg</span>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
