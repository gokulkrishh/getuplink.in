"use client";

import { Map, MapControls, MapMarker, MapPopup, MarkerContent, useMap } from "@/components/ui/map";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Zap } from "lucide-react";
import { Component, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { googleMapsUrl } from "@/lib/charge-names";
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
      <p className="flex h-full items-center justify-center rounded-lg bg-muted dark:bg-card p-4 text-center text-sm text-muted-foreground">This browser can&apos;t show the map.</p>
    ) : (
      this.props.children
    );
  }
}

export type MapPoint = { lat: number; lng: number; t: number };
// size: a diameter in px, for pins drawn to scale (a charge's kWh, a place's visits). A charge is a green
// lightning-bolt badge, so it reads as a charger at a glance. note: an extra line for the pin's tooltip.
// name: where it is, shown beside the pin when there's room (see LabelPlacer).
export type MapPin = MapPoint & { kind: "start" | "stop" | "end" | "place" | "charge"; label: string; size?: number; note?: string; name?: string };
// A leg of a trip, for a chip at its middle: its start and end, and a line saying what it was.
export type MapLeg = { start: number; end: number; note: string };
// extra: a control beside the value, such as "Name this place" by the trip's start.
export type MapFact = { label: string; value: string; extra?: ReactNode };

export const NEAR_M = 60; // pins closer than this share one marker (a round trip's start and end)
// A longer gap between route points starts a new line, so no jump is drawn: between legs and trips on a
// journey; between drives on a map of everywhere visited, whose points are sparser.
const GAP_MS = 4 * 60_000;
const VISITED_GAP_MS = 20 * 60_000;
const SPEED_WITHIN_MS = 30_000;

export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

