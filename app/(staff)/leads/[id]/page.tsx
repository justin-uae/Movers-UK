import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { LeadDetailPage, type LeadDetail, type LeadDetailQuote, type LeadSourceDocument } from "@/components/pages/LeadDetailPage";
import { getAssignableSalesUsers } from "@/lib/leadAssignees";
import type { MoveLeg } from "@/components/pages/MoveDetailCard";
import type { LeadEditRecord } from "@/components/pages/LeadEditHistory";
import type { LeadAssignmentEvent } from "@/components/pages/LeadAssignmentHistory";
import { estimateMoveDistance } from "@/lib/moveDistance";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, source, status, priority, pickup_text, destination_text, travel_date, pickup_time, is_complex_booking, notes, move_type, property_type, rooms, estimated_boxes, pickup_floor, destination_floor, lift_available, packing_needed, dismantling_needed, assembly_needed, storage_needed, fragile_items, assigned_user_id, created_at, customer_id, customers(id, company_name, contact_name, phone, whatsapp, email), profiles(full_name), brands(name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!lead) notFound();

  const { data: enquiry } = await supabase
    .from("enquiries")
    .select(
      "id, status, enquiry_legs(id, sequence, pickup_address, destination_address, pickup_date, pickup_time, van_size, special_requirements, move_type, property_type, rooms, estimated_boxes, pickup_floor, destination_floor, lift_available, packing_needed, dismantling_needed, assembly_needed, storage_needed, fragile_items)",
    )
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let quote: LeadDetailQuote | null = null;
  if (enquiry) {
    const { data: quoteRow } = await supabase
      .from("quotes")
      .select("id, quote_number, status, ai_generated")
      .eq("enquiry_id", enquiry.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    quote = quoteRow;
  }

  let sourceDocument: LeadSourceDocument | null = null;
  if (lead.is_complex_booking) {
    const { data: doc } = await supabase
      .from("documents")
      .select("file_name, storage_path")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (doc) {
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 3600);
      sourceDocument = { fileName: doc.file_name, downloadUrl: signed?.signedUrl ?? null };
    }
  }

  // The move on the enquiry (once one exists) is what the quote is built
  // from, and edits after that point land on it rather than the raw intake
  // text — so its addresses win for the distance lookup.
  const move = ((enquiry?.enquiry_legs ?? []) as unknown as MoveLeg[]).sort((a, b) => a.sequence - b.sequence)[0] ?? null;

  const [canAddEnquiry, canClaim, canRelease, canEditCustomer, canAssign, canViewAuditLog, { data: editsRaw }, moveDistance] = await Promise.all([
    hasPermission(profile, PERMISSIONS.ENQUIRIES_ADD),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_CLAIM_OPEN_LEADS),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_RETURN_TO_POOL),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_EDIT),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_REASSIGN),
    hasPermission(profile, PERMISSIONS.ADMIN_VIEW_AUDIT_LOGS),
    supabase.from("lead_edits").select("id, reason, changes, created_at, profiles(full_name)").eq("lead_id", id).order("created_at", { ascending: false }),
    move ? estimateMoveDistance(move.pickup_address, move.destination_address) : estimateMoveDistance(lead.pickup_text, lead.destination_text),
  ]);

  // Only fetched for someone who can actually use it — the dropdown of
  // sales users a lead can be handed to.
  const assignableUsers = canAssign ? await getAssignableSalesUsers(supabase) : [];

  // audit_log's own select policy is gated on admin.view_audit_logs
  // tenant-wide (Master Admin, Sales Manager, Finance Manager) — querying it
  // for anyone else would just come back empty anyway, so skip the round trip.
  const assignmentEvents = canViewAuditLog
    ? ((
        await supabase
          .from("audit_log")
          .select("id, action, new_value, created_at, actor:profiles!audit_log_actor_id_fkey(full_name)")
          .eq("entity_type", "lead")
          .eq("entity_id", id)
          .in("action", [
            "lead_assigned_by_manager",
            "lead_claimed",
            "lead_released",
            "lead_released_sla_breach",
            "ai_quote_created_sla",
            "ai_quote_created_whatsapp_lead",
            "ai_quote_created_manual_assign",
            "ai_quote_created_website_lead",
            "ai_quote_created_email_lead",
            "ai_quote_created_manual_lead",
          ])
          .order("created_at", { ascending: false })
      ).data ?? [])
    : [];

  return (
    <LeadDetailPage
      lead={lead as unknown as LeadDetail}
      move={move}
      moveDistance={moveDistance}
      enquiryId={enquiry?.id ?? null}
      quote={quote}
      sourceDocument={sourceDocument}
      edits={(editsRaw ?? []) as unknown as LeadEditRecord[]}
      assignmentEvents={assignmentEvents as unknown as LeadAssignmentEvent[]}
      currentUserId={profile.id}
      canAddEnquiry={canAddEnquiry}
      canClaim={canClaim}
      canRelease={canRelease}
      canEditCustomer={canEditCustomer}
      canAssign={canAssign}
      assignableUsers={assignableUsers}
    />
  );
}
