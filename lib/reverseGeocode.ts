import "server-only";

// Turns a WhatsApp-shared location's raw lat/lng into a readable address for
// the lead's pickup/destination text — reuses the same Google Maps key the
// browser-side address autocomplete already uses (lib/googleMaps.ts); there
// is no separate server-restricted Maps key configured in this app, and
// adding one is out of scope for what's otherwise a one-call lookup.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(apiKey)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { formatted_address?: string }[] };
    return data.results?.[0]?.formatted_address ?? null;
  } catch (err) {
    console.error("reverseGeocode failed:", err);
    return null;
  }
}
