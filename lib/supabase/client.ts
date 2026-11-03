import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Browser-side Supabase client for use inside Client Components.
 *
 * autoRefreshToken is off here on purpose: the middleware (proxy.ts) already
 * refreshes the session on every navigation via getUser(), server-side. With
 * this timer also enabled, mobile browsers throttling background tabs would
 * fire an overdue client-side refresh right as a tab resumes, racing the
 * middleware's own refresh for the same refresh token — Supabase's reuse
 * detection then revokes the whole session, logging the user out (seen as
 * repeated "Refresh Token Not Found" errors in Auth Logs). Session refresh
 * still happens correctly on navigation; a tab left open with zero
 * navigation for over an hour may need one reload before a direct
 * client-side call (e.g. Team Chat) works again.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false } },
  );
}
