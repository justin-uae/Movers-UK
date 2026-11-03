import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceEventLike } from "@/lib/attendanceState";
import type { Database } from "@/lib/supabase/database.types";

export * from "@/lib/attendanceState";

/** UTC-midnight day boundary — per-user shift timezones are deferred (projectContext.md §129), so "today" is a UTC calendar day for now. */
export function startOfTodayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export function daysAgoIso(days: number): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString();
}

/** UTC-midnight boundaries for an arbitrary "YYYY-MM-DD" calendar day — same convention as startOfTodayIso, just parameterised for the team-by-date view (Attendance page's date picker). */
export function dayBoundsIso(dateStr: string): { startIso: string; endIso: string } {
  const parts = dateStr.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(Date.UTC(y, m - 1, d + 1));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** This user's own attendance_events from `sinceIso` onward, oldest first. */
export async function getEventsSince(
  supabase: SupabaseClient<Database>,
  userId: string,
  sinceIso: string,
): Promise<AttendanceEventLike[]> {
  const { data } = await supabase
    .from("attendance_events")
    .select("event, created_at")
    .eq("user_id", userId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  return data ?? [];
}
