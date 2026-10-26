"use client";

import { Map, MapControls, MapMarker, MarkerContent, MarkerPopup, MarkerTooltip, useMap } from "@/components/ui/map";
import { Zap } from "lucide-react";
import { Component, type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { formatClock, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// A device without WebGL2 can't draw MapLibre maps; the map says so instead of taking the page down.
class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="flex h-full items-center justify-center bg-muted dark:bg-card p-4 text-center text-sm text-muted-foreground">This browser can&apos;t show the map.</p>
    ) : (
      this.props.children
    );
  }
}

export type MapPoint = { lat: number; lng: number; t: number };
// size: a diameter in px, for pins drawn to scale (a charge's kWh, a place's visits). A charge is a
// lightning-bolt badge, so it reads as a charger at a glance. note: an extra line for the pin's tooltip.
export type MapPin = MapPoint & { kind: "start" | "stop" | "end" | "place" | "charge"; label: string; size?: number; note?: string };
// A leg of a trip, for a chip at its middle: its start and end, and a line saying what it was.
export type MapLeg = { start: number; end: number; note: string };
export type MapFact = { label: string; value: string };

const NEAR_M = 60; // pins closer than this share one marker (a round trip's start and end)
// A longer gap between route points starts a new line, so no jump is drawn: between legs and trips on a
// journey; between drives on a map of everywhere visited, whose points are sparser.
const GAP_MS = 4 * 60_000;
const VISITED_GAP_MS = 20 * 60_000;
const SPEED_WITHIN_MS = 30_000;

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

// MapLibre paints with real colours, not CSS variables: the theme's accent and background as they are now.
function useThemeColors() {
  const [colors, setColors] = useState({ accent: "#3f6fae", background: "#ffffff" });
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      setColors({
        accent: style.getPropertyValue("--chart-accent").trim() || "#3f6fae",
        background: style.getPropertyValue("--background").trim() || "#ffffff",
      });
    };
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
  return colors;
}

