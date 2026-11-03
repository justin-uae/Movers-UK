"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import type { DocumentType } from "@/lib/supabase/database.types";

export async function createDocumentAction(input: {
  docType: DocumentType;
  label: string;
  notes: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  customerId: string | null;
  supplierId: string | null;
  quoteId: string | null;
}) {
  const actor = await requireProfile();
  const supabase = await createClient();

  if (!input.label.trim()) throw new Error("Give the document a label.");

  const { data, error } = await supabase
    .from("documents")
    .insert({
      tenant_id: actor.tenant_id,
      doc_type: input.docType,
      label: input.label.trim(),
      notes: input.notes.trim() || null,
      storage_path: input.storagePath,
      file_name: input.fileName,
      file_size: input.fileSize,
      customer_id: input.customerId,
      supplier_id: input.supplierId,
      quote_id: input.quoteId,
      uploaded_by: actor.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "document_uploaded",
    entityType: "document",
    entityId: data.id,
    newValue: { label: input.label, docType: input.docType },
  });

  revalidatePath("/documents");
}

export async function deleteDocumentAction(id: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const { data: doc } = await supabase.from("documents").select("storage_path, uploaded_by, label").eq("id", id).single();
  if (!doc) throw new Error("Document not found.");
  if (doc.uploaded_by !== actor.id && !actor.is_master_admin) {
    throw new Error("You can only delete documents you uploaded.");
  }

  const { error: storageError } = await supabase.storage.from("documents").remove([doc.storage_path]);
  if (storageError) throw new Error(storageError.message);

  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "document_deleted",
    entityType: "document",
    entityId: id,
    previousValue: { label: doc.label },
  });

  revalidatePath("/documents");
}
