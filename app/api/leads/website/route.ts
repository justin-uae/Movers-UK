import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { instantAutoQuoteNewLead } from "@/lib/aiAutoQuote";
import { recordAudit } from "@/lib/audit";
import { resolveCustomerId, notifyIfAutoAssigned } from "@/lib/leadIntake";
import { formatDateAndTime } from "@/lib/formatDate";
import { moveDetailsSummary } from "@/lib/moveDetails";
import { verifyRecaptcha } from "@/lib/recaptcha";

// Public website intake (Part 22). Authenticated by a per-brand shared
// secret (brands.webhook_secret) rather than a Supabase session — the
// website never signs in, it just knows its brand's secret. proxy.ts allows
// this path through PUBLIC_PATHS.
//
// One endpoint, two form types, picked by the body's "formType":
//   - "quote"   (default): the 4-step "Get your moving quote" form —
//               addresses, move type/date, property and access details,
//               extra services, contact + consent. source 'website'.
//   - "contact": a general "Contact Us" enquiry — no move details, just a name, a
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

/** Blank form inputs arrive as "" — treat them as not supplied. */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = z.preprocess(blankToUndefined, z.string().trim().optional());
/** HTML checkboxes post "on" (or nothing); JS clients send true/"true"/1. */
const formBoolean = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "string") return ["true", "on", "1", "yes"].includes(v.trim().toLowerCase());
  if (typeof v === "number") return v === 1;
  return v;
}, z.boolean().optional());

const QuoteLeadSchema = z
  .object({
    brandSlug: z.string().min(1),
    secret: z.string().min(1),
    // Step 4 — contact
    name: z.string().trim().min(1),
    email: z.preprocess(blankToUndefined, z.string().trim().email().optional()),
    phone: optionalText,
    whatsapp: optionalText,
    country: optionalText,
    privacyConsent: formBoolean,
    recaptchaToken: optionalText,
    // Step 1 — the move
    pickup: z.string().trim().min(1),
    destination: z.string().trim().min(1),
    moveType: optionalText,
    /** Preferred date — YYYY-MM-DD or DD/MM/YYYY. */
    moveDate: optionalText,
    /** Optional preferred start time, "HH:MM". */
    moveTime: optionalText,
    // Step 2 — property
    propertyType: optionalText,
    rooms: z.preprocess((v) => (typeof v === "number" ? String(v) : blankToUndefined(v)), z.string().trim().optional()),
    estimatedBoxes: z.preprocess(blankToUndefined, z.coerce.number().int().nonnegative().optional()),
    pickupFloor: z.preprocess((v) => (typeof v === "number" ? String(v) : blankToUndefined(v)), z.string().trim().optional()),
    // Step 3 — access and extra services
    destinationFloor: z.preprocess((v) => (typeof v === "number" ? String(v) : blankToUndefined(v)), z.string().trim().optional()),
    liftAvailable: formBoolean,
    packingNeeded: formBoolean,
    furnitureDismantling: formBoolean,
    furnitureAssembly: formBoolean,
    storageNeeded: formBoolean,
    fragileItems: formBoolean,
    /** "Inventory and access notes". */
    notes: optionalText,
    ...UtmFields,
  })
  .refine((body) => body.email || body.phone, { message: "Provide an email or a telephone number.", path: ["email"] });

/** "2026-12-05" or UK-style "05/12/2026" -> "2026-12-05"; anything else -> null (kept in the notes instead, so a bad date never loses the lead). */
function toIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const uk = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : uk ? [uk[3], uk[2]?.padStart(2, "0"), uk[1]?.padStart(2, "0")] : [];
  if (!y) return null;
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d) ? null : `${y}-${m}-${d}`;
}

const ContactLeadSchema = z.object({
  brandSlug: z.string().min(1),
  secret: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  whatsapp: z.string().optional(),
  country: z.string().optional(),
  serviceNeeded: z.string().optional(),
  moveDate: z.string().optional(),
  message: z.string().min(1),
  ...UtmFields,
});

/** Combined "date at time" for the lead_assigned email, since the template has one {{move_date}} slot rather than a separate time variable — "Monday 10th August 2026, 8:17 PM" via the app's one shared formatter, not the raw ISO value. */
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
      travel_date: toIsoDate(body.moveDate),
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
    move_date: formatWhen(toIsoDate(body.moveDate) ?? undefined),
    move_details: "Not specified",
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

  if (!(await verifyRecaptcha(body.recaptchaToken))) {
    return NextResponse.json({ error: "reCAPTCHA verification failed." }, { status: 400 });
  }

  const customerId = await resolveCustomerId(admin, brand.tenant_id, brand.id, body);

  const rawDate = body.moveDate;
  const travelDate = toIsoDate(rawDate);
  const notes =
    [body.notes, rawDate && !travelDate ? `Preferred date (as entered): ${rawDate}` : null].filter(Boolean).join("\n") || null;
  const moveDetails = {
    move_type: body.moveType ?? null,
    property_type: body.propertyType ?? null,
    rooms: body.rooms ?? null,
    estimated_boxes: body.estimatedBoxes ?? null,
    pickup_floor: body.pickupFloor ?? null,
    destination_floor: body.destinationFloor ?? null,
    // The form's checkboxes are always on screen, so an unticked one is a
    // real "no" — stored as false rather than null ("not asked").
    lift_available: body.liftAvailable ?? false,
    packing_needed: body.packingNeeded ?? false,
    dismantling_needed: body.furnitureDismantling ?? false,
    assembly_needed: body.furnitureAssembly ?? false,
    storage_needed: body.storageNeeded ?? false,
    fragile_items: body.fragileItems ?? false,
  };

  // Simple duplicate guard (Part 27): same brand, same route and move date,
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
      travel_date: travelDate,
      pickup_time: body.moveTime ?? null,
      notes,
      ...moveDetails,
      privacy_consent: body.privacyConsent === true,
      privacy_consent_at: body.privacyConsent === true ? new Date().toISOString() : null,
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
    newValue: { source: "website", pickup: body.pickup, destination: body.destination, moveType: body.moveType ?? null },
  });

  await notifyIfAutoAssigned(admin, lead, brand.tenant_id, brand.name, {
    source: "Website",
    pickup: body.pickup,
    destination: body.destination,
    move_date: formatWhen(travelDate ?? undefined, body.moveTime),
    move_details: moveDetailsSummary(moveDetails) || "Not specified",
    notes: notes ?? "",
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
