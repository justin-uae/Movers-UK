import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runQuoteReminderSweep } from "@/lib/quoteReminders";

// Render Cron Job hits this every 15 minutes (render.yaml) — same shape as
// the other sweeps. See lib/quoteReminders.ts for what actually happens.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await runQuoteReminderSweep(admin);
  return NextResponse.json(result);
}
