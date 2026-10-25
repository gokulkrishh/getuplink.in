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
  // AC only, from the readings while charging; null when the car did not report them.
  ac_voltage: number | null;
  ac_amps: number | null;
  ac_phases: number | null;
  cable_type: string | null; // "IEC", "SAE", "GB_AC", ...
  temp_max_c: number | null; // highest battery module temperature during the session
  temp_start_c: number | null; // the reading at, or just before, the start
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
  "ChargerVoltage",
  "ChargeAmps",
  "ChargerPhases",
  "ChargingCableType",
  "ModuleTempMax",
];

const START_STATES = new Set(["Starting", "Charging"]);
const END_STATES = new Set(["Complete", "Stopped", "Disconnected", "NoPower"]);
// Below this the voltage is idle noise from an unplugged charger.
const MIN_AC_VOLTS = 50;
const MIN_SESSION_MS = 2 * 60 * 1000;
// The energy counter is sent at most once a minute, so its last count can land after the session ends:
// 14.56 kWh at 21:55:41, Complete at 21:55:54, 14.64 kWh at 21:56:41 (the car's own total, too).
export const COUNTER_TAIL_MS = 3 * 60 * 1000;
// Battery level and energy remaining are sent every 5 minutes, so the last reading before the end can be
// minutes old while the level was still rising. One interval after the end (with a little slack) decides.
export const SETTLE_MS = 5.5 * 60 * 1000;

// The reading that best describes the battery at `end`: the last one at or before it, or the first one
// after it (within SETTLE_MS) when that one is nearer. Charging has stopped by then, so a reading just
// after the end is the finished level, where one taken minutes before still misses the last minutes.
export function nearestToEnd<T extends { t: number }>(before: T | null, after: T | null, end: number): T | null {
  if (!after || after.t <= end || after.t - end > SETTLE_MS) return before;
  if (!before) return after;
  return after.t - end < end - before.t ? after : before;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function mode(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  for (const [v, c] of counts) if (best === null || c > counts.get(best)!) best = v;
  return best;
}

// "CableTypeIEC" -> "IEC"; unknown or invalid cables are not a reading.
function cableName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/^CableType/, "");
  return name === "" || /^(unknown|invalid|snafu)/i.test(name) ? null : name;
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

type Timed = { t: number; v: number };

