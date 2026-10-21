// Charging sessions rebuilt from Fleet Telemetry readings. Pure (no database), so it can be tested
// with a script; lib/server/stream-charging.ts does the reading and writing.

export type ChargeReading = { field: string; at: string; value: unknown };

export type StreamSession = {
  started_at: string;
  ended_at: string | null; // null while the session is in progress
  kind: "ac" | "dc";
  supercharger: boolean;
  energy_added_kwh: number | null;
  start_level: number | null;
  end_level: number | null;
  start_energy_kwh: number | null;
  end_energy_kwh: number | null;
  peak_power_kw: number | null;
};

// Fields buildSessions reads; the loader fetches exactly these.
export const CHARGE_FIELDS = [
  "DetailedChargeState",
  "FastChargerPresent",
  "FastChargerType",
  "ACChargingPower",
  "DCChargingPower",
  "ACChargingEnergyIn",
  "DCChargingEnergyIn",
  "BatteryLevel",
  "EnergyRemaining",
];

const START_STATES = new Set(["Starting", "Charging"]);
const END_STATES = new Set(["Complete", "Stopped", "Disconnected", "NoPower"]);
const MIN_SESSION_MS = 2 * 60 * 1000;

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function round(value: number | null, digits: number): number | null {
  if (value === null) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

// "DetailedChargeStateCharging" -> "Charging"
export function chargeStateName(value: unknown): string | null {
  return typeof value === "string" ? value.replace(/^DetailedChargeState/, "") : null;
}

type Open = {
  startedAt: number;
  startLevel: number | null;
  startEnergy: number | null;
  fastPresent: boolean;
  supercharger: boolean;
  acPower: number | null;
  dcPower: number | null;
  acEnergy: number | null;
  dcEnergy: number | null;
};

// Readings may be unsorted. Readings that share a timestamp were sent in one record and are applied
// together. Counter and power values only count once the session is open, so an energy counter that
// still holds the previous session's total (the car only sends changes) is never mistaken for this one.
export function buildSessions(readings: ChargeReading[]): StreamSession[] {
  const sorted = readings
    .map((r) => ({ ...r, t: Date.parse(r.at) }))
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);

  const sessions: StreamSession[] = [];
  // Latest known value of the state-like fields.
  let level: number | null = null;
  let energy: number | null = null;
  let fastPresent = false;
  let fastType = "";
  let open: Open | null = null;

  const finish = (end: number | null) => {
    if (!open) return;
    // Power seen during the session decides; FastChargerPresent can carry over from an earlier DC session.
    const dc = (open.dcPower ?? 0) > 0 || (!((open.acPower ?? 0) > 0) && open.fastPresent);
    const added = dc ? open.dcEnergy : open.acEnergy;
    const rounded = round(added, 2);
    const tooShort = end !== null && end - open.startedAt < MIN_SESSION_MS && !(rounded && rounded > 0);
    if (!tooShort) {
      sessions.push({
        started_at: new Date(open.startedAt).toISOString(),
        ended_at: end === null ? null : new Date(end).toISOString(),
        kind: dc ? "dc" : "ac",
        supercharger: dc && open.supercharger,
        energy_added_kwh: rounded,
        start_level: round(open.startLevel, 2),
        end_level: round(level, 2),
        start_energy_kwh: round(open.startEnergy, 2),
        end_energy_kwh: round(energy, 2),
        peak_power_kw: round(dc ? open.dcPower : open.acPower, 1),
      });
    }
    open = null;
  };

  for (let i = 0; i < sorted.length; ) {
    const t = sorted[i].t;
    let j = i;
    while (j < sorted.length && sorted[j].t === t) j++;
    const batch = sorted.slice(i, j);
    i = j;

    const stateReading = batch.findLast((r) => r.field === "DetailedChargeState");
    const state = stateReading ? chargeStateName(stateReading.value) : null;
    const starting = state !== null && START_STATES.has(state) && !open;
    if (starting) {
      open = {
        startedAt: t,
        startLevel: null,
        startEnergy: null,
        fastPresent,
        supercharger: fastPresent && fastType.includes("supercharger"),
        acPower: null,
        dcPower: null,
        acEnergy: null,
        dcEnergy: null,
      };
    }

    for (const r of batch) {
      const n = num(r.value);
      switch (r.field) {
        case "BatteryLevel":
          if (n !== null) level = n;
          break;
        case "EnergyRemaining":
          if (n !== null) energy = n;
          break;
        case "FastChargerPresent":
          fastPresent = r.value === true || r.value === "true";
          if (open && fastPresent) open.fastPresent = true;
          break;
        case "FastChargerType":
          fastType = typeof r.value === "string" ? r.value.toLowerCase() : "";
          break;
        case "ACChargingPower":
          if (open && n !== null) open.acPower = Math.max(open.acPower ?? n, n);
          break;
        case "DCChargingPower":
          if (open && n !== null) open.dcPower = Math.max(open.dcPower ?? n, n);
          break;
        case "ACChargingEnergyIn":
          if (open && n !== null) open.acEnergy = Math.max(open.acEnergy ?? n, n);
          break;
        case "DCChargingEnergyIn":
          if (open && n !== null) open.dcEnergy = Math.max(open.dcEnergy ?? n, n);
          break;
      }
    }
    if (open) {
      // Sticky: the charger type may only be reported after the session began.
      if (open.fastPresent && fastType.includes("supercharger")) open.supercharger = true;
      if (starting) {
        open.startLevel = level;
        open.startEnergy = energy;
      }
    }

    if (state !== null) {
      if (END_STATES.has(state)) finish(t);
    }
  }
  // Still going: ended_at stays null. The latest level is as of the last reading.
  finish(null);
  return sessions;
}

