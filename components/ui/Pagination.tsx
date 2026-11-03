"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages <= 1) return null;

  function hrefFor(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-slate-500">
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="flex gap-2">
        <Link
          href={hrefFor(Math.max(1, page - 1))}
          className={clsx(
            "rounded-lg border px-3 py-2 text-xs font-bold",
            page <= 1 && "pointer-events-none opacity-40",
          )}
        >
          Previous
        </Link>
        <Link
          href={hrefFor(Math.min(totalPages, page + 1))}
          className={clsx(
            "rounded-lg border px-3 py-2 text-xs font-bold",
            page >= totalPages && "pointer-events-none opacity-40",
          )}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
