/**
 * Best-effort visitor country lookup for defaulting the phone input's dial
 * code — client-only (no API key, no server round-trip). Resolves to null
 * on any failure (offline, rate-limited, blocked by an ad-blocker, ...) so
 * callers always have a hardcoded fallback country ready.
 */
let cached: string | null | undefined;
let pending: Promise<string | null> | null = null;

export function detectVisitorCountry(): Promise<string | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (typeof window === "undefined") return Promise.resolve(null);

  if (!pending) {
    pending = fetch("https://ipapi.co/json/")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { country_code?: string } | null) => {
        cached = data?.country_code || null;
        return cached;
      })
      .catch(() => {
        cached = null;
        return null;
      });
  }
  return pending;
}
