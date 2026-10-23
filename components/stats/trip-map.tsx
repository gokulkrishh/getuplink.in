"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { formatClock } from "@/lib/format";

export type MapPoint = { lat: number; lng: number; t: number };
// size: a radius in px, for pins drawn to scale (a charge's kWh).
export type MapPin = MapPoint & { kind: "start" | "stop" | "end" | "place"; label: string; size?: number };

// CARTO's OpenStreetMap tiles, light and dark to match the page.
const TILES = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>';

const isDark = () => {
  const theme = document.documentElement.dataset.theme;
  return theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};

// A route as a line (a trip, or everywhere visited), with pins: a trip's start, stops and end, or places
// such as chargers. Hover a pin for its label, or tap it on a phone. Leaflet loads in the browser only.
export function TripMap({ route = [], pins, label }: { route?: MapPoint[]; pins: MapPin[]; label?: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--chart-accent").trim() || "#5b8fd9";
      map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
      L.tileLayer(isDark() ? TILES.dark : TILES.light, { attribution: ATTRIBUTION, maxZoom: 19, subdomains: "abcd" }).addTo(map);
      if (route.length >= 2) L.polyline(route.map((p) => [p.lat, p.lng] as [number, number]), { color: accent, weight: 4, opacity: 0.9 }).addTo(map);
      for (const pin of pins) {
        const marker = L.circleMarker([pin.lat, pin.lng], {
          radius: pin.size ?? (pin.kind === "stop" ? 6 : 8),
          color: pin.kind === "stop" ? "#888" : accent,
          fillColor: pin.kind === "start" ? "#ffffff" : pin.kind === "end" || pin.kind === "place" ? accent : "#888",
          fillOpacity: pin.kind === "place" ? 0.6 : 1,
          weight: 3,
        }).addTo(map);
        marker.bindTooltip(pin.label, { direction: "top", offset: [0, -8] });
        marker.on("click", () => marker.openTooltip());
      }
      const bounds = L.latLngBounds([...route, ...pins].map((p) => [p.lat, p.lng] as [number, number]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [route, pins]);

  return (
    <div className="space-y-2">
      <div
        ref={el}
        className="h-72 w-full bg-muted sm:h-96"
        role="img"
        aria-label={label ?? (route.length ? `Route from ${formatClock(route[0].t)} to ${formatClock(route.at(-1)!.t)}, ${pins.length} pins` : `${pins.length} places`)}
      />
      <p className="text-xs text-muted-foreground">Hover or tap a pin for its details.</p>
    </div>
  );
}
