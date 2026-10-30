import { cn } from "@/lib/utils";
import { ChartCard } from "@/components/chart-card";
import { EfficiencyViews } from "@/components/stats/efficiency-views";
import { TripMap } from "@/components/stats/trip-map";
import { DECIMALS, formatDuration, formatKm, formatNumber, formatShortDate } from "@/lib/format";
import type { Band } from "@/lib/driving-insights";
import type { DrivingExtras, NamedPlace } from "@/lib/server/driving-extra";
import { Measure } from "@/components/measure";
import { type PlaceRow, PlaceRows } from "@/components/stats/place-rows";
import { type LoadMore, paged } from "@/lib/list";
import { CAR_FLAGS, mapName, nameAction, shownName, withCarFlag, googleMapsUrl } from "@/lib/charge-names";

// The map's label: the name with the car's flag ("Koramangala, Bengaluru · Home"). Never Google's name:
// `name` falls back to the area for a Google-tagged place.
const pinName = (p: NamedPlace, k: number) => withCarFlag(mapName(p), p.tag) ?? `Place ${k + 1}`;

// A place as the table draws it: a Google place's name (credited) when the owner picked one, else the best
// name; the car's flag as a small tag beside a real name, or alone when nothing else names the spot.
// `canName`: false for a guest, who never gets "Name this place".
export function placeRows(places: NamedPlace[], canName = true): PlaceRow[] {
  return places.map((p, k) => {
    const shown = shownName(p);
    return {
      key: `${p.lat},${p.lng}`,
      serial: k + 1,
      href: googleMapsUrl(p),
      name: shown?.text ?? (p.tag ? CAR_FLAGS[p.tag] : `Place ${k + 1}`),
      google: !!shown?.google,
      flag: shown && p.tag ? CAR_FLAGS[p.tag] : null,
      action: canName ? nameAction(p) : null,
      target: p.target,
      visits: p.visits,
      parked: formatDuration(p.parkedMs / 1000),
      lastVisit: formatShortDate(p.lastVisit),
    };
  });
}

// The page's period switch names what each insight covers; `note` is the caveat under it when the period
// reaches back past the readings kept ("Covers only 27 Sept to 26 Oct").
type Covers = { note?: string };

// How long you spend at each speed, after TeslaMate's speed histogram.
export function SpeedBands({ bins, note }: { bins: DrivingExtras["speed"] } & Covers) {
  if (bins.length === 0) return null;
  // Each band's share is rounded on its own, so the shown shares can add up to a point off 100%.
  const shares = bins.map((b) => b.share * 100);
  const top = Math.max(...shares);
  // Five shares of one whole read best as a list: each band, a bar for its share, and the share. The band
  // you spend most time in is drawn in the accent colour.
  return (
    <ChartCard title="Time at each speed" description="Share of driving time at each speed." caption={note}>
      <ul className="space-y-2.5 text-sm tabular-nums" aria-label="Share of driving time by speed">
        {bins.map((b, k) => (
          <li key={b.from} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3">
            <span className="text-muted-foreground">{b.to === null ? `${b.from} km/h and up` : `${b.from} to ${b.to} km/h`}</span>
            <span className="h-2 bg-muted" aria-hidden="true">
              <span className={cn("block h-full", shares[k] === top ? "bg-chart-accent" : "bg-chart-accent/40")} style={{ width: `${top > 0 ? (shares[k] / top) * 100 : 0}%` }} />
            </span>
            <span className="text-right font-mono">{formatNumber(shares[k], DECIMALS.percent)}%</span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

// Energy used per km at different speeds, AC settings and weather, after TeslaMate's efficiency. Speed comes
// first: it is the one the owner can change.
export function EfficiencyBands({ byTemp, bySpeed, byAc = [], note }: { byTemp: Band[]; bySpeed: Band[]; byAc?: Band[] } & Covers) {
  if (byTemp.length === 0 && bySpeed.length === 0 && byAc.length === 0) return null;
  return (
    <ChartCard
      title="Efficiency"
      description="Energy used per kilometre, in Wh/km. Lower is better."
      caption={note}
    >
      <EfficiencyViews
        views={[
          { key: "speed", label: "Speed", bands: bySpeed },
          { key: "ac", label: "AC setting", bands: byAc },
          { key: "outside", label: "Outside", bands: byTemp },
        ]}
      />
    </ChartCard>
  );
}

// Where the car parks, after TeslaMate's locations: each spot by its best name (see spotName), with Home,
// Work and Favourite from the car's own settings beside it, with visits and time parked; then everywhere it went on a map.
export function Places({ places, visited, note, more, canName = true }: { places: NamedPlace[]; visited: DrivingExtras["visited"]; more: LoadMore<PlaceRow>; canName?: boolean } & Covers) {
  if (places.length === 0 && visited.length < 2) return null;
  const pins = places.map((p, k) => ({
    lat: p.lat,
    lng: p.lng,
    t: p.lastVisit,
    kind: "place" as const,
    size: 6 + Math.min(10, p.visits * 1.5),
    label: `${pinName(p, k)} · ${p.visits} ${p.visits === 1 ? "visit" : "visits"} · ${formatDuration(p.parkedMs / 1000)} parked`,
  }));
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Places</h2>
        <p className="text-sm text-muted-foreground">Where you went and parked.</p>
      </div>
      {(pins.length > 0 || visited.length >= 2) && <TripMap route={visited} pins={pins} label="Everywhere the car went, with where it parked" legend="A place it parked. Bigger pins had more visits." />}
      {places.length > 0 && <PlaceRows list={paged(placeRows(places, canName), 5)} load={more} />}
      {note && <p className="text-sm text-faint">{note}</p>}
      <p className="text-sm text-faint">Names you give come first, then OpenStreetMap&apos;s. Places named from Google Maps show their area on the map. Home, Work and Favourite are the ones set in your car.</p>
    </section>
  );
}
