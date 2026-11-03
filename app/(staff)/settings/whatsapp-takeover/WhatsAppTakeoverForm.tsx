"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Bot, CalendarDays, Clock, Hand, MessageCircle, Power } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { WhatsAppTakeoverSettings } from "@/lib/whatsappConversations";
import { updateWhatsAppTakeoverSettingsAction } from "./actions";

const DAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
];

const COMMON_TIMEZONES = ["Europe/London", "Asia/Dubai", "Europe/Paris", "Africa/Nairobi", "Asia/Karachi", "Asia/Kolkata", "Asia/Manila", "UTC"];

/** "09:00" -> "9:00 AM" */
function clock(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** [1,2,3,4,5,6] -> "Monday to Saturday"; [1,3,5] -> "Mon, Wed, Fri". */
function describeDays(days: number[]): string {
  const sorted = [...days].sort();
  if (sorted.length === 7) return "every day";
  if (sorted.length === 0) return "no days";
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1]! + 1);
  if (contiguous && sorted.length > 2) {
    return `${DAYS[sorted[0]! - 1]!.long} to ${DAYS[sorted[sorted.length - 1]! - 1]!.long}`;
  }
  return sorted.map((d) => DAYS[d - 1]!.short).join(", ");
}

function cityOf(tz: string): string {
  return (tz.split("/").pop() ?? tz).replaceAll("_", " ");
}

/** Same rule as the database's whatsapp_takeover_open(), evaluated in the browser for the status line. */
function isOpenNow(s: WhatsAppTakeoverSettings, now: Date): boolean {
  if (!s.enabled) return false;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone: s.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  } catch {
    return false;
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = DAYS.find((d) => d.short === get("weekday"))?.value ?? 0;
  const time = `${get("hour")}:${get("minute")}`;
  if (!s.days.includes(day)) return false;
  return s.start <= s.end ? time >= s.start && time < s.end : time >= s.start || time < s.end;
}

