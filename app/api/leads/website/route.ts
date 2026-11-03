import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { instantAutoQuoteNewLead } from "@/lib/aiAutoQuote";
import { recordAudit } from "@/lib/audit";
import { resolveCustomerId, notifyIfAutoAssigned } from "@/lib/leadIntake";
import { formatDateAndTime } from "@/lib/formatDate";

// Public website intake (Part 22). Authenticated by a per-brand shared
// secret (brands.webhook_secret) rather than a Supabase session — the
// website never signs in, it just knows its brand's secret. proxy.ts allows
// this path through PUBLIC_PATHS.
//
// One endpoint, two form types, picked by the body's "formType":
//   - "quote"   (default, unchanged): the journey-specific quote-request
//               form — pickup, destination, travel date... source 'website'.
//   - "contact": a general "Contact Us" enquiry — no journey, just a name, a
//               way to reach back, and a message. source 'website_contact'.
// Both land in `leads`; the distinct source is what lets the Leads
// workspace and Control Centre label and chart them separately.

type AdminClient = ReturnType<typeof createAdminClient>;

const UtmFields = {
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
  referrer: z.string().optional(),
};

const QuoteLeadSchema = z.object({
  brandSlug: z.string().min(1),
  secret: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  country: z.string().optional(),
  pickup: z.string().min(1),
  destination: z.string().min(1),
  travelDate: z.string().optional(),
  pickupTime: z.string().optional(),
  passengerCount: z.coerce.number().int().positive().optional(),
  luggageCount: z.coerce.number().int().nonnegative().optional(),
  vehicleRequested: z.string().optional(),
  returnTrip: z.boolean().optional(),
  returnDate: z.string().optional(),
  returnTime: z.string().optional(),
  notes: z.string().optional(),
  ...UtmFields,
});

const ContactLeadSchema = z.object({
  brandSlug: z.string().min(1),
  secret: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  whatsapp: z.string().optional(),
  country: z.string().optional(),
  serviceNeeded: z.string().optional(),
  passengerCount: z.coerce.number().int().positive().optional(),
  luggageCount: z.coerce.number().int().nonnegative().optional(),
  travelDate: z.string().optional(),
  pickupTime: z.string().optional(),
  returnTrip: z.boolean().optional(),
  returnDate: z.string().optional(),
  returnTime: z.string().optional(),
  message: z.string().min(1),
  ...UtmFields,
});

const HIGH_PRIORITY_PASSENGER_THRESHOLD = 50;

/** `returnTrip` can arrive true with no date/time yet (customer knows they need a return leg, hasn't picked one) — infer it from either signal so a bare returnDate/returnTime still counts as a return trip even if the flag itself was left out. */
function isReturnTrip(body: { returnTrip?: boolean; returnDate?: string; returnTime?: string }) {
  return Boolean(body.returnTrip || body.returnDate || body.returnTime);
}

/** Combined "date at time" for the lead_assigned email, since the template has one {{travel_date}} slot rather than a separate time variable — "Monday 10th August 2026, 8:17 PM" via the app's one shared formatter, not the raw ISO value. */
function formatWhen(date?: string, time?: string) {
  return date ? formatDateAndTime(date, time) : "Not specified";
}

async function resolveBrand(admin: AdminClient, brandSlug: string, secret: string) {
  const { data: brand } = await admin
    .from("brands")
    .select("id, tenant_id, name, webhook_secret")
    .eq("slug", brandSlug)
    .single();

  if (!brand || brand.webhook_secret !== secret) return null;
  return brand;
}

