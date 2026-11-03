// Pure attendance state-derivation logic — deliberately has no "server-only"
// import, unlike lib/attendance.ts, because both the server (initial render,
// server actions) and the client (AttendanceState.tsx's live-ticking timer
// and button-enablement) need it.

import type { AttendanceEventType } from "@/lib/supabase/database.types";

export type AttendanceStatus = "not_clocked_in" | "working" | "on_break" | "clocked_out";

export interface AttendanceState {
  status: AttendanceStatus;
  clockInAt: string | null;
  breakStartedAt: string | null;
  clockOutAt: string | null;
  totalBreakMs: number;
}

export interface AttendanceEventLike {
  event: AttendanceEventType;
  created_at: string;
}

const INITIAL_STATE: AttendanceState = {
  status: "not_clocked_in",
  clockInAt: null,
  breakStartedAt: null,
  clockOutAt: null,
  totalBreakMs: 0,
};

/**
 * Walks one user's events (ascending order, normally "today only") into
 * their current derived state — status is never stored as its own mutable
 * column, only ever computed from this log, so there's nothing that can
 * fall out of sync with the events that actually happened.
 *
 * An event that doesn't make sense from the current state (e.g. a second
 * clock_in with no clock_out in between) is ignored rather than throwing —
 * the server actions already enforce legalNextEvents() before ever
 * inserting, so this only defends against reading a log some future bug
 * managed to write out of order.
 */
export function deriveAttendanceState(events: AttendanceEventLike[]): AttendanceState {
  let state: AttendanceState = { ...INITIAL_STATE };
  let breakStartMs: number | null = null;

  for (const e of events) {
    const atMs = new Date(e.created_at).getTime();
    switch (e.event) {
      case "clock_in":
        state = { status: "working", clockInAt: e.created_at, breakStartedAt: null, clockOutAt: null, totalBreakMs: 0 };
        breakStartMs = null;
        break;
      case "break_start":
        if (state.status !== "working") break;
        state = { ...state, status: "on_break", breakStartedAt: e.created_at };
        breakStartMs = atMs;
        break;
      case "break_end":
        if (state.status !== "on_break" || breakStartMs === null) break;
        state = { ...state, status: "working", breakStartedAt: null, totalBreakMs: state.totalBreakMs + (atMs - breakStartMs) };
        breakStartMs = null;
        break;
      case "clock_out":
        if (state.status !== "working" && state.status !== "on_break") break;
        // Clocking out mid-break folds the open break into totalBreakMs up
        // to now, same as an explicit break_end immediately before it would.
        if (state.status === "on_break" && breakStartMs !== null) {
          state = { ...state, totalBreakMs: state.totalBreakMs + (atMs - breakStartMs) };
        }
        state = { ...state, status: "clocked_out", breakStartedAt: null, clockOutAt: e.created_at };
        breakStartMs = null;
        break;
    }
  }

  return state;
}

/** Legal next event(s) from a given status — the state machine the server actions enforce. */
export function legalNextEvents(status: AttendanceStatus): AttendanceEventType[] {
  switch (status) {
    case "not_clocked_in":
    case "clocked_out":
      return ["clock_in"];
    case "working":
      return ["break_start", "clock_out"];
    case "on_break":
      return ["break_end", "clock_out"];
  }
}

/** Active (non-break) time from clock-in through `asOfMs` (pass Date.now() for a shift still in progress, or the clock-out time for a finished one). */
export function computeActiveMs(state: AttendanceState, asOfMs: number): number {
  if (!state.clockInAt) return 0;
  const start = new Date(state.clockInAt).getTime();
  let breakMs = state.totalBreakMs;
  if (state.status === "on_break" && state.breakStartedAt) {
    breakMs += asOfMs - new Date(state.breakStartedAt).getTime();
  }
  return Math.max(0, asOfMs - start - breakMs);
}

/** "6h 14m" style label for a millisecond duration. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
