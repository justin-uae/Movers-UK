import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBusinessIntelligenceSummary } from "@/lib/businessIntelligenceSummary";
import { BusinessIntelligencePage } from "@/components/pages/BusinessIntelligencePage";

export default async function Page() {
  await requireProfile();
  const supabase = await createClient();
  const summary = await getBusinessIntelligenceSummary(supabase);

  return <BusinessIntelligencePage summary={summary} />;
}
