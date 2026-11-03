"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { deriveAttendanceState, legalNextEvents, getEventsSince, startOfTodayIso } from "@/lib/attendance";
import type { AttendanceEventType } from "@/lib/supabase/database.types";

const ACTION_LABEL: Record<AttendanceEventType, string> = {
  clock_in: "clocked in",
  break_start: "started a break",
  break_end: "ended their break",
  clock_out: "clocked out",
};

// Status each event moves the user into — used to treat a repeat click
// (second tab, stale page, double click) as already done instead of an error.
const RESULTING_STATUS: Record<AttendanceEventType, string> = {
  clock_in: "working",
  break_start: "on_break",
  break_end: "working",
  clock_out: "clocked_out",
};

// Returns { error } rather than throwing: a thrown server-action error is
// replaced by Next's generic "Server Components render" message in
// production, so the user never saw why the click failed.
async function recordEvent(event: AttendanceEventType): Promise<{ error?: string }> {
  const actor = await requireProfile();
  const supabase = await createClient();

  const todaysEvents = await getEventsSince(supabase, actor.id, startOfTodayIso());
  const state = deriveAttendanceState(todaysEvents);
  if (!legalNextEvents(state.status).includes(event)) {
    if (state.status === RESULTING_STATUS[event]) return {};
    return { error: `You can't do that right now (current status: ${state.status.replaceAll("_", " ")}).` };
  }

  const { error } = await supabase.from("attendance_events").insert({
    tenant_id: actor.tenant_id,
    user_id: actor.id,
    event,
  });
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "attendance_event",
    entityType: "attendance",
    entityId: actor.id,
    newValue: { event, label: ACTION_LABEL[event] },
  });

  revalidatePath("/attendance");
  return {};
}

export async function clockInAction() {
  return recordEvent("clock_in");
}

export async function startBreakAction() {
  return recordEvent("break_start");
}

export async function endBreakAction() {
  return recordEvent("break_end");
}

export async function clockOutAction() {
  return recordEvent("clock_out");
}
