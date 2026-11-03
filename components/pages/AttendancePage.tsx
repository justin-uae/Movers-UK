"use client";

import { LogIn, Coffee, LogOut, Clock3 } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { AttendanceDiagram } from "@/components/ui/guide-diagrams/AttendanceDiagram";
import { useAttendance } from "@/components/ui/AttendanceState";
import { legalNextEvents, formatDuration } from "@/lib/attendanceState";
import { formatDate, formatClockTime } from "@/lib/formatDate";

export interface DailySummary {
  date: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  /** null means a past day with no clock_out — forgotten, not still running; shown as "Incomplete" rather than a fabricated duration. */
  activeMs: number | null;
}

export interface TeamRow {
  profileId: string;
  name: string;
  status: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  /** null means this day (not necessarily today) has no clock-out yet and isn't the live/current day either — see dailyActiveMs in the route page. */
  activeMs: number | null;
}

const STATUS_STYLE: Record<string, string> = {
  not_clocked_in: "bg-slate-100 text-slate-500",
  working: "bg-emerald-50 text-emerald-600",
  on_break: "bg-amber-50 text-amber-600",
  clocked_out: "bg-slate-100 text-slate-500",
};

const STATUS_LABEL: Record<string, string> = {
  not_clocked_in: "Not Clocked In",
  working: "Working",
  on_break: "On Break",
  clocked_out: "Clocked Out",
};

function timeLabel(iso: string | null) {
  if (!iso) return "—";
  return formatClockTime(iso);
}

function dateLabel(dateStr: string) {
  return formatDate(dateStr);
}

export function AttendancePage({
  recentDays,
  teamRows,
  selectedDate,
  todayStr,
}: {
  recentDays: DailySummary[];
  teamRows: TeamRow[] | null;
  selectedDate: string;
  todayStr: string;
}) {
  const { status, elapsedLabel, pending, clockIn, startBreak, endBreak, clockOut } = useAttendance();
  const available = legalNextEvents(status);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isSelectedToday = selectedDate === todayStr;

  function changeDate(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === todayStr) {
      params.delete("date");
    } else {
      params.set("date", next);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div>
      <PageHead
        eyebrow="People Operations"
        title="Time & attendance"
        text="Clock in, take breaks and clock out — your active time is tracked automatically."
        action={
          <PageGuide
            title="Time & attendance"
            subtitle="Clock in/out for yourself, plus a live team view for managers."
            screenshot={<AttendanceDiagram />}
            sections={[
              {
                heading: "Your clock card",
                body: [
                  "Clock in, Start break, End break and Clock out are only ever available in the order that makes sense — you can't clock out while on a break, or start a break before clocking in.",
                ],
              },
              {
                heading: "Team attendance overview",
                body: [
                  "Managers see every team member's status here — Not Clocked In, Working, On Break or Clocked Out — with clock-in, clock-out and active time. Defaults to today's live view; pick an earlier date to see that day's record instead. Incomplete means no clock-out was recorded for that day.",
                ],
              },
              {
                heading: "Your recent days",
                body: [
                  "A day-by-day history of your own clock-in, clock-out and active time. Incomplete means a clock-out was never recorded for that day — not a fabricated duration.",
                ],
              },
            ]}
          />
        }
      />
      <div className={clsx("grid gap-6", teamRows && "xl:grid-cols-[.8fr_1.2fr]")}>
        <Panel>
          <div className="text-center">
            <div className={clsx("mx-auto grid h-24 w-24 place-items-center rounded-full", STATUS_STYLE[status])}>
              <Clock3 size={42} />
            </div>
            <h2 className="mt-4 text-2xl font-black">{STATUS_LABEL[status]}</h2>
            {elapsedLabel && <p className="mt-1 text-sm font-bold text-slate-500">{elapsedLabel} today</p>}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                onClick={clockIn}
                disabled={pending || !available.includes("clock_in")}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                <LogIn className="mr-2 inline" size={17} />
                Clock in
              </button>
              <button
                onClick={startBreak}
                disabled={pending || !available.includes("break_start")}
                className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                <Coffee className="mr-2 inline" size={17} />
                Start break
              </button>
              <button
                onClick={endBreak}
                disabled={pending || !available.includes("break_end")}
                className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                <Coffee className="mr-2 inline" size={17} />
                End break
              </button>
              <button
                onClick={clockOut}
                disabled={pending || !available.includes("clock_out")}
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                <LogOut className="mr-2 inline" size={17} />
                Clock out
              </button>
            </div>
          </div>
        </Panel>

        {teamRows && (
          <Panel className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle
                title={isSelectedToday ? "Today's attendance overview" : `Attendance overview — ${dateLabel(selectedDate)}`}
                sub={isSelectedToday ? "Live team status" : "As recorded for the selected date"}
              />
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                Date
                <input
                  type="date"
                  value={selectedDate}
                  max={todayStr}
                  onChange={(e) => e.target.value && changeDate(e.target.value)}
                  className="rounded-lg border px-2.5 py-1.5 text-sm font-semibold text-slate-700"
                />
              </label>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase text-slate-400">
                  <tr>
                    <th className="pb-3">User</th>
                    <th>Clock in</th>
                    <th>Clock out</th>
                    <th>Active time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRows.map((u) => (
                    <tr className="border-t" key={u.profileId}>
                      <td className="whitespace-nowrap py-4 font-bold">{u.name}</td>
                      <td className="whitespace-nowrap">{timeLabel(u.clockInAt)}</td>
                      <td className="whitespace-nowrap">{timeLabel(u.clockOutAt)}</td>
                      <td className="whitespace-nowrap">{u.activeMs == null ? (u.clockInAt ? "Incomplete" : "—") : formatDuration(u.activeMs)}</td>
                      <td className="whitespace-nowrap">
                        <span className={clsx("rounded-full px-2 py-1 text-xs font-bold", STATUS_STYLE[u.status])}>
                          {STATUS_LABEL[u.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {teamRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                        No team members yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>

      <Panel className="mt-6">
        <SectionTitle title="Your recent days" sub="Clock-in, clock-out and active time, grouped by day" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">Date</th>
                <th>Clock in</th>
                <th>Clock out</th>
                <th>Active time</th>
              </tr>
            </thead>
            <tbody>
              {recentDays.map((d) => (
                <tr className="border-t" key={d.date}>
                  <td className="min-w-[11rem] py-4 font-bold">{dateLabel(d.date)}</td>
                  <td className="whitespace-nowrap">{timeLabel(d.clockInAt)}</td>
                  <td className="whitespace-nowrap">{timeLabel(d.clockOutAt)}</td>
                  <td className="whitespace-nowrap">{d.activeMs == null ? "Incomplete" : formatDuration(d.activeMs)}</td>
                </tr>
              ))}
              {recentDays.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-sm text-slate-500">
                    No attendance recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
