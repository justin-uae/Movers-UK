"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { MONTH_NAMES } from "@/lib/formatDate";

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const BARE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseValue(value: string): { y: number; m: number; d: number } | null {
  if (!BARE_DATE_RE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

export interface DatePickerProps {
  /** Bare "YYYY-MM-DD", matching the native date input this replaces. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Native <input type="date"> renders as an OS-controlled picker whose touch
 * behaviour varies across mobile browsers and can feel unreliable inside a
 * scrolling form. This is a self-contained calendar grid instead — same
 * "YYYY-MM-DD" value contract as the native input, so it's a drop-in swap.
 */
export function DatePicker({ value, onChange, placeholder = "Select date", className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseValue(value);
  const today = new Date();
  const [viewYear, setViewYear] = useState(parsed?.y ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.m ?? today.getMonth() + 1);

  useEffect(() => {
    if (!open) return;
    const p = parseValue(value);
    setViewYear(p?.y ?? today.getFullYear());
    setViewMonth(p?.m ?? today.getMonth() + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function changeMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  function selectDay(day: number) {
    onChange(`${viewYear}-${pad2(viewMonth)}-${pad2(day)}`);
    setOpen(false);
  }

  const leadDays = new Date(viewYear, viewMonth - 1, 1).getDay();
  const totalDays = new Date(viewYear, viewMonth, 0).getDate();
  const cells: (number | null)[] = [...Array(leadDays).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "mt-1.5 flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-base font-normal"
        }
      >
        <span className={parsed ? "" : "text-slate-400"}>
          {parsed ? `${parsed.d} ${MONTH_NAMES[parsed.m - 1]!.slice(0, 3)} ${parsed.y}` : placeholder}
        </span>
        <Calendar size={16} className="shrink-0 text-slate-400" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[300] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-xs rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  className="rounded-lg p-2 hover:bg-slate-100"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                <b className="text-sm">
                  {MONTH_NAMES[viewMonth - 1]} {viewYear}
                </b>
                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  className="rounded-lg p-2 hover:bg-slate-100"
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400">
                {WEEKDAY_INITIALS.map((w, i) => (
                  <div key={i} className="py-1">
                    {w}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (day === null) return <div key={i} />;
                  const isSelected = parsed?.y === viewYear && parsed?.m === viewMonth && parsed?.d === day;
                  const isToday = today.getFullYear() === viewYear && today.getMonth() + 1 === viewMonth && today.getDate() === day;
                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => selectDay(day)}
                      className={
                        "aspect-square rounded-full text-sm font-semibold " +
                        (isSelected
                          ? "bg-primary-500 text-white"
                          : isToday
                            ? "border border-primary-300 text-primary-700"
                            : "text-slate-700 hover:bg-slate-100")
                      }
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
