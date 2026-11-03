"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ToastProvider } from "../ui/Toast";
import { AttendanceProvider } from "../ui/AttendanceState";
import { ClockInGate } from "./ClockInGate";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { WhatsAppTakeoverAlerts } from "./WhatsAppTakeoverAlerts";
import type { Brand } from "@/lib/supabase/database.types";
import type { AttendanceState } from "@/lib/attendanceState";

export function StaffShell({
  userName,
  roleName,
  brands,
  activeBrandId,
  visibleHrefs,
  canSeeSettings,
  canCreateQuote,
  canAddLead,
  initialAttendance,
  locked,
  impersonation,
  navCounts,
  whatsappAlertsTenantId,
  children,
}: {
  userName: string;
  roleName: string;
  brands: Brand[];
  activeBrandId: string | null;
  visibleHrefs: string[];
  canSeeSettings: boolean;
  canCreateQuote: boolean;
  canAddLead: boolean;
  initialAttendance: AttendanceState;
  locked: boolean;
  impersonation: { targetName: string; adminName: string } | null;
  /** Sidebar badge numbers keyed by nav href — see lib/navCounts.ts. */
  navCounts: Record<string, number>;
  /** Set for sales users when WhatsApp takeover is switched on — mounts the new-message popup. */
  whatsappAlertsTenantId: string | null;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ToastProvider>
      <AttendanceProvider initialState={initialAttendance}>
        <div className="min-h-screen bg-appbg text-slate-800">
          {impersonation && <ImpersonationBanner targetName={impersonation.targetName} adminName={impersonation.adminName} />}
          <div inert={locked} className={locked ? "opacity-40" : undefined}>
            <Sidebar
              mobileOpen={mobileOpen}
              onCloseMobile={() => setMobileOpen(false)}
              userName={userName}
              roleName={roleName}
              visibleHrefs={visibleHrefs}
              canSeeSettings={canSeeSettings}
              navCounts={navCounts}
            />
          </div>
          <main className="lg:pl-72">
            <Header
              onOpenMobile={() => setMobileOpen(true)}
              brands={brands}
              activeBrandId={activeBrandId}
              canCreateQuote={canCreateQuote}
              canAddLead={canAddLead}
              locked={locked}
            />
            {locked && <ClockInGate />}
            <div inert={locked} className={"p-4 md:p-6 xl:p-8" + (locked ? " select-none opacity-40" : "")}>
              {children}
            </div>
          </main>
          {whatsappAlertsTenantId && !locked && <WhatsAppTakeoverAlerts tenantId={whatsappAlertsTenantId} />}
        </div>
      </AttendanceProvider>
    </ToastProvider>
  );
}
