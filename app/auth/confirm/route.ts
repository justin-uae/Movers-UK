import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase email links (invite, password recovery) point here with
 * ?token_hash=...&type=...&next=... — verifying server-side and setting the
 * session cookie is the SSR-safe way to do this. The client-side
 * "detectSessionInUrl" hash-fragment flow doesn't reliably apply once the
 * browser client is configured for PKCE, which is why the invite/reset
 * pages alone were seeing "Auth session missing!".
 *
 * Requires the Supabase project's "Invite user" and "Reset password" email
 * templates to link here (see README) instead of the default
 * {{ .ConfirmationURL }}.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(next);
    }
  }

  redirect("/login?reason=invalid_link");
}
