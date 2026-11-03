import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BusinessDetailsForm } from "./BusinessDetailsForm";

export default async function SupplierBusinessDetailsPage() {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: vehicles } = await supabase.from("supplier_vehicles").select("*").eq("supplier_id", supplier.id).order("created_at");

  return (
    <div>
      <div className="mx-auto max-w-3xl">
        <PageHead
          eyebrow="Supplier Portal"
          title="Business Details"
          text="Your contact info, registration and vehicle fleet."
          action={
            <Link href="/supplier/settings" className="flex items-center gap-2 text-sm font-bold text-slate-500">
              <ArrowLeft size={16} />
              Back to Settings
            </Link>
          }
        />
      </div>
      <div className="mx-auto max-w-3xl">
        <BusinessDetailsForm supplier={supplier} vehicles={vehicles ?? []} />
      </div>
    </div>
  );
}
