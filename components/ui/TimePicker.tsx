"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, X } from "lucide-react";

const BARE_TIME_RE = /^\d{2}:\d{2}$/;
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0, 5, ..., 55
const PERIODS = ["AM", "PM"] as const;
type Period = (typeof PERIODS)[number];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseValue(value: string): { hour24: number; minute: number } | null {
  if (!BARE_TIME_RE.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return { hour24: h!, minute: m! };
}

function to12Hour(hour24: number): { hour12: number; period: Period } {
  const period: Period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, period };
}

function to24Hour(hour12: number, period: Period): number {
  if (period === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

export interface TimePickerProps {
  /** Bare 24-hour "HH:MM", matching the native time input this replaces. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Native <input type="time"> has the same cross-browser/touch reliability
 * issues as the native date input this sits alongside — this is a
 * self-contained hour/minute/AM-PM picker with the same "HH:MM" value
 * contract, so it's a drop-in swap. Minutes snap to 5-minute steps, which
 * covers every real pickup/return time in this domain.
 */
export function TimePicker({ value, onChange, placeholder = "Select time", className }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseValue(value);
  const initial = parsed ? to12Hour(parsed.hour24) : { hour12: 12, period: "AM" as Period };
  const [hour12, setHour12] = useState(initial.hour12);
  const [minute, setMinute] = useState(parsed ? parsed.minute - (parsed.minute % 5) : 0);
  const [period, setPeriod] = useState<Period>(initial.period);

  useEffect(() => {
    if (!open) return;
    const p = parseValue(value);
    if (p) {
      const t = to12Hour(p.hour24);
      setHour12(t.hour12);
      setPeriod(t.period);
      setMinute(p.minute - (p.minute % 5));
    }
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

  function apply(nextHour12: number, nextMinute: number, nextPeriod: Period) {
    setHour12(nextHour12);
    setMinute(nextMinute);
    setPeriod(nextPeriod);
    onChange(`${pad2(to24Hour(nextHour12, nextPeriod))}:${pad2(nextMinute)}`);
  }

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
          {parsed ? `${to12Hour(parsed.hour24).hour12}:${pad2(parsed.minute)} ${to12Hour(parsed.hour24).period}` : placeholder}
        </span>
        <Clock size={16} className="shrink-0 text-slate-400" />
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
                <b className="text-sm">Select time</b>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <ScrollColumn items={HOURS_12} selected={hour12} onSelect={(h) => apply(h, minute, period)} format={(h) => String(h)} />
                <ScrollColumn items={MINUTES} selected={minute} onSelect={(m) => apply(hour12, m, period)} format={pad2} />
                <ScrollColumn items={PERIODS} selected={period} onSelect={(p) => apply(hour12, minute, p)} format={(p) => p} />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-3 w-full rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white"
              >
                Done
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function ScrollColumn<T extends string | number>({
  items,
  selected,
  onSelect,
  format,
}: {
  items: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  format: (value: T) => string;
}) {
  return (
    <div className="h-48 overflow-y-auto rounded-xl border">
      {items.map((item) => (
        <button
          key={String(item)}
          type="button"
          onClick={() => onSelect(item)}
          className={
            "block w-full px-2 py-2.5 text-center text-sm font-semibold " +
            (item === selected ? "bg-primary-500 text-white" : "text-slate-700 hover:bg-slate-100")
          }
        >
          {format(item)}
        </button>
      ))}
    </div>
  );
}
