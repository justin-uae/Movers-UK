import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { NAV, landingHref, type NavItem } from "@/components/layout/nav";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissionKeys";

// "/q" is the token-based customer quote page (Part 55), "/api/leads/website"
// is the public website lead webhook (Part 22), and "/api/cron/*" is every
// Render Cron Job route (e.g. email-sync) — all three authenticate on their
// own terms (an unguessable token / a per-brand shared secret / the
// CRON_SECRET bearer token) rather than a Supabase session, so none of them
// have one to gate on here.
const PUBLIC_PATHS = [
  "/login",
  "/reset-password",
  "/accept-invite",
  "/auth/confirm",
  "/q",
  "/api/leads/website",
  "/api/stripe/webhook",
  "/api/cron",
  "/api/webhooks/360dialog",
];

/** Most specific (longest-href) NAV item whose route this path falls under, if any — mirrors the highlighting logic in Sidebar.tsx. Paths matching no NAV item (settings/*, api/*, ...) are left to their own page/layout-level gates. */
function matchingNavItem(pathname: string): NavItem | null {
  const matches = NAV.filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0] ?? null;
}

/** Same shape as lib/permissions.ts's fetchGrantedPermissions(), but using the request-scoped RLS-respecting client (role_permissions/user_permission_overrides are both self-readable, see 0001_foundation.sql) instead of the service-role client + unstable_cache — middleware needs this to be edge-friendly and per-request. */
async function grantedPermissionsFor(
  supabase: ReturnType<typeof createServerClient>,
  profile: { id: string; role_id: string | null; is_master_admin: boolean },
): Promise<Set<PermissionKey>> {
  if (profile.is_master_admin) return new Set(Object.values(PERMISSIONS));

  const [{ data: roleGrants }, { data: overrides }] = await Promise.all([
    profile.role_id
      ? supabase.from("role_permissions").select("permissions(key)").eq("role_id", profile.role_id)
      : Promise.resolve({ data: [] as { permissions: { key: string } | null }[] }),
    supabase.from("user_permission_overrides").select("effect, permissions(key)").eq("user_id", profile.id),
  ]);

  const granted = new Set<string>();
  for (const row of roleGrants ?? []) {
    const key = (row.permissions as unknown as { key: string } | null)?.key;
    if (key) granted.add(key);
  }
  for (const row of overrides ?? []) {
    const key = (row.permissions as unknown as { key: string } | null)?.key;
    if (!key) continue;
    if (row.effect === "grant") granted.add(key);
    else granted.delete(key);
  }
  return granted as Set<PermissionKey>;
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  // Every other branch below only exists to decide (a) whether to bounce an
  // unauthenticated visitor away from a protected path, or (b) whether to
  // bounce an already-signed-in visitor away from /login — neither applies
  // to a public path that isn't /login (the customer quote page, the
  // website lead webhook, reset-password, etc.), so skip the session round
  // trip entirely there instead of paying for it on every request.
  if (isPublic && path !== "/login") {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() can throw (not just resolve with an `error` field) when the
  // refresh token in the cookie is invalid — already rotated, revoked, or
  // just stale. Treat that the same as "no user" instead of letting it
  // crash the request; the signOut() clears the dead cookie so the
  // redirect below doesn't just bounce the visitor right back into the
  // same broken session.
  let user = null;
  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    user = authUser;
  } catch {
    await supabase.auth.signOut().catch(() => {});
  }

  if (!user && !isPublic) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (!user) return response;

  // Staff (profiles) and suppliers are separate identity spaces sharing this
  // one login page (0003_operations.sql) — figure out which one this
  // session belongs to once, used for both the /login bounce-away below and
  // the route-permission gate.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role_id, is_master_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (path === "/login") {
    if (profile) return NextResponse.redirect(new URL("/dashboard", request.url));
    const { data: supplier } = await supabase.from("suppliers").select("id").eq("id", user.id).maybeSingle();
    if (supplier) return NextResponse.redirect(new URL("/supplier/dashboard", request.url));
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const navItem = matchingNavItem(path);

  if (profile) {
    // This is the actual authorization gate for every staff page that maps
    // to a NAV entry — hiding a sidebar link (or an individual page's own
    // ad-hoc hasPermission() check, easy to forget on a new route) was never
    // enough to stop a direct URL visit. Paths matching no NAV item
    // (settings/*, api/*, ...) are left to their own gates.
    if (navItem?.masterAdminOnly && !profile.is_master_admin) {
      const { data: role } = profile.role_id
        ? await supabase.from("roles").select("name").eq("id", profile.role_id).single()
        : { data: null };
      const granted = await grantedPermissionsFor(supabase, profile);
      const landing = landingHref(role?.name ?? null, profile.is_master_admin, granted);
      if (landing !== path) {
        return NextResponse.redirect(new URL(landing, request.url));
      }
    }
    if (navItem?.anyOf) {
      const granted = await grantedPermissionsFor(supabase, profile);
      if (!navItem.anyOf.some((key) => granted.has(key))) {
        const { data: role } = profile.role_id
          ? await supabase.from("roles").select("name").eq("id", profile.role_id).single()
          : { data: null };
        const landing = landingHref(role?.name ?? null, profile.is_master_admin, granted);
        if (landing !== path) {
          return NextResponse.redirect(new URL(landing, request.url));
        }
      }
    }
    return response;
  }

  // No staff profile — supplier identity. Suppliers have no business on any
  // staff (NAV-mapped) page regardless of permissions.
  if (navItem) {
    return NextResponse.redirect(new URL("/supplier/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every route except static assets and Next.js internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
