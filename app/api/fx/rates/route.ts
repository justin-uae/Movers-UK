import { NextResponse } from "next/server";
import { getGbpRates } from "@/lib/fxRates";

// Lets the (client-side) new-quote form show a live "which payment method
// will this quote get" preview without embedding an exchange-rate API key or
// call in the browser — it just reads the same cached rates the server uses
// to make the real decision at submit time (see quotes/new/actions.ts).
export async function GET() {
  try {
    const rates = await getGbpRates();
    return NextResponse.json({ base: "GBP", rates });
  } catch (err) {
    return NextResponse.json(
      { base: "GBP", rates: null, error: err instanceof Error ? err.message : "Could not load exchange rates." },
      { status: 502 },
    );
  }
}
