"use client";

import { createContext, useContext, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import { clockInAction, startBreakAction, endBreakAction, clockOutAction } from "@/app/(staff)/attendance/actions";
import { computeActiveMs, formatDuration, type AttendanceState as DerivedAttendanceState } from "@/lib/attendanceState";

interface AttendanceContextValue {
  status: DerivedAttendanceState["status"];
  elapsedLabel: string;
  pending: boolean;
  clockIn: () => void;
  startBreak: () => void;
  endBreak: () => void;
  clockOut: () => void;
}

const AttendanceContext = createContext<AttendanceContextValue | null>(null);

/**
 * Wraps children in the live attendance status shown in the header and used
 * on /attendance. `initialState` is derived server-side (see
 * app/(staff)/layout.tsx) from the real attendance_events log — every action
 * here calls the matching server action then router.refresh(), which
 * re-runs that layout and hands this provider a fresh initialState, so
 * there's no separate client-side state to keep in sync by hand.
 */
export function AttendanceProvider({
  initialState,
  children,
}: {
  initialState: DerivedAttendanceState;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  // Starts null (rather than Date.now()) so the very first client render
  // matches SSR exactly — seeding from the real clock here would make the
  // elapsed label depend on how much wall-clock time passed between the
  // server render and hydration, which reliably produces a hydration
  // mismatch once that gap crosses a minute boundary (same class of issue
  // as Intl.NumberFormat's SSR/client divergence elsewhere in this app).
  // The real value is only ever set inside the effect below, i.e. after
  // hydration has already completed.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedLabel =
    now === null || initialState.status === "not_clocked_in" ? "" : formatDuration(computeActiveMs(initialState, now));

  function run(action: () => Promise<{ error?: string }>, successMessage: string) {
    startTransition(async () => {
      try {
        const result = await action();
        notify(result.error ?? successMessage);
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const value: AttendanceContextValue = {
    status: initialState.status,
    elapsedLabel,
    pending,
    clockIn: () => run(clockInAction, "Clocked in successfully"),
    startBreak: () => run(startBreakAction, "Break started"),
    endBreak: () => run(endBreakAction, "Break ended"),
    clockOut: () => run(clockOutAction, "Clocked out successfully"),
  };

  return <AttendanceContext.Provider value={value}>{children}</AttendanceContext.Provider>;
}

export function useAttendance() {
  const ctx = useContext(AttendanceContext);
  if (!ctx) throw new Error("useAttendance must be used within AttendanceProvider");
  return ctx;
}
