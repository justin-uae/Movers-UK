// The public quote page renders with per-brand colors/logo fetched at
// request time, so a matching skeleton isn't feasible here — a neutral
// centered spinner is the honest fallback for this one.
export default function Loading() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-400" />
    </div>
  );
}
