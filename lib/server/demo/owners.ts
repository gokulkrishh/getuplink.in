// A made-up set of owners who share, for the demo's /owners: 40 cars in four groups (the Model Ys sold in India), each with 30 days of
// figures shaped like a real car's day rows (lib/owners.ts DayFigures), so the page runs them through the same
// summarise and aggregate as real data. Seeded like generate.ts, so the same set comes back on every rebuild.
// Plausible Indian figures, not anyone's.
import { istWeekday } from "@/lib/charge-habits";
import { type CarDay, type CarSummary, type DayFigures, FIGURES_VERSION, type Latest, summarise, WINDOW_DAYS } from "@/lib/owners";
import { istDay, istDayStart } from "@/lib/telemetry-derive";
import { between, type Rng, rngFor } from "./generate";

const HOUR = 3_600_000;

type Group = { model: string; pack: string; drive: string; lfp: boolean; cars: number; whPerKm: [number, number]; capacity: [number, number]; wheels: [string, number][] };

// The demo car is a Model Y Standard Range, rear-wheel drive, with an LFP battery: its group is the largest.
const GROUPS: Group[] = [
  { model: "Model Y", pack: "Standard Range", drive: "Rear-wheel drive", lfp: true, cars: 15, whPerKm: [118, 152], capacity: [58.2, 61.6], wheels: [["19″ Crossflow", 0.75], ["20″ Helix 2.0", 0.25]] },
  { model: "Model Y", pack: "Premium", drive: "Rear-wheel drive", lfp: false, cars: 12, whPerKm: [124, 158], capacity: [74.5, 78.8], wheels: [["19″ Crossflow", 0.6], ["20″ Helix 2.0", 0.4]] },
  { model: "Model Y L", pack: "Long Range", drive: "All-wheel drive", lfp: false, cars: 7, whPerKm: [132, 168], capacity: [80.5, 84.6], wheels: [["19″ Crossflow", 0.7], ["20″ Helix 2.0", 0.3]] },
  // No longer sold in India, still on the road.
  { model: "Model Y", pack: "Long Range", drive: "Rear-wheel drive", lfp: false, cars: 6, whPerKm: [126, 160], capacity: [73.8, 78.2], wheels: [["19″ Crossflow", 0.6], ["20″ Helix 2.0", 0.4]] },
];
const PAINTS: [string, number][] = [
  ["Pearl White", 0.34],
  ["Stealth Grey", 0.2],
  ["Diamond Black", 0.16],
  ["Quicksilver", 0.12],
  ["Glacier Blue", 0.1],
  ["Ultra Red", 0.08],
];
// Two owners have two cars each, so 40 cars have 38 owners.
const SECOND_CARS = 2;

function pick<T>(rng: Rng, options: [T, number][]): T {
  let r = rng() * options.reduce((a, [, w]) => a + w, 0);
  for (const [value, weight] of options) if ((r -= weight) <= 0) return value;
  return options[options.length - 1][0];
}

const round = (v: number, digits = 3) => Math.round(v * 10 ** digits) / 10 ** digits;

function settings(rng: Rng): Latest["settings"] {
  return {
    PinToDriveEnabled: rng() < 0.3,
    ScheduledChargingMode: pick(rng, [["ScheduledChargingModeOff", 0.55], ["ScheduledChargingModeStartAt", 0.3], ["ScheduledChargingModeDepartBy", 0.15]]),
    EmergencyLaneDepartureAvoidance: rng() < 0.85,
    AutomaticEmergencyBrakingOff: rng() < 0.03,
    BlindSpotCollisionWarningChime: rng() < 0.55,
    AutomaticBlindSpotCamera: rng() < 0.7,
    SpeedLimitWarning: pick(rng, [["SpeedAssistLevelChime", 0.35], ["SpeedAssistLevelDisplay", 0.5], ["SpeedAssistLevelNone", 0.15]]),
    ForwardCollisionWarning: pick(rng, [["ForwardCollisionSensitivityAverage", 0.6], ["ForwardCollisionSensitivityEarly", 0.15], ["ForwardCollisionSensitivityLate", 0.2], ["ForwardCollisionSensitivityOff", 0.05]]),
    LaneDepartureAvoidance: pick(rng, [["LaneAssistLevelWarning", 0.5], ["LaneAssistLevelAssist", 0.3], ["LaneAssistLevelNone", 0.2]]),
    CruiseFollowDistance: pick(rng, [["FollowDistance2", 0.15], ["FollowDistance3", 0.4], ["FollowDistance4", 0.3], ["FollowDistance5", 0.15]]),
    PairedPhoneKeyAndKeyFobQty: pick(rng, [[2, 0.35], [3, 0.35], [4, 0.2], [5, 0.1]]),
    CabinOverheatProtectionMode: pick(rng, [["CabinOverheatProtectionModeStateFanOnly", 0.4], ["CabinOverheatProtectionModeStateOn", 0.3], ["CabinOverheatProtectionModeStateOff", 0.3]]),
  };
}

