import { describe, expect, test } from "bun:test";
import { carNow, firstArrival, measuredAt, seenAt, tyreFlags, words } from "@/lib/car-now";

// TpmsLastSeenPressureTimeFl as the car sent it, arrival times in IST. Each new value came 12 h 30 min
// ahead of its arrival; the 24 Oct 12:35:17 AM value (1792771517) was then sent again on every wake.
const ist = (local: string) => new Date(`${local}+05:30`).toISOString();
const seen = [
  { at: ist("2026-10-23T13:51:05"), value: 1792771517 },
  { at: ist("2026-10-23T23:57:39"), value: 1792771517 },
  { at: ist("2026-10-24T07:39:50"), value: 1792771517 },
  { at: ist("2026-10-25T21:07:59"), value: 1792771517 },
  { at: ist("2026-10-25T21:20:39"), value: 1792948838 },
  { at: ist("2026-10-25T22:06:15"), value: 1792991174 },
  { at: ist("2026-10-26T07:09:00"), value: 1792991174 },
  { at: ist("2026-10-26T07:14:12"), value: 1792991174 },
];

describe("firstArrival", () => {
  test("the earliest of the newest run of equal values", () => {
    expect(firstArrival(seen)).toBe(ist("2026-10-25T22:06:15"));
    expect(firstArrival(seen.slice(0, 5))).toBe(ist("2026-10-25T21:20:39"));
  });
  test("unknown when the run reaches the first reading given", () => {
    expect(firstArrival(seen.slice(0, 4))).toBeNull();
    expect(firstArrival([])).toBeNull();
  });
});

describe("seenAt", () => {
  test("a time after the value first arrived is left out, even once it has passed", () => {
    // Arrived 25 Oct 10:06:15 PM IST saying 26 Oct 10:36:14 AM; still wrong on the 26th at 2:30 PM.
    expect(seenAt(1792991174, ist("2026-10-25T22:06:15"), Date.parse(ist("2026-10-26T14:30:00")))).toBeNull();
  });
  test("a re-send doesn't make it right: the 24 Oct 7:39 AM row of the 12:35 AM value", () => {
    // Bounded by that row's own arrival it would pass; bounded by the value's first arrival it doesn't.
    expect(seenAt(1792771517, ist("2026-10-24T07:39:50"), Date.parse(ist("2026-10-24T08:00:00")))).not.toBeNull();
    expect(seenAt(1792771517, firstArrival([{ at: ist("2026-10-23T12:00:00"), value: 1 }, ...seen.slice(0, 3)]), Date.parse(ist("2026-10-24T08:00:00")))).toBeNull();
  });
  test("a time before the value first arrived is kept", () => {
    expect(seenAt(Date.parse("2026-10-25T16:30:00Z") / 1000, "2026-10-25T16:36:15Z", Date.parse("2026-10-26T09:00:00Z"))).toBe("2026-10-25T16:30:00.000Z");
  });
  test("no first arrival, no time", () => {
    expect(seenAt(1792991174, null, Date.now())).toBeNull();
  });
  test("on the car page, a tyre with a wrong or unknown time falls back to when its pressure arrived", () => {
    const stream = { TpmsPressureFl: { at: seen[7].at, value: 2.75 }, TpmsLastSeenPressureTimeFl: seen[7] };
    const later = Date.parse(ist("2026-10-26T14:30:00"));
    for (const arrivals of [{}, { TpmsLastSeenPressureTimeFl: firstArrival(seen) }] as Record<string, string | null>[])
      expect(carNow(stream, later, null, arrivals).tyres.map((t) => [t.pressure, t.measuredAt, t.updatedAt])).toEqual([["40 psi", null, seen[7].at]]);
  });
});

const at = "2026-10-23T08:00:00Z";
const now = Date.parse("2026-10-25T08:00:00Z");

