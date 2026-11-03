/**
 * Pickup/destination pair shown as stacked "From" / "To" lines, each
 * truncated with an ellipsis at `maxWidth` instead of forcing the
 * containing table to grow and scroll horizontally — the full address is
 * still available via the native title tooltip on hover.
 */
export function JourneyCell({
  pickup,
  destination,
  maxWidth = "240px",
  className = "",
}: {
  pickup: string | null | undefined;
  destination: string | null | undefined;
  maxWidth?: string;
  className?: string;
}) {
  return (
    <div className={className} style={{ maxWidth }}>
      <div className="flex items-baseline gap-1.5">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">From</span>
        <span className="min-w-0 flex-1 truncate font-bold" title={pickup || undefined}>
          {pickup || "—"}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">To</span>
        <span className="min-w-0 flex-1 truncate" title={destination || undefined}>
          {destination || "—"}
        </span>
      </div>
    </div>
  );
}