// One car's 30 days. Its habits are drawn once (how far, how hard, when it charges), each day around them.
function carDays(n: number, group: Group, today: number): CarDay[] {
  const rng = rngFor(43, n);
  const weeklyKm = between(rng, 70, 420);
  const tripKm = between(rng, 4, 18);
  const whPerKm = between(rng, ...group.whPerKm);
  const lossPerDay = between(rng, 0.25, 1.3);
  const chargesWeek = between(rng, 1, 5);
  const plugLevel = between(rng, 22, 62);
  const fastShare = rng() < 0.7 ? between(rng, 0, 0.08) : between(rng, 0.2, 0.95);
  const evening = rng() < 0.8;
  const hardPer100 = between(rng, 0.5, 7);
  const onePedal = between(rng, 0.62, 0.97);
  const regen = between(rng, 0.09, 0.19);
  const cityShare = between(rng, 0.4, 0.8);
  const acShare = between(rng, 0.55, 1);
  const setTemp = Math.round(between(rng, 19.6, 25.4));
  const seat = rng() < 0.55;
  const sentryHours = rng() < 0.6 ? between(rng, 0.8, 9) : 0;
  const keeper = rng() < 0.25;
  const dog = rng() < 0.08;
  const camp = rng() < 0.1;
  const limit = group.lfp ? pick(rng, [[100, 0.6], [90, 0.25], [80, 0.15]]) : pick(rng, [[80, 0.5], [90, 0.3], [85, 0.1], [70, 0.05], [100, 0.05]]);
  const capacity = between(rng, ...group.capacity);
  const latest: Latest = {
    model: group.model,
    pack: group.pack,
    drive: group.drive,
    lfp: group.lfp,
    paint: pick(rng, PAINTS),
    wheels: pick(rng, group.wheels),
    capacityKwh: round(capacity, 1),
    tyreFrontBar: round(between(rng, 2.75, 3.05), 2),
    tyreRearBar: round(between(rng, 2.75, 3.05), 2),
    chargeLimit: limit,
    settings: settings(rng),
  };
  const speedShares = (() => {
    const w = [cityShare * 0.45, cityShare * 0.55, (1 - cityShare) * 0.35, (1 - cityShare) * 0.3, (1 - cityShare) * 0.22, (1 - cityShare) * 0.13];
    const total = w.reduce((a, b) => a + b, 0);
    return w.map((v) => round(v / total));
  })();
  const installDay = Math.floor(between(rng, 2, 26));

  return Array.from({ length: WINDOW_DAYS }, (_, k): CarDay => {
    const day = today - WINDOW_DAYS + k;
    const dayRng = rngFor(43, n, day);
    const weekend = istWeekday(istDayStart(day)) >= 5;
    const hourKm = { weekday: Array<number>(24).fill(0), weekend: Array<number>(24).fill(0) };
    const drives: number[] = [];
    const driving = dayRng() < 0.85;
    let dayKm = driving ? (weeklyKm / 7 / 0.85) * between(dayRng, 0.4, 1.6) : 0;
    while (dayKm > 0.5) {
      const km = Math.min(dayKm, tripKm * between(dayRng, 0.5, 1.6));
      dayKm -= km;
      drives.push(round(km, 2));
      const hour = weekend ? Math.floor(between(dayRng, 9, 21)) : pick(dayRng, [[Math.floor(between(dayRng, 8, 11)), 0.4], [Math.floor(between(dayRng, 17, 21)), 0.4], [Math.floor(between(dayRng, 11, 17)), 0.2]]);
      hourKm[weekend ? "weekend" : "weekday"][hour] = round(hourKm[weekend ? "weekend" : "weekday"][hour] + km);
    }
    const km = drives.reduce((a, b) => a + b, 0);
    const driveMs = (km / between(dayRng, 22, 34)) * HOUR;
    const used = (km * whPerKm * 1.15) / 1000;
    const charged = dayRng() < chargesWeek / 7;
    const dc = charged && dayRng() < fastShare;
    const level = Math.round(Math.min(90, Math.max(8, plugLevel + between(dayRng, -12, 12))));
    const acOn = driveMs * acShare;
    const parkedHours = round(between(dayRng, 14, 22), 2);
    const figures: DayFigures = {
      v: FIGURES_VERSION,
      km: round(km),
      drives,
      energyKm: round(drives.filter((d) => d >= 1).reduce((a, b) => a + b, 0)),
      energyKwh: round((drives.filter((d) => d >= 1).reduce((a, b) => a + b, 0) * whPerKm * between(dayRng, 0.92, 1.08)) / 1000),
      hourKm,
      parkedHours,
      parkedKwh: round((lossPerDay * between(dayRng, 0.7, 1.3) * parkedHours) / 24),
      charges: charged
        ? [{ hour: dc ? Math.floor(between(dayRng, 10, 20)) : evening ? Math.floor(between(dayRng, 19, 24)) : Math.floor(between(dayRng, 7, 10)), level, kwh: round(((limit - level) / 100) * capacity, 2), dc }]
        : [],
      hard: { count: Math.round((km * hardPer100 * between(dayRng, 0.4, 1.6)) / 100), km: round(km) },
      onePedal: km > 0 ? { slowing: Math.round(km * 14), noBrake: Math.round(km * 14 * Math.min(1, onePedal * between(dayRng, 0.95, 1.05))), km: round(km) } : null,
      regen: { gained: round(used * regen * between(dayRng, 0.9, 1.1)), used: round(used), km: round(km) },
      speed: km > 0 ? { shares: speedShares, ms: Math.round(driveMs) } : null,
      climate: km > 0 ? { acMs: Math.round(acOn), knownMs: Math.round(driveMs), setMs: { [String(setTemp)]: Math.round(acOn) } } : null,
      seatCooling: km > 0 ? seat && dayRng() < 0.6 : null,
      parkedModes: {
        sentryMs: sentryHours ? Math.round(sentryHours * between(dayRng, 0.5, 1.5) * HOUR) : 0,
        keeperMs: keeper && dayRng() < 0.3 ? Math.round(between(dayRng, 0.2, 1) * HOUR) : 0,
        dogMs: dog && dayRng() < 0.15 ? Math.round(between(dayRng, 0.3, 1.5) * HOUR) : 0,
        campMs: camp && dayRng() < 0.1 ? Math.round(between(dayRng, 2, 8) * HOUR) : 0,
      },
      installs: k === installDay ? [{ waitDays: pick(dayRng, [[between(dayRng, 0, 0.9), 0.4], [between(dayRng, 1, 2.9), 0.3], [between(dayRng, 3, 7), 0.2], [between(dayRng, 8, 14), 0.1]]), hour: pick(dayRng, [[Math.floor(between(dayRng, 22, 24)), 0.3], [Math.floor(between(dayRng, 0, 6)), 0.2], [Math.floor(between(dayRng, 7, 22)), 0.5]]) }] : [],
      latest: k === WINDOW_DAYS - 1 ? latest : null,
    };
    return { day, figures };
  });
}

let cached: { at: number; summaries: CarSummary[] } | undefined;

// The set's summaries, one per car, as the daily run would make them on the day `now` falls in.
export function demoOwnerSummaries(now: number): CarSummary[] {
  if (cached && now - cached.at < 60_000) return cached.summaries;
  const today = istDay(now);
  const summaries: CarSummary[] = [];
  let n = 0;
  for (const group of GROUPS) {
    for (let k = 0; k < group.cars; k++, n++) {
      const owner = n < SECOND_CARS ? 1000 + n + 2 : 1000 + n;
      summaries.push(summarise(carDays(n, group, today), { vinHash: `demo-${n}`, owner }));
    }
  }
  cached = { at: now, summaries };
  return summaries;
}
