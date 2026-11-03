import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DocumentsForm } from "./DocumentsForm";

export default async function SupplierDocumentsPage() {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { data: documents } = await supabase.from("supplier_documents").select("*").eq("supplier_id", supplier.id).order("uploaded_at");

  return (
    <div>
      <div className="mx-auto max-w-3xl">
        <PageHead
          eyebrow="Supplier Portal"
          title="Documents"
          text="Upload documents for review, such as insurance certificates and licenses."
          action={
            <Link href="/supplier/settings" className="flex items-center gap-2 text-sm font-bold text-slate-500">
              <ArrowLeft size={16} />
              Back to Settings
            </Link>
          }
        />
      </div>
      <div className="mx-auto max-w-3xl">
        <DocumentsForm supplier={supplier} documents={documents ?? []} />
      </div>
    </div>
  );
}
