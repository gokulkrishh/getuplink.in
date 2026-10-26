import { ChartCard } from "@/components/chart-card";
import { Bars } from "@/components/stats/bars";
import { TripMap } from "@/components/stats/trip-map";
import { DECIMALS, formatDuration, formatKm, formatNumber, formatShortDate } from "@/lib/format";
import type { Band } from "@/lib/driving-insights";
import type { DrivingExtras, NamedPlace } from "@/lib/server/driving-extra";
import { Measure } from "@/components/measure";

const TAGS = { home: "Home", work: "Work", favorite: "Favourite" } as const;
const placeName = (p: NamedPlace, k: number) => (p.tag ? TAGS[p.tag] : (p.name ?? `Place ${k + 1}`));

// What each insight covers, ending its caption: the last 30 days, or a range picked by date ("from 1 Sept
// to 30 Sept"); `note` says when that range reaches back past the readings kept.
type Covers = { words?: string; note?: string };

const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const Note = ({ note }: { note?: string }) => (note ? <p className="text-xs text-faint">{note}</p> : null);

// How long you spend at each speed, after TeslaMate's speed histogram.
export function SpeedBands({ bins, words = "last 30 days", note }: { bins: DrivingExtras["speed"] } & Covers) {
  if (bins.length === 0) return null;
  // Each band's share is rounded on its own, so the shown shares can add up to a point off 100%.
  const shares = bins.map((b) => b.share * 100);
  const bars = bins.map((b, k) => ({
    key: String(b.from),
    // The tip names the band; the axis gives where it starts ("20"), like a histogram's, so all six fit
    // under their bars on a phone.
    label: b.to === null ? `${b.from}+ km/h` : `${b.from} to ${b.to} km/h`,
    axis: b.to === null ? `${b.from}+` : String(b.from),
    value: shares[k],
    display: formatNumber(shares[k], DECIMALS.percent),
    isCurrent: b.share === Math.max(...bins.map((x) => x.share)) && k >= 0,
  }));
  return (
    <ChartCard
      title="Time at each speed"
      description="Share of driving time at each speed."
      info="Each bar is a 20 km/h band, labelled by the speed it starts at. The band you drive in most is highlighted."
      summary={<Note note={note} />}
      caption={upper(words)}
    >
      <Bars bars={bars} ariaLabel="Share of driving time by speed in km/h" unit="%" fit />
    </ChartCard>
  );
}

function BandTable({ title, bands }: { title: string; bands: Band[] }) {
  if (bands.length === 0) return null;
  return (
    <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b text-left text-xs text-faint">
            <th scope="col" className="w-10 py-2 pr-3 font-normal max-sm:hidden">
              #
            </th>
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
          {bands.map((b, k) => (
            <tr key={b.label}>
              <td className="w-10 py-3 pr-3 font-mono text-xs text-faint max-sm:hidden">{k + 1}</td>
              <th scope="row" className="py-3 pr-4 text-left font-normal">
                {b.label}
              </th>
              <td className="py-3 pr-4 text-right font-mono">{b.drives}</td>
              <td className="py-3 pr-4 text-right font-mono"><Measure text={formatKm(b.km)} /></td>
              <td className="py-3 text-right font-mono">{b.kmPerKwh !== null ? formatNumber(b.kmPerKwh, DECIMALS.kmPerKwh) : "Unknown"}</td>
            </tr>
          ))}
        </tbody>
    </table>
  );
}

// How far a kWh goes in different weather and at different speeds, after TeslaMate's efficiency.
export function EfficiencyBands({ byTemp, bySpeed, words = "last 30 days", note }: { byTemp: Band[]; bySpeed: Band[] } & Covers) {
  if (byTemp.length === 0 && bySpeed.length === 0) return null;
  return (
    <ChartCard
      title="Efficiency"
      description="How far each kWh took you. Higher is better."
      unit="kWh"
      summary={<Note note={note} />}
      caption={upper(words)}
    >
      <div className="space-y-6">
        <BandTable title="Outside" bands={byTemp} />
        <BandTable title="Average speed" bands={bySpeed} />
      </div>
    </ChartCard>
  );
}

// Where the car parks, after TeslaMate's locations: Home, Work and Favourite from the car's own settings,
// other spots by area name, with visits and time parked; then everywhere it went on a map.
export function Places({ places, visited, words = "last 30 days", note }: { places: NamedPlace[]; visited: DrivingExtras["visited"] } & Covers) {
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
        <p className="text-sm text-muted-foreground">Where you went and parked, {words}.</p>
        <Note note={note} />
      </div>
      {(pins.length > 0 || visited.length >= 2) && <TripMap route={visited} pins={pins} label="Everywhere the car went, with where it parked" legend="A place it parked; bigger pins had more visits" />}
      {places.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-md text-sm tabular-nums">
            <thead>
              <tr className="border-b text-left text-xs text-faint">
                <th scope="col" className="w-10 py-2 pr-3 font-normal">
                  #
                </th>
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
                  <td className="w-10 py-3 pr-3 font-mono text-xs text-faint">{k + 1}</td>
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
