"use client";

import { Menu, LogOut } from "lucide-react";
import { signOut } from "@/app/(staff)/actions";

export function SupplierHeader({ onOpenMobile, supplierName }: { onOpenMobile: () => void; supplierName: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-20 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-8">
      <button onClick={onOpenMobile} className="rounded-xl p-2 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
        <Menu />
      </button>
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-sm font-semibold text-slate-500 sm:inline">{supplierName}</span>
        <form action={signOut}>
          <button className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50" aria-label="Sign out" title="Sign out">
            <LogOut size={18} />
          </button>
        </form>
      </div>
    </header>
  );
}
