import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { IncidentsPage, type IncidentRow, type PickerOption } from "@/components/pages/IncidentsPage";
import type { IncidentCategory, ServiceOpsSeverity, ServiceOpsStatus } from "@/lib/supabase/database.types";

interface IncidentListRow {
  id: string;
  category: IncidentCategory;
  severity: ServiceOpsSeverity;
  description: string;
  status: ServiceOpsStatus;
  resolution_notes: string | null;
  created_at: string;
  assigned_to: string | null;
  quotes: { quote_number: string } | null;
  suppliers: { name: string } | null;
}

export default async function Page() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canManage = await hasPermission(profile, PERMISSIONS.INCIDENTS_MANAGE);

  const [{ data: rows }, { data: jobs }, { data: suppliers }, { data: profiles }] = await Promise.all([
    supabase
      .from("incidents")
      .select(
        "id, category, severity, description, status, resolution_notes, created_at, assigned_to, quotes(quote_number), suppliers(name)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("jobs")
      .select("id, quote_id, quotes(quote_number)")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("suppliers").select("id, name").order("name").limit(300),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);

  const nameByProfileId = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const typedRows = (rows ?? []) as unknown as IncidentListRow[];

  const incidentRows: IncidentRow[] = typedRows.map((r) => ({
    id: r.id,
    category: r.category,
    severity: r.severity,
    description: r.description,
    status: r.status,
    resolutionNotes: r.resolution_notes,
    createdAt: r.created_at,
    quoteNumber: r.quotes?.quote_number ?? null,
    supplierName: r.suppliers?.name ?? null,
    assigneeId: r.assigned_to,
    assigneeName: r.assigned_to ? (nameByProfileId.get(r.assigned_to) ?? null) : null,
  }));

  const jobOptions = (jobs ?? []).map((j) => {
    const quote = j.quotes as unknown as { quote_number: string } | null;
    return { id: j.id, label: quote?.quote_number ?? j.id, quoteId: j.quote_id };
  });
  const supplierOptions: PickerOption[] = (suppliers ?? []).map((s) => ({ id: s.id, label: s.name }));
  const assigneeOptions: PickerOption[] = (profiles ?? []).map((p) => ({ id: p.id, label: p.full_name }));

  return (
    <IncidentsPage
      rows={incidentRows}
      jobs={jobOptions}
      suppliers={supplierOptions}
      assignees={assigneeOptions}
      canManage={canManage}
    />
  );
}
