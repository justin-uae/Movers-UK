"use client";

/**
 * Lazily injects the Google Maps JS SDK (Places + core) once per page,
 * shared by the address autocomplete field and the dashboard live map.
 * Resolves to null instead of throwing when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
 * isn't set, so callers can fall back to a plain input / static panel rather
 * than crash the page.
 */
let loadPromise: Promise<typeof google | null> | null = null;

export function loadGoogleMaps(): Promise<typeof google | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.google?.maps) return Promise.resolve(window.google);
  if (loadPromise) return loadPromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set — Google Maps features are disabled.");
    return Promise.resolve(null);
  }

  loadPromise = new Promise((resolve) => {
    const existing = document.getElementById("google-maps-script") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google ?? null));
      existing.addEventListener("error", () => resolve(null));
      return;
    }
    // Deliberately no `&loading=async` — that parameter only does something
    // useful when paired with Google's inline bootstrap-loader snippet and
    // google.maps.importLibrary(). Tacked onto this classic direct <script>
    // src on its own, it left google.maps.Map/MapTypeId/Marker unpopulated
    // (google.maps existed but was effectively an empty stub), which is what
    // threw "Cannot read properties of undefined (reading 'SATELLITE')" here.
    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.onload = () => resolve(window.google ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loadPromise;
}
