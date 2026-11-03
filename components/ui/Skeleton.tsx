import clsx from "clsx";
import { Panel } from "./Panel";

/** Base shimmering placeholder block — compose the pieces below from this. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-lg bg-slate-200", className)} />;
}

/** Mirrors PageHead: eyebrow + title + text, optional action-button-shaped block. */
export function SkeletonPageHead({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div className="space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {withAction && <Skeleton className="h-11 w-36 shrink-0 rounded-xl" />}
    </div>
  );
}

/** Mirrors the `grid gap-4 sm:grid-cols-2 xl:grid-cols-4` Kpi row. */
export function SkeletonKpiRow({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Panel key={i}>
          <div className="flex items-start justify-between">
            <Skeleton className="h-11 w-11 rounded-2xl" />
          </div>
          <Skeleton className="mt-5 h-3 w-24" />
          <Skeleton className="mt-2 h-6 w-16" />
        </Panel>
      ))}
    </div>
  );
}

/**
 * Mirrors the common list-page shape: a Panel with optional tabs/search row
 * above a table. Column widths vary a little so it doesn't read as one
 * uniform bar per row.
 */
export function SkeletonTable({
  rows = 8,
  cols = 5,
  withTabs = false,
  withSearch = false,
}: {
  rows?: number;
  cols?: number;
  withTabs?: boolean;
  withSearch?: boolean;
}) {
  return (
    <Panel>
      {(withTabs || withSearch) && (
        <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center">
          {withTabs && (
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20 rounded-xl" />
              <Skeleton className="h-9 w-24 rounded-xl" />
              <Skeleton className="h-9 w-16 rounded-xl" />
            </div>
          )}
          {withSearch && <Skeleton className="h-10 flex-1 rounded-xl" />}
        </div>
      )}
      <div className="space-y-4 pt-4">
        <div className="flex gap-6">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-16" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-6 border-t pt-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={clsx("h-4", c === 0 ? "w-32" : "w-16", c % 3 === 1 && "w-24")} />
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** A vertical stack of card-shaped rows — dispatch jobs, roles, payments. */
export function SkeletonCardList({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Panel key={i} className="flex items-center gap-4">
          <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </Panel>
      ))}
    </div>
  );
}

/** A single panel of label/value pairs, as used throughout detail pages. */
export function SkeletonPanelLines({ title = true, lines = 4 }: { title?: boolean; lines?: number }) {
  return (
    <Panel>
      {title && (
        <div className="flex items-start justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      )}
      <div className={clsx("grid grid-cols-2 gap-x-4 gap-y-4 rounded-2xl bg-slate-50 p-4", title && "mt-4")}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-16 bg-slate-300" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Mirrors quote/supplier/dispatch detail pages: a 2-col + 1-col panel grid. */
export function SkeletonDetail() {
  return (
    <div>
      <SkeletonPageHead withAction />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <SkeletonPanelLines lines={8} />
          <SkeletonPanelLines lines={2} />
        </div>
        <div className="space-y-5">
          <SkeletonPanelLines lines={2} />
        </div>
      </div>
    </div>
  );
}

/** Mirrors dashboard-style pages: kpi row, two wide panels, a chart row. */
export function SkeletonDashboardBody() {
  return (
    <div className="space-y-6">
      <SkeletonKpiRow count={4} />
      <div className="grid gap-6 2xl:grid-cols-[1.45fr_.85fr]">
        <Panel className="h-[360px]">
          <Skeleton className="h-full w-full" />
        </Panel>
        <Panel>
          <Skeleton className="h-5 w-32" />
          <div className="mt-5 space-y-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </Panel>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-4 h-72 w-full" />
        </Panel>
        <Panel>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mx-auto mt-4 h-56 w-56 rounded-full" />
        </Panel>
      </div>
    </div>
  );
}

/** Mirrors a 2-column card grid, as used on the settings overview page. */
export function SkeletonCardGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <Panel key={i} className="flex items-start gap-4">
          <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </Panel>
      ))}
    </div>
  );
}

/** A grid of checkbox-row groups, as used by the role permission editor. */
export function SkeletonChecklistGrid({ groups = 4, rowsPerGroup = 4 }: { groups?: number; rowsPerGroup?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {Array.from({ length: groups }).map((_, g) => (
        <div key={g} className="space-y-3">
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: rowsPerGroup }).map((_, r) => (
            <div key={r} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className="h-3.5 w-40" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Generic page fallback — a header plus one open panel, close enough to fit almost any page. */
export function SkeletonPage() {
  return (
    <div>
      <SkeletonPageHead />
      <Panel>
        <div className="space-y-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </Panel>
    </div>
  );
}
