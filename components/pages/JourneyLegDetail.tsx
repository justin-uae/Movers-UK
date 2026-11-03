import { formatDateAndTime } from "@/lib/formatDate";
import { FormattedText } from "@/components/ui/FormattedText";
import { formatDuration } from "@/lib/formatDuration";
import type { RouteDistance } from "@/lib/tripDistance";

export interface JourneyLeg {
  /** Only present where a leg needs to be individually addressable (e.g. editing) — read-only display contexts don't select it. */
  id?: string;
  sequence: number;
  journey_type: string;
  pickup_address: string;
  destination_address: string;
  via_points: string[];
  pickup_date: string | null;
  pickup_time: string | null;
  return_date: string | null;
  return_time: string | null;
  passenger_count: number | null;
  luggage_count: number | null;
  wheelchair_required: boolean;
  child_seats: number;
  special_requirements: string | null;
  vehicle_types: { name: string } | null;
}

/** Full detail block for one enquiry leg — used on both the quote and job detail pages so a multi-leg or return journey shows every field instead of just the first leg's pickup/destination/date. */
export function JourneyLegDetail({
  leg,
  index,
  total,
  distance,
}: {
  leg: JourneyLeg;
  index: number;
  total: number;
  /** Stop-by-stop driving distance — optional, only pages that look it up pass it. */
  distance?: RouteDistance;
}) {
  return (
    <div className={index > 0 ? "mt-4 border-t pt-4" : ""}>
      {total > 1 && (
        <div className="mb-2 text-xs font-black uppercase tracking-wide text-primary-500">
          Leg {leg.sequence} of {total} · {leg.journey_type.replaceAll("_", " ")}
        </div>
      )}
      <dl className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Pickup</dt>
          <dd className="mt-0.5 font-semibold">{leg.pickup_address}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Destination</dt>
          <dd className="mt-0.5 font-semibold">{leg.destination_address}</dd>
        </div>
        {leg.via_points.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-bold uppercase text-slate-400">Via</dt>
            <dd className="mt-0.5 font-semibold">{leg.via_points.join(" → ")}</dd>
          </div>
        )}
        {distance && distance.segments.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-bold uppercase text-slate-400">Distance</dt>
            <dd className="mt-0.5 font-semibold">
              {distance.segments.length > 1 && (
                <ul className="mb-1 space-y-0.5">
                  {distance.segments.map((s, i) => (
                    <li key={i}>
                      <span className="font-normal text-slate-500">
                        {s.from} → {s.to}:
                      </span>{" "}
                      {s.distance ? `${s.distance.distanceKm} km · ${formatDuration(s.distance.durationMinutes)}` : "—"}
                    </li>
                  ))}
                </ul>
              )}
              {distance.total ? (
                <>
                  {distance.segments.length > 1 && "Total "}
                  {distance.total.distanceKm} km
                  <span className="ml-2 font-normal text-slate-500">
                    ≈{formatDuration(distance.total.durationMinutes)}
                    {leg.journey_type === "return" &&
                      ` each way · ${Math.round(distance.total.distanceKm * 2 * 10) / 10} km round trip`}
                  </span>
                </>
              ) : (
                distance.segments.length === 1 && <span className="font-normal text-slate-500">Couldn&apos;t calculate</span>
              )}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Date</dt>
          <dd className="mt-0.5 font-semibold">{leg.pickup_date ? formatDateAndTime(leg.pickup_date, leg.pickup_time) : "—"}</dd>
        </div>
        {leg.journey_type === "return" && (leg.return_date || leg.return_time) && (
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Return</dt>
            <dd className="mt-0.5 font-semibold">{leg.return_date ? formatDateAndTime(leg.return_date, leg.return_time) : "—"}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Passengers</dt>
          <dd className="mt-0.5 font-semibold">{leg.passenger_count ?? "—"}</dd>
        </div>
        {leg.special_requirements && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-bold uppercase text-slate-400">Special requirements</dt>
            <dd className="mt-0.5 font-semibold">
              <FormattedText text={leg.special_requirements} />
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
