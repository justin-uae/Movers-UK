"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import type { Supplier, SupplierDocument } from "@/lib/supabase/database.types";

export function DocumentsForm({ supplier, documents }: { supplier: Supplier; documents: SupplierDocument[] }) {
  const notify = useToast();
  const router = useRouter();
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();

  async function uploadDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!uploadLabel.trim()) {
      notify("Give the document a label first (e.g. Insurance Certificate)");
      e.target.value = "";
      return;
    }

    setUploading(true);
    const label = uploadLabel.trim();
    const supabase = createClient();
    const path = `${supplier.id}/${crypto.randomUUID()}-${file.name}`;

    const { error: uploadError } = await supabase.storage.from("supplier-documents").upload(path, file);
    if (uploadError) {
      notify(uploadError.message);
      setUploading(false);
      e.target.value = "";
      return;
    }

    const { error: insertError } = await supabase.from("supplier_documents").insert({
      supplier_id: supplier.id,
      label,
      storage_path: path,
      file_name: file.name,
    });
    e.target.value = "";

    if (insertError) {
      notify(insertError.message);
      setUploading(false);
      return;
    }

    notify("Document uploaded");
    setUploadLabel("");
    setUploading(false);
    // Wrapped in startTransition, same reasoning as the business details form —
    // an urgent refresh here unmounts/remounts this component mid-typing.
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <Panel className="p-4">
      <h2 className="text-sm font-black">
        Documents <span className="font-normal text-slate-400">· {documents.length} uploaded</span>
      </h2>
      <div className="mt-3 space-y-1.5">
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm">
            <FileText size={14} className="shrink-0 text-slate-400" />
            <div className="min-w-0">
              <b className="truncate">{doc.label}</b>
              <div className="truncate text-xs text-slate-500">{doc.file_name}</div>
            </div>
          </div>
        ))}
        {documents.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No documents uploaded yet.</p>}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={uploadLabel}
          onChange={(e) => setUploadLabel(e.target.value)}
          placeholder="Document label (e.g. Insurance Certificate)"
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <label className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm font-bold text-slate-500 hover:border-primary-300 hover:text-primary-700 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
          <Upload size={14} />
          {uploading ? "Uploading…" : "Choose file"}
          <input type="file" disabled={uploading} onChange={uploadDocument} className="hidden" />
        </label>
      </div>
    </Panel>
  );
}
