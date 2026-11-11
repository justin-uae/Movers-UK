import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { landingHrefForProfile } from "@/lib/landing";
import type { MoveLeg } from "@/components/pages/MoveDetailCard";
import { moveRouteDistances } from "@/lib/moveDistance";
import { NewQuoteForm } from "./NewQuoteForm";
import { BRAND } from "@/lib/brandConfig";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ enquiryId?: string }>;
}) {
  const profile = await requireProfile();
  if (!(await hasPermission(profile, PERMISSIONS.QUOTES_CREATE))) {
    redirect(await landingHrefForProfile(profile));
  }
  const { enquiryId } = await searchParams;
  const supabase = await createClient();

  if (!enquiryId) {
    const { data: enquiries } = await supabase
      .from("enquiries")
      .select(
        "id, created_at, customers(company_name, contact_name), enquiry_legs(pickup_address, destination_address, pickup_date)",
      )
      .eq("assigned_user_id", profile.id)
      .order("created_at", { ascending: false });

    return (
      <div>
        <PageHead eyebrow="Sales Workspace" title="Select an Enquiry" text="Choose which enquiry to build a quote for." />
        <Panel>
          <div className="space-y-2">
            {(enquiries ?? []).map((e) => {
              const leg = (e.enquiry_legs as unknown as { pickup_address: string; destination_address: string }[] | null)?.[0];
              const customer = e.customers as unknown as { company_name: string | null; contact_name: string } | null;
              return (
                <Link
                  key={e.id}
                  href={`/quotes/new?enquiryId=${e.id}`}
                  className="flex items-center justify-between rounded-xl border p-4 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-bold">{customer?.company_name || customer?.contact_name || "Enquiry"}</div>
                    <div className="text-xs text-slate-500">
                      {leg ? `${leg.pickup_address} → ${leg.destination_address}` : "No move details yet"}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-primary-600">Quote this →</span>
                </Link>
              );
            })}
            {(enquiries ?? []).length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">
                No enquiries assigned to you yet.{" "}
                <Link href="/leads/new" className="font-bold text-primary-600">
                  Add one first.
                </Link>
              </p>
            )}
          </div>
        </Panel>
      </div>
    );
  }

  const { data: enquiry } = await supabase
    .from("enquiries")
    .select(
      "id, brand_id, customer_id, customers(company_name, contact_name, email, phone, whatsapp, country), enquiry_legs(id, sequence, pickup_address, destination_address, pickup_date, pickup_time, van_size, special_requirements, move_type, property_type, rooms, estimated_boxes, pickup_floor, destination_floor, lift_available, packing_needed, dismantling_needed, assembly_needed, storage_needed, fragile_items), brands(default_currency)",
    )
    .eq("id", enquiryId)
    .single();

  if (!enquiry) redirect("/quotes/new");

  const legs = [...((enquiry.enquiry_legs as unknown as MoveLeg[] | null) ?? [])].sort((a, b) => a.sequence - b.sequence);
  const [canSend, legDistances, { data: tenant }] = await Promise.all([
    hasPermission(profile, PERMISSIONS.QUOTES_SEND),
    moveRouteDistances(legs),
    supabase.from("tenants").select("quote_validity_days").eq("id", profile.tenant_id).single(),
  ]);
  const customer = enquiry.customers as unknown as {
    company_name: string | null;
    contact_name: string;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    country: string | null;
  } | null;
  const brand = enquiry.brands as unknown as { default_currency: string } | null;

  return (
    <div>
      <PageHead eyebrow="Sales Workspace" title="Build Quote" text="Price the move and send a professional quotation." />
      <NewQuoteForm
        enquiryId={enquiry.id}
        customer={{
          name: customer?.company_name || customer?.contact_name || "Customer",
          contactName: customer?.contact_name ?? "—",
          email: customer?.email ?? null,
          phone: customer?.phone ?? null,
          whatsapp: customer?.whatsapp ?? null,
          country: customer?.country ?? null,
        }}
        legs={legs}
        legDistances={legDistances}
        defaultCurrency={brand?.default_currency ?? BRAND.defaultCurrency}
        canSend={canSend}
        defaultExpiryDays={tenant?.quote_validity_days ?? 30}
      />
    </div>
  );
}