async function handleContactSubmission(json: unknown) {
  const parsed = ContactLeadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid contact payload.", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const admin = createAdminClient();
  const brand = await resolveBrand(admin, body.brandSlug, body.secret);
  if (!brand) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const customerId = await resolveCustomerId(admin, brand.tenant_id, brand.id, body);

  const notes = [body.serviceNeeded ? `Service needed: ${body.serviceNeeded}` : null, body.message].filter(Boolean).join("\n");

  // Duplicate guard, mirroring handleQuoteSubmission's — but keyed on
  // customer identity rather than an exact route match, since the contact
  // form has no pickup/destination to compare and a resubmitted message is
  // rarely byte-identical (e.g. "4 cities" vs "four cities"). Any customer
  // resubmitting to the same brand within 24h is treated as a duplicate —
  // a false positive here just means a mislabeled status, not lost data
  // (still visible under All, same as every other duplicate-flagged lead).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: possibleDuplicate } = customerId
    ? await admin
        .from("leads")
        .select("id")
        .eq("brand_id", brand.id)
        .eq("customer_id", customerId)
        .eq("source", "website_contact")
        .gte("created_at", since)
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      tenant_id: brand.tenant_id,
      brand_id: brand.id,
      source: "website_contact",
      status: possibleDuplicate ? "duplicate" : "new",
      customer_id: customerId,
      travel_date: body.travelDate ?? null,
      pickup_time: body.pickupTime ?? null,
      return_trip: isReturnTrip(body),
      return_date: body.returnDate ?? null,
      return_time: body.returnTime ?? null,
      passenger_count: body.passengerCount ?? null,
      luggage_count: body.luggageCount ?? null,
      notes,
      utm_source: body.utmSource ?? null,
      utm_medium: body.utmMedium ?? null,
      utm_campaign: body.utmCampaign ?? null,
      utm_term: body.utmTerm ?? null,
      utm_content: body.utmContent ?? null,
      referrer: body.referrer ?? null,
      raw_payload: body,
    })
    .select("id, status, assigned_user_id")
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: leadError?.message ?? "Could not create the lead." }, { status: 500 });
  }

  await recordAudit({
    client: admin,
    tenantId: brand.tenant_id,
    actorId: null,
    action: "lead_created_webhook",
    entityType: "lead",
    entityId: lead.id,
    newValue: { source: "website_contact", serviceNeeded: body.serviceNeeded ?? null },
  });

  await notifyIfAutoAssigned(admin, lead, brand.tenant_id, brand.name, {
    source: "Website contact form",
    pickup: "Not specified",
    destination: "Not specified",
    travel_date: formatWhen(body.travelDate, body.pickupTime),
    passenger_count: body.passengerCount ? String(body.passengerCount) : "Not specified",
    vehicle_requested: "Not specified",
    notes,
  });

  return NextResponse.json({ id: lead.id }, { status: 201 });
}

async function handleQuoteSubmission(json: unknown) {
  const parsed = QuoteLeadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lead payload.", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const admin = createAdminClient();
  const brand = await resolveBrand(admin, body.brandSlug, body.secret);
  if (!brand) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const customerId = await resolveCustomerId(admin, brand.tenant_id, brand.id, body);

  // Simple duplicate guard (Part 27): same brand, same route and travel date,
  // submitted again within the last 24 hours.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: possibleDuplicate } = await admin
    .from("leads")
    .select("id")
    .eq("brand_id", brand.id)
    .eq("pickup_text", body.pickup)
    .eq("destination_text", body.destination)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      tenant_id: brand.tenant_id,
      brand_id: brand.id,
      source: "website",
      status: possibleDuplicate ? "duplicate" : "new",
      customer_id: customerId,
      pickup_text: body.pickup,
      destination_text: body.destination,
      travel_date: body.travelDate ?? null,
      pickup_time: body.pickupTime ?? null,
      return_trip: isReturnTrip(body),
      return_date: body.returnDate ?? null,
      return_time: body.returnTime ?? null,
      passenger_count: body.passengerCount ?? null,
      luggage_count: body.luggageCount ?? null,
      vehicle_requested: body.vehicleRequested ?? null,
      notes: body.notes ?? null,
      priority: (body.passengerCount ?? 0) >= HIGH_PRIORITY_PASSENGER_THRESHOLD ? "high" : "normal",
      utm_source: body.utmSource ?? null,
      utm_medium: body.utmMedium ?? null,
      utm_campaign: body.utmCampaign ?? null,
      utm_term: body.utmTerm ?? null,
      utm_content: body.utmContent ?? null,
      referrer: body.referrer ?? null,
      raw_payload: body,
    })
    .select("id, status, assigned_user_id")
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: leadError?.message ?? "Could not create the lead." }, { status: 500 });
  }

  await recordAudit({
    client: admin,
    tenantId: brand.tenant_id,
    actorId: null,
    action: "lead_created_webhook",
    entityType: "lead",
    entityId: lead.id,
    newValue: { source: "website", pickup: body.pickup, destination: body.destination },
  });

  await notifyIfAutoAssigned(admin, lead, brand.tenant_id, brand.name, {
    source: "Website",
    pickup: body.pickup,
    destination: body.destination,
    travel_date: formatWhen(body.travelDate, body.pickupTime),
    passenger_count: body.passengerCount ? String(body.passengerCount) : "Not specified",
    vehicle_requested: body.vehicleRequested ?? "Not specified",
    notes: body.notes ?? "",
  });

  // Optional instant AI quote (Settings -> AI Assistant -> "Instant quote for
  // new website leads", off by default) — run after the response is sent,
  // since pricing + PDF + email takes several seconds and the website's form
  // submit shouldn't wait on it. Duplicates are skipped inside, too.
  if (lead.status !== "duplicate") {
    after(() => instantAutoQuoteNewLead(admin, lead.id, "website"));
  }

  return NextResponse.json({ id: lead.id }, { status: 201 });
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  if (!json || typeof json !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if ((json as { formType?: unknown }).formType === "contact") {
    return handleContactSubmission(json);
  }
  return handleQuoteSubmission(json);
}
