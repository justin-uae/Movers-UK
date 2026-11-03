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

  const [{ data: customers }, { data: vehicleTypes }] = await Promise.all([
    supabase.from("customers").select("id, company_name, contact_name, email, phone").order("contact_name"),
    supabase.from("vehicle_types").select("id, name, seat_capacity").eq("is_active", true).order("seat_capacity"),
  ]);

  return (
    <div>
      <PageHead
        eyebrow="Sales Workspace"
        title="Add Enquiry"
        text="Capture a new coach, minibus or transfer enquiry — pickup, destination, passengers and requirements."
      />
      <Panel>
        <NewEnquiryForm customers={customers ?? []} vehicleTypes={vehicleTypes ?? []} />
      </Panel>
    </div>
  );
}
