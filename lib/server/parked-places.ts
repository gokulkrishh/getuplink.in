import "server-only";
import type { ParkedNow, ParkedPeriod } from "@/lib/drives";
import { chargeSpot, type SpotName, spotName } from "@/lib/charge-names";
import { stationAt } from "@/lib/stations";
import type { Owner } from "./data/owner";
import { cachedPlaceNames, placeKey } from "./place-names";
import { loadReadingsByField } from "./telemetry-window";
import { withGoogleNamesBy } from "./google-place-names";
import { loadUserPlaces } from "./user-places";

const MIN = 60_000;
// The newest stretches the list names; more than 30 days of parking usually holds.
export const NAMED_STRETCHES = 60;

// Where the car was parked for each stretch (by its start), named best source first (see spotName): the
// owner's tag, a charging station there, then the area name already kept, never looked up here. One small
// Location read each, around the stretch's start (the drive's end).
export async function loadParkedPlaces(owner: Owner, vin: string | null, starts: number[]): Promise<Record<number, SpotName>> {
  if (!vin || starts.length === 0) return {};
  const newest = [...new Set(starts)].sort((a, b) => b - a).slice(0, NAMED_STRETCHES);
  const [spots, tags] = await Promise.all([
    Promise.all(
      newest.map(async (start) => {
        const r = await loadReadingsByField(owner, vin, ["Location"], new Date(start - 10 * MIN).toISOString(), new Date(start + 10 * MIN).toISOString());
        const spot = chargeSpot(r?.Location ?? [], start);
        return spot ? { start, spot } : null;
      }),
    ),
    loadUserPlaces(owner),
  ]);
  const located = spots.filter((s) => s !== null);
  const places = await cachedPlaceNames(located.map((s) => s.spot)).catch(() => new Map<string, string>());
  // Shown only as the parked rows' place line, so a Google-tagged spot's live name is added (credited there).
  return withGoogleNamesBy(owner, Object.fromEntries(located.map(({ start, spot }) => [start, spotName(tags, spot, { station: stationAt(spot.lat, spot.lng), place: places.get(placeKey(spot)) })])));
}

// The places of a driving window's stretches, the one going on now included. Never fails: a stretch
// without a place just shows none.
export const loadStretchPlaces = (owner: Owner, vin: string | null, { parked, parkedNow }: { parked: ParkedPeriod[]; parkedNow: ParkedNow | null }) =>
  loadParkedPlaces(owner, vin, [...parked.map((p) => p.start), ...(parkedNow ? [parkedNow.start] : [])]).catch((): Record<number, SpotName> => ({}));
