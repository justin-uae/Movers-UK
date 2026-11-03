import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { LeadDetailPage, type LeadDetail, type LeadDetailQuote, type LeadSourceDocument } from "@/components/pages/LeadDetailPage";
import { getAssignableSalesUsers } from "@/lib/leadAssignees";
import type { JourneyLeg } from "@/components/pages/JourneyLegDetail";
import type { LeadEditRecord } from "@/components/pages/LeadEditHistory";
import type { LeadAssignmentEvent } from "@/components/pages/LeadAssignmentHistory";
import { estimateTripDistance, legRouteDistances } from "@/lib/tripDistance";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, source, status, priority, pickup_text, destination_text, travel_date, pickup_time, return_trip, return_date, return_time, passenger_count, luggage_count, is_complex_booking, vehicle_requested, notes, assigned_user_id, created_at, customer_id, customers(id, company_name, contact_name, phone, whatsapp, email), profiles(full_name), brands(name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!lead) notFound();

  const { data: enquiry } = await supabase
    .from("enquiries")
    .select(
      "id, status, enquiry_legs(id, sequence, journey_type, pickup_address, destination_address, via_points, pickup_date, pickup_time, return_date, return_time, passenger_count, luggage_count, wheelchair_required, child_seats, special_requirements, vehicle_types(name))",
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

  // Each structured leg gets a stop-by-stop route distance (pickup → via
  // points → destination). The single intake-panel figure is only shown for
  // a simple one-way/return trip — a complex or multi-leg booking (or one
  // with via points) has no single pickup→destination pair it would be
  // meaningful for. Prefer the structured leg's addresses once an enquiry
  // exists, since edits after that point land on the leg rather than the
  // raw intake text.
  // Sorted so "leg N → leg N+1" connections below follow the real order.
  const enquiryLegs = [...((enquiry?.enquiry_legs ?? []) as unknown as JourneyLeg[])].sort((a, b) => a.sequence - b.sequence);
  const singleLeg = enquiryLegs.length === 1 ? enquiryLegs[0] : null;
  const isSimpleTrip = !lead.is_complex_booking && enquiryLegs.length <= 1 && !(singleLeg?.via_points.length);

  // The gap between consecutive legs: where one leg finishes (its pickup
  // again, for a return leg) to where the next one starts. Null when both
  // are the same address — there's no gap to drive.
  const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const connectionLookups = enquiryLegs.slice(1).map((next, i) => {
    const prev = enquiryLegs[i]!;
    const from = prev.journey_type === "return" ? prev.pickup_address : prev.destination_address;
    return sameAddress(from, next.pickup_address)
      ? Promise.resolve(null)
      : estimateTripDistance(from, next.pickup_address).then((distance) => ({ from, to: next.pickup_address, distance }));
  });

  const [canAddEnquiry, canClaim, canRelease, canEditCustomer, canAssign, canViewAuditLog, { data: editsRaw }, legDistances, intakeDistance, legConnections] = await Promise.all([
    hasPermission(profile, PERMISSIONS.ENQUIRIES_ADD),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_CLAIM_OPEN_LEADS),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_RETURN_TO_POOL),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_EDIT),
    hasPermission(profile, PERMISSIONS.ENQUIRIES_REASSIGN),
    hasPermission(profile, PERMISSIONS.ADMIN_VIEW_AUDIT_LOGS),
    supabase.from("lead_edits").select("id, reason, changes, created_at, profiles(full_name)").eq("lead_id", id).order("created_at", { ascending: false }),
    legRouteDistances(enquiryLegs),
    // A single leg's figure comes from legDistances below — only a lead
    // with no enquiry yet needs its own lookup from the intake text.
    isSimpleTrip && !singleLeg ? estimateTripDistance(lead.pickup_text, lead.destination_text) : Promise.resolve(null),
    Promise.all(connectionLookups),
  ]);
  const tripDistance = isSimpleTrip ? (singleLeg ? (legDistances[0]?.total ?? null) : intakeDistance) : null;

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
      legs={enquiryLegs}
      legDistances={legDistances}
      legConnections={legConnections}
      tripDistance={tripDistance}
      isReturnTrip={singleLeg ? singleLeg.journey_type === "return" : lead.return_trip}
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
