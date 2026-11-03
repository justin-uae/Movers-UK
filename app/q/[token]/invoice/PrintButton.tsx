"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-3 text-sm font-bold text-white"
    >
      <Printer size={17} />
      Print / Save as PDF
    </button>
  );
}
