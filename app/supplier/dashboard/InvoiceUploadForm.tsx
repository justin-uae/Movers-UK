"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { uploadSupplierInvoiceAction } from "./actions";
import type { JobSupplierInvoice } from "@/lib/supabase/database.types";
import { BRAND } from "@/lib/brandConfig";

export function InvoiceUploadForm({
  allocationId,
  supplierId,
  invoice,
  prefillAmount = null,
  prefillCurrency = null,
}: {
  allocationId: string;
  supplierId: string;
  invoice: JobSupplierInvoice | null;
  /** The agreed cost for this allocation — this is the amount that gets invoiced, not editable here. */
  prefillAmount?: number | null;
  prefillCurrency?: string | null;
}) {
  const notify = useToast();
  const router = useRouter();
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();

  const amount = invoice?.amount ?? prefillAmount;
  const currency = invoice?.currency ?? prefillCurrency ?? BRAND.defaultCurrency;

  if (amount == null) {
    return (
      <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-700">
        No supplier cost has been set for this job yet — contact the office before invoicing.
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice && !file) {
      notify("Attach your invoice file.");
      return;
    }

    startTransition(async () => {
      let storagePath = invoice?.storage_path ?? "";
      let fileName = invoice?.file_name ?? "";

      if (file) {
        const supabase = createClient();
        const path = `${supplierId}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("job-invoices").upload(path, file);
        if (uploadError) {
          notify(uploadError.message);
          return;
        }
        storagePath = path;
        fileName = file.name;
      }

      try {
        await uploadSupplierInvoiceAction(allocationId, { notes, storagePath, fileName });
        notify(invoice ? "Invoice updated" : "Invoice uploaded");
        setFile(null);
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not save the invoice.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t pt-3">
      <div className="text-xs font-bold text-slate-500">{invoice ? "Edit your invoice" : "Upload your invoice"}</div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm font-bold">
          {new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount)}
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="min-w-[8rem] flex-1 rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <p className="text-xs text-slate-400">This is the agreed supplier cost for this job and can&apos;t be changed here.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
        {invoice && <span className="text-xs text-slate-400">Current file: {invoice.file_name}</span>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : invoice ? "Save changes" : "Upload invoice"}
      </button>
    </form>
  );
}
