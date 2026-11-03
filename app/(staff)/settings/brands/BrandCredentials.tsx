"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";

function CopyField({ label, value, mask }: { label: string; value: string; mask?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(!mask);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-2.5 py-1.5">
      <span className="w-10 shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">
        {revealed ? value : "•".repeat(Math.min(value.length, 24))}
      </code>
      {mask && (
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="shrink-0 text-slate-400 hover:text-slate-600"
          title={revealed ? "Hide" : "Show"}
        >
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
      <button type="button" onClick={copy} className="shrink-0 text-slate-400 hover:text-slate-600" title="Copy">
        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

/** Website Lead Intake API credentials for a brand (see app/api/leads/website/route.ts) — shown here so an admin can hand them to a developer integrating an external site's quote form, without needing SQL access. */
export function BrandCredentials({ slug, secret }: { slug: string; secret: string }) {
  return (
    <div className="mt-3 space-y-1.5 border-t pt-3">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Lead API credentials</div>
      <CopyField label="Slug" value={slug} />
      <CopyField label="Secret" value={secret} mask />
    </div>
  );
}
