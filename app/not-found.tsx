import Link from "next/link";
import { Bus } from "lucide-react";

/**
 * UI-NAV-03 — a branded 404 instead of Next's bare, chrome-less default.
 * Deliberately outside the (staff) route group (no sidebar/header, no
 * requireProfile()) since an unmatched route can be hit either logged in or
 * signed out — "/" already resolves to the right destination either way.
 */
export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-appbg px-4 text-center">
      <div>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary-500 text-white">
          <Bus size={30} />
        </div>
        <h1 className="mt-6 text-4xl font-black text-slate-900">404</h1>
        <p className="mt-2 text-lg font-bold text-slate-700">Page not found</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          The page you&apos;re looking for doesn&apos;t exist, or you may not have access to it.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-primary-500 px-5 py-3 text-sm font-bold text-white hover:bg-primary-600"
        >
          Back to safety
        </Link>
      </div>
    </div>
  );
}
