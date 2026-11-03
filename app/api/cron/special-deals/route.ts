import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDueAutoDiscounts } from "@/lib/quoteRepricing";

// Sends automatic "Too expensive" discounts whose 30-minute delay is up
// (lib/quoteRepricing.ts). The 5-minute email-sync cron already runs the same
// sweep, so this route is optional — point a Render Cron Job at it only if
// email-sync is ever switched off.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDueAutoDiscounts(createAdminClient());
  return NextResponse.json(result);
}
