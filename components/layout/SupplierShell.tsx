"use client";

import { useState } from "react";
import { SupplierSidebar } from "./SupplierSidebar";
import { SupplierHeader } from "./SupplierHeader";
import { ToastProvider } from "../ui/Toast";
import type { SupplierStatus } from "@/lib/supabase/database.types";

export function SupplierShell({
  supplierName,
  supplierStatus,
  newJobsCount,
  children,
}: {
  supplierName: string;
  supplierStatus: SupplierStatus;
  newJobsCount: number;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-appbg text-slate-800">
        <SupplierSidebar
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          supplierName={supplierName}
          supplierStatus={supplierStatus}
          newJobsCount={newJobsCount}
        />
        <main className="lg:pl-72">
          <SupplierHeader onOpenMobile={() => setMobileOpen(true)} supplierName={supplierName} />
          <div className="p-4 md:p-6 xl:p-8">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