export function WhatsAppTakeoverForm({ initial }: { initial: WhatsAppTakeoverSettings }) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [now, setNow] = useState<Date | null>(null);
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const timezones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return [...new Set([settings.timezone, ...COMMON_TIMEZONES, ...all])];
  }, [settings.timezone]);

  const overnight = settings.end < settings.start;
  // Status line describes what's saved (what's actually live), not unsaved edits.
  const liveOpen = now ? isOpenNow(saved, now) : null;

  function toggleDay(day: number) {
    setSettings((s) => ({ ...s, days: s.days.includes(day) ? s.days.filter((d) => d !== day) : [...s.days, day].sort() }));
  }

  function save() {
    startTransition(async () => {
      const result = await updateWhatsAppTakeoverSettingsAction(settings);
      if (result.error) {
        notify(result.error);
        return;
      }
      setSaved(settings);
      notify("WhatsApp takeover settings saved");
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Live status ─────────────────────────────────────────── */}
      <div
        className={`flex items-start gap-3 rounded-2xl border p-4 ${
          !saved.enabled ? "border-slate-200 bg-slate-50" : liveOpen ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
        }`}
      >
        <span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${!saved.enabled ? "bg-slate-400" : liveOpen ? "animate-pulse bg-emerald-500" : "bg-amber-500"}`}
        />
        <div className="text-sm">
          <div className="font-bold text-slate-900">
            {!saved.enabled ? "Switched off" : liveOpen === null ? "Checking…" : liveOpen ? "Live right now" : "Outside takeover hours right now"}
          </div>
          <p className="mt-0.5 text-slate-600">
            {!saved.enabled
              ? "The AI answers every WhatsApp chat on its own. Sales users don't get any popups."
              : liveOpen
                ? "Sales users are getting a popup for every new WhatsApp message and can take the chat over."
                : `No popups at the moment — the AI is answering. Popups start again ${describeDays(saved.days)}, from ${clock(saved.start)} (${cityOf(saved.timezone)} time).`}
          </p>
        </div>
      </div>

      {/* ── How it works ────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: MessageCircle, title: "A customer sends a WhatsApp", text: "on a chat no sales user owns yet." },
          { icon: Hand, title: "Every sales user gets a popup", text: "The first to click Take over gets the chat." },
          { icon: Bot, title: "The AI stops replying", text: "until that person clicks Hand back to AI." },
        ].map((step, i) => (
          <div key={step.title} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-600">
              <step.icon size={18} />
            </div>
            <div className="text-sm">
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">Step {i + 1}</div>
              <div className="font-bold text-slate-900">{step.title}</div>
              <div className="text-slate-500">{step.text}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Settings ────────────────────────────────────────────── */}
      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-4 p-5">
          <div className="flex gap-3">
            <Power size={18} className="mt-0.5 shrink-0 text-slate-400" />
            <div>
              <div className="text-sm font-bold text-slate-900">Turn on WhatsApp takeover</div>
              <div className="text-xs text-slate-500">Off means the AI handles every chat, all the time.</div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            onClick={() => setSettings((s) => ({ ...s, enabled: !s.enabled }))}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${settings.enabled ? "bg-primary-500" : "bg-slate-300"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${settings.enabled ? "left-6" : "left-1"}`} />
          </button>
        </div>

        <fieldset disabled={!settings.enabled} className={`space-y-0 divide-y divide-slate-100 ${settings.enabled ? "" : "opacity-50"}`}>
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start">
            <div className="flex gap-3 lg:w-64 lg:shrink-0">
              <CalendarDays size={18} className="mt-0.5 shrink-0 text-slate-400" />
              <div>
                <div className="text-sm font-bold text-slate-900">Which days?</div>
                <div className="text-xs text-slate-500">Tap a day to switch it on or off.</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const on = settings.days.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    aria-pressed={on}
                    className={`h-10 w-14 rounded-xl text-sm font-bold transition ${
                      on ? "bg-primary-500 text-white shadow-sm hover:bg-primary-600" : "border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start">
            <div className="flex gap-3 lg:w-64 lg:shrink-0">
              <Clock size={18} className="mt-0.5 shrink-0 text-slate-400" />
              <div>
                <div className="text-sm font-bold text-slate-900">What time?</div>
                <div className="text-xs text-slate-500">Popups only show between these times.</div>
              </div>
            </div>
            <div className="flex flex-1 flex-wrap items-end gap-3">
              <label className="text-xs font-semibold text-slate-500">
                Starts at
                <input
                  type="time"
                  value={settings.start}
                  onChange={(e) => setSettings((s) => ({ ...s, start: e.target.value }))}
                  className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
                />
              </label>
              <span className="pb-2.5 text-sm text-slate-400">to</span>
              <label className="text-xs font-semibold text-slate-500">
                Ends at
                <input
                  type="time"
                  value={settings.end}
                  onChange={(e) => setSettings((s) => ({ ...s, end: e.target.value }))}
                  className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
                />
              </label>
              <label className="min-w-[12rem] flex-1 text-xs font-semibold text-slate-500">
                Time zone
                <select
                  value={settings.timezone}
                  onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                >
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </fieldset>

        {/* ── Plain-English summary + save ─────────────────────── */}
        <div className="flex flex-col gap-3 rounded-b-2xl bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            {settings.enabled ? (
              settings.days.length === 0 ? (
                <span className="font-semibold text-red-600">Pick at least one day.</span>
              ) : (
                <>
                  Sales users get WhatsApp popups <b className="text-slate-900">{describeDays(settings.days)}</b>, from{" "}
                  <b className="text-slate-900">{clock(settings.start)}</b> to <b className="text-slate-900">{clock(settings.end)}</b>
                  {overnight ? " the next morning" : ""} ({cityOf(settings.timezone)} time). The rest of the time, the AI handles new chats alone.
                </>
              )
            ) : (
              "Takeover is off — the AI answers every WhatsApp chat."
            )}
          </p>
          <button
            disabled={pending || !dirty}
            onClick={save}
            className="shrink-0 rounded-xl bg-primary-500 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-600 disabled:opacity-40"
          >
            {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Whatever the hours: customers a sales user has already quoted always go to that person&apos;s WhatsApp tab, sales users only see their own chats, and
        you see every chat on the WhatsApp page.
      </p>
    </div>
  );
}
