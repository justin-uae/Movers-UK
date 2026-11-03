import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { AuditLogPage, type AuditEntryRow, type LoginHistoryRow, type PickerOption } from "@/components/pages/AuditLogPage";

const PAGE_SIZE = 50;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; actor?: string; event?: string; page?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireProfile();
  const allowed = await hasPermission(profile, PERMISSIONS.ADMIN_VIEW_AUDIT_LOGS);

  if (!allowed) {
    return (
      <div>
        <PageHead eyebrow="Administration" title="Audit Log" />
        <Panel>
          <p className="py-8 text-center text-sm text-slate-500">You do not have permission to view the audit log.</p>
        </Panel>
      </div>
    );
  }

  const supabase = await createClient();
  const tab = params.tab === "logins" ? "logins" : "changes";
  const q = params.q?.trim() ?? "";
  const actor = params.actor ?? "";
  const event = params.event ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: profiles } = await supabase.from("profiles").select("id, full_name").order("full_name");
  const actorOptions: PickerOption[] = (profiles ?? []).map((p) => ({ id: p.id, label: p.full_name }));

  let auditEntries: AuditEntryRow[] = [];
  let auditTotal = 0;
  let loginRows: LoginHistoryRow[] = [];
  let loginTotal = 0;

  if (tab === "changes") {
    let query = supabase
      .from("audit_log")
      .select(
        "id, action, entity_type, entity_id, reason, previous_value, new_value, ip_address, user_agent, created_at, actor:profiles!audit_log_actor_id_fkey(full_name)",
        { count: "exact" },
      );
    if (actor) query = query.eq("actor_id", actor);
    if (q) query = query.or(`action.ilike.%${q}%,entity_type.ilike.%${q}%,reason.ilike.%${q}%`);
    const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
    auditTotal = count ?? 0;
    auditEntries = (data ?? []).map((e) => ({
      id: e.id,
      action: e.action,
      entityType: e.entity_type,
      entityId: e.entity_id,
      reason: e.reason,
      previousValue: e.previous_value as Record<string, unknown> | null,
      newValue: e.new_value as Record<string, unknown> | null,
      ipAddress: e.ip_address,
      userAgent: e.user_agent,
      createdAt: e.created_at,
      actorName: (e.actor as unknown as { full_name: string } | null)?.full_name ?? "System",
    }));
  } else {
    let query = supabase
      .from("login_history")
      .select("id, event, ip_address, user_agent, created_at, profiles(full_name)", { count: "exact" });
    if (actor) query = query.eq("user_id", actor);
    if (event) query = query.eq("event", event);
    const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
    loginTotal = count ?? 0;
    loginRows = (data ?? []).map((r) => ({
      id: r.id,
      event: r.event,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      createdAt: r.created_at,
      userName: (r.profiles as unknown as { full_name: string } | null)?.full_name ?? "Unknown",
    }));
  }

  return (
    <AuditLogPage
      tab={tab}
      auditEntries={auditEntries}
      auditTotal={auditTotal}
      loginRows={loginRows}
      loginTotal={loginTotal}
      pageSize={PAGE_SIZE}
      page={page}
      actorOptions={actorOptions}
    />
  );
}
