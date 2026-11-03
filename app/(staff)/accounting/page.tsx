import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { SkeletonDashboardBody } from "@/components/ui/Skeleton";
import { createClient } from "@/lib/supabase/server";
import { getAccountingSummary } from "@/lib/accountingSummary";

const AccountingPage = dynamic(() => import("@/components/pages/AccountingPage").then((m) => m.AccountingPage), {
  loading: () => <SkeletonDashboardBody />,
});

export default async function Page() {
  const profile = await requireProfile();
  const allowed = await hasPermission(profile, PERMISSIONS.FINANCE_VIEW_INVOICES);
  if (!allowed) redirect("/dashboard");

  const supabase = await createClient();
  const summary = await getAccountingSummary(supabase);

  return <AccountingPage summary={summary} />;
}
