"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { formatClock } from "@/lib/format";

export type MapPoint = { lat: number; lng: number; t: number };
export type MapPin = MapPoint & { kind: "start" | "stop" | "end"; label: string };

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

// The trip's route as a line, with pins for where it started, each stop and where it ended. Hover a pin
// for its label, or tap it on a phone. Leaflet loads in the browser only.
export function TripMap({ route, pins }: { route: MapPoint[]; pins: MapPin[] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--chart-accent").trim() || "#5b8fd9";
      map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
      L.tileLayer(isDark() ? TILES.dark : TILES.light, { attribution: ATTRIBUTION, maxZoom: 19, subdomains: "abcd" }).addTo(map);
      const line = L.polyline(
        route.map((p) => [p.lat, p.lng] as [number, number]),
        { color: accent, weight: 4, opacity: 0.9 },
      ).addTo(map);
      for (const pin of pins) {
        const marker = L.circleMarker([pin.lat, pin.lng], {
          radius: pin.kind === "stop" ? 6 : 8,
          color: pin.kind === "stop" ? "#888" : accent,
          fillColor: pin.kind === "start" ? "#ffffff" : pin.kind === "end" ? accent : "#888",
          fillOpacity: 1,
          weight: 3,
        }).addTo(map);
        marker.bindTooltip(pin.label, { direction: "top", offset: [0, -8] });
        marker.on("click", () => marker.openTooltip());
      }
      map.fitBounds(line.getBounds(), { padding: [24, 24] });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [route, pins]);

  return (
    <div className="space-y-2">
      <div ref={el} className="h-72 w-full bg-muted sm:h-96" role="img" aria-label={`Route from ${formatClock(route[0].t)} to ${formatClock(route.at(-1)!.t)}, ${pins.length} pins`} />
      <p className="text-xs text-muted-foreground">Hover or tap a pin for the start, each stop and the end.</p>
    </div>
  );
}
