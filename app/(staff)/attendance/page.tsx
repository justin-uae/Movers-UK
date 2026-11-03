import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { getEventsSince, daysAgoIso, dayBoundsIso } from "@/lib/attendance";
import { deriveAttendanceState, computeActiveMs } from "@/lib/attendanceState";
import { AttendancePage, type DailySummary, type TeamRow } from "@/components/pages/AttendancePage";
import type { AttendanceEventType } from "@/lib/supabase/database.types";

const RECENT_DAYS = 14;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AttendanceRoutePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const profile = await requireProfile();
  const canViewTeam = await hasPermission(profile, PERMISSIONS.ADMIN_VIEW_AUDIT_LOGS);
  const supabase = await createClient();

  const todayStr = new Date().toISOString().slice(0, 10);
  const selectedDate = params.date && DATE_RE.test(params.date) && params.date <= todayStr ? params.date : todayStr;
  const { startIso, endIso } = dayBoundsIso(selectedDate);

  const [ownRecentEvents, teamEventsResult, teamProfilesResult] = await Promise.all([
    getEventsSince(supabase, profile.id, daysAgoIso(RECENT_DAYS)),
    canViewTeam
      ? supabase
          .from("attendance_events")
          .select("user_id, event, created_at")
          .gte("created_at", startIso)
          .lt("created_at", endIso)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: null }),
    canViewTeam ? supabase.from("profiles").select("id, full_name").order("full_name") : Promise.resolve({ data: null }),
  ]);

  // A past day with no clock_out means it was forgotten, not that the shift
  // is still running — showing "Incomplete" beats fabricating a duration
  // against the current moment (projectContext.md §133's corrections
  // workflow is the deferred, proper fix for that case). Shared by both the
  // viewer's own recent-days table and the team-by-date table below, since
  // both need the exact same "is this the still-live day or a past one"
  // rule applied per row.
  function dailyActiveMs(state: ReturnType<typeof deriveAttendanceState>, isToday: boolean): number | null {
    if (state.status === "clocked_out") return computeActiveMs(state, new Date(state.clockOutAt!).getTime());
    return isToday ? computeActiveMs(state, Date.now()) : null;
  }

  const eventsByDay = new Map<string, { event: AttendanceEventType; created_at: string }[]>();
  for (const e of ownRecentEvents) {
    const day = e.created_at.slice(0, 10);
    if (!eventsByDay.has(day)) eventsByDay.set(day, []);
    eventsByDay.get(day)!.push(e);
  }

  const recentDays: DailySummary[] = [...eventsByDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, events]) => {
      const state = deriveAttendanceState(events);
      return { date, clockInAt: state.clockInAt, clockOutAt: state.clockOutAt, activeMs: dailyActiveMs(state, date === todayStr) };
    });

  let teamRows: TeamRow[] | null = null;
  if (canViewTeam && teamProfilesResult.data) {
    const eventsByUser = new Map<string, { event: AttendanceEventType; created_at: string }[]>();
    for (const e of (teamEventsResult.data ?? []) as { user_id: string; event: AttendanceEventType; created_at: string }[]) {
      if (!eventsByUser.has(e.user_id)) eventsByUser.set(e.user_id, []);
      eventsByUser.get(e.user_id)!.push(e);
    }
    const isSelectedToday = selectedDate === todayStr;
    teamRows = teamProfilesResult.data.map((p) => {
      const state = deriveAttendanceState(eventsByUser.get(p.id) ?? []);
      return {
        profileId: p.id,
        name: p.full_name,
        status: state.status,
        clockInAt: state.clockInAt,
        clockOutAt: state.clockOutAt,
        activeMs: dailyActiveMs(state, isSelectedToday),
      };
    });
  }

  return <AttendancePage recentDays={recentDays} teamRows={teamRows} selectedDate={selectedDate} todayStr={todayStr} />;
}
