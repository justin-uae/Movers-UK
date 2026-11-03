"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { MapPin, X } from "lucide-react";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { AddressAutocompleteField } from "@/components/ui/AddressAutocompleteField";
import { useToast } from "@/components/ui/Toast";
import { addUserRegionAction, removeUserRegionAction } from "./actions";

export interface AllocatedRegion {
  id: string;
  region: string;
  lat: number | null;
  lng: number | null;
  userId: string;
  userName: string;
}

// One tenant is rarely more than a handful of staff — a small fixed palette
// is enough for every marker/dot to read as "this person" at a glance
// without maintaining a colour assignment anywhere in the database.
const PALETTE = ["#f97316", "#2563eb", "#16a34a", "#a855f7", "#dc2626", "#0891b2", "#ca8a04", "#db2777", "#4f46e5", "#059669"];

// London — a reasonable default centre for this tenant's operating area when
// no allocated region has coordinates yet to fit bounds to.
const DEFAULT_CENTER = { lat: 51.5072, lng: -0.1276 };

// The Maps JS API has no free way to fetch a place's real administrative
// boundary (that's a separate, paid "boundaries" dataset) — so "the Kochi
// region" is approximated as a coloured circle of this radius around its
// pin, which reads as "roughly this area is covered" without pretending to
// be an exact city outline.
const REGION_RADIUS_METERS = 12000;

/**
 * Region coverage map — opened from "+ Add region" on a user row. Shows
 * every colleague's allocated region as a coloured pin (so an admin can see
 * gaps/overlaps before adding one), and lets them add a new region for the
 * target user either by searching a place or clicking directly on the map.
 * Existing regions without stored coordinates (added through the old
 * plain-text flow, pre-0069) are geocoded on the fly for display only —
 * never written back, so nothing about their row changes just by opening this.
 */
