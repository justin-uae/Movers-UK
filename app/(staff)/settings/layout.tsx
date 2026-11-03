import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, ShieldCheck, Building2, History, Landmark, Settings as SettingsIcon } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getGrantedPermissions } from "@/lib/permissions";
import { ADMIN_SURFACE_PERMISSIONS } from "@/lib/permissionKeys";
import { landingHrefForProfile } from "@/lib/landing";

const SETTINGS_NAV = [
  { label: "Overview", href: "/settings", icon: SettingsIcon },
  { label: "Users", href: "/settings/users", icon: Users },
  { label: "Roles & Permissions", href: "/settings/roles", icon: ShieldCheck },
  { label: "Companies & Brands", href: "/settings/brands", icon: Building2 },
  { label: "Bank Details & Terms", href: "/settings/bank-details", icon: Landmark },
  { label: "Audit Log", href: "/settings/audit-log", icon: History },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // The nav link is hidden for non-admins in Sidebar.tsx, but hiding a link
  // doesn't stop a direct URL visit — this is the actual authorization gate
  // for the whole /settings surface (profiles/roles/brands are otherwise
  // tenant-wide readable via RLS, by design, for assignment pickers).
  const profile = await requireProfile();
  const granted = await getGrantedPermissions(profile);
  if (!ADMIN_SURFACE_PERMISSIONS.some((key) => granted.has(key))) {
    redirect(await landingHrefForProfile(profile));
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        {SETTINGS_NAV.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:border-primary-300 hover:text-primary-700"
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
