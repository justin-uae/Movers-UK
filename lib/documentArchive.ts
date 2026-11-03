import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DocumentType } from "./supabase/database.types";

/**
 * Archives a generated PDF (quote or invoice) into the shared Documents
 * module the same way any manual upload is recorded, so every quote sent
 * and every invoice raised leaves a dated, downloadable copy in one place.
 * Never throws — a storage/DB failure here must not block the email it was
 * generated for.
 */
export async function persistGeneratedPdf(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string;
    uploadedBy: string | null;
    docType: DocumentType;
    label: string;
    fileName: string;
    quoteId: string;
    pdf: Buffer;
  },
): Promise<void> {
  const storagePath = `${params.tenantId}/${crypto.randomUUID()}-${params.fileName}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, params.pdf, {
    contentType: "application/pdf",
  });
  if (uploadError) {
    console.error(`persistGeneratedPdf: storage upload failed for quote ${params.quoteId}:`, uploadError.message);
    return;
  }

  const { error } = await supabase.from("documents").insert({
    tenant_id: params.tenantId,
    doc_type: params.docType,
    label: params.label,
    storage_path: storagePath,
    file_name: params.fileName,
    file_size: params.pdf.byteLength,
    quote_id: params.quoteId,
    uploaded_by: params.uploadedBy,
  });
  if (error) {
    console.error(`persistGeneratedPdf: insert failed for quote ${params.quoteId}:`, error.message);
  }
}