describe("carNow", () => {
  test("enum values in plain words", () => {
    expect(words("SentryModeStateArmed")).toBe("Armed");
    expect(words("HvacPowerStateOn")).toBe("On");
    expect(words("ClimateKeeperModeStateDog")).toBe("Dog");
    expect(words(true)).toBe("Yes");
  });
  test("rows from the latest readings, tyres in psi, warnings named", () => {
    const state = carNow(
      {
        Locked: { at, value: true },
        SentryMode: { at, value: "SentryModeStateIdle" },
        FdWindow: { at, value: "WindowStateClosed" },
        RpWindow: { at, value: "WindowStatePartiallyOpen" },
        DoorState: { at, value: { DriverFront: false, DriverRear: false, PassengerFront: false, PassengerRear: false, TrunkFront: false, TrunkRear: true } },
        InsideTemp: { at, value: 31.25 },
        TpmsPressureFl: { at, value: 2.85 },
        TpmsLastSeenPressureTimeFl: { at, value: Date.parse(at) / 1000 },
        TpmsHardWarnings: { at, value: [] },
        TpmsSoftWarnings: { at, value: { front_left: false, front_right: false, rear_left: true, rear_right: false } },
      },
      now,
      null,
      { TpmsLastSeenPressureTimeFl: at },
    );
    expect(state.rows).toEqual([
      ["Locked", "Yes"],
      ["Sentry Mode", "Idle"],
      ["Doors", "boot open"],
      ["Windows", "1 open"],
      ["Inside", "31.3 °C"],
    ]);
    expect(state.tyres).toEqual([{ name: "Front left", pressure: "41 psi", measuredAt: "2026-10-23T08:00:00.000Z", updatedAt: at, warning: null, alert: null }]);
    expect(state.tyreWarning).toBe("Rear left is low.");
  });
  test("each tyre in whole psi, front left to rear right, the warned one named on its own", () => {
    const state = carNow(
      {
        TpmsPressureRr: { at, value: 2.75 },
        TpmsPressureFl: { at, value: 2.9 },
        TpmsPressureFr: { at, value: 2.9 },
        TpmsPressureRl: { at: "2026-10-24T08:00:00Z", value: 2.1 },
        TpmsSoftWarnings: { at, value: { rear_left: true } },
      },
      now,
    );
    expect(state.tyres.map((t) => [t.name, t.pressure, t.measuredAt, t.updatedAt, t.alert])).toEqual([
      ["Front left", "42 psi", null, at, null],
      ["Front right", "42 psi", null, at, null],
      ["Rear left", "30 psi", null, "2026-10-24T08:00:00Z", "Rear left is low"],
      ["Rear right", "40 psi", null, at, null],
    ]);
  });
  test("hard warnings first, several tyres named together", () => {
    const state = carNow(
      {
        TpmsPressureFr: { at, value: 1.9 },
        TpmsHardWarnings: { at, value: { front_right: true } },
        TpmsSoftWarnings: { at, value: { frontLeft: true, rearRight: true, frontRight: true } },
      },
      now,
    );
    expect(state.tyreWarning).toBe("Front right is very low. Check before you drive. Front left and rear right are low.");
    expect(state.tyres[0].warning).toBe("very low");
  });
  test("a newer check's warnings win over older streamed ones", () => {
    const stream = { TpmsSoftWarnings: { at, value: { front_left: false, front_right: false, rear_left: false, rear_right: false } } };
    const checked = { at: "2026-10-24T08:00:00Z", soft: { fl: true, rr: true }, hard: {} };
    expect(carNow(stream, now, checked).tyreWarning).toBe("Front left and rear right are low.");
    // An older check doesn't override the stream.
    expect(carNow(stream, now, { ...checked, at: "2026-10-22T08:00:00Z" }).tyreWarning).toBeNull();
  });
  test("a warning that doesn't say which tyre stays general", () => {
    expect(carNow({ TpmsHardWarnings: { at, value: true } }, now).tyreWarning).toBe("Tyre pressure warning: check your tyres.");
    expect(carNow({ TpmsSoftWarnings: { at, value: [1] } }, now).tyreWarning).toBe("A tyre is a little low.");
  });
  test("all four tyres", () => {
    expect(carNow({ TpmsSoftWarnings: { at, value: { fl: true, fr: true, rl: true, rr: true } } }, now).tyreWarning).toBe("All four tyres are low.");
  });
});

describe("tyreFlags", () => {
  test("a TireLocation object in any casing; anything else is null", () => {
    expect(tyreFlags({ front_left: true, RearRight: false })).toEqual({ fl: true, rr: false });
    expect(tyreFlags({ spare: true })).toBeNull();
    expect(tyreFlags([true])).toBeNull();
    expect(tyreFlags(true)).toBeNull();
  });
});

describe("measuredAt", () => {
  const iso = "2026-10-23T08:00:00.000Z";
  test("seconds, ms, numeric strings, ISO and { seconds }", () => {
    expect(measuredAt(Date.parse(iso) / 1000, now)).toBe(iso);
    expect(measuredAt(Date.parse(iso), now)).toBe(iso);
    expect(measuredAt(String(Date.parse(iso) / 1000), now)).toBe(iso);
    expect(measuredAt(iso, now)).toBe(iso);
    expect(measuredAt({ seconds: Date.parse(iso) / 1000 }, now)).toBe(iso);
  });
  test("unreadable, too old or in the future is null", () => {
    expect(measuredAt("soon", now)).toBeNull();
    expect(measuredAt(0, now)).toBeNull();
    expect(measuredAt(null, now)).toBeNull();
    expect(measuredAt(now / 1000 + 3600, now)).toBeNull();
  });
});
