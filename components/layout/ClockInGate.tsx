"use client";

import { Clock3, Lock } from "lucide-react";
import { useAttendance } from "../ui/AttendanceState";

/** Shown in place of the workspace for roles that must be clocked in to work (Sales User). */
export function ClockInGate() {
  const { pending, clockIn } = useAttendance();

  return (
    <div role="alert" className="flex justify-center px-4 pt-8 md:pt-12">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-primary-100 bg-white p-8 text-center shadow-xl shadow-primary-500/10">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />

        <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-50 ring-8 ring-primary-50/60">
          <Clock3 size={38} className="text-primary-500" />
          <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-800 text-white">
            <Lock size={14} />
          </span>
        </div>

        <h2 className="mt-6 text-2xl font-black tracking-tight text-slate-800">Clock in to start working</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
          Your workspace is locked until you clock in. Once you do, everything unlocks instantly.
        </p>

        <button
          onClick={clockIn}
          disabled={pending}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-500 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-primary-500/30 transition hover:bg-primary-600 disabled:opacity-60"
        >
          <Clock3 size={18} />
          {pending ? "Clocking in…" : "Clock In"}
        </button>
      </div>
    </div>
  );
}
