import { MoreHorizontal } from "lucide-react";

export function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h2 className="font-black">{title}</h2>
        {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
      </div>
      <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-50" aria-label="More options">
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}
