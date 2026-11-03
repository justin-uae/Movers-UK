"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

export interface ConfirmDetailModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Simple label/value rows — covers most cases (lead detail, quote detail, job detail). */
  details?: { label: string; value: React.ReactNode; fullWidth?: boolean }[];
  /** Free-form body content, rendered below `details` if both are given. */
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for actions like unclaim/reject/cancel. */
  destructive?: boolean;
  /** Caller's own useTransition pending state. */
  pending?: boolean;
  error?: string | null;
  onConfirm?: () => void;
}

/**
 * The single shared confirmation/detail dialog used across the app: shows
 * full relevant detail plus one deliberate Confirm click. Every
 * state-changing action (claim, create quote, resend invoice, assign
 * supplier, ...) reuses this instead of a bespoke modal.
 */
export function ConfirmDetailModal({
  open,
  onClose,
  title,
  description,
  details,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
  error,
  onConfirm,
}: ConfirmDetailModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, pending, onClose]);

  // Moves focus into the dialog on open so a keyboard/screen-reader user
  // isn't left focused on whatever triggered it, behind the overlay.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // Locks the page behind the modal — without this, a long details list plus
  // the page's own scroll made it possible to scroll the dashboard/table
  // underneath while the modal sat fixed on top.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] overflow-y-auto bg-slate-900/40 p-4"
      onClick={() => !pending && onClose()}
    >
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scrolls on its own — the footer below stays pinned in view so the
              action buttons are never pushed off-screen behind a long details
              list on a short mobile viewport. */}
          <div className="overflow-y-auto p-6">
            <h3 id={titleId} className="text-lg font-black text-slate-900">
              {title}
            </h3>
            {description && (
              <p id={descId} className="mt-1 text-sm text-slate-500">
                {description}
              </p>
            )}

            {details && details.length > 0 && (
              <dl className="mt-4 flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:grid sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
                {details.map((d, i) => (
                  <div key={i} className={clsx("min-w-0", d.fullWidth && "sm:col-span-2")}>
                    <dt className="text-xs font-bold uppercase text-slate-400">{d.label}</dt>
                    <dd className="mt-0.5 break-words text-sm font-semibold text-slate-800">{d.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {children && <div className="mt-4">{children}</div>}
          </div>

          <div className="shrink-0 border-t border-slate-100 px-6 py-4">
            {error && (
              <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={onClose}
                className="shrink-0 whitespace-nowrap rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-60"
              >
                {cancelLabel}
              </button>
              {onConfirm && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={onConfirm}
                  className={clsx(
                    "shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60",
                    destructive ? "bg-red-600" : "bg-primary-500",
                  )}
                >
                  {pending ? "Please wait…" : confirmLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
