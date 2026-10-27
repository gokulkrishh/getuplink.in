import { describe, expect, test } from "bun:test";
import { checkTips, type Finding, unshownCause } from "@/lib/ai-tips";
import type { ParkedPeriod } from "@/lib/drives";
import { modesWhileParked, onMsIn } from "@/lib/parked-modes";

const H = 3_600_000;
const at = (h: number) => new Date(h * H).toISOString();

describe("modes while parked", () => {
  test("a mode holds from one reading to the next, and the state before the stretch carries in", () => {
    const sentry = [
      { at: at(0), value: "SentryModeStateArmed" },
      { at: at(5), value: "SentryModeStateOff" },
      { at: at(8), value: "SentryModeStateAware" },
    ];
    expect(onMsIn(sentry, 2 * H, 10 * H)).toBe(5 * H);
    expect(onMsIn([{ at: at(0), value: "SentryModeStateOff" }], 0, 10 * H)).toBe(0);
  });

  test("a mode counts only while the car was seen awake", () => {
    const p = { start: 0, end: 10 * H, awakeMs: 2 * H } as ParkedPeriod;
    expect(modesWhileParked(p, { SentryMode: [{ at: at(0), value: "SentryModeStateArmed" }] }).sentryMs).toBe(2 * H);
  });
});

describe("a tip names a cause only when its finding holds it", () => {
  const plain: Finding = { kind: "parkedLoss", score: 1, facts: { lostPerDayParked: "0.8 kWh" }, say: "" };
  const sentry: Finding = { ...plain, kind: "heavyDrain", causes: ["sentry"] };

  test("Sentry Mode, apps or air conditioning are refused without the data", () => {
    expect(unshownCause("Turning off Sentry Mode can cut this.", plain)).toBe("sentry");
    expect(unshownCause("Apps that wake the car add to it.", plain)).toBe("apps");
    expect(unshownCause("Air conditioning raises energy use.", plain)).toBe("climate");
    expect(unshownCause("Parked, the car lost 0.8 kWh a day.", plain)).toBeNull();
    expect(unshownCause("Sentry Mode was on, which keeps the car awake.", sentry)).toBeNull();
  });

  test("checkTips drops the tip that guesses", () => {
    const tips = checkTips({ tips: [{ kind: "parkedLoss", text: "Parked, the car lost 0.8 kWh a day. Turning off Sentry Mode can cut this." }] }, [plain]);
    expect(tips).toEqual([]);
  });
});
