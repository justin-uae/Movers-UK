"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";
import clsx from "clsx";

export interface GuideSection {
  heading: string;
  /** Each entry renders as its own paragraph or bullet, depending on `bullets`. */
  body: string[];
  /** Renders `body` as a bullet list instead of stacked paragraphs. */
  bullets?: boolean;
}

export interface PageGuideProps {
  /** Shown as the modal title — usually the page name. */
  title: string;
  /** One-line summary shown under the title, above the sections. */
  subtitle?: string;
  sections: GuideSection[];
  /** Overrides the trigger button's label. Defaults to "How this works". */
  label?: string;
  /** An annotated wireframe (see components/ui/guide-diagrams) shown above the sections — a labelled map of the real layout, not a live screenshot. */
  screenshot?: React.ReactNode;
}

/**
 * Self-contained "How this works" trigger + modal, dropped into a page's
 * PageHead action slot. Every page's guide content lives at its call site so
 * the copy stays next to the page it documents instead of in one giant file.
 */
export function PageGuide({ title, subtitle, sections, label = "How this works", screenshot }: PageGuideProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
      >
        <HelpCircle size={17} />
        {label}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] overflow-y-auto bg-slate-900/40 p-4"
            onClick={() => setOpen(false)}
          >
            <div className="flex min-h-full items-start justify-center sm:items-center">
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className={clsx(
                  "flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl outline-none",
                  screenshot ? "max-w-4xl" : "max-w-2xl",
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-primary-500">
                      <HelpCircle size={14} />
                      Guide
                    </div>
                    <h3 id={titleId} className="mt-1 text-lg font-black text-slate-900">
                      {title}
                    </h3>
                    {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close guide"
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="overflow-y-auto px-6 py-5">
                  {screenshot && (
                    <div className="mb-5">
                      {screenshot}
                      <p className="mt-2 text-center text-xs text-slate-400">
                        Simplified layout guide — labels point to what each part does, not a live screenshot.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-col gap-5">
                    {sections.map((s, i) => (
                      <div key={i}>
                        <h4 className="text-sm font-black uppercase tracking-wide text-slate-700">{s.heading}</h4>
                        {s.bullets ? (
                          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-slate-600">
                            {s.body.map((line, j) => (
                              <li key={j} className="flex gap-2">
                                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary-400" />
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="mt-2 flex flex-col gap-2 text-sm text-slate-600">
                            {s.body.map((line, j) => (
                              <p key={j}>{line}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="shrink-0 border-t border-slate-100 px-6 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
