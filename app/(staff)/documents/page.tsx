import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DocumentsPage, type DocumentRow, type PickerOption } from "@/components/pages/DocumentsPage";
import type { DocumentType } from "@/lib/supabase/database.types";

const PAGE_SIZE = 25;
const DOC_TYPES: DocumentType[] = [
  "contract",
  "nda",
  "customer_agreement",
  "supplier_licence",
  "insurance",
  "driver_licence",
  "vehicle_registration",
  "invoice",
  "receipt",
  "credit_note",
  "itinerary",
  "passenger_list",
  "quote",
  "other",
];

interface DocumentListRow {
  id: string;
  doc_type: DocumentType;
  label: string;
  notes: string | null;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  created_at: string;
  uploaded_by: string | null;
  profiles: { full_name: string } | null;
  customers: { contact_name: string; company_name: string | null } | null;
  suppliers: { name: string } | null;
  quotes: { quote_number: string } | null;
}

export default async function DocumentsRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; type?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const q = params.q?.trim() || "";
  const type = DOC_TYPES.includes(params.type as DocumentType) ? (params.type as DocumentType) : null;
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("documents")
    .select(
      "id, doc_type, label, notes, storage_path, file_name, file_size, created_at, uploaded_by, profiles(full_name), customers(contact_name, company_name), suppliers(name), quotes(quote_number)",
      { count: "exact" },
    );
  if (type) query = query.eq("doc_type", type);
  if (q) query = query.or(`label.ilike.%${q}%,notes.ilike.%${q}%`);

  const [{ data, count }, { data: customers }, { data: suppliers }, { data: quotes }] = await Promise.all([
    query.order("created_at", { ascending: false }).range(from, to),
    supabase.from("customers").select("id, contact_name, company_name").order("contact_name").limit(200),
    supabase.from("suppliers").select("id, name").order("name").limit(200),
    supabase.from("quotes").select("id, quote_number").order("created_at", { ascending: false }).limit(200),
  ]);
  const rows = (data ?? []) as unknown as DocumentListRow[];

  // Signed URLs resolved server-side (same convention as
  // app/(staff)/accounting/supplier-payments/page.tsx) rather than one
  // client-side round trip per row/click.
  const urlEntries = await Promise.all(
    rows.map(async (r) => {
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(r.storage_path, 3600);
      return [r.id, signed?.signedUrl ?? null] as const;
    }),
  );
  const urls = Object.fromEntries(urlEntries);

  const documentRows: DocumentRow[] = rows.map((r) => ({
    id: r.id,
    docType: r.doc_type,
    label: r.label,
    notes: r.notes,
    fileName: r.file_name,
    fileSize: r.file_size,
    createdAt: r.created_at,
    uploaderName: r.profiles?.full_name ?? "Unknown",
    linkedLabel:
      r.customers?.company_name || r.customers?.contact_name || r.suppliers?.name || (r.quotes ? `Quote ${r.quotes.quote_number}` : null),
    canDelete: r.uploaded_by === profile.id || profile.is_master_admin,
    downloadUrl: urls[r.id] ?? null,
  }));

  const customerOptions: PickerOption[] = (customers ?? []).map((c) => ({ id: c.id, label: c.company_name || c.contact_name }));
  const supplierOptions: PickerOption[] = (suppliers ?? []).map((s) => ({ id: s.id, label: s.name }));
  const quoteOptions: PickerOption[] = (quotes ?? []).map((q) => ({ id: q.id, label: q.quote_number }));

  return (
    <DocumentsPage
      rows={documentRows}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
      docType={type}
      customers={customerOptions}
      suppliers={supplierOptions}
      quotes={quoteOptions}
    />
  );
}
