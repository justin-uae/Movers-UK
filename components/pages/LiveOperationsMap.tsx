"use client";

import { useEffect, useRef, useState } from "react";
import { Globe2 } from "lucide-react";
import { loadGoogleMaps } from "@/lib/googleMaps";

export interface CountryLeadCluster {
  code: string;
  name: string;
  lat: number;
  lng: number;
  count: number;
}

/**
 * Satellite-view Google Map bubbling up every lead (any status) by the
 * customer's country (dashboard's "Live global operations" panel) — one
 * marker per country, sized and labeled by how many leads are there.
 * Degrades to the existing dark placeholder panel — instead of crashing —
 * whenever NEXT_PUBLIC_GOOGLE_MAPS_API_KEY isn't configured yet.
 */
export function LiveOperationsMap({ clusters }: { clusters: CountryLeadCluster[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (cancelled || !containerRef.current) return;
      if (!google) {
        setStatus("unavailable");
        return;
      }

      const map = new google.maps.Map(containerRef.current, {
        mapTypeId: google.maps.MapTypeId.SATELLITE,
        center: { lat: 20, lng: 20 },
        zoom: 2,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
      });

      if (clusters.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        const infoWindow = new google.maps.InfoWindow();
        const maxCount = Math.max(...clusters.map((c) => c.count));

        for (const cluster of clusters) {
          const position = { lat: cluster.lat, lng: cluster.lng };
          bounds.extend(position);
          const radius = 14 + Math.round((cluster.count / maxCount) * 22);

          const marker = new google.maps.Marker({
            position,
            map,
            label: { text: String(cluster.count), color: "#ffffff", fontSize: "12px", fontWeight: "bold" },
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: radius,
              fillColor: "#f97316",
              fillOpacity: 0.85,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          });

          marker.addListener("click", () => {
            const content = document.createElement("div");
            content.style.fontSize = "13px";
            content.style.lineHeight = "1.6";
            const title = document.createElement("b");
            title.textContent = cluster.name;
            content.append(title, document.createElement("br"), `${cluster.count} lead${cluster.count === 1 ? "" : "s"}`);
            infoWindow.setContent(content);
            infoWindow.open({ map, anchor: marker });
          });
        }

        // fitBounds() applies its zoom asynchronously (after the next
        // bounds_changed event) — reading map.getZoom() right after calling
        // it still returns the pre-fit zoom, so capping it has to happen in
        // that event, not synchronously below. Without this cap, a single
        // country (or several close together) fits to a near-street-level
        // zoom instead of a country overview.
        const MAX_ZOOM = 5;
        google.maps.event.addListenerOnce(map, "bounds_changed", () => {
          if ((map.getZoom() ?? 0) > MAX_ZOOM) map.setZoom(MAX_ZOOM);
        });
        map.fitBounds(bounds, 80);
      }

      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [clusters]);

  const totalLeads = clusters.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="relative h-[360px] w-full overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950">
      <div ref={containerRef} className="absolute inset-0" />

      {status !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-400">
          {status === "loading" ? (
            <span>Loading live map…</span>
          ) : (
            <>
              <Globe2 size={28} />
              <p className="max-w-xs">
                Add <code className="rounded bg-white/10 px-1 py-0.5 text-white">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to enable the live satellite map.
              </p>
            </>
          )}
        </div>
      )}

      {status === "ready" && (
        <div className="pointer-events-none absolute bottom-5 left-5 flex gap-4 rounded-2xl bg-white/10 p-3 text-xs text-white backdrop-blur">
          <span>
            <i className="mr-2 inline-block h-2 w-2 rounded-full bg-orange-400" />
            All leads {totalLeads} · {clusters.length} {clusters.length === 1 ? "country" : "countries"}
          </span>
        </div>
      )}
    </div>
  );
}
