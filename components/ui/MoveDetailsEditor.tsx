"use client";

import { VAN_SIZES, type MoveDetailColumns } from "@/lib/supabase/database.types";
import { MOVE_TYPES, PROPERTY_TYPES } from "@/lib/moveDetails";

const inputClass = "mt-2 w-full rounded-xl border px-3 py-2.5 font-normal";

const SERVICES: [keyof MoveDetailColumns, string][] = [
  ["lift_available", "Lift available"],
  ["packing_needed", "Packing needed"],
  ["dismantling_needed", "Furniture dismantling"],
  ["assembly_needed", "Furniture assembly"],
  ["storage_needed", "Storage needed"],
  ["fragile_items", "Fragile or special items"],
];

/** Dropdown that always includes the current value, even if it's not one of the standard options (e.g. free text from the website or an AI extraction). */
function OptionSelect({ value, options, onChange, placeholder }: { value: string | null; options: readonly string[]; onChange: (v: string | null) => void; placeholder: string }) {
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={inputClass}>
      <option value="">{placeholder}</option>
      {all.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/**
 * The move-details section shared by every form that creates or edits a
 * move — the manual enquiry form, lead editing, booking editing and
 * Complex Booking. Controlled: the parent owns the MoveDetails value (and
 * posts it with JSON.stringify, read back by parseMoveDetails).
 */
export function MoveDetailsEditor({ value, onChange }: { value: MoveDetailColumns; onChange: (next: MoveDetailColumns) => void }) {
  const set = <K extends keyof MoveDetailColumns>(key: K, v: MoveDetailColumns[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="text-sm font-bold">
        Move type
        <OptionSelect value={value.move_type} options={MOVE_TYPES} onChange={(v) => set("move_type", v)} placeholder="Select move type" />
      </label>
      <label className="text-sm font-bold">
        Property type
        <OptionSelect value={value.property_type} options={PROPERTY_TYPES} onChange={(v) => set("property_type", v)} placeholder="Select property type" />
      </label>
      <label className="text-sm font-bold">
        Bedrooms or rooms
        <input value={value.rooms ?? ""} onChange={(e) => set("rooms", e.target.value || null)} placeholder="e.g. 3 or 3 bed + study" className={inputClass} />
      </label>
      <label className="text-sm font-bold">
        Estimated boxes
        <input
          type="number"
          min={0}
          value={value.estimated_boxes ?? ""}
          onChange={(e) => set("estimated_boxes", e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))))}
          className={inputClass}
        />
      </label>
      <label className="text-sm font-bold">
        Pickup floor
        <input value={value.pickup_floor ?? ""} onChange={(e) => set("pickup_floor", e.target.value || null)} placeholder="e.g. Ground or 2" className={inputClass} />
      </label>
      <label className="text-sm font-bold">
        Destination floor
        <input value={value.destination_floor ?? ""} onChange={(e) => set("destination_floor", e.target.value || null)} placeholder="e.g. Ground or 1" className={inputClass} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2 md:col-span-2">
        {SERVICES.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold">
            <input type="checkbox" checked={value[key] === true} onChange={(e) => set(key, e.target.checked)} className="h-4 w-4" />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Van size dropdown — one of VAN_SIZES, or none. Keeps a non-standard current value selectable. */
export function VanSizeSelect({ value, onChange, className }: { value: string | null; onChange: (v: string | null) => void; className?: string }) {
  const all: readonly string[] = value && !(VAN_SIZES as readonly string[]).includes(value) ? [value, ...VAN_SIZES] : VAN_SIZES;
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={className ?? inputClass}>
      <option value="">Not decided yet</option>
      {all.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
