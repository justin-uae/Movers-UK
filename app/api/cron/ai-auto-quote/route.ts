import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAiAutoQuoteSweep } from "@/lib/aiAutoQuote";

// Render Cron Job hits this hourly (render.yaml) — same shape as
// task-automation's sweep. See lib/aiAutoQuote.ts for what actually happens.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await runAiAutoQuoteSweep(admin);
  return NextResponse.json(result);
}