// Slack on both ends: the car and Tesla's history stamp the same session a few minutes apart.
const MATCH_SLACK_MS = 10 * 60 * 1000;
// When Tesla has no stop time yet.
const OPEN_SPAN_MS = 6 * 60 * 60 * 1000;

type TeslaSpan = { vehicle_vin: string; started_at: string; stopped_at: string | null };
type StreamSpan = { vin: string; started_at: string; ended_at: string | null };

// A streamed session that overlaps a Tesla Supercharger session of the same car is that same session.
// Returns each Tesla session with its streamed twin (or null), and the streamed sessions left over.
export function matchSessions<T extends TeslaSpan, S extends StreamSpan>(
  tesla: T[],
  stream: S[],
  now: number,
): { pairs: { tesla: T; stream: S | null }[]; streamOnly: S[] } {
  const used = new Set<S>();
  const pairs = tesla.map((t) => {
    const from = Date.parse(t.started_at);
    const to = t.stopped_at ? Date.parse(t.stopped_at) : from + OPEN_SPAN_MS;
    const twin =
      stream.find((s) => {
        if (used.has(s) || s.vin !== t.vehicle_vin) return false;
        const sFrom = Date.parse(s.started_at);
        const sTo = s.ended_at ? Date.parse(s.ended_at) : now;
        return sFrom <= to + MATCH_SLACK_MS && sTo >= from - MATCH_SLACK_MS;
      }) ?? null;
    if (twin) used.add(twin);
    return { tesla: t, stream: twin };
  });
  return { pairs, streamOnly: stream.filter((s) => !used.has(s)) };
}

type EfficiencySpan = {
  ended_at: string | null;
  energy_added_kwh: number | null;
  start_energy_kwh: number | null;
  end_energy_kwh: number | null;
};

// Share of the energy the charger delivered that ended up in the pack, from the pack's energy
// readings. Sessions outside 50-105% are measurement noise and are left out.
export function chargeEfficiency(sessions: EfficiencySpan[]): number | null {
  let delivered = 0;
  let stored = 0;
  for (const s of sessions) {
    if (s.ended_at === null || s.energy_added_kwh === null || s.energy_added_kwh <= 0) continue;
    if (s.start_energy_kwh === null || s.end_energy_kwh === null) continue;
    const gain = s.end_energy_kwh - s.start_energy_kwh;
    const ratio = gain / s.energy_added_kwh;
    if (ratio < 0.5 || ratio > 1.05) continue;
    delivered += s.energy_added_kwh;
    stored += gain;
  }
  return delivered > 0 ? stored / delivered : null;
}
