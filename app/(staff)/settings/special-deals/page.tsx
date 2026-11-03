import { notFound } from "next/navigation";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SpecialDealSettingsForm } from "./SpecialDealSettingsForm";

export default async function SpecialDealsSettingsPage() {
  const profile = await requireProfile();
  if (!profile.is_master_admin) notFound();

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("special_deal_auto_enabled, special_deal_auto_percent")
    .eq("id", profile.tenant_id)
    .single();

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Special Deals"
        text="Win back customers who say a quote is too expensive, with an automatic discount."
        action={
          <PageGuide
            title="Special Deals"
            subtitle="Discounts on quotes the customer hasn't accepted yet."
            sections={[
              {
                heading: "Today's Special Deal button",
                bullets: true,
                body: [
                  "On every quote that isn't accepted, paid or cancelled, sales users and Master Admin see a green Today's Special Deal button.",
                  "They pick a percentage. The customer's quote page and PDF show the old price struck through and the new price next to it.",
                  "A rejected or expired quote is re-opened by it and emailed to the customer again.",
                ],
              },
              {
                heading: "Automatic discount for \"Too expensive\"",
                bullets: true,
                body: [
                  "When this is on and a customer rejects a quote with the reason \"Too expensive\", the same quote is re-opened 30 minutes later at the percentage set here, and emailed to them.",
                  "The wait is on purpose, so the offer reads like the team reconsidered rather than an instant automatic reply. If staff re-open, re-quote or discount the quote themselves within those 30 minutes, the automatic one isn't sent.",
                  "It stays the same quote with the same owner. The Timeline shows the rejection and the automatic discount.",
                  "It happens once per quote, and never if the new price would be below the supplier cost.",
                ],
              },
            ]}
          />
        }
      />

      <div className="max-w-4xl">
        <SpecialDealSettingsForm
          initial={{
            autoEnabled: Boolean(tenant?.special_deal_auto_enabled),
            autoPercent: Number(tenant?.special_deal_auto_percent ?? 10),
          }}
        />
      </div>
    </div>
  );
}
