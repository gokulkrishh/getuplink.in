// A simulated fleet of Indian cars for the demo's /rollout and /admin, separate from the one demo car the
// other pages show. Seeded like generate.ts, so the same fleet comes back on every rebuild, and anchored to
// "now". It writes rows shaped like the vehicles and version_history tables, so the pages run them through
// the same functions as real data.
import type { StateCode } from "@/lib/india-states";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import { istDay } from "@/lib/status";
import { between, PENDING_VERSION, rngFor } from "./generate";

const HOUR = 3_600_000;
const DAY = 86_400_000;

// Oldest first: the version, when the world first saw it and when the first Indian car got it (days ago),
// and how many of the fleet's cars run it now. 2026.40.2 is new, on three cars; 2026.26.6 has one left.
const RELEASES: [version: string, globalDaysAgo: number, indiaDaysAgo: number, carsNow: number][] = [
  ["2026.26.6", 104, 88, 1],
  ["2026.32.3", 70, 55, 7],
  ["2026.38.3.1", 45, 27, 9],
  ["2026.38.5.1", 31, 16, 20],
  ["2026.40.2", 12, 3, 3],
];
// Home states of the cars on each version, in RELEASES order, as [state, cars]. On 2026.38.5.1 the map
// shows Karnataka and Maharashtra, pools Tamil Nadu and Kerala into "Other South states", and leaves
// Haryana out: its 3 cars and the 2 with no state yet make 5 uncounted, so nothing can be subtracted.
const HOMES: [StateCode | null, number][][] = [
  [["KA", 1]],
  [["MH", 7]],
  [["KA", 9]],
  [["KA", 5], ["MH", 5], ["TN", 3], ["KL", 2], ["HR", 3], [null, 2]],
  [["KA", 2], ["MH", 1]],
];
// Updates offered but not installed yet, as [version, offered to cars on this version, their statuses]:
// 2026.40.2 is reaching more 2026.38.5.1 cars, two 2026.38.3.1 cars have 2026.38.5.1 waiting, and one
// 2026.40.2 car is the first offered the demo car's next update.
const OFFERS: [version: string, from: string, statuses: string[]][] = [
  ["2026.40.2", "2026.38.5.1", ["available", "downloading", "downloading_wifi_wait", "scheduled", "installing"]],
  ["2026.38.5.1", "2026.38.3.1", ["available", "available"]],
  [PENDING_VERSION, "2026.40.2", ["available"]],
];
// Notes for the fleet's versions the demo car never ran; the rest come from the demo car's (generate.ts).
// Plausible stand-ins, not Tesla's text.
const FLEET_NOTES: ReleaseNotesByVersion = {
  "2026.40.2": [
    { title: "Trip Planner", description: "Plan a trip in the Tesla app and send it to the car, with charging stops added for you." },
    { title: "Security Improvements", description: "This update includes important security fixes and improvements." },
  ],
};
const SHIPPED = "2026.20.6.10"; // what every car ran before its first recorded update
const SHARED_CARS = 3; // owners with two cars, so 40 cars have 37 owners

export type FleetVehicle = { id: string; current_version: string; last_seen_at: string; home_state: StateCode | null };
export type FleetChange = { vehicle_id: string; version: string; previous_version: string; detected_at: string; source: "tracked" };
// Each offered car's last online check, shaped like a snapshots row.
export type FleetOffer = { vehicle_id: string; state: "online"; update_status: string; update_version: string };
export type FleetRun = { started_at: string; ok: boolean };

export type DemoFleet = {
  now: number;
  owners: number;
  vehicles: FleetVehicle[];
  history: FleetChange[]; // oldest first
  offers: FleetOffer[];
  globalReleases: Record<string, string>; // simulated, IST days
  notes: ReleaseNotesByVersion; // simulated
  runs: FleetRun[]; // the last 7 days of checks, newest first
  // Simulated: real Fleet API requests and spend aren't counted anywhere yet.
  api: { requests: number; costUsd: number };
};

export function generateFleet(now: number): DemoFleet {
  const vehicles: FleetVehicle[] = [];
  const history: FleetChange[] = [];
  let n = 0;
  RELEASES.forEach(([, , , carsNow], current) => {
    const homes = HOMES[current].flatMap(([state, cars]) => Array<StateCode | null>(cars).fill(state));
    for (let k = 0; k < carsNow; k++, n++) {
      const rng = rngFor(41, n);
      const id = String(9000 + n);
      let previous = SHIPPED;
      for (let i = 0; i <= current; i++) {
        const [version, , indiaDaysAgo] = RELEASES[i];
        // Each step lands before the next version reaches India, so a car's updates stay in order. The
        // first car on each version takes it the day it arrives.
        const room = (i < RELEASES.length - 1 ? indiaDaysAgo - RELEASES[i + 1][2] : indiaDaysAgo) * 0.8;
        const lead = n === firstCarOn(i) ? 0 : between(rng, 0, room);
        const at = now - (indiaDaysAgo - lead) * DAY + between(rng, 0, 8) * HOUR;
        history.push({ vehicle_id: id, version, previous_version: previous, detected_at: new Date(Math.min(at, now - HOUR)).toISOString(), source: "tracked" });
        previous = version;
      }
      // Most cars were online at a check this week; a few have been parked longer.
      const quiet = rng() < 0.15;
      const last_seen_at = new Date(now - between(rng, quiet ? 8 : 0, quiet ? 20 : 6) * DAY).toISOString();
      vehicles.push({ id, current_version: previous, last_seen_at, home_state: homes[k] ?? null });
    }
  });
  history.sort((a, b) => Date.parse(a.detected_at) - Date.parse(b.detected_at));

  // The last cars on each version get its offers, so every offer is newer than what its car runs.
  const offers: FleetOffer[] = OFFERS.flatMap(([version, from, statuses]) =>
    vehicles
      .filter((v) => v.current_version === from)
      .slice(-statuses.length)
      .map((v, i) => ({ vehicle_id: v.id, state: "online" as const, update_status: statuses[i], update_version: version })),
  );

  // A check every 6 hours; two failed this week.
  const runs: FleetRun[] = [];
  for (let i = 0; i < 28; i++) {
    runs.push({ started_at: new Date(now - (i * 6 + 1) * HOUR).toISOString(), ok: i !== 5 && i !== 19 });
  }
  const requests = vehicles.length * 4 * 30 * 3; // four checks a day, about three Fleet API calls each
  return {
    now,
    owners: vehicles.length - SHARED_CARS,
    vehicles,
    history,
    offers,
    globalReleases: Object.fromEntries(RELEASES.map(([version, globalDaysAgo]) => [version, istDay(now - globalDaysAgo * DAY)])),
    notes: FLEET_NOTES,
    runs,
    api: { requests, costUsd: Math.round(requests * 0.0011 * 100) / 100 },
  };
}

// The cars are numbered by the version they run now, oldest first. Every car on version i or later went
// through it, so the first such car is the one that opens group i.
function firstCarOn(i: number): number {
  return RELEASES.slice(0, i).reduce((sum, [, , , carsNow]) => sum + carsNow, 0);
}
