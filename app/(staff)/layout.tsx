import { cookies } from "next/headers";
import { requireProfile } from "@/lib/auth";
import { getBrandContext } from "@/lib/brand";
import { getGrantedPermissions } from "@/lib/permissions";
import { ADMIN_SURFACE_PERMISSIONS, PERMISSIONS } from "@/lib/permissionKeys";
import { createClient } from "@/lib/supabase/server";
import { StaffShell } from "@/components/layout/StaffShell";
import { computeVisibleHrefs } from "@/components/layout/nav";
import { getEventsSince, startOfTodayIso, deriveAttendanceState } from "@/lib/attendance";
import { getNavCounts } from "@/lib/navCounts";

/** Only ever reads the two display fields out of the cookie loginAsUserAction sets — never the return token itself, which stays server-only. */
async function getImpersonationBanner(): Promise<{ targetName: string; adminName: string } | null> {
  const raw = (await cookies()).get("impersonation")?.value;
  if (!raw) return null;
  try {
    const stash = JSON.parse(raw) as { targetName?: string; adminName?: string };
    if (!stash.targetName || !stash.adminName) return null;
    return { targetName: stash.targetName, adminName: stash.adminName };
  } catch {
    return null;
  }
}

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: role }, { brands, activeBrandId }, granted, todaysAttendanceEvents, impersonation, { data: tenantSettings }] = await Promise.all([
    profile.role_id
      ? supabase.from("roles").select("name").eq("id", profile.role_id).single()
      : Promise.resolve({ data: null }),
    getBrandContext(profile),
    getGrantedPermissions(profile),
    getEventsSince(supabase, profile.id, startOfTodayIso()),
    getImpersonationBanner(),
    supabase.from("tenants").select("whatsapp_takeover_enabled").eq("id", profile.tenant_id).maybeSingle(),
  ]);

  // Icon components in NAV can't cross the server->client prop boundary
  // (RSC can only serialize data, not function/component references) — so
  // we compute which hrefs are visible here and let the Client Component
  // Sidebar filter its own client-side NAV import by that list.
  const visibleHrefs = computeVisibleHrefs(granted, profile.is_master_admin);
  // Sidebar badge numbers, scoped to this user and only for items they can see (lib/navCounts.ts).
  const navCounts = await getNavCounts(supabase, profile, visibleHrefs);
  const canSeeSettings = ADMIN_SURFACE_PERMISSIONS.some((key) => granted.has(key));
  const canCreateQuote = granted.has(PERMISSIONS.QUOTES_CREATE);
  const canAddLead = granted.has(PERMISSIONS.ENQUIRIES_ADD);
  const initialAttendance = deriveAttendanceState(todaysAttendanceEvents);
  // WhatsApp "take over" popups go to sales users only (Master Admin already sees every chat).
  const whatsappAlertsTenantId =
    !profile.is_master_admin && tenantSettings?.whatsapp_takeover_enabled && granted.has(PERMISSIONS.ENQUIRIES_CLAIM_OPEN_LEADS)
      ? profile.tenant_id
      : null;
  // Sales Users must be clocked in to use the system; being on a break still counts as clocked in.
  const requiresClockIn =
    !profile.is_master_admin &&
    role?.name === "Sales User" &&
    (initialAttendance.status === "not_clocked_in" || initialAttendance.status === "clocked_out");

  return (
    <StaffShell
      userName={profile.full_name}
      roleName={profile.is_master_admin ? "Master Admin" : (role?.name ?? "Team Member")}
      brands={brands}
      activeBrandId={activeBrandId}
      visibleHrefs={visibleHrefs}
      canSeeSettings={canSeeSettings}
      canCreateQuote={canCreateQuote}
      canAddLead={canAddLead}
      initialAttendance={initialAttendance}
      locked={requiresClockIn}
      impersonation={impersonation}
      navCounts={navCounts}
      whatsappAlertsTenantId={whatsappAlertsTenantId}
    >
      {children}
    </StaffShell>
  );
}
