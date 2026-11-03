import { TriangleAlert } from "lucide-react";

/** Flags a quote/job still sitting open past its own travel date — never
    paid/dispatched/completed in time and needs a human's attention. */
export function OverdueBadge() {
  return (
    <span
      title="The travel date has already passed"
      className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600"
    >
      <TriangleAlert size={12} /> Travel date passed
    </span>
  );
}
