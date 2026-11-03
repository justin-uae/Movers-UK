import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { PageHead } from "@/components/ui/PageHead";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { BackLink } from "@/components/ui/BackLink";
import { Panel } from "@/components/ui/Panel";
import { ComplexBookingPage } from "@/components/pages/ComplexBookingPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const allowed = await hasPermission(profile, PERMISSIONS.ENQUIRIES_ADD);
  if (!allowed) redirect(`/leads/${id}`);

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, assigned_user_id, customer_id, customers(company_name, contact_name)")
    .eq("id", id)
    .maybeSingle();
  if (!lead) notFound();
  if (lead.assigned_user_id !== profile.id || !lead.customer_id) redirect(`/leads/${id}`);

  // Allowed right up until a quote actually exists — a lead commonly picks
  // up a quick single-leg enquiry via "Create Quote" before anyone realises
  // it's a multi-leg booking, and that quote-less enquiry gets reused (legs
  // replaced) rather than blocking conversion outright. See
  // getLeadEnquiryState in ./actions.ts.
  const { data: existingEnquiry } = await supabase
    .from("enquiries")
    .select("id")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingEnquiry) {
    const { data: existingQuote } = await supabase.from("quotes").select("id").eq("enquiry_id", existingEnquiry.id).limit(1).maybeSingle();
    if (existingQuote) redirect(`/leads/${id}`);
  }

  const customer = lead.customers as unknown as { company_name: string | null; contact_name: string } | null;
  const customerLabel = customer?.company_name || customer?.contact_name || "this lead's customer";

  return (
    <div>
      <Breadcrumb
        items={[{ label: "Customer Leads", href: "/leads" }, { label: customerLabel, href: `/leads/${id}` }, { label: "Convert to Complex Booking" }]}
      />
      <PageHead
        eyebrow="Omnichannel Lead Centre"
        title="Convert to Complex Booking"
        text="AI reads everything already captured on this lead and builds journey legs for you to review — nothing is saved until you confirm below."
        action={<BackLink fallbackHref={`/leads/${id}`} label="Back to Lead" />}
      />
      <Panel>
        <ComplexBookingPage customers={[]} leadConversion={{ leadId: id, customerLabel }} />
      </Panel>
    </div>
  );
}
