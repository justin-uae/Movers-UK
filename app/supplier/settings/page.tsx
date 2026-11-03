import Link from "next/link";
import { Building2, FileText } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { requireSupplier } from "@/lib/auth";
import { SubmitReviewBar } from "./SubmitReviewBar";

const CARDS = [
  {
    label: "Business Details",
    href: "/supplier/settings/business",
    icon: Building2,
    text: "Contact info, registration, insurance, license and your vehicle fleet.",
  },
  {
    label: "Documents",
    href: "/supplier/settings/documents",
    icon: FileText,
    text: "Upload verification documents such as insurance certificates and licenses.",
  },
];

export default async function SupplierSettingsPage() {
  const supplier = await requireSupplier();

  return (
    <div>
      <PageHead eyebrow="Supplier Portal" title="Settings" text="Manage your business profile and verification documents." />
      <SubmitReviewBar status={supplier.status} />
      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.map(({ label, href, icon: Icon, text }) => (
          <Link key={href} href={href}>
            <Panel className="h-full transition hover:border-primary-300">
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className="font-black">{label}</h3>
                  <p className="mt-1 text-sm text-slate-500">{text}</p>
                </div>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
