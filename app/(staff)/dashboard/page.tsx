import dynamic from "next/dynamic";
import { requireProfile } from "@/lib/auth";
import { getLeadsByCountry } from "@/lib/liveOperations";
import { getControlCentreSummary } from "@/lib/controlCentreSummary";
import { SkeletonDashboardBody } from "@/components/ui/Skeleton";
import { BRAND } from "@/lib/brandConfig";
import { timeOfDayGreeting } from "@/lib/formatDate";

// /dashboard is the first page every staff member lands on after login —
// recharts is otherwise already route-split by Next.js, but a dynamic()
// import here still lets the page shell stream in while the chart-heavy
// chunk downloads, instead of blocking on it.
const ControlCentre = dynamic(() => import("@/components/pages/ControlCentre").then((m) => m.ControlCentre), {
  loading: () => <SkeletonDashboardBody />,
});

export default async function DashboardPage() {
  const profile = await requireProfile();
  const fullName = profile.full_name.trim();
  // Shared/system accounts are named after the business ("Movers Nationwide
  // Admin") — their first word is half the company name, not a person's
  // name, so greet them by the full name instead.
  const isBusinessAccount = fullName.toLowerCase().startsWith(BRAND.companyName.toLowerCase());
  const displayName = isBusinessAccount ? fullName : (fullName.split(/\s+/)[0] || fullName);
  // Worked out here (server, fixed UK timezone) rather than in the client
  // component so SSR and hydration always agree on the greeting.
  const greeting = timeOfDayGreeting();
  const [leadClusters, summary] = await Promise.all([
    getLeadsByCountry(profile.tenant_id),
    getControlCentreSummary(profile.tenant_id),
  ]);
  return <ControlCentre greeting={greeting} displayName={displayName} leadClusters={leadClusters} summary={summary} />;
}
