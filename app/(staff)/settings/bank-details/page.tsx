import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { BankDetailsDiagram } from "@/components/ui/guide-diagrams/BankDetailsDiagram";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { BankProfilesManager } from "./BankProfilesManager";
import { TermsForm } from "./TermsForm";
import { QuoteValidityForm } from "./QuoteValidityForm";
import type { BankAccount } from "@/lib/supabase/database.types";

export default async function BankDetailsPage() {
  const profile = await requireProfile();
  const canManage = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_ACCOUNTING_SETTINGS);
  const supabase = await createClient();

  const [{ data: profiles }, { data: tenant }] = await Promise.all([
    supabase.from("bank_accounts").select("*").eq("tenant_id", profile.tenant_id).order("sort_order"),
    supabase.from("tenants").select("terms_and_conditions, quote_validity_days").eq("id", profile.tenant_id).single(),
  ]);

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Bank Details & Terms"
        text="Payment profiles, how long quotes stay valid, and the Terms & Conditions boilerplate shown to customers on quotes and invoices."
        action={
          <PageGuide
            title="Bank Details & Terms"
            subtitle="Where customer payments land, and the default terms text they see."
            screenshot={<BankDetailsDiagram />}
            sections={[
              {
                heading: "Payment profiles",
                body: [
                  "One profile per currency you accept bank transfers in. The correct profile is picked automatically to match a quote's own currency on the public quote page, the invoice and the quote PDF — customers only ever see the one that matches what they're paying in.",
                ],
              },
              {
                heading: "Quote validity",
                body: [
                  "How many days a new quote stays valid before it expires — 30 by default. It pre-fills the New Quote form (where it can still be changed for that one quote) and sets the expiry of every quote AI sends automatically. Changing it never alters quotes already sent; an individual quote's expiry can be changed from its own page.",
                ],
              },
              {
                heading: "Terms & Conditions",
                body: [
                  "The fallback text shown whenever a specific quote doesn't have its own override — set this once here and every quote uses it unless overridden at quote level.",
                ],
              },
            ]}
          />
        }
      />

      <Panel>
        <SectionTitle
          title="Payment profiles"
          sub="Shown on the public quote page, invoice and quote PDF — matched to the quote's own currency"
        />
        <BankProfilesManager profiles={(profiles ?? []) as BankAccount[]} canManage={canManage} />
      </Panel>

      <div className="mt-6">
        <Panel>
          <SectionTitle title="Quote validity" sub="Default number of days a new quote stays valid — can still be changed per quote" />
          <QuoteValidityForm initialDays={tenant?.quote_validity_days ?? 30} canManage={canManage} />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel>
          <SectionTitle title="Terms & Conditions" sub="Fallback shown whenever a quote has no per-quote override" />
          <TermsForm initialValue={tenant?.terms_and_conditions ?? ""} canManage={canManage} />
        </Panel>
      </div>
    </div>
  );
}