export function RegionMapModal({
  open,
  onClose,
  targetUserId,
  targetUserName,
  allRegions,
  canManage,
}: {
  open: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUserName: string;
  allRegions: AllocatedRegion[];
  canManage: boolean;
}) {
  const notify = useToast();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<{ setMap(map: google.maps.Map | null): void }[]>([]);
  const geocodeCache = useRef<Map<string, { lat: number; lng: number } | null>>(new Map());
  // Keyed by region row id — lets a click in the "Allocated regions" list
  // jump the map straight to that region, reusing the same coords/bounds/
  // info-popup the marker itself would show, without re-geocoding anything.
  const regionLookupRef = useRef<
    Map<string, { coords: { lat: number; lng: number }; bounds: google.maps.LatLngBounds; open: () => void }>
  >(new Map());

  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [nameInput, setNameInput] = useState("");
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pending, startTransition] = useTransition();

  // Hashing a user id straight into a palette index (the previous approach)
  // collides constantly with only a handful of colours to pick from — with
  // ~6-7 staff sharing a 10-colour palette, two people landing on the same
  // hash bucket was common, not a rare edge case. Assigning colours by each
  // distinct user's position in a stable, sorted list instead guarantees no
  // two different people share a colour as long as there are ≤10 of them.
  const userColors = useMemo(() => {
    const ids = [...new Set(allRegions.map((r) => r.userId))].sort();
    const map = new Map<string, string>();
    ids.forEach((id, i) => map.set(id, PALETTE[i % PALETTE.length]!));
    return map;
  }, [allRegions]);
  const colorForUser = (userId: string) => userColors.get(userId) ?? PALETTE[0]!;

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Resets everything when the modal closes, so reopening it (for the same
  // or a different user) starts clean rather than showing stale state.
  useEffect(() => {
    if (open) return;
    mapRef.current = null;
    overlaysRef.current = [];
    setMapStatus("loading");
    setNameInput("");
    setPendingCoords(null);
  }, [open]);

  // Builds the map once per open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !mapContainerRef.current) return;
      if (!maps) {
        setMapStatus("unavailable");
        return;
      }
      const map = new maps.maps.Map(mapContainerRef.current, {
        center: DEFAULT_CENTER,
        zoom: 10,
        mapTypeId: maps.maps.MapTypeId.SATELLITE,
        streetViewControl: false,
        mapTypeControl: true,
        mapTypeControlOptions: { style: maps.maps.MapTypeControlStyle.DROPDOWN_MENU },
        fullscreenControl: false,
      });
      mapRef.current = map;

      const pendingMarker = new maps.maps.Marker({
        map,
        visible: false,
        icon: {
          path: maps.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#0f172a",
          fillOpacity: 0.9,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });

      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng || !canManage) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        pendingMarker.setPosition({ lat, lng });
        pendingMarker.setVisible(true);
        const geocoder = new maps.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          const name = status === "OK" && results?.[0] ? results[0].formatted_address : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          setNameInput(name);
          setPendingCoords({ lat, lng });
        });
      });

      setMapStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [open, canManage]);

  // Plots every allocated region as a pin, once the map is ready — geocoding
  // on the fly (and caching in memory for this session) any older row that
  // has no stored lat/lng.
  useEffect(() => {
    if (mapStatus !== "ready" || !mapRef.current || typeof window === "undefined" || !window.google) return;
    const google = window.google;
    const map = mapRef.current;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    regionLookupRef.current = new Map();

    const infoWindow = new google.maps.InfoWindow();
    const bounds = new google.maps.LatLngBounds();
    let plotted = 0;

    // The circle is sized to a real-world radius, so it visually shrinks to
    // nothing once zoomed out past a certain point — exactly the "can't see
    // the region unless zoomed in" problem. This label is a plain DOM chip
    // positioned via OverlayView, so unlike the circle it never scales with
    // zoom: the region name + colour dot stay exactly as legible zoomed all
    // the way out as zoomed all the way in.
    class RegionLabelOverlay extends google.maps.OverlayView {
      private div: HTMLDivElement;
      private position: google.maps.LatLng;

      // Shows the region name AND whose region it is right on the pin — the
      // point of a default-view label is to answer "what's here, and whose
      // is it" without a click, so leaving the owner out and requiring a
      // click to find out defeats that.
      constructor(position: google.maps.LatLng, regionLabel: string, userName: string, color: string, onClick: () => void) {
        super();
        this.position = position;
        const div = document.createElement("div");
        Object.assign(div.style, {
          position: "absolute",
          transform: "translate(-50%, calc(-100% - 10px))",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          maxWidth: "210px",
          padding: "4px 10px 4px 7px",
          borderRadius: "12px",
          background: "#ffffff",
          boxShadow: "0 1px 4px rgba(15,23,42,0.35)",
          cursor: "pointer",
          userSelect: "none",
        } satisfies Partial<CSSStyleDeclaration>);

        const dot = document.createElement("span");
        Object.assign(dot.style, {
          width: "8px",
          height: "8px",
          minWidth: "8px",
          borderRadius: "50%",
          background: color,
        });

        const textCol = document.createElement("div");
        Object.assign(textCol.style, {
          display: "flex",
          flexDirection: "column",
          minWidth: "0",
          lineHeight: "1.25",
        } satisfies Partial<CSSStyleDeclaration>);

        const regionLine = document.createElement("span");
        Object.assign(regionLine.style, {
          fontSize: "11px",
          fontWeight: "700",
          color: "#1e293b",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        } satisfies Partial<CSSStyleDeclaration>);
        regionLine.textContent = regionLabel;

        const userLine = document.createElement("span");
        Object.assign(userLine.style, {
          fontSize: "9.5px",
          fontWeight: "600",
          color: "#64748b",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        } satisfies Partial<CSSStyleDeclaration>);
        userLine.textContent = userName;

        textCol.append(regionLine, userLine);
        div.append(dot, textCol);
        div.addEventListener("click", (e) => {
          e.stopPropagation();
          onClick();
        });
        this.div = div;
      }

      onAdd() {
        this.getPanes()?.floatPane.appendChild(this.div);
      }

      draw() {
        const point = this.getProjection()?.fromLatLngToDivPixel(this.position);
        if (point) {
          this.div.style.left = `${point.x}px`;
          this.div.style.top = `${point.y}px`;
        }
      }

      onRemove() {
        this.div.parentNode?.removeChild(this.div);
      }
    }

    async function resolveCoords(r: AllocatedRegion): Promise<{ lat: number; lng: number } | null> {
      if (r.lat != null && r.lng != null) return { lat: r.lat, lng: r.lng };
      if (geocodeCache.current.has(r.region)) return geocodeCache.current.get(r.region)!;
      const result = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        new google.maps.Geocoder().geocode({ address: r.region }, (results, status) => {
          if (status === "OK" && results?.[0]) {
            const loc = results[0].geometry.location;
            resolve({ lat: loc.lat(), lng: loc.lng() });
          } else {
            resolve(null);
          }
        });
      });
      geocodeCache.current.set(r.region, result);
      return result;
    }

    Promise.all(
      allRegions.map(async (r) => {
        const coords = await resolveCoords(r);
        if (!coords) return;
        plotted += 1;
        bounds.extend(coords);
        const color = colorForUser(r.userId);

        const showInfo = (anchor: google.maps.MVCObject) => {
          const content = document.createElement("div");
          content.style.fontSize = "13px";
          content.style.lineHeight = "1.5";
          const strong = document.createElement("b");
          strong.textContent = r.region;
          content.append(strong, document.createElement("br"), r.userName);
          infoWindow.setContent(content);
          infoWindow.open({ map, anchor });
        };

        // The circle IS the region marking (per-user coloured outline +
        // light fill, per the "circle the covered area" request) — the dot
        // marker on top just gives a precise, always-clickable point since
        // a large circle's own click target can be awkward to hit exactly.
        const circle = new google.maps.Circle({
          center: coords,
          radius: REGION_RADIUS_METERS,
          map,
          strokeColor: color,
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: color,
          fillOpacity: 0.12,
          clickable: true,
        });
        circle.addListener("click", () => showInfo(circle));
        overlaysRef.current.push(circle);
        const circleBounds = circle.getBounds();
        if (circleBounds) bounds.union(circleBounds);

        const marker = new google.maps.Marker({
          position: coords,
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
        marker.addListener("click", () => showInfo(marker));
        overlaysRef.current.push(marker);

        const label = new RegionLabelOverlay(new google.maps.LatLng(coords), r.region, r.userName, color, () => showInfo(marker));
        label.setMap(map);
        overlaysRef.current.push(label);

        // circleBounds is only null if the browser's Geometry library failed
        // to compute it — falls back to a tight bounds around just the pin
        // so flyToRegion still has something reasonable to fit to.
        regionLookupRef.current.set(r.id, {
          coords,
          bounds: circleBounds ?? new google.maps.LatLngBounds(coords, coords),
          open: () => showInfo(marker),
        });
      }),
    ).then(() => {
      if (plotted > 0) map.fitBounds(bounds, 64);
    });
  }, [allRegions, mapStatus]);

  // One person can have several regions — grouped under their name (rather
  // than a flat list repeating "· Alex Munyam" on every row) so the list
  // reads as "who covers what" instead of a jumble sorted by whenever each
  // region happened to be added.
  const groupedRegions = useMemo(() => {
    const groups = new Map<string, { userId: string; userName: string; regions: AllocatedRegion[] }>();
    for (const r of allRegions) {
      if (!groups.has(r.userId)) groups.set(r.userId, { userId: r.userId, userName: r.userName, regions: [] });
      groups.get(r.userId)!.regions.push(r);
    }
    return [...groups.values()].sort((a, b) => a.userName.localeCompare(b.userName));
  }, [allRegions]);

  // Clicking a region in the list pans/zooms the map to it (and, on a
  // narrow screen where the list can be scrolled below the map, brings the
  // map back into view) — otherwise finding a specific person's region among
  // many overlapping pins means hunting around the map by eye.
  function flyToRegion(regionId: string) {
    const entry = regionLookupRef.current.get(regionId);
    const map = mapRef.current;
    if (!entry || !map) return;
    // Fits to the circle's own bounds rather than a fixed zoom level — a
    // fixed zoom clipped the circle's edges on a narrower map panel (or
    // showed it too small on a wider one); fitBounds always frames the
    // whole 12km circle regardless of the map container's size.
    map.fitBounds(entry.bounds, 40);
    entry.open();
    mapContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function confirmAdd() {
    const name = nameInput.trim();
    if (!name) {
      notify("Enter or pick a region first.");
      return;
    }
    startTransition(async () => {
      const result = await addUserRegionAction(targetUserId, name, pendingCoords);
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify(`Region added for ${targetUserName}`);
      setNameInput("");
      setPendingCoords(null);
    });
  }

  function handleRemove(regionId: string) {
    startTransition(async () => {
      try {
        await removeUserRegionAction(targetUserId, regionId);
        notify(`Region removed for ${targetUserName}`);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not remove region");
      }
    });
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-slate-900/40 p-4" onClick={() => onClose()}>
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div>
              <h3 id={titleId} className="text-lg font-black text-slate-900">
                Region coverage
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Adding for <b>{targetUserName}</b> — search a place, or click anywhere on the map.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[1.4fr_1fr] md:overflow-visible">
            <div className="relative min-h-[240px] max-h-[45dvh] shrink-0 bg-slate-100 md:max-h-none md:min-h-[320px]">
              <div ref={mapContainerRef} className="absolute inset-0" />
              {mapStatus !== "ready" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-400">
                  {mapStatus === "loading" ? (
                    <span>Loading map…</span>
                  ) : (
                    <>
                      <MapPin size={24} />
                      <p>
                        Add <code className="rounded bg-slate-200 px-1 py-0.5 text-slate-600">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to
                        enable the map — you can still add a region by name below.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-col border-t border-slate-100 md:border-l md:border-t-0">
              {canManage && (
                <div className="shrink-0 border-b border-slate-100 p-4">
                  <div className="text-xs font-black uppercase tracking-wide text-slate-400">Add a region for {targetUserName}</div>
                  <div className="mt-2">
                    <AddressAutocompleteField
                      value={nameInput}
                      onChange={(v) => {
                        setNameInput(v);
                        setPendingCoords(null);
                      }}
                      onPlaceSelect={(place) => {
                        setNameInput(place.address);
                        setPendingCoords(place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : null);
                      }}
                      placeholder="Search a place, or click the map…"
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary-400"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={pending || !nameInput.trim()}
                    onClick={confirmAdd}
                    className="mt-2 w-full rounded-lg bg-primary-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {pending ? "Adding…" : "Add region"}
                  </button>
                </div>
              )}

              <div className="min-h-0 flex-1 p-4 md:overflow-y-auto">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Allocated regions ({allRegions.length})</div>
                <p className="mt-1 text-xs text-slate-400">
                  Each person's regions are shaded in their own colour, with a {(REGION_RADIUS_METERS / 1000).toFixed(0)}km circle
                  marking the approximate area covered around each pin. The label above each pin shows the region and who covers
                  it, without needing a click, and stays readable at any zoom level, even fully zoomed out — the circle itself only
                  becomes visible once zoomed in close. Click a region below to zoom the map straight to it.
                </p>
                <div className="mt-3 space-y-4">
                  {groupedRegions.map((group) => (
                    <div key={group.userId}>
                      <div className="flex items-center gap-2 px-2 text-xs font-black uppercase tracking-wide text-slate-500">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorForUser(group.userId) }} />
                        <span className="truncate">{group.userName}</span>
                        <span className="shrink-0 font-normal normal-case text-slate-400">({group.regions.length})</span>
                      </div>
                      <div className="mt-1 space-y-1">
                        {group.regions.map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between gap-2 rounded-lg py-1.5 pl-7 pr-2 text-sm hover:bg-slate-50"
                          >
                            <button
                              type="button"
                              onClick={() => flyToRegion(r.id)}
                              disabled={mapStatus !== "ready"}
                              title="Zoom the map to this region"
                              className="min-w-0 flex-1 truncate text-left font-semibold disabled:cursor-default"
                            >
                              {r.region}
                            </button>
                            {canManage && r.userId === targetUserId && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => {
                                  if (window.confirm(`Remove "${r.region}" from ${r.userName}'s regions?`)) handleRemove(r.id);
                                }}
                                aria-label={`Remove ${r.region}`}
                                className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {allRegions.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No regions allocated yet.</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
