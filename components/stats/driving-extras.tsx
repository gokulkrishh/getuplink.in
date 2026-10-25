import { Bars } from "@/components/stats/bars";
import { TripMap } from "@/components/stats/trip-map";
import { formatDuration, formatShortDate } from "@/lib/format";
import type { Band } from "@/lib/driving-insights";
import type { DrivingExtras, NamedPlace } from "@/lib/server/driving-extra";

const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const TAGS = { home: "Home", work: "Work", favorite: "Favourite" } as const;
const placeName = (p: NamedPlace, k: number) => (p.tag ? TAGS[p.tag] : (p.name ?? `Place ${k + 1}`));

// How long you spend at each speed, after TeslaMate's speed histogram.
export function SpeedBands({ bins }: { bins: DrivingExtras["speed"] }) {
  if (bins.length === 0) return null;
  const bars = bins.map((b, k) => ({
    key: String(b.from),
    label: b.to === null ? `${b.from}+` : `${b.from}–${b.to}`,
    value: Math.round(b.share * 100),
    display: `${Math.round(b.share * 100)}`,
    isCurrent: b.share === Math.max(...bins.map((x) => x.share)) && k >= 0,
  }));
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Time at each speed</h2>
        <p className="text-sm text-muted-foreground">Share of driving time in each speed band, km/h, last 30 days.</p>
      </div>
      <Bars bars={bars} ariaLabel="Share of driving time by speed in km/h" unit="%" scrollFrom="start" />
    </section>
  );
}

function BandTable({ title, bands }: { title: string; bands: Band[] }) {
  if (bands.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-sm text-sm tabular-nums">
        <thead>
          <tr className="border-b text-left text-xs text-faint">
            <th scope="col" className="py-2 pr-4 font-normal">
              {title}
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              Drives
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              Distance
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              km per kWh
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {bands.map((b) => (
            <tr key={b.label}>
              <th scope="row" className="py-3 pr-4 text-left font-normal">
                {b.label}
              </th>
              <td className="py-3 pr-4 text-right font-mono">{b.drives}</td>
              <td className="py-3 pr-4 text-right font-mono">{Math.round(b.km)} km</td>
              <td className="py-3 text-right font-mono">{b.kmPerKwh !== null ? oneDecimal.format(b.kmPerKwh) : "Unknown"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// How far a kWh goes in different weather and at different speeds, after TeslaMate's efficiency.
export function EfficiencyBands({ byTemp, bySpeed }: { byTemp: Band[]; bySpeed: Band[] }) {
  if (byTemp.length === 0 && bySpeed.length === 0) return null;
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Efficiency</h2>
        <p className="text-sm text-muted-foreground">How far each kWh took you, by outside temperature and by average speed, last 30 days. Higher is better.</p>
      </div>
      <BandTable title="Outside" bands={byTemp} />
      <BandTable title="Average speed" bands={bySpeed} />
    </section>
  );
}

// Where the car parks, after TeslaMate's locations: Home, Work and Favourite from the car's own settings,
// other spots by area name, with visits and time parked; then everywhere it went on a map.
export function Places({ places, visited }: { places: NamedPlace[]; visited: DrivingExtras["visited"] }) {
  if (places.length === 0 && visited.length < 2) return null;
  const pins = places.slice(0, 15).map((p, k) => ({
    lat: p.lat,
    lng: p.lng,
    t: p.lastVisit,
    kind: "place" as const,
    size: 6 + Math.min(10, p.visits * 1.5),
    label: `${placeName(p, k)} · ${p.visits} ${p.visits === 1 ? "visit" : "visits"} · ${formatDuration(p.parkedMs / 1000)} parked`,
  }));
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Places</h2>
        <p className="text-sm text-muted-foreground">Where you went and where the car parked, last 30 days.</p>
      </div>
      {(pins.length > 0 || visited.length >= 2) && <TripMap route={visited} pins={pins} label="Everywhere the car went, with where it parked" />}
      {places.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-md text-sm tabular-nums">
            <thead>
              <tr className="border-b text-left text-xs text-faint">
                <th scope="col" className="py-2 pr-4 font-normal">
                  Place
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  Visits
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  Time parked
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Last visit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {places.slice(0, 15).map((p, k) => (
                <tr key={`${p.lat},${p.lng}`}>
                  <th scope="row" className="py-3 pr-4 text-left font-normal">
                    {placeName(p, k)}
                  </th>
                  <td className="py-3 pr-4 text-right font-mono">{p.visits}</td>
                  <td className="py-3 pr-4 text-right">{formatDuration(p.parkedMs / 1000)}</td>
                  <td className="py-3 text-right">{formatShortDate(p.lastVisit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-faint">Place names from OpenStreetMap. Home, Work and Favourite are the ones set in your car.</p>
    </section>
  );
}