// "#3f6fae" at an opacity, for the faint end of the route.
function fade(hex: string, alpha: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// The route split where readings stop for a while: between legs, between trips, between days.
function segments(route: MapPoint[], gap: number): MapPoint[][] {
  const out: MapPoint[][] = [];
  for (const p of route) {
    const last = out.at(-1);
    if (last && p.t - last.at(-1)!.t <= gap) last.push(p);
    else out.push([p]);
  }
  return out.filter((s) => s.length >= 2);
}

// A chevron pointing east, drawn once per colour; MapLibre turns it along the line.
function arrowImage(color: string) {
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(9, 6);
  ctx.lineTo(15, 12);
  ctx.lineTo(9, 18);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

type Hovered = MapPoint & { speed: number | null };

// The route as lines: on a journey, faint at the start and full accent at the end, with arrows the way the
// car went; for everywhere visited, a plain thinner line. Hovering (or tapping) the route picks the
// nearest reading.
function RouteLines({ parts, journey, colors, onHover }: { parts: MapPoint[][]; journey: boolean; colors: { accent: string; background: string }; onHover: (p: MapPoint | null) => void }) {
  const { map, isLoaded } = useMap();
  const id = useId().replace(/[^a-z0-9]/gi, "");
  const source = `route-${id}`;
  const casing = `route-casing-${id}`;
  const line = `route-line-${id}`;
  const arrows = `route-arrows-${id}`;
  const hit = `route-hit-${id}`;
  const image = `route-arrow-${id}`;
  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: parts.map((s) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: s.map((p) => [p.lng, p.lat]) } })),
    }),
    [parts],
  );

  useEffect(() => {
    if (!isLoaded || !map) return;
    map.addSource(source, { type: "geojson", data, lineMetrics: true });
    const round = { "line-cap": "round", "line-join": "round" } as const;
    map.addLayer({ id: casing, type: "line", source, layout: round, paint: { "line-color": colors.background, "line-width": journey ? 9 : 6, "line-opacity": 0.85 } });
    map.addLayer({
      id: line,
      type: "line",
      source,
      layout: round,
      paint: journey
        ? { "line-width": 5, "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, fade(colors.accent, 0.4), 1, colors.accent] }
        : { "line-width": 3, "line-color": colors.accent, "line-opacity": 0.8 },
    });
    if (journey) {
      map.addImage(image, arrowImage(colors.background), { pixelRatio: 2 });
      map.addLayer({
        id: arrows,
        type: "symbol",
        source,
        layout: { "symbol-placement": "line", "symbol-spacing": 80, "icon-image": image, "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-rotation-alignment": "map" },
      });
    }
    map.addLayer({ id: hit, type: "line", source, layout: round, paint: { "line-color": "#000", "line-width": 22, "line-opacity": 0.001 } });

    const points = parts.flat();
    const nearest = (e: { point: { x: number; y: number } }) => {
      let best: MapPoint | null = null;
      let bestD = Infinity;
      for (const p of points) {
        const q = map.project([p.lng, p.lat]);
        const d = (q.x - e.point.x) ** 2 + (q.y - e.point.y) ** 2;
        if (d < bestD) [best, bestD] = [p, d];
      }
      return best;
    };
    const move = (e: { point: { x: number; y: number } }) => {
      map.getCanvas().style.cursor = "pointer";
      onHover(nearest(e));
    };
    const leave = () => {
      map.getCanvas().style.cursor = "";
      onHover(null);
    };
    // A tap off the route closes its tip; a tap on it shows one. A tap on a pin is the pin's alone.
    const click = (e: { point: { x: number; y: number }; originalEvent: MouseEvent }) => {
      if ((e.originalEvent.target as Element | null)?.closest?.(".maplibregl-marker")) return onHover(null);
      const on = map.queryRenderedFeatures([e.point.x, e.point.y], { layers: [hit] }).length > 0;
      onHover(on ? nearest(e) : null);
    };
    map.on("mousemove", hit, move);
    map.on("mouseleave", hit, leave);
    map.on("click", click);
    map.on("movestart", leave);
    return () => {
      map.off("mousemove", hit, move);
      map.off("mouseleave", hit, leave);
      map.off("click", click);
      map.off("movestart", leave);
      try {
        for (const layer of [hit, arrows, line, casing]) if (map.getLayer(layer)) map.removeLayer(layer);
        if (map.hasImage(image)) map.removeImage(image);
        if (map.getSource(source)) map.removeSource(source);
      } catch {
        // the style may be mid-reload
      }
    };
    // The layers rebuild with the style (a theme switch) and when the colours or data change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map, data, journey, colors.accent, colors.background]);
  return null;
}

// Fits everything with room for the pins, their labels, the zoom buttons and the attribution, again
// whenever the box changes size (a phone turned) or the pins change (another period picked).
function FitView({ bounds, pad }: { bounds: [[number, number], [number, number]]; pad: number }) {
  const { map, isLoaded } = useMap();
  const key = bounds.flat().join(",");
  useEffect(() => {
    if (!isLoaded || !map) return;
    // The credit stays as a small (i) button, and in full under the map.
    map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    const fit = () => {
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      if (!w || !h) return;
      const side = Math.min(pad, w / 4);
      const padding = { top: Math.min(pad + 8, h / 4), bottom: Math.min(pad + 8, h / 4), left: side, right: Math.min(side + 40, w / 3) };
      map.fitBounds(bounds, { padding, maxZoom: 15, duration: 0 });
    };
    fit();
    let width = map.getContainer().clientWidth;
    const observer = new ResizeObserver(() => {
      const now = map.getContainer().clientWidth;
      if (now !== width) {
        width = now;
        fit();
      }
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map, key, pad]);
  return null;
}

// A marker's tip: hover on a mouse, tap on a touch screen, never both at once.
function PinTip({ lines }: { lines: string[] }) {
  const body = (
    <span className="block max-w-64 border bg-background px-2.5 py-1.5 text-xs text-foreground shadow-md tabular-nums">
      <span className="block font-medium">{lines[0]}</span>
      {lines.slice(1).map((l) => (
        <span key={l} className="block text-muted-foreground">
          {l}
        </span>
      ))}
    </span>
  );
  return (
    <>
      <MarkerTooltip className="rounded-none bg-transparent p-0 shadow-none [@media(hover:none)]:hidden">{body}</MarkerTooltip>
      <MarkerPopup className="rounded-none border-0 bg-transparent p-0 shadow-none [@media(hover:hover)]:hidden">{body}</MarkerPopup>
    </>
  );
}

const BADGE = "flex items-center justify-center rounded-full border-2 font-mono font-semibold leading-none shadow-md";

// A start (A), an end (B), or both at one spot (A B): solid accent badges with letters, so they can't be
// mixed up, and no text pills to collide on a phone. Stops are numbered, charging stops carry a bolt.
function JourneyBadge({ kinds, stop }: { kinds: MapPin["kind"][]; stop: number | null }) {
  if (kinds.includes("charge")) {
    return (
      <span className={cn(BADGE, "size-6 border-background bg-chart-accent text-white")}>
        <Zap className="size-3 fill-current" aria-hidden="true" />
      </span>
    );
  }
  const letters = [kinds.includes("start") && "A", kinds.includes("end") && "B"].filter(Boolean).join(" ");
  if (letters) {
    return (
      <span className={cn(BADGE, "h-6 min-w-6 px-1.5 text-[11px]", kinds.includes("start") && !kinds.includes("end") ? "border-chart-accent bg-background text-chart-accent" : "border-background bg-chart-accent text-white")}>
        {letters}
      </span>
    );
  }
  return <span className={cn(BADGE, "size-5 border-background bg-foreground text-[10px] text-background")}>{stop ?? ""}</span>;
}

type Group = { pins: MapPin[]; lat: number; lng: number };

// What a pin says in its tip: its kind and time, then whatever the page knows about it.
function pinLines(pin: MapPin, journey: boolean): string[] {
  if (!journey) return [pin.label, ...(pin.note ? [pin.note] : [])];
  const words = { start: "Start", end: "End", stop: "Stop", charge: "Charging stop", place: "Place" }[pin.kind];
  // The labels carry the trip's own times ("Start · 9:56 PM"; a stop's start, end and length); the pin's
  // t is only the reading nearest it.
  const head = pin.kind === "stop" || pin.kind === "charge" ? pin.label.replace(/^Stop \d+ · /, `${words}, `) : pin.label.replace(" · ", " ");
  return [head, ...(pin.note ? [pin.note] : [])];
}

function Swatch({ children, text }: { children: ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-1.5">
      {children}
      <span>{text}</span>
    </li>
  );
}

// A route as a line (a trip, a day, or everywhere visited), with pins: a trip's start, stops and end, or
// places such as chargers. mapcn (MapLibre) with CARTO's free vector basemaps, light or dark with the page.
// With a start or end pin it's a journey: A and B badges, the line fading in the way the car went, and
// the route tells its time and speed on hover. `below` sits right under the map (a trip's facts); `legend`
// explains pin sizes on a map of places.
export function TripMap({
  route = [],
  pins,
  label,
  speed = [],
  legs = [],
  below,
  legend,
}: {
  route?: MapPoint[];
  pins: MapPin[];
  label?: string;
  speed?: { t: number; v: number }[];
  legs?: MapLeg[];
  below?: ReactNode;
  legend?: string;
}) {
  const colors = useThemeColors();
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const journey = pins.some((p) => p.kind === "start" || p.kind === "end");
  const parts = useMemo(() => segments(route, journey ? GAP_MS : VISITED_GAP_MS), [route, journey]);
  // One journey (a drive or a trip) has one start; a day can have several.
  const single = pins.filter((p) => p.kind === "start").length <= 1;

  // Pins at one spot share a marker, so a round trip shows "A B" instead of two badges on top of each other.
  const groups = useMemo(() => {
    if (!journey) return pins.map((p) => ({ pins: [p], lat: p.lat, lng: p.lng }));
    const out: Group[] = [];
    for (const p of pins) {
      const near = out.find((g) => metres(g, p) < NEAR_M);
      if (near) near.pins.push(p);
      else out.push({ pins: [p], lat: p.lat, lng: p.lng });
    }
    return out;
  }, [pins, journey]);

  // A chip in the middle of each leg of a trip.
  const legChips = useMemo(
    () =>
      legs.length > 1
        ? legs.flatMap((leg, k) => {
            const mid = (leg.start + leg.end) / 2;
            const inLeg = route.filter((p) => p.t >= leg.start && p.t <= leg.end);
            const at = inLeg.reduce<MapPoint | null>((a, p) => (!a || Math.abs(p.t - mid) < Math.abs(a.t - mid) ? p : a), null);
            return at ? [{ at, n: k + 1, leg }] : [];
          })
        : [],
    [legs, route],
  );

  const all = [...route, ...pins];
  if (all.length === 0) return null;
  const lngs = all.map((p) => p.lng);
  const lats = all.map((p) => p.lat);
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
  const biggest = Math.max(24, ...pins.map((p) => p.size ?? 0));
  const multiDay = all.length > 0 && formatShortDate(Math.min(...all.map((p) => p.t))) !== formatShortDate(Math.max(...all.map((p) => p.t)));

  const onHover = (p: MapPoint | null) => {
    if (!p) return setHovered(null);
    const near = speed.reduce<{ t: number; v: number } | null>((a, s) => (!a || Math.abs(s.t - p.t) < Math.abs(a.t - p.t) ? s : a), null);
    setHovered({ ...p, speed: near && Math.abs(near.t - p.t) <= SPEED_WITHIN_MS ? near.v : null });
  };
  const legOf = (t: number) => (legs.length > 1 ? legs.findIndex((l) => t >= l.start - 2 * 60_000 && t <= l.end + 2 * 60_000) : -1);

  const kinds = new Set(pins.map((p) => p.kind));
  const start = single ? pins.find((p) => p.kind === "start") : undefined;
  const end = single ? pins.find((p) => p.kind === "end") : undefined;
  let stopNumber = 0;

  return (
    <div className="space-y-3">
      <div>
        <div
          className="relative h-72 w-full overflow-hidden border sm:h-96"
          role="img"
          aria-label={label ?? (route.length ? `Route from ${formatClock(route[0].t)} to ${formatClock(route.at(-1)!.t)}, ${pins.length} pins` : `${pins.length} places`)}
        >
          <MapBoundary>
            <Map bounds={bounds} fitBoundsOptions={{ padding: 48, maxZoom: 15 }} cooperativeGestures>
              <MapControls position="top-right" />
              <FitView bounds={bounds} pad={biggest / 2 + 28} />
              {parts.length > 0 && <RouteLines parts={parts} journey={journey} colors={colors} onHover={onHover} />}
              {legChips.map(({ at, n, leg }) => (
                <MapMarker key={`leg-${n}`} longitude={at.lng} latitude={at.lat}>
                  <MarkerContent>
                    <span className="block border bg-background px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground shadow-sm">Leg {n}</span>
                  </MarkerContent>
                  <PinTip lines={[`Leg ${n}, ${formatClock(leg.start)} to ${formatClock(leg.end)}`, leg.note]} />
                </MapMarker>
              ))}
              {groups.map((g) => {
                const lead = g.pins[0];
                const size = lead.size ?? (lead.kind === "stop" ? 12 : 16);
                const stop = journey && g.pins.some((p) => p.kind === "stop") && single ? ++stopNumber : null;
                return (
                  <MapMarker key={`${lead.kind}-${lead.t}-${lead.lat}`} longitude={g.lng} latitude={g.lat}>
                    <MarkerContent>
                      {journey ? (
                        <JourneyBadge kinds={g.pins.map((p) => p.kind)} stop={stop} />
                      ) : lead.kind === "charge" ? (
                        <span className="flex items-center justify-center rounded-full border-2 border-background bg-chart-accent text-white shadow-md" style={{ width: size, height: size }}>
                          <Zap className="fill-current" style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden="true" />
                        </span>
                      ) : (
                        <span className="block rounded-full border-2 border-background bg-chart-accent/75 shadow-md" style={{ width: size, height: size }} />
                      )}
                    </MarkerContent>
                    <PinTip lines={g.pins.flatMap((p) => pinLines(p, journey))} />
                  </MapMarker>
                );
              })}
              {hovered && (
                <MapMarker longitude={hovered.lng} latitude={hovered.lat} className="pointer-events-none">
                  <MarkerContent className="pointer-events-none">
                    <span className="block size-3 rounded-full border-2 border-background bg-foreground shadow" />
                    <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 border bg-background px-2.5 py-1.5 text-xs whitespace-nowrap text-foreground shadow-md tabular-nums">
                      <span className="block font-medium">{multiDay ? `${formatShortDate(hovered.t)}, ${formatClock(hovered.t)}` : formatClock(hovered.t)}</span>
                      {hovered.speed !== null && <span className="block text-muted-foreground">{Math.round(hovered.speed)} km/h</span>}
                      {legOf(hovered.t) >= 0 && <span className="block text-muted-foreground">Leg {legOf(hovered.t) + 1}</span>}
                    </span>
                  </MarkerContent>
                </MapMarker>
              )}
            </Map>
          </MapBoundary>
        </div>
        {below}
      </div>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground tabular-nums">
        {journey ? (
          <>
            <Swatch text={start ? start.label.replace(" · ", " ") : "Start of a trip"}>
              <span className={cn(BADGE, "size-4 border-chart-accent bg-background text-[9px] text-chart-accent")}>A</span>
            </Swatch>
            <Swatch text={end ? end.label.replace(" · ", " ") : "End of a trip"}>
              <span className={cn(BADGE, "size-4 border-background bg-chart-accent text-[9px] text-white")}>B</span>
            </Swatch>
            {kinds.has("stop") && (
              <Swatch text="Stop">
                <span className={cn(BADGE, "size-4 border-background bg-foreground text-[9px] text-background")}>{single ? 1 : ""}</span>
              </Swatch>
            )}
            {kinds.has("charge") && (
              <Swatch text="Charging stop">
                <span className={cn(BADGE, "size-4 border-background bg-chart-accent text-white")}>
                  <Zap className="size-2.5 fill-current" aria-hidden="true" />
                </span>
              </Swatch>
            )}
            {parts.length > 0 && (
              <Swatch text="Route, darker towards the end">
                <span className="block h-1.5 w-8 rounded-full bg-linear-to-r from-chart-accent/40 to-chart-accent" aria-hidden="true" />
              </Swatch>
            )}
          </>
        ) : (
          <>
            {kinds.has("charge") && (
              <Swatch text={legend ?? "Charge"}>
                <span className="flex size-4 items-center justify-center rounded-full bg-chart-accent text-white">
                  <Zap className="size-2.5 fill-current" aria-hidden="true" />
                </span>
              </Swatch>
            )}
            {kinds.has("place") && (
              <Swatch text={legend ?? "Place"}>
                <span className="block size-3 rounded-full bg-chart-accent/75" aria-hidden="true" />
              </Swatch>
            )}
            {parts.length > 0 && (
              <Swatch text="Where the car drove">
                <span className="block h-1 w-8 rounded-full bg-chart-accent/80" aria-hidden="true" />
              </Swatch>
            )}
          </>
        )}
      </ul>
      <p className="text-xs text-muted-foreground">
        {parts.length > 0 ? "Hover or tap a pin or the route for details." : "Hover or tap a pin for its details."} Map data © OpenStreetMap contributors, © CARTO.
      </p>
    </div>
  );
}

const FACT_COLUMNS = ["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4"];
const FACT_SPAN = ["", "", "sm:col-span-2", "sm:col-span-3"];

// A few facts right under a map, joined to its frame: where from and to, how far, how long, the battery.
export function MapFacts({ facts }: { facts: MapFact[] }) {
  if (facts.length === 0) return null;
  const columns = facts.length <= 4 ? facts.length : 3;
  const left = facts.length % columns;
  return (
    // Two a row on a phone, up to four wider; the last cell of a short row stretches, so no row ends in
    // an empty cell. A long place name wraps.
    <dl className={cn("grid grid-cols-2 gap-px border-x border-b bg-border dark:border-transparent dark:bg-background", FACT_COLUMNS[columns])}>
      {facts.map((f, k) => (
        <div
          key={f.label}
          className={cn(
            "min-w-0 bg-background px-3 py-2 dark:bg-card",
            k === facts.length - 1 && facts.length % 2 === 1 && "max-sm:col-span-2",
            k === facts.length - 1 && left > 0 && FACT_SPAN[columns - left + 1],
          )}
        >
          <dt className="text-xs text-muted-foreground">{f.label}</dt>
          <dd className="text-sm text-balance tabular-nums">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
