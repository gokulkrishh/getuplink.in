import { describe, expect, test } from "bun:test";
import { barsCaption } from "@/components/stats/chart-caption";
import { MILES_TO_KM } from "@/lib/car";
import { driveEnergy, driveKmIn, timeframeEfficiency } from "@/lib/drive-stats";
import { type CounterColumn, drivingTimeframe, timeframeInstants } from "@/lib/driving-figures";
import { type Drive, hourKm, istHourStart } from "@/lib/drives";
import { formatHours, sumKnown } from "@/lib/format";
import { fromTracking, isoDay, periodTimeframe, rangeSlots, rangeTimeframe } from "@/lib/periods";

const ist = (local: string) => Date.parse(`${local}+05:30`);

// Hourly bars. A bar says its whole span, so a 7:14 AM trip in the 7 AM to 8 AM bar never reads as
// "drove at 7 AM".
describe("slots of hours", () => {
  const now = ist("2026-10-25T14:00:00");
  const day = (local: string) => isoDay(local)!;

  test("formatHours writes both ends in full, 12-hour", () => {
    expect(formatHours(6, 7)).toBe("6 AM to 7 AM");
    expect(formatHours(11, 12)).toBe("11 AM to 12 PM");
    expect(formatHours(23, 24)).toBe("11 PM to 12 AM");
    expect(formatHours(0, 1)).toBe("12 AM to 1 AM");
  });

  test("a one-day range has the Day period's hours", () => {
    const { slots } = rangeSlots({ from: day("2026-10-24"), to: day("2026-10-24") }, now);
    expect(slots).toHaveLength(24);
    expect(slots[7]).toMatchObject({ label: "7 AM to 8 AM", axis: "7 AM", edge: true, from: ist("2026-10-24T07:00:00"), to: ist("2026-10-24T08:00:00") });
  });

  test("a two-day range names the day in every label, and on the axis at each midnight", () => {
    const { slots, slotName } = rangeSlots({ from: day("2026-10-24"), to: day("2026-10-25") }, now);
    expect(slotName).toBe("hour");
    expect(slots).toHaveLength(48);
    expect(slots[0]).toMatchObject({ label: "Sat, 12 AM to 1 AM", axis: "Sat", from: ist("2026-10-24T00:00:00") });
    expect(slots[6]).toMatchObject({ label: "Sat, 6 AM to 7 AM", axis: "6 AM" });
    expect(slots[24]).toMatchObject({ label: "Sun, 12 AM to 1 AM", axis: "Sun", from: ist("2026-10-25T00:00:00") });
    expect(slots[47]).toMatchObject({ label: "Sun, 11 PM to 12 AM", axis: "11 PM", ahead: true });
    expect(slots.find((s) => s.isCurrent)!.label).toBe("Sun, 2 PM to 3 PM");
  });

  test("longer ranges and other periods keep centred labels", () => {
    expect(rangeSlots({ from: day("2026-10-19"), to: day("2026-10-25") }, now).slots.some((s) => s.edge || s.axis)).toBe(false);
    expect(periodTimeframe("week", now).slots.some((s) => s.edge)).toBe(false);
  });

  test("captions say what each bar covers", () => {
    expect(barsCaption("Kilometres driven", periodTimeframe("day", now))).toBe("Kilometres driven each hour today");
    expect(barsCaption("Bills", rangeTimeframe({ from: day("2026-10-24"), to: day("2026-10-24") }, now))).toBe("Bills each hour on 24 Oct");
    expect(barsCaption("Energy added", rangeTimeframe({ from: day("2026-10-24"), to: day("2026-10-25") }, now))).toBe("Energy added each hour from 24 Oct to 25 Oct");
    expect(barsCaption("Kilometres driven", periodTimeframe("week", now))).toBe("Kilometres driven each day, last 7 days");
    expect(barsCaption("Kilometres driven", periodTimeframe("month", now))).toBe("Kilometres driven each day, this month");
  });

  test("IST hours start at half past a UTC hour", () => {
    expect(istHourStart(ist("2026-10-25T07:14:00"))).toBe(ist("2026-10-25T07:00:00"));
    expect(istHourStart(ist("2026-10-25T00:00:00"))).toBe(ist("2026-10-25T00:00:00"));
    expect(istHourStart(ist("2026-10-24T23:59:59"))).toBe(ist("2026-10-24T23:00:00"));
  });
});

