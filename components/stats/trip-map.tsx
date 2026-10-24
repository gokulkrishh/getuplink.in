"use client";

import { Map, MapControls, MapMarker, MapRoute, MarkerContent, MarkerPopup, MarkerTooltip } from "@/components/ui/map";
import { Zap } from "lucide-react";
import { Component, type ReactNode, useEffect, useState } from "react";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

// A device without WebGL2 can't draw MapLibre maps; the map says so instead of taking the page down.
class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="flex h-full items-center justify-center bg-muted p-4 text-center text-sm text-muted-foreground">This browser can&apos;t show the map.</p>
    ) : (
      this.props.children
    );
  }
}

export type MapPoint = { lat: number; lng: number; t: number };
// size: a diameter in px, for pins drawn to scale (a charge's kWh, a place's visits). A charge is a
// lightning-bolt badge, so it reads as a charger at a glance.
export type MapPin = MapPoint & { kind: "start" | "stop" | "end" | "place" | "charge"; label: string; size?: number };

// A route as a line (a trip, or everywhere visited), with pins: a trip's start, stops and end, or places
// such as chargers. mapcn (MapLibre) with CARTO's free vector basemaps, light or dark with the page. Hover
// a pin for its label, or tap it on a phone.
export function TripMap({ route = [], pins, label }: { route?: MapPoint[]; pins: MapPin[]; label?: string }) {
  // MapLibre paints with real colours, not CSS variables: the accent as the page's theme has it.
  const [accent, setAccent] = useState("#3f6fae");
  useEffect(() => {
    const read = () => setAccent(getComputedStyle(document.documentElement).getPropertyValue("--chart-accent").trim() || "#3f6fae");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", read);
    };
  }, []);
  const all = [...route, ...pins];
  if (all.length === 0) return null;
  const lngs = all.map((p) => p.lng);
  const lats = all.map((p) => p.lat);
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
  return (
    <div className="space-y-2">
      <div
        className="h-72 w-full overflow-hidden border sm:h-96"
        role="img"
        aria-label={label ?? (route.length ? `Route from ${formatClock(route[0].t)} to ${formatClock(route.at(-1)!.t)}, ${pins.length} pins` : `${pins.length} places`)}
      >
        <MapBoundary>
        <Map bounds={bounds} fitBoundsOptions={{ padding: 40, maxZoom: 15 }} cooperativeGestures>
          <MapControls />
          {route.length >= 2 && <MapRoute coordinates={route.map((p) => [p.lng, p.lat] as [number, number])} color={accent} width={4} opacity={0.9} />}
          {pins.map((pin) => {
            const size = pin.size ?? (pin.kind === "stop" ? 12 : 16);
            return (
              <MapMarker key={`${pin.kind}-${pin.t}-${pin.lat}`} longitude={pin.lng} latitude={pin.lat}>
                <MarkerContent>
                  {pin.kind === "charge" ? (
                    <span
                      className="flex items-center justify-center rounded-full border-2 border-background bg-chart-accent text-white shadow-md"
                      style={{ width: size, height: size }}
                    >
                      <Zap className="fill-current" style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden="true" />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "block rounded-full border-2 shadow",
                        pin.kind === "start" && "border-chart-accent bg-background",
                        pin.kind === "end" && "border-background bg-chart-accent",
                        pin.kind === "stop" && "border-background bg-muted-foreground",
                        pin.kind === "place" && "border-background bg-chart-accent/70",
                      )}
                      style={{ width: size, height: size }}
                    />
                  )}
                </MarkerContent>
                <MarkerTooltip>
                  <span className="block border bg-background px-2 py-1 text-xs whitespace-nowrap text-foreground tabular-nums">{pin.label}</span>
                </MarkerTooltip>
                <MarkerPopup>
                  <span className="block border bg-background px-2 py-1 text-xs whitespace-nowrap text-foreground tabular-nums">{pin.label}</span>
                </MarkerPopup>
              </MapMarker>
            );
          })}
        </Map>
        </MapBoundary>
      </div>
      <p className="text-xs text-muted-foreground">Hover or tap a pin for its details. Map data © OpenStreetMap contributors, © CARTO.</p>
    </div>
  );
}
