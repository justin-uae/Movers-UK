import { formatDateAndTime } from "@/lib/formatDate";
import { FormattedText } from "@/components/ui/FormattedText";
import { formatDuration } from "@/lib/formatDuration";
import { moveDetailRows, type MoveDetails } from "@/lib/moveDetails";
import type { RouteDistance } from "@/lib/moveDistance";

/** The move a quote/job is built from — one enquiry_legs row (sequence 1). */
export interface MoveLeg extends MoveDetails {
  /** Only present where the move needs to be individually addressable (e.g. editing) — read-only display contexts don't select it. */
  id?: string;
  sequence: number;
  pickup_address: string;
  destination_address: string;
  pickup_date: string | null;
  pickup_time: string | null;
  van_size: string | null;
  special_requirements: string | null;
}

/** Full detail block for a move — used on the lead, quote, new-quote, dispatch job and supplier job pages. */
export function MoveDetailCard({
  leg,
  distance,
}: {
  leg: MoveLeg;
  /** Driving distance — optional, only pages that look it up pass it. */
  distance?: RouteDistance;
}) {
  return (
    <dl className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
      <div>
        <dt className="text-xs font-bold uppercase text-slate-400">Moving from</dt>
        <dd className="mt-0.5 font-semibold">{leg.pickup_address}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold uppercase text-slate-400">Moving to</dt>
        <dd className="mt-0.5 font-semibold">{leg.destination_address}</dd>
      </div>
      {distance && distance.segments.length > 0 && (
        <div className="sm:col-span-2">
          <dt className="text-xs font-bold uppercase text-slate-400">Distance</dt>
          <dd className="mt-0.5 font-semibold">
            {distance.total ? (
              <>
                {distance.total.distanceKm} km
                <span className="ml-2 font-normal text-slate-500">≈{formatDuration(distance.total.durationMinutes)}</span>
              </>
            ) : (
              <span className="font-normal text-slate-500">Couldn&apos;t calculate</span>
            )}
          </dd>
        </div>
      )}
      <div>
        <dt className="text-xs font-bold uppercase text-slate-400">Move date</dt>
        <dd className="mt-0.5 font-semibold">{leg.pickup_date ? formatDateAndTime(leg.pickup_date, leg.pickup_time) : "—"}</dd>
      </div>
      <div>
        <dt className="text-xs font-bold uppercase text-slate-400">Van size</dt>
        <dd className="mt-0.5 font-semibold">{leg.van_size ?? "—"}</dd>
      </div>
      {moveDetailRows(leg).map(({ label, value }) => (
        <div key={label}>
          <dt className="text-xs font-bold uppercase text-slate-400">{label}</dt>
          <dd className="mt-0.5 font-semibold">{value}</dd>
        </div>
      ))}
      {leg.special_requirements && (
        <div className="sm:col-span-2">
          <dt className="text-xs font-bold uppercase text-slate-400">Inventory and access notes</dt>
          <dd className="mt-0.5 font-semibold">
            <FormattedText text={leg.special_requirements} />
          </dd>
        </div>
      )}
    </dl>
  );
}

/** Column list for selecting a move (enquiry_legs) everywhere MoveDetailCard is shown. */
export const MOVE_LEG_COLUMNS =
  "id, sequence, pickup_address, destination_address, pickup_date, pickup_time, van_size, special_requirements, move_type, property_type, rooms, estimated_boxes, pickup_floor, destination_floor, lift_available, packing_needed, dismantling_needed, assembly_needed, storage_needed, fragile_items";
