"use client";

import { Sparkles, Command } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { optimisationCards } from "@/components/demo/demoData";

export function OptimisationPage() {
  const notify = useToast();

  return (
    <div>
      <PageHead
        eyebrow="AI Business Optimisation Engine"
        title="Optimisation opportunities"
        text="Live recommendations to improve revenue, margin, conversion and operations."
        action={
          <button
            onClick={() => notify("Executive brief generated")}
            className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
          >
            <Sparkles size={17} />
            Generate Brief
          </button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {optimisationCards.map((c) => (
          <Panel key={c[0]}>
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                <Sparkles />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-black">{c[0]}</h3>
                  <span
                    className={
                      "rounded-full px-2 py-1 text-xs font-bold " +
                      (c[3] === "High" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")
                    }
                  >
                    {c[3]} confidence
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{c[1]}</p>
                <div className="mt-3 text-sm font-black text-primary-600">{c[2]}</div>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => notify(`${c[0]} approved`)}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white"
                  >
                    Approve action
                  </button>
                  <button className="rounded-xl border px-4 py-2 text-xs font-bold">View analysis</button>
                </div>
              </div>
            </div>
          </Panel>
        ))}
      </div>
      <Panel className="mt-6">
        <SectionTitle title="AI executive command" sub="Ask questions using live CRM data" />
        <div className="mt-5 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Command className="absolute left-4 top-1/2 -translate-y-1/2 text-primary-500" size={19} />
            <input
              placeholder="Ask: Which users generated the highest final margin this month?"
              className="w-full rounded-2xl border bg-slate-50 py-4 pl-12 pr-4 outline-none focus:ring-4 focus:ring-primary-100"
            />
          </div>
          <button
            onClick={() => notify("AI analysis generated")}
            className="rounded-2xl bg-primary-500 px-6 py-4 font-black text-white"
          >
            Analyse
          </button>
        </div>
      </Panel>
    </div>
  );
}
