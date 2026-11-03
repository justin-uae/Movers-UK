"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Brand } from "@/lib/supabase/database.types";

export function BrandSwitcher({
  brands,
  activeBrandId,
}: {
  brands: Brand[];
  activeBrandId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (brands.length === 0) return null;

  async function handleChange(brandId: string) {
    await fetch("/api/brand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId }),
    });
    startTransition(() => router.refresh());
  }

  if (brands.length === 1) {
    const [onlyBrand] = brands;
    return (
      <div className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 xl:block">
        {onlyBrand!.name}
      </div>
    );
  }

  return (
    <select
      value={activeBrandId ?? ""}
      disabled={pending}
      onChange={(e) => handleChange(e.target.value)}
      className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none xl:block"
    >
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