// A made-up morning: parked overnight, asleep from 1 AM, awake at 6:50, a drive from 7:14 AM to 8:19 AM
// at a steady 0.5 miles a minute, then parked and awake until 10, asleep after.
describe("a drive split across the hours it ran through", () => {
  const now = ist("2026-10-25T14:00:00");
  const start = ist("2026-10-25T07:14:00");
  const end = ist("2026-10-25T08:19:00");
  const base = 4000;
  // Odometer every minute while driving; once on waking, unchanged.
  const odometer: { t: number; v: number }[] = [{ t: ist("2026-10-24T22:30:00"), v: base }, { t: ist("2026-10-25T06:50:00"), v: base }];
  for (let t = start; t <= end; t += 60_000) odometer.push({ t, v: base + ((t - start) / 60_000) * 0.5 });
  const odoEnd = odometer.at(-1)!.v;
  const driveKm = (odoEnd - base) * MILES_TO_KM;
  const pieces = hourKm(odometer, start, end + 10 * 60_000, base, odoEnd);

  test("the pieces fall in the 7 AM and 8 AM hours, by the odometer at 8 AM, and add up to the drive", () => {
    expect(pieces.map((p) => p.from)).toEqual([ist("2026-10-25T07:00:00"), ist("2026-10-25T08:00:00")]);
    // 7:14 to 7:59 is 45 minutes of driving before 8 AM's last reading; its last reading, 7:59, to 8:19 is 20 after it.
    expect(pieces[0].km).toBeCloseTo(45 * 0.5 * MILES_TO_KM, 6);
    expect(pieces[1].km).toBeCloseTo(20 * 0.5 * MILES_TO_KM, 6);
    expect(pieces[0].km + pieces[1].km).toBeCloseTo(driveKm, 9);
  });

  const drive: Drive = { start, end, km: driveKm, kwh: 6.5, whPerKm: null, startLevel: null, endLevel: null, hourKm: pieces };
  const seven = { from: ist("2026-10-25T07:00:00"), to: ist("2026-10-25T08:00:00") };
  const eight = { from: ist("2026-10-25T08:00:00"), to: ist("2026-10-25T09:00:00") };

  test("its energy is shared out by distance, and the hours add up to the day", () => {
    expect(driveKmIn(drive, seven)).toBeCloseTo(pieces[0].km, 9);
    const a = driveEnergy([drive], seven).kwh!;
    const b = driveEnergy([drive], eight).kwh!;
    expect(a / b).toBeCloseTo(pieces[0].km / pieces[1].km, 9);
    expect(a + b).toBeCloseTo(6.5, 9);
    expect(driveEnergy([drive], { from: ist("2026-10-25T00:00:00"), to: Infinity }).kwh).toBeCloseTo(6.5, 9);
    expect(driveEnergy([drive], { from: ist("2026-10-25T09:00:00"), to: ist("2026-10-25T10:00:00") }).kwh).toBeNull();
  });

  // The counters as the loader returns them, read at the Day frame's hour boundaries.
  const frame = periodTimeframe("day", now);
  const instants = timeframeInstants([frame], now);
  const column = (points: { t: number; v: number }[]): CounterColumn => ({
    first: { at: points[0].t, value: points[0].v },
    bounds: instants.map((t) => {
      const p = points.findLast((q) => q.t < t);
      return p ? { at: p.t, value: p.v } : null;
    }),
  });
  // EnergyRemaining while awake: from 6:50 AM to 10 AM, every 5 minutes, and at 12:30 AM before sleeping.
  const awake: { t: number; v: number }[] = [{ t: ist("2026-10-25T00:30:00"), v: 50 }];
  for (let t = ist("2026-10-25T06:50:00"); t < ist("2026-10-25T10:00:00"); t += 5 * 60_000) awake.push({ t, v: 50 });
  const counters = { instants, odometer: column(odometer), used: null, regen: null, polledOdometer: null };
  const day = drivingTimeframe({ ...counters, presence: [column(odometer), column(awake)] }, frame, now);
  const km = day.bars.map((b) => b.km);

  test("asleep hours are blank, awake and parked ones a real 0, hours ahead blank", () => {
    // 12 AM: awake (a reading at 12:30). 1 AM to 6 AM: asleep, nothing sent.
    expect(km[0]).toBe(0);
    expect(km.slice(1, 6)).toEqual([null, null, null, null, null]);
    // 6 AM: woke at 6:50, didn't move. 9 AM: parked and awake.
    expect(km[6]).toBe(0);
    expect(km[9]).toBe(0);
    // 10 AM to 2 PM: asleep again.
    expect(km.slice(10, 14)).toEqual([null, null, null, null]);
    // Now's hour has no reading yet, so it is blank too; the hours after it are ahead (blank, see knownBar).
    expect(frame.slots[14].isCurrent).toBe(true);
  });

  test("the 7 AM and 8 AM bars split the drive, and their raw sum is the day's distance", () => {
    expect(km[7]).toBeCloseTo(pieces[0].km, 9);
    expect(km[8]).toBeCloseTo(pieces[1].km, 9);
    expect(sumKnown(km)).toBeCloseTo(day.current.km!, 9);
  });

  test("without the presence fields, nothing is blanked on a guess", () => {
    const unknown = drivingTimeframe(counters, frame, now);
    expect(unknown.bars.slice(1, 6).map((b) => b.km)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("charts start where the data starts", () => {
  const now = ist("2026-10-26T14:00:00");

  test("a month drawn from the day tracking began, with a note saying so", () => {
    const { frame, skip } = fromTracking(periodTimeframe("month", now), ist("2026-10-23T10:15:00"), now);
    expect(skip).toBe(22);
    expect(frame.slots[0].from).toBe(ist("2026-10-23T00:00:00"));
    expect(frame.slots).toHaveLength(9);
    // The period is still named, so Week and Month don't read the same when both start at tracking.
    expect(frame.words).toBe("this month, since 23 Oct");
    expect(barsCaption("Kilometres driven", frame)).toBe("Kilometres driven each day this month, since 23 Oct");
    const week = fromTracking(periodTimeframe("week", now), ist("2026-10-23T10:15:00"), now).frame;
    expect(barsCaption("", week).trim()).toBe("each day in the last 7 days, since 23 Oct");
    // All has no start of its own to name.
    expect(fromTracking(periodTimeframe("all", now), ist("2026-10-23T10:15:00"), now).frame.words).toBe("since 23 Oct");
  });

  test("a period inside tracking is left alone", () => {
    const week = periodTimeframe("week", now);
    expect(fromTracking(week, ist("2026-09-01T00:00:00"), now)).toEqual({ frame: week, skip: 0 });
    expect(fromTracking(week, null, now).skip).toBe(0);
    // Tracking that began today keeps every hour of today: the axis starts at the day, not the reading.
    expect(fromTracking(periodTimeframe("day", now), ist("2026-10-26T09:40:00"), now).skip).toBe(0);
  });

  test("a two-day range from the day before tracking keeps the second day's 24 hours", () => {
    const range = rangeTimeframe({ from: isoDay("2026-10-22")!, to: isoDay("2026-10-23")! }, now);
    const { frame, skip } = fromTracking(range, ist("2026-10-23T10:15:00"), now);
    expect(skip).toBe(24);
    expect(frame.slots[0].from).toBe(ist("2026-10-23T00:00:00"));
    expect(barsCaption("Kilometres driven", frame)).toBe("Kilometres driven each hour since 23 Oct");
  });

  test("a year and all of time start at tracking's month and year", () => {
    expect(fromTracking(periodTimeframe("year", now), ist("2026-10-23T10:15:00"), now).frame.slots.map((s) => s.label)).toEqual(["Oct", "Nov", "Dec"]);
    expect(fromTracking(periodTimeframe("all", now), ist("2026-10-23T10:15:00"), now).frame.slots.map((s) => s.label)).toEqual(["2026"]);
  });

  test("few days left draw every label", () => {
    expect(fromTracking(periodTimeframe("month", now), ist("2026-10-23T10:15:00"), now).frame.labelEvery).toBe(2);
    expect(fromTracking(periodTimeframe("month", now), ist("2026-10-25T10:15:00"), now).frame.labelEvery).toBe(1);
    // Three months: just those three columns, not padded out to six.
    expect(fromTracking(periodTimeframe("year", now), ist("2026-10-23T10:15:00"), now).frame.labelEvery).toBe(1);
  });
});

describe("a year that starts before the drives do", () => {
  test("its energy total is the sum of its bars, counter months and drive months alike", () => {
    const now = ist("2026-10-26T14:00:00");
    const frame = periodTimeframe("year", now);
    // Made-up counter figures: 100 km and 20 kWh a month to July, no driving in August or September,
    // 50 km in October, nothing yet in November or December.
    const bar = (k: number) => (k < 7 ? { km: 100, kwh: 20 } : k < 9 ? { km: 0, kwh: null } : k === 9 ? { km: 50, kwh: 9 } : { km: null, kwh: null });
    const p = {
      current: { km: 750, whPerKm: null, kwh: 300, regenKwh: null },
      previous: null,
      bars: frame.slots.map((_, k) => ({ ...bar(k), whPerKm: null, regenKwh: null })),
    };
    const drive: Drive = { start: ist("2026-10-10T09:00:00"), end: ist("2026-10-10T10:00:00"), km: 50, kwh: 7, whPerKm: null, startLevel: null, endLevel: null };
    const year = timeframeEfficiency(p, frame, [drive], ist("2026-01-01T00:00:00"), now);
    const sum = year.bars.reduce((s, b) => s + (b.kwh ?? 0), 0);
    expect(year.bars[9].kwh).toBe(7);
    expect(sum).toBeCloseTo(147, 9);
    expect(year.current.kwh).toBeCloseTo(sum, 9);
  });
});

