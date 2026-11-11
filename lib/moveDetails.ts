// Move details captured by the website's "Get your moving quote" form
// (0117_lead_move_details.sql). One place for the labels
// and the plain-text summary, so the lead page, the leads list, the
// enquiry hand-off, AI pricing and the new-lead email all describe a move
// the same way.

import type { MoveDetailColumns } from "./supabase/database.types";

export type MoveDetails = MoveDetailColumns;

const EXTRA_SERVICES: [keyof MoveDetails, string][] = [
  ["packing_needed", "Packing"],
  ["dismantling_needed", "Furniture dismantling"],
  ["assembly_needed", "Furniture assembly"],
  ["storage_needed", "Storage"],
  ["fragile_items", "Fragile or special items"],
];

/** True when any move detail was captured — i.e. this lead came from the moving-quote form. */
export function hasMoveDetails(lead: MoveDetails): boolean {
  return (
    Boolean(lead.move_type || lead.property_type || lead.rooms || lead.pickup_floor || lead.destination_floor) ||
    lead.estimated_boxes !== null ||
    lead.lift_available !== null ||
    EXTRA_SERVICES.some(([key]) => lead[key] !== null)
  );
}

/** Extra services the customer ticked, e.g. ["Packing", "Storage"]. */
export function extraServices(lead: MoveDetails): string[] {
  return EXTRA_SERVICES.filter(([key]) => lead[key] === true).map(([, label]) => label);
}

function yesNo(value: boolean | null): string | null {
  return value === null ? null : value ? "Yes" : "No";
}

/** Label/value rows for display — only rows that were actually captured. */
export function moveDetailRows(lead: MoveDetails): { label: string; value: string }[] {
  const services = extraServices(lead);
  const rows: [string, string | number | null][] = [
    ["Move type", lead.move_type],
    ["Property type", lead.property_type],
    ["Bedrooms / rooms", lead.rooms],
    ["Estimated boxes", lead.estimated_boxes],
    ["Pickup floor", lead.pickup_floor],
    ["Destination floor", lead.destination_floor],
    ["Lift available", yesNo(lead.lift_available)],
    ["Extra services", services.length > 0 ? services.join(", ") : hasMoveDetails(lead) ? "None requested" : null],
  ];
  return rows.filter(([, value]) => value !== null && value !== "").map(([label, value]) => ({ label, value: String(value) }));
}

/** Multi-line plain-text summary ("Move type: House removal\n...") for notes, prompts and emails. Empty string when nothing was captured. */
export function moveDetailsSummary(lead: MoveDetails): string {
  return moveDetailRows(lead)
    .map(({ label, value }) => `${label}: ${value}`)
    .join("\n");
}

/** All-null move details — for lead-shaped objects built from something other than a lead row (e.g. a quote's price estimate). */
export const NO_MOVE_DETAILS: MoveDetails = {
  move_type: null,
  property_type: null,
  rooms: null,
  estimated_boxes: null,
  pickup_floor: null,
  destination_floor: null,
  lift_available: null,
  packing_needed: null,
  dismantling_needed: null,
  assembly_needed: null,
  storage_needed: null,
  fragile_items: null,
};

/**
 * JSON-schema properties for the move details, shared by every AI
 * extraction that reads a move out of free text (email intake, WhatsApp
 * intake, Complex Booking). Every field is nullable — null means "not
 * mentioned", never a guess.
 */
export const MOVE_DETAILS_EXTRACTION_PROPERTIES = {
  move_type: {
    type: ["string", "null"],
    description: "The kind of move, e.g. \"House removal\", \"Flat removal\", \"Man and van\", \"Office relocation\", \"Storage\", \"International move\".",
  },
  property_type: { type: ["string", "null"], description: "The property being moved from, e.g. \"House\", \"Flat\", \"Office\", \"Storage unit\"." },
  rooms: { type: ["string", "null"], description: "Number of bedrooms or rooms, in the customer's words (e.g. \"3\", \"3 bed + study\")." },
  estimated_boxes: { type: ["integer", "null"], description: "Estimated number of boxes, if given." },
  pickup_floor: { type: ["string", "null"], description: "Floor at the pickup address (e.g. \"Ground\", \"2\"), if given." },
  destination_floor: { type: ["string", "null"], description: "Floor at the destination address, if given." },
  lift_available: { type: ["boolean", "null"], description: "Whether a lift is available. Null if not mentioned." },
  packing_needed: { type: ["boolean", "null"], description: "True if the customer wants packing done for them. Null if not mentioned." },
  dismantling_needed: { type: ["boolean", "null"], description: "True if furniture needs dismantling. Null if not mentioned." },
  assembly_needed: { type: ["boolean", "null"], description: "True if furniture needs reassembly. Null if not mentioned." },
  storage_needed: { type: ["boolean", "null"], description: "True if storage is needed. Null if not mentioned." },
  fragile_items: { type: ["boolean", "null"], description: "True if fragile or special items (piano, antiques, artwork) are mentioned. Null if not mentioned." },
} as const;