type Open = {
  startedAt: number;
  // The counters' values when the session opened, on the same plug-in (see acClose in buildSessions).
  acBase: number;
  dcBase: number;
  startLevel: number | null;
  startEnergy: number | null;
  fastPresent: boolean;
  supercharger: boolean;
  acPower: number | null;
  dcPower: number | null;
  acEnergy: number | null;
  dcEnergy: number | null;
  volts: number[];
  amps: number[];
  phases: number[];
  cable: string | null;
  startTemp: number | null;
  maxTemp: number | null;
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
  // Latest known value of the state-like fields, with when it was sent.
  let level: Timed | null = null;
  let energy: Timed | null = null;
  // Each counter's value when the last session on this plug-in closed, or 0 after an unplug: a car that
  // stops and starts again without unplugging may keep counting from there.
  let acClose = 0;
  let dcClose = 0;
  let fastPresent = false;
  let fastType = "";
  let open: Open | null = null;
  let chargeState: string | null = null;
  // Latest known values; the car sends them only when they change.
  let volts: number | null = null;
  let amps: number | null = null;
  let phases: number | null = null;
  let cable: string | null = null;
  let temp: number | null = null;

  // A session that just ended, still taking the readings that arrive after its end (see COUNTER_TAIL_MS
  // and SETTLE_MS). Dropped at the next start, or once both windows have passed.
  let tail: {
    session: StreamSession;
    end: number;
    counterField: string;
    counter: number | null; // the counter's latest value, before taking off the base
    base: number;
    counterDone: boolean;
    level: Timed | null;
    levelDone: boolean;
    energy: Timed | null;
    energyDone: boolean;
  } | null = null;

  const finish = (end: number | null) => {
    if (!open) return;
    // Power seen during the session decides; FastChargerPresent can carry over from an earlier DC session.
    const dc = (open.dcPower ?? 0) > 0 || (!((open.acPower ?? 0) > 0) && open.fastPresent);
    const counter = dc ? open.dcEnergy : open.acEnergy;
    const base = dc ? open.dcBase : open.acBase;
    const rounded = round(counter === null ? null : counter - base, 2);
    const tooShort = end !== null && end - open.startedAt < MIN_SESSION_MS && !(rounded && rounded > 0);
    if (counter !== null) {
      if (dc) dcClose = counter;
      else acClose = counter;
    }
    if (!tooShort) {
      const session: StreamSession = {
        started_at: new Date(open.startedAt).toISOString(),
        ended_at: end === null ? null : new Date(end).toISOString(),
        kind: dc ? "dc" : "ac",
        supercharger: dc && open.supercharger,
        energy_added_kwh: rounded,
        start_level: round(open.startLevel, 2),
        end_level: round(level?.v ?? null, 2),
        start_energy_kwh: round(open.startEnergy, 2),
        end_energy_kwh: round(energy?.v ?? null, 2),
        peak_power_kw: round(dc ? open.dcPower : open.acPower, 1),
        ac_voltage: dc ? null : round(median(open.volts), 1),
        ac_amps: dc || open.amps.length === 0 ? null : round(Math.max(...open.amps), 1),
        ac_phases: dc ? null : mode(open.phases),
        cable_type: dc ? null : open.cable,
        temp_max_c: round(open.maxTemp, 1),
        temp_start_c: round(open.startTemp, 1),
      };
      sessions.push(session);
      if (end !== null) {
        const counterField = dc ? "DCChargingEnergyIn" : "ACChargingEnergyIn";
        tail = { session, end, counterField, counter, base, counterDone: false, level, levelDone: false, energy, energyDone: false };
      }
    }
    open = null;
  };

  // Readings that arrive after the tail's session ended: the counter's last count, and the level and energy
  // remaining when the first reading after the end is nearer to it than the last one before.
  const settle = (t: number, batch: ChargeReading[]) => {
    if (!tail) return;
    const since = t - tail.end;
    if (since > COUNTER_TAIL_MS) tail.counterDone = true;
    if (since > SETTLE_MS) tail.levelDone = tail.energyDone = true;
    for (const r of batch) {
      const n = num(r.value);
      if (n === null) continue;
      if (r.field === tail.counterField && !tail.counterDone) {
        // A lower count is a reset: a new plug-in, not this session.
        if (tail.counter !== null && n < tail.counter) {
          tail.counterDone = true;
          continue;
        }
        tail.counter = n;
        tail.session.energy_added_kwh = round(n - tail.base, 2);
        if (tail.counterField === "DCChargingEnergyIn") dcClose = n;
        else acClose = n;
      } else if (r.field === "BatteryLevel" && !tail.levelDone) {
        tail.levelDone = true;
        tail.session.end_level = round(nearestToEnd(tail.level, { t, v: n }, tail.end)?.v ?? null, 2);
      } else if (r.field === "EnergyRemaining" && !tail.energyDone) {
        tail.energyDone = true;
        tail.session.end_energy_kwh = round(nearestToEnd(tail.energy, { t, v: n }, tail.end)?.v ?? null, 2);
      }
    }
    if (tail.counterDone && tail.levelDone && tail.energyDone) tail = null;
  };

  for (let i = 0; i < sorted.length; ) {
    const t = sorted[i].t;
    let j = i;
    while (j < sorted.length && sorted[j].t === t) j++;
    const batch = sorted.slice(i, j);
    i = j;

    const stateReading = batch.findLast((r) => r.field === "DetailedChargeState");
    const state = stateReading ? chargeStateName(stateReading.value) : null;
    if (state !== null) chargeState = state;
    const starting = state !== null && START_STATES.has(state) && !open;
    if (starting) tail = null;
    else settle(t, batch);
    if (starting) {
      open = {
        startedAt: t,
        acBase: acClose,
        dcBase: dcClose,
        startLevel: null,
        startEnergy: null,
        fastPresent,
        supercharger: fastPresent && fastType.includes("supercharger"),
        acPower: null,
        dcPower: null,
        acEnergy: null,
        dcEnergy: null,
        volts: [],
        amps: [],
        phases: [],
        cable,
        startTemp: temp,
        maxTemp: temp,
      };
    }

    for (const r of batch) {
      const n = num(r.value);
      switch (r.field) {
        case "BatteryLevel":
          if (n !== null) level = { t, v: n };
          break;
        case "EnergyRemaining":
          if (n !== null) energy = { t, v: n };
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
        case "ChargerVoltage":
          volts = n;
          break;
        case "ChargeAmps":
          amps = n;
          break;
        case "ChargerPhases":
          phases = n;
          break;
        case "ChargingCableType": {
          const name = cableName(r.value);
          if (name) {
            cable = name;
            if (open) open.cable = name;
          }
          break;
        }
        case "ModuleTempMax":
          if (n !== null) {
            temp = n;
            if (open) open.maxTemp = Math.max(open.maxTemp ?? n, n);
          }
          break;
        // A count below the base means the counter was reset for this session: it counts from 0.
        case "ACChargingEnergyIn":
          if (open && n !== null) {
            if (n < open.acBase) open.acBase = 0;
            open.acEnergy = Math.max(open.acEnergy ?? n, n);
          }
          break;
        case "DCChargingEnergyIn":
          if (open && n !== null) {
            if (n < open.dcBase) open.dcBase = 0;
            open.dcEnergy = Math.max(open.dcEnergy ?? n, n);
          }
          break;
      }
    }
    if (open) {
      // Sticky: the charger type may only be reported after the session began.
      if (open.fastPresent && fastType.includes("supercharger")) open.supercharger = true;
      if (starting) {
        open.startLevel = level?.v ?? null;
        open.startEnergy = energy?.v ?? null;
      }
      // While charging: the values that arrived now, and on entering Charging the ones carried over.
      if (chargeState === "Charging") {
        const entering = starting || state === "Charging";
        const fresh = (field: string) => entering || batch.some((r) => r.field === field);
        if (volts !== null && volts >= MIN_AC_VOLTS && fresh("ChargerVoltage")) open.volts.push(volts);
        if (amps !== null && fresh("ChargeAmps")) open.amps.push(amps);
        if (phases !== null && phases > 0 && fresh("ChargerPhases")) open.phases.push(phases);
      }
    }

    if (state !== null) {
      if (END_STATES.has(state)) finish(t);
      // Unplugged: the next plug-in's counters start again from 0.
      if (state === "Disconnected") acClose = dcClose = 0;
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

// "Bengaluru, Nexus Koramangala" -> { place: "Nexus Koramangala", city: "Bengaluru" }
export function splitSite(name: string | null): { place: string; city: string | null } {
  if (!name) return { place: "Supercharger", city: null };
  const i = name.indexOf(", ");
  if (i === -1) return { place: name, city: null };
  return { place: name.slice(i + 2), city: name.slice(0, i) };
}
