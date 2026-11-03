import { NextResponse } from "next/server";
import { ACTIVE_BRAND_COOKIE } from "@/lib/brand";

export async function POST(request: Request) {
  const { brandId } = await request.json();
  if (typeof brandId !== "string") {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACTIVE_BRAND_COOKIE, brandId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
