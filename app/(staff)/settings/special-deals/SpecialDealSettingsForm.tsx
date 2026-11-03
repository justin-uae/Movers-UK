"use client";

import { useState, useTransition } from "react";
import { Mail, Percent, Power, Tag, ThumbsDown } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { updateSpecialDealSettingsAction, type SpecialDealSettings } from "./actions";

const QUICK_PERCENTS = [5, 10, 15, 20];
const EXAMPLE_PRICE = 1000;

export function SpecialDealSettingsForm({ initial }: { initial: SpecialDealSettings }) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const pct = Number(settings.autoPercent) || 0;
  const valid = pct >= 1 && pct <= 90;

  function save() {
    startTransition(async () => {
      const result = await updateSpecialDealSettingsAction(settings);
      if (result.error) {
        notify(result.error);
        return;
      }
      setSaved(settings);
      notify("Special deal settings saved");
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Live status ─────────────────────────────────────────── */}
      <div className={`flex items-start gap-3 rounded-2xl border p-4 ${saved.autoEnabled ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${saved.autoEnabled ? "bg-emerald-500" : "bg-slate-400"}`} />
        <div className="text-sm">
          <div className="font-bold text-slate-900">{saved.autoEnabled ? `On — ${saved.autoPercent}% off` : "Automatic discount is switched off"}</div>
          <p className="mt-0.5 text-slate-600">
            {saved.autoEnabled
              ? `A customer who rejects a quote as "Too expensive" gets it back 30 minutes later at ${saved.autoPercent}% off.`
              : `Customers who reject a quote as "Too expensive" get nothing automatic. Staff can still use the Today's Special Deal button on any quote.`}
          </p>
        </div>
      </div>

      {/* ── How it works ────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: ThumbsDown, title: "Customer rejects the quote", text: 'and picks "Too expensive" as the reason.' },
          { icon: Tag, title: "30 minutes later, the price drops", text: "by the percentage below, on the same quote." },
          { icon: Mail, title: "The customer gets the deal", text: "by email, from the quote owner." },
        ].map((step, i) => (
          <div key={step.title} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <step.icon size={18} />
            </div>
            <div className="text-sm">
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">Step {i + 1}</div>
              <div className="font-bold text-slate-900">{step.title}</div>
              <div className="text-slate-500">{step.text}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Settings ────────────────────────────────────────────── */}
      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-4 p-5">
          <div className="flex gap-3">
            <Power size={18} className="mt-0.5 shrink-0 text-slate-400" />
            <div>
              <div className="text-sm font-bold text-slate-900">Automatic discount for &quot;Too expensive&quot;</div>
              <div className="text-xs text-slate-500">Once per quote, and never below the supplier cost.</div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.autoEnabled}
            onClick={() => setSettings((s) => ({ ...s, autoEnabled: !s.autoEnabled }))}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${settings.autoEnabled ? "bg-emerald-500" : "bg-slate-300"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${settings.autoEnabled ? "left-6" : "left-1"}`} />
          </button>
        </div>

        <fieldset disabled={!settings.autoEnabled} className={`p-5 ${settings.autoEnabled ? "" : "opacity-50"}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="flex gap-3 lg:w-64 lg:shrink-0">
              <Percent size={18} className="mt-0.5 shrink-0 text-slate-400" />
              <div>
                <div className="text-sm font-bold text-slate-900">How much off?</div>
                <div className="text-xs text-slate-500">Taken off the quote&apos;s current price.</div>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {QUICK_PERCENTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, autoPercent: p }))}
                    className={`h-10 rounded-xl px-4 text-sm font-bold transition ${
                      pct === p ? "bg-emerald-600 text-white shadow-sm" : "border border-dashed border-slate-300 text-slate-500 hover:border-slate-400"
                    }`}
                  >
                    {p}%
                  </button>
                ))}
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-600">
                  or
                  <input
                    type="number"
                    min={1}
                    max={90}
                    step="0.5"
                    value={settings.autoPercent}
                    onChange={(e) => setSettings((s) => ({ ...s, autoPercent: Number(e.target.value) }))}
                    className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
                    aria-label="Discount percentage"
                  />
                  %
                </label>
              </div>
              {valid ? (
                <p className="mt-3 text-xs text-slate-500">
                  Example: a quote for £{EXAMPLE_PRICE.toLocaleString("en-GB")} would be re-sent at{" "}
                  <b className="text-emerald-700">£{(EXAMPLE_PRICE * (1 - pct / 100)).toLocaleString("en-GB", { maximumFractionDigits: 2 })}</b>.
                </p>
              ) : (
                <p className="mt-3 text-xs font-semibold text-red-600">Pick a discount between 1% and 90%.</p>
              )}
            </div>
          </div>
        </fieldset>

        {/* ── Summary + save ──────────────────────────────────────── */}
        <div className="flex flex-col gap-3 rounded-b-2xl bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            {settings.autoEnabled ? (
              <>
                &quot;Too expensive&quot; rejections are re-sent at <b className="text-slate-900">{valid ? `${pct}% off` : "—"}</b>, from the quote owner&apos;s email.
              </>
            ) : (
              "Off — rejected quotes stay rejected."
            )}
          </p>
          <button
            disabled={pending || !dirty || !valid}
            onClick={save}
            className="shrink-0 rounded-xl bg-primary-500 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-600 disabled:opacity-40"
          >
            {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>
    </div>
  );
}
