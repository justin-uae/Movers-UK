"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { loadGoogleMaps } from "@/lib/googleMaps";

export interface PlaceSelection {
  address: string;
  lat: number | null;
  lng: number | null;
}

interface Suggestion {
  id: string;
  main: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}

/**
 * Plain text input with Google address suggestions underneath, once the Maps
 * SDK is available (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY set) — degrades silently
 * to free-text entry otherwise, so this is safe to use everywhere
 * pickup/destination is captured even before the key is added.
 *
 * Uses Places API (New) — AutocompleteSuggestion + Place.fetchFields — not
 * the legacy google.maps.places.Autocomplete widget, which Google no longer
 * enables on new Cloud projects. The key's project needs "Places API (New)".
 */
export function AddressAutocompleteField({
  value,
  onChange,
  onPlaceSelect,
  placeholder,
  className,
  name,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: PlaceSelection) => void;
  placeholder?: string;
  className?: string;
  name?: string;
  required?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  // One session token per search → pick, so Google bills the keystrokes and
  // the final place lookup as one autocomplete session.
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (!cancelled && google?.maps.places?.AutocompleteSuggestion) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  function search(input: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = input.trim();
    if (!ready || query.length < 3) {
      requestIdRef.current++;
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      try {
        const places = window.google.maps.places;
        sessionRef.current ??= new places.AutocompleteSessionToken();
        const { suggestions: results } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: sessionRef.current,
        });
        if (requestId !== requestIdRef.current) return;
        const next = results
          .map((s) => s.placePrediction)
          .filter((p): p is google.maps.places.PlacePrediction => !!p)
          .map((p) => ({
            id: p.placeId,
            main: p.mainText?.text ?? p.text.text,
            secondary: p.secondaryText?.text ?? "",
            prediction: p,
          }));
        setSuggestions(next);
        setActive(-1);
        setOpen(next.length > 0);
      } catch (err) {
        console.error("Address suggestions failed:", err);
        if (requestId === requestIdRef.current) setSuggestions([]);
      }
    }, 250);
  }

  async function pick(s: Suggestion) {
    setOpen(false);
    setSuggestions([]);
    requestIdRef.current++;
    const fallback = s.secondary ? `${s.main}, ${s.secondary}` : s.main;
    try {
      const place = s.prediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "displayName", "location"] });
      const address = place.formattedAddress || place.displayName || fallback;
      onChange(address);
      onPlaceSelect?.({ address, lat: place.location?.lat() ?? null, lng: place.location?.lng() ?? null });
    } catch (err) {
      console.error("Address lookup failed:", err);
      onChange(fallback);
      onPlaceSelect?.({ address: fallback, lat: null, lng: null });
    } finally {
      sessionRef.current = null;
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      // Pick the highlighted address instead of submitting the form.
      e.preventDefault();
      void pick(suggestions[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        name={name}
        required={required}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          search(e.target.value);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && (
        <ul role="listbox" className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                // mousedown, not click: keeps focus in the input and fires before any outside-click close.
                onMouseDown={(e) => {
                  e.preventDefault();
                  void pick(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm ${i === active ? "bg-slate-50" : ""}`}
              >
                <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-800">{s.main}</span>
                  {s.secondary && <span className="block truncate text-xs text-slate-500">{s.secondary}</span>}
                </span>
              </button>
            </li>
          ))}
          <li className="px-3 pb-1 pt-1.5 text-right text-[10px] text-slate-400">Powered by Google</li>
        </ul>
      )}
    </div>
  );
}
