import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEmailLeadIntakeSweep } from "@/lib/emailLeadIntake";

// Render Cron Job hits this hourly (render.yaml). See lib/emailLeadIntake.ts
// for what actually happens — no-ops cleanly (checked:0) if the shared
// inbox's LEADS_INBOX_IMAP_* env vars aren't set yet.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await runEmailLeadIntakeSweep(admin);
  return NextResponse.json(result);
}
