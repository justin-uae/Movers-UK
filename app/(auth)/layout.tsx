import { BRAND } from "@/lib/brandConfig";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-appbg px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center justify-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logoPath} alt={BRAND.companyName} className="h-12 w-auto" />
          <div className="text-[10px] font-bold uppercase tracking-[.22em] text-primary-500">
            {BRAND.appTagline}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
