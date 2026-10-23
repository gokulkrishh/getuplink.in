import { describe, expect, test } from "bun:test";
import { carNow, words } from "@/lib/car-now";

const at = "2026-10-23T08:00:00Z";

describe("carNow", () => {
  test("enum values in plain words", () => {
    expect(words("SentryModeStateArmed")).toBe("Armed");
    expect(words("HvacPowerStateOn")).toBe("On");
    expect(words("ClimateKeeperModeStateDog")).toBe("Dog");
    expect(words(true)).toBe("Yes");
  });
  test("rows from the latest readings, tyres in bar, warnings named", () => {
    const now = carNow({
      Locked: { at, value: true },
      SentryMode: { at, value: "SentryModeStateIdle" },
      FdWindow: { at, value: "WindowStateClosed" },
      RpWindow: { at, value: "WindowStatePartiallyOpen" },
      InsideTemp: { at, value: 31.25 },
      TpmsPressureFl: { at, value: 2.85 },
      TpmsHardWarnings: { at, value: [] },
      TpmsSoftWarnings: { at, value: true },
    });
    expect(now.rows).toEqual([
      ["Locked", "Yes"],
      ["Sentry Mode", "Idle"],
      ["Windows", "1 open"],
      ["Inside", "31.3 °C"],
    ]);
    expect(now.tyres).toEqual([["Front left", "2.9 bar"]]);
    expect(now.tyreWarning).toBe("A tyre is a little low.");
  });
});