export const MOVE_DETAILS_EXTRACTION_KEYS = Object.keys(MOVE_DETAILS_EXTRACTION_PROPERTIES) as (keyof MoveDetails)[];

/** Picks just the move-detail fields off any object that has them (an AI extraction, a lead row, ...). */
export function pickMoveDetails(source: MoveDetails): MoveDetails {
  return {
    move_type: source.move_type,
    property_type: source.property_type,
    rooms: source.rooms,
    estimated_boxes: source.estimated_boxes,
    pickup_floor: source.pickup_floor,
    destination_floor: source.destination_floor,
    lift_available: source.lift_available,
    packing_needed: source.packing_needed,
    dismantling_needed: source.dismantling_needed,
    assembly_needed: source.assembly_needed,
    storage_needed: source.storage_needed,
    fragile_items: source.fragile_items,
  };
}

/** Choices for the move-type dropdown — matches the website quote form, plus the other services the company offers. */
export const MOVE_TYPES = ["House removal", "Flat removal", "Man and van", "Office relocation", "Packing service", "Storage", "International relocation"];

/** Choices for the property-type dropdown. */
export const PROPERTY_TYPES = ["House", "Flat or apartment", "Bungalow", "Maisonette", "Office", "Storage unit", "Other"];

/**
 * Reads move details posted as one JSON string (MoveDetailsEditor's
 * serialised value) back into a clean MoveDetails — every field
 * type-checked, blanks turned into null, so a tampered or partial payload
 * can never write the wrong type into the database.
 */
export function parseMoveDetails(raw: unknown): MoveDetails {
  let input: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") input = parsed as Record<string, unknown>;
    } catch {
      input = {};
    }
  } else if (raw && typeof raw === "object") {
    input = raw as Record<string, unknown>;
  }
  const text = (key: keyof MoveDetails) => {
    const v = input[key];
    return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
  };
  const bool = (key: keyof MoveDetails) => (typeof input[key] === "boolean" ? (input[key] as boolean) : null);
  const boxes = Number(input.estimated_boxes);
  return {
    move_type: text("move_type"),
    property_type: text("property_type"),
    rooms: text("rooms"),
    estimated_boxes: input.estimated_boxes === null || input.estimated_boxes === "" || !Number.isFinite(boxes) || boxes < 0 ? null : Math.round(boxes),
    pickup_floor: text("pickup_floor"),
    destination_floor: text("destination_floor"),
    lift_available: bool("lift_available"),
    packing_needed: bool("packing_needed"),
    dismantling_needed: bool("dismantling_needed"),
    assembly_needed: bool("assembly_needed"),
    storage_needed: bool("storage_needed"),
    fragile_items: bool("fragile_items"),
  };
}

/** Field-by-field differences between two sets of move details, in the { from, to } shape the lead/booking edit history records. */
export function moveDetailChanges(before: MoveDetails, after: MoveDetails): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(NO_MOVE_DETAILS) as (keyof MoveDetails)[]) {
    if ((before[key] ?? null) !== (after[key] ?? null)) changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
  }
  return changes;
}

/** One-line move summary for short messages (supplier job offers, WhatsApp), e.g. "House removal · House, 3 rooms · Luton van". */
export function shortMoveSummary(move: Pick<MoveDetails, "move_type" | "property_type" | "rooms"> & { van_size?: string | null }): string {
  const property = [move.property_type, move.rooms ? `${move.rooms} rooms` : null].filter(Boolean).join(", ");
  return [move.move_type, property || null, move.van_size ?? null].filter(Boolean).join(" · ") || "Move details on the job page";
}
