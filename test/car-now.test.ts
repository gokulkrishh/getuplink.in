import { describe, expect, test } from "bun:test";
import { carNow, measuredAt, tyreFlags, words } from "@/lib/car-now";

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
