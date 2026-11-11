import { redirect } from "next/navigation";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { landingHrefForProfile } from "@/lib/landing";
import { NewEnquiryForm } from "./NewEnquiryForm";

export default async function NewEnquiryPage() {
  const profile = await requireProfile();
  if (!(await hasPermission(profile, PERMISSIONS.ENQUIRIES_ADD))) {
    redirect(await landingHrefForProfile(profile));
  }
  const supabase = await createClient();

  const { data: customers } = await supabase.from("customers").select("id, company_name, contact_name, email, phone").order("contact_name");

  return (
    <div>
      <PageHead
        eyebrow="Sales Workspace"
        title="Add Enquiry"
        text="Capture a new moving enquiry — addresses, move date, property size and the services needed."
      />
      <Panel>
        <NewEnquiryForm customers={customers ?? []} />
      </Panel>
    </div>
  );
}
