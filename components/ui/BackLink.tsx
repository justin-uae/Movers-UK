"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * UI-NAV-02's "clear return action" on detail pages. Prefers real browser
 * back-navigation over a fixed link to the collection root: list pages in
 * this app already encode their search/filter/tab/pagination in the URL, so
 * router.back() lands the user on the exact referring URL (state intact)
 * and the browser restores scroll position for free. Falls back to a plain
 * link to fallbackHref when there's no same-origin history to return to —
 * a bookmarked or directly-opened detail page, or a fresh tab.
 */
export function BackLink({ fallbackHref, label }: { fallbackHref: string; label: string }) {
  const router = useRouter();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    let cameFromThisApp = false;
    try {
      cameFromThisApp =
        window.history.length > 1 && !!document.referrer && new URL(document.referrer).origin === window.location.origin;
    } catch {
      cameFromThisApp = false;
    }
    if (cameFromThisApp) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <a
      href={fallbackHref}
      onClick={handleClick}
      className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary-600"
    >
      <ArrowLeft size={16} />
      {label}
    </a>
  );
}
