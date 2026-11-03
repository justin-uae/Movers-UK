import type { LucideIcon } from "lucide-react";
import { MoreHorizontal, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Panel } from "./Panel";
import clsx from "clsx";

export function Kpi({
  title,
  value,
  delta,
  icon: Icon,
  warn = false,
  href,
}: {
  title: string;
  value: string;
  delta?: string;
  icon: LucideIcon;
  warn?: boolean;
  /** When set, the whole card becomes a link to the view this number is counted from — e.g. a status-filtered list. Omit for a card that's a pure aggregate (a revenue total, a percentage) with no single list it could sensibly open. */
  href?: string;
}) {
  // h-full + flex-col on the Panel, plus mt-auto on the delta line, so every
  // card in a grid row ends up the same height regardless of whether it has
  // a delta line or sits next to a taller sibling — the grid stretches each
  // item to the row's height (CSS grid's default), and this makes the
  // *content* actually fill that stretched height instead of just leaving
  // blank space below a short card. Without h-full here, a card wrapped in
  // the <Link> below would stay shrunk to its own content height even
  // though the row around it grew to fit a taller sibling.
  const card = (
    <Panel className={clsx("flex h-full flex-col", href && "transition-shadow hover:border-primary-200 hover:shadow-md")}>
      <div className="flex items-start justify-between">
        <div
          className={clsx(
            "grid h-11 w-11 place-items-center rounded-2xl",
            warn ? "bg-amber-50 text-amber-600" : "bg-primary-50 text-primary-600",
          )}
        >
          <Icon size={21} />
        </div>
        {href ? <ChevronRight className="text-slate-300" size={18} /> : <MoreHorizontal className="text-slate-300" size={18} />}
      </div>
      <div className="mt-5 text-sm font-semibold text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
      <div className={clsx("mt-2 text-xs font-bold", warn ? "text-amber-600" : "text-emerald-600")}>{delta}</div>
    </Panel>
  );

  if (!href) return card;
  return (
    <Link href={href} className="block h-full rounded-3xl focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-100">
      {card}
    </Link>
  );
}
