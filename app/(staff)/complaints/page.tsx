import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { ComplaintsPage, type ComplaintRow, type PickerOption } from "@/components/pages/ComplaintsPage";
import type { ComplaintCategory, ServiceOpsSeverity, ServiceOpsStatus } from "@/lib/supabase/database.types";

interface ComplaintListRow {
  id: string;
  category: ComplaintCategory;
  severity: ServiceOpsSeverity;
  description: string;
  status: ServiceOpsStatus;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  assigned_to: string | null;
  customers: { company_name: string | null; contact_name: string } | null;
  quotes: { id: string; quote_number: string } | null;
}

export default async function Page() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canManage = await hasPermission(profile, PERMISSIONS.COMPLAINTS_MANAGE);

  const [{ data: rows }, { data: customers }, { data: quotes }, { data: profiles }] = await Promise.all([
    supabase
      .from("complaints")
      .select(
        "id, category, severity, description, status, resolution_notes, created_at, resolved_at, assigned_to, customers(company_name, contact_name), quotes(id, quote_number)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("customers").select("id, company_name, contact_name").order("contact_name").limit(300),
    supabase.from("quotes").select("id, quote_number").order("created_at", { ascending: false }).limit(300),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);

  const nameByProfileId = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const typedRows = (rows ?? []) as unknown as ComplaintListRow[];

  const complaintRows: ComplaintRow[] = typedRows.map((r) => ({
    id: r.id,
    category: r.category,
    severity: r.severity,
    description: r.description,
    status: r.status,
    resolutionNotes: r.resolution_notes,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    customerLabel: r.customers?.company_name || r.customers?.contact_name || null,
    quoteId: r.quotes?.id ?? null,
    quoteNumber: r.quotes?.quote_number ?? null,
    assigneeId: r.assigned_to,
    assigneeName: r.assigned_to ? (nameByProfileId.get(r.assigned_to) ?? null) : null,
  }));

  const customerOptions: PickerOption[] = (customers ?? []).map((c) => ({ id: c.id, label: c.company_name || c.contact_name }));
  const quoteOptions: PickerOption[] = (quotes ?? []).map((q) => ({ id: q.id, label: q.quote_number }));
  const assigneeOptions: PickerOption[] = (profiles ?? []).map((p) => ({ id: p.id, label: p.full_name }));

  return (
    <ComplaintsPage
      rows={complaintRows}
      customers={customerOptions}
      quotes={quoteOptions}
      assignees={assigneeOptions}
      canManage={canManage}
    />
  );
}