// MapLibre paints with real colours, not CSS variables: the theme's route colour and background as they are now.
function useThemeColors() {
  const [colors, setColors] = useState({ route: "#1a5fd0", background: "#ffffff" });
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      setColors({
        route: style.getPropertyValue("--map-route").trim() || "#1a5fd0",
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

// "#1a5fd0" part way to the background, for the faint end of the route: solid, so the roads under it
// don't show through and muddy it on the dark map.
function mix(hex: string, toward: string, amount: number) {
  const rgb = (h: string) => {
    const m = /^#([0-9a-f]{6})$/i.exec(h);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  };
  const [a, b] = [rgb(hex), rgb(toward)];
  if (!a || !b) return hex;
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * amount)).join(", ")})`;
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

// The route as lines over a halo in the page's background, so they stand clear of the basemap's roads: on
// a journey, faint at the start and full colour at the end, with arrows the way the car went; for
// everywhere visited, a plain thinner line. Hovering (or tapping) the route picks the nearest reading.
function RouteLines({ parts, journey, colors, onHover }: { parts: MapPoint[][]; journey: boolean; colors: { route: string; background: string }; onHover: (p: MapPoint | null) => void }) {
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
    map.addLayer({ id: casing, type: "line", source, layout: round, paint: { "line-color": colors.background, "line-width": journey ? 10 : 7 } });
    map.addLayer({
      id: line,
      type: "line",
      source,
      layout: round,
      paint: journey
        ? { "line-width": 5, "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, mix(colors.route, colors.background, 0.5), 1, colors.route] }
        : { "line-width": 3.5, "line-color": colors.route },
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
  }, [isLoaded, map, data, journey, colors.route, colors.background]);
  return null;
}

type Bounds = [[number, number], [number, number]];

// Everything in view, with room for the pins, their labels, the map's buttons and the attribution.
function fitAll(map: MapLibreMap, bounds: Bounds, pad: number, duration = 0) {
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  if (!w || !h) return;
  const side = Math.min(pad, w / 4);
  const padding = { top: Math.min(pad + 8, h / 4), bottom: Math.min(pad + 8, h / 4), left: side, right: Math.min(side + 40, w / 3) };
  map.fitBounds(bounds, { padding, maxZoom: 15, duration });
}

// The zoom buttons, and one that brings the map back to everything after zooming or moving it.
function Controls({ bounds, pad }: { bounds: Bounds; pad: number }) {
  const { map } = useMap();
  return <MapControls position="top-right" onReset={() => map && fitAll(map, bounds, pad, 300)} />;
}

// Fits everything (fitAll) on load, and again whenever the box changes size (a phone turned) or the pins
// change (another period picked).
function FitView({ bounds, pad }: { bounds: Bounds; pad: number }) {
  const { map, isLoaded } = useMap();
  const key = bounds.flat().join(",");
  useEffect(() => {
    if (!isLoaded || !map) return;
    // The credit stays as a small (i) button, and in full under the map.
    map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    const fit = () => fitAll(map, bounds, pad);
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

// The open tip: which marker, where, what it says, and whether a click or tap holds it open. link: a
// pin's tips offer the spot in Google Maps; a leg's chip has no spot of its own.
type Tip = { key: string; lat: number; lng: number; lines: string[]; link: boolean; held: boolean };

const TIP_LINGER_MS = 250; // time to move the pointer from a pin into its tip

// One tip at a time. On a mouse, hovering a pin opens it, and it stays while the pointer is on the pin or
// the tip, so its link can be clicked. A click or tap holds it open; a click elsewhere or Escape closes it.
function PinTip({ tip, onEnter, onLeave, onClose }: { tip: Tip; onEnter: () => void; onLeave: () => void; onClose: () => void }) {
  const { map } = useMap();
  useEffect(() => {
    if (!map) return;
    const click = (e: { originalEvent: MouseEvent }) => {
      if ((e.originalEvent.target as Element | null)?.closest?.(".maplibregl-marker, .maplibregl-popup")) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    map.on("click", click);
    document.addEventListener("keydown", key);
    return () => {
      map.off("click", click);
      document.removeEventListener("keydown", key);
    };
  }, [map, onClose]);
  // Native listeners: React's enter and leave events don't cross from a marker's portal into the popup's.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [onEnter, onLeave]);
  return (
    <MapPopup longitude={tip.lng} latitude={tip.lat} closeOnClick={false} focusAfterOpen={false} offset={18} className="max-w-none rounded-none border-0 bg-transparent p-0 shadow-none">
      <div ref={body} className="block max-w-64 rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground shadow-md tabular-nums">
        <span className="block font-medium">{tip.lines[0]}</span>
        {tip.lines.slice(1).map((l, i) => (
          // Two pins at one spot can say the same thing, so the text alone isn't a key.
          <span key={`${i}-${l}`} className="block text-muted-foreground">
            {l}
          </span>
        ))}
        {tip.link && (
          <a
            href={googleMapsUrl(tip)}
            target="_blank"
            rel="noopener"
            className="-mx-1 mt-1 inline-block px-1 py-1 font-medium text-foreground underline decoration-muted-foreground/60 underline-offset-4 transition-colors duration-150 hover:text-chart-accent"
          >
            Open in Google Maps
          </a>
        )}
      </div>
    </MapPopup>
  );
}

type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
export type LabelSide = "right" | "left";
type LabelItem = { key: string; lat: number; lng: number; r: number; text?: string; rank: number };
const LABEL_MAX = 176; // px, the chip's widest; a longer name ends in an ellipsis
const LABEL_H = 22;
const LABEL_GAP = 4;

// Which named pins get their name beside them, and on which side: biggest pins first, each name on the
// right, else the left, and only where it overlaps no other name, pin or the zoom buttons and stays inside
// the map. Placed again after every move and zoom, so zooming in shows the names that didn't fit.
function LabelPlacer({ items, onPlace }: { items: LabelItem[]; onPlace: (sides: ReadonlyMap<string, LabelSide>) => void }) {
  const { map, isLoaded } = useMap();
  const key = items.map((i) => `${i.key}:${i.text ?? ""}`).join("|");
  useEffect(() => {
    if (!isLoaded || !map || !items.some((i) => i.text)) return;
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) ctx.font = `500 11px ${getComputedStyle(document.body).fontFamily}`;
    const width = (text: string) => Math.min(LABEL_MAX, Math.ceil(ctx?.measureText(text).width ?? text.length * 6.5) + 14);
    const place = () => {
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      const at = new globalThis.Map(items.map((i) => [i.key, map.project([i.lng, i.lat])]));
      const pins = items.map((i) => {
        const p = at.get(i.key)!;
        return { key: i.key, box: { x0: p.x - i.r, y0: p.y - i.r, x1: p.x + i.r, y1: p.y + i.r } };
      });
      const placed: Box[] = [{ x0: w - 48, y0: 0, x1: w, y1: 84 }];
      const sides = new globalThis.Map<string, LabelSide>();
      const named: { text: string; x: number; y: number }[] = [];
      for (const i of [...items].filter((i) => i.text).sort((a, b) => b.rank - a.rank)) {
        const p = at.get(i.key)!;
        // Charges at one spot (home, most nights) share one name.
        if (named.some((n) => n.text === i.text && Math.hypot(n.x - p.x, n.y - p.y) < 48)) continue;
        named.push({ text: i.text!, x: p.x, y: p.y });
        const wide = width(i.text!);
        const options: [LabelSide, number][] = [
          ["right", p.x + i.r + LABEL_GAP],
          ["left", p.x - i.r - LABEL_GAP - wide],
        ];
        for (const [side, x0] of options) {
          const box = { x0, x1: x0 + wide, y0: p.y - LABEL_H / 2, y1: p.y + LABEL_H / 2 };
          if (box.x0 < 4 || box.x1 > w - 4 || box.y0 < 4 || box.y1 > h - 4) continue;
          if (placed.some((b) => overlaps(b, box)) || pins.some((o) => o.key !== i.key && overlaps(o.box, box))) continue;
          placed.push(box);
          sides.set(i.key, side);
          break;
        }
      }
      onPlace(sides);
    };
    place();
    map.on("moveend", place);
    map.on("resize", place);
    return () => {
      map.off("moveend", place);
      map.off("resize", place);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map, key]);
  return null;
}

const BADGE = "flex items-center justify-center rounded-full border-2 font-mono font-semibold leading-none shadow-md";
// Pins wear a white ring in both themes: a ring in the page's background vanishes on the dark basemap.
const RING = "border-white";

// A start (A), an end (B), or both at one spot (A B): solid badges in the route's colour with letters, so
// they can't be mixed up, and no text pills to collide on a phone. Stops are numbered, charging stops
// carry a bolt.
function JourneyBadge({ kinds, stop }: { kinds: MapPin["kind"][]; stop: number | null }) {
  if (kinds.includes("charge")) {
    return (
      <span className={cn(BADGE, RING, "size-6 bg-charge text-white")}>
        <Zap className="size-3 fill-current" aria-hidden="true" />
      </span>
    );
  }
  const letters = [kinds.includes("start") && "A", kinds.includes("end") && "B"].filter(Boolean).join(" ");
  if (letters) {
    return (
      <span className={cn(BADGE, "h-6 min-w-6 px-1.5 text-xs", kinds.includes("start") && !kinds.includes("end") ? "border-map-route bg-background text-map-route" : cn(RING, "bg-map-route text-white"))}>
        {letters}
      </span>
    );
  }
  return <span className={cn(BADGE, RING, "size-5 bg-foreground text-[10px] text-background")}>{stop ?? ""}</span>;
}

type Group = { pins: MapPin[]; lat: number; lng: number; key: string };

// A key for each group that is its own, though two pins can share a kind, a time and a latitude (stops at one
// place, a place visited twice): the second one is numbered.
function keyed(groups: Omit<Group, "key">[]): Group[] {
  const seen = new globalThis.Map<string, number>();
  return groups.map((g) => {
    const base = `${g.pins[0].kind}-${g.pins[0].t}-${g.pins[0].lat}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...g, key: n ? `${base}-${n}` : base };
  });
}

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
  short,
}: {
  route?: MapPoint[];
  pins: MapPin[];
  label?: string;
  speed?: { t: number; v: number }[];
  legs?: MapLeg[];
  below?: ReactNode;
  legend?: string;
  // Half the usual height, for a map that only shows where.
  short?: boolean;
}) {
  const colors = useThemeColors();
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const journey = pins.some((p) => p.kind === "start" || p.kind === "end");
  const parts = useMemo(() => segments(route, journey ? GAP_MS : VISITED_GAP_MS), [route, journey]);
  // One journey (a drive or a trip) has one start; a day can have several.
  const single = pins.filter((p) => p.kind === "start").length <= 1;

  // Pins at one spot share a marker, so a round trip shows "A B" instead of two badges on top of each other.
  const groups = useMemo(() => {
    if (!journey) return keyed(pins.map((p) => ({ pins: [p], lat: p.lat, lng: p.lng })));
    const out: Omit<Group, "key">[] = [];
    for (const p of pins) {
      const near = out.find((g) => metres(g, p) < NEAR_M);
      if (near) near.pins.push(p);
      else out.push({ pins: [p], lat: p.lat, lng: p.lng });
    }
    return keyed(out);
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

  // The one open tip; a hover tip closes a moment after the pointer leaves both the pin and the tip.
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const stay = useCallback(() => window.clearTimeout(timer.current), []);
  const leave = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTip((t) => (t && !t.held ? null : t)), TIP_LINGER_MS);
  }, []);
  const closeTip = useCallback(() => {
    window.clearTimeout(timer.current);
    setTip(null);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // A marker's handlers: hover shows its tip, a click or tap holds it (on touch the hover comes first).
  const tipOn = (next: Omit<Tip, "held">) => ({
    onMouseEnter: () => {
      stay();
      setTip((t) => ({ ...next, held: t?.key === next.key && t.held }));
    },
    onMouseLeave: leave,
    onClick: () => {
      stay();
      setTip({ ...next, held: true });
    },
  });

  // Names beside the pins that have one, where they fit.
  const labelItems = useMemo(
    () =>
      groups.map((g) => {
        const size = journey ? 24 : (g.pins[0].size ?? 16);
        return { key: g.key, lat: g.lat, lng: g.lng, r: size / 2, text: g.pins.find((p) => p.name)?.name, rank: size * 1e13 + g.pins[0].t };
      }),
    [groups, journey],
  );
  const [sides, setSides] = useState<ReadonlyMap<string, LabelSide>>(new globalThis.Map());

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
          className={cn("relative w-full overflow-hidden rounded-lg border", short ? "h-36 sm:h-48" : "h-72 sm:h-96")}
          role="group"
          aria-label={label ?? (route.length ? `Route from ${formatClock(route[0].t)} to ${formatClock(route.at(-1)!.t)}, ${pins.length} pins` : `${pins.length} places`)}
        >
          <MapBoundary>
            <Map bounds={bounds} fitBoundsOptions={{ padding: 48, maxZoom: 15 }} cooperativeGestures>
              <Controls bounds={bounds} pad={biggest / 2 + 28} />
              <FitView bounds={bounds} pad={biggest / 2 + 28} />
              {parts.length > 0 && <RouteLines parts={parts} journey={journey} colors={colors} onHover={onHover} />}
              {legChips.map(({ at, n, leg }) => (
                <MapMarker
                  key={`leg-${n}`}
                  longitude={at.lng}
                  latitude={at.lat}
                  {...tipOn({ key: `leg-${n}`, lat: at.lat, lng: at.lng, lines: [`Leg ${n}, ${formatClock(leg.start)} to ${formatClock(leg.end)}`, leg.note], link: false })}
                >
                  <MarkerContent>
                    <span className="block rounded-md border bg-background px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground shadow-sm">Leg {n}</span>
                  </MarkerContent>
                </MapMarker>
              ))}
              {groups.map((g) => {
                const lead = g.pins[0];
                const size = lead.size ?? (lead.kind === "stop" ? 12 : 16);
                const stop = journey && g.pins.some((p) => p.kind === "stop") && single ? ++stopNumber : null;
                const key = g.key;
                const name = g.pins.find((p) => p.name)?.name;
                const side = sides.get(key);
                return (
                  <MapMarker key={key} longitude={g.lng} latitude={g.lat} {...tipOn({ key, lat: g.lat, lng: g.lng, lines: g.pins.flatMap((p) => pinLines(p, journey)), link: true })}>
                    <MarkerContent>
                      {journey ? (
                        <JourneyBadge kinds={g.pins.map((p) => p.kind)} stop={stop} />
                      ) : lead.kind === "charge" ? (
                        <span className={cn("flex items-center justify-center rounded-full border-2 bg-charge text-white shadow-md", RING)} style={{ width: size, height: size }}>
                          <Zap className="fill-current" style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden="true" />
                        </span>
                      ) : (
                        // A small place still gets a finger-sized target around it.
                        <span className="block p-2">
                          <span className={cn("block rounded-full border-2 bg-map-route shadow-md", RING)} style={{ width: size, height: size }} />
                        </span>
                      )}
                      {name && side && (
                        <span
                          className={cn(
                            "absolute top-1/2 block max-w-44 -translate-y-1/2 truncate rounded-md border bg-background/90 px-1.5 py-0.5 text-xs leading-4 font-medium whitespace-nowrap text-foreground shadow-sm",
                            side === "right" ? "left-full ml-1" : "right-full mr-1",
                          )}
                        >
                          {name}
                        </span>
                      )}
                    </MarkerContent>
                  </MapMarker>
                );
              })}
              <LabelPlacer items={labelItems} onPlace={setSides} />
              {tip && <PinTip key={tip.key} tip={tip} onEnter={stay} onLeave={leave} onClose={closeTip} />}
              {hovered && (
                <MapMarker longitude={hovered.lng} latitude={hovered.lat} className="pointer-events-none">
                  <MarkerContent className="pointer-events-none">
                    <span className="block size-3 rounded-full border-2 border-background bg-foreground shadow" />
                    <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-md border bg-background px-2.5 py-1.5 text-xs whitespace-nowrap text-foreground shadow-md tabular-nums">
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
              <span className={cn(BADGE, "size-4 border-map-route bg-background text-[9px] text-map-route")}>A</span>
            </Swatch>
            <Swatch text={end ? end.label.replace(" · ", " ") : "End of a trip"}>
              <span className={cn(BADGE, RING, "size-4 bg-map-route text-[9px] text-white")}>B</span>
            </Swatch>
            {kinds.has("stop") && (
              <Swatch text="Stop">
                <span className={cn(BADGE, RING, "size-4 bg-foreground text-[9px] text-background")}>{single ? 1 : ""}</span>
              </Swatch>
            )}
            {kinds.has("charge") && (
              <Swatch text="Charging stop">
                <span className={cn(BADGE, RING, "size-4 bg-charge text-white")}>
                  <Zap className="size-2.5 fill-current" aria-hidden="true" />
                </span>
              </Swatch>
            )}
            {parts.length > 0 && (
              <Swatch text="Route, fainter at the start">
                <span className="block h-1.5 w-8 rounded-full bg-linear-to-r from-map-route/50 to-map-route" aria-hidden="true" />
              </Swatch>
            )}
          </>
        ) : (
          <>
            {kinds.has("charge") && (
              <Swatch text={legend ?? "Charge"}>
                <span className={cn(BADGE, RING, "size-4 bg-charge text-white")}>
                  <Zap className="size-2.5 fill-current" aria-hidden="true" />
                </span>
              </Swatch>
            )}
            {kinds.has("place") && (
              <Swatch text={legend ?? "Place"}>
                <span className={cn("block size-3.5 rounded-full border-2 bg-map-route shadow-md", RING)} aria-hidden="true" />
              </Swatch>
            )}
            {parts.length > 0 && (
              <Swatch text="Where the car drove">
                <span className="block h-1 w-8 rounded-full bg-map-route" aria-hidden="true" />
              </Swatch>
            )}
          </>
        )}
      </ul>
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
          <dd className="text-sm text-balance tabular-nums">
            {f.extra ? (
              <span className="flex flex-wrap items-center gap-x-1.5">
                <span>{f.value}</span>
                {f.extra}
              </span>
            ) : (
              f.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
