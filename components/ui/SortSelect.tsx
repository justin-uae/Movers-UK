"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowDownUp } from "lucide-react";

/**
 * A `<select>` that drives a URL search param (server-side sort) the same
 * way SearchInput drives `q` — so sorting a list stays part of its
 * shareable/bookmarkable URL instead of being client-only state that's lost
 * on refresh. Resets pagination on a new sort, same as a new search term.
 */
export function SortSelect({
  options,
  paramName = "sort",
}: {
  options: { value: string; label: string }[];
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(paramName) ?? options[0]?.value ?? "";

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== options[0]?.value) params.set(paramName, value);
    else params.delete(paramName);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="relative">
      <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-xl border bg-slate-50 py-2.5 pl-9 pr-8 text-sm font-semibold outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
