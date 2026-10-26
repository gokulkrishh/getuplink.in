import { describe, expect, test } from "bun:test";
import { buildSessions, CHARGE_FIELDS } from "@/lib/charge-sessions";
import { analyseDriving } from "@/lib/drives";
import { generateDemo } from "@/lib/server/demo/generate";

// The demo's charge now lives in its history, so the stream's latest state, the session list and the
// parked stretch tell one story, whatever the time of day.
const ist = (local: string) => Date.parse(`${local}+05:30`);
const times = ["2026-10-26T06:00:00", "2026-10-26T08:50:00", "2026-10-26T09:30:00", "2026-10-26T20:43:00", "2026-10-26T23:20:00"];

describe("demo charging now", () => {
  for (const local of times) {
    test(`agrees everywhere at ${local} IST`, () => {
      const now = ist(local);
      const { readings: r, snapshot } = generateDemo(now);
      const state = String(r.DetailedChargeState.at(-1)?.value);
      const charging = state === "DetailedChargeStateCharging";
      const sessions = buildSessions(CHARGE_FIELDS.flatMap((field) => (r[field] ?? []).map((x) => ({ field, at: x.at, value: x.value }))));
      const newest = sessions.at(-1)!;
      const { parkedNow, drives } = analyseDriving(
        { gear: r.Gear, odometer: r.Odometer, battery: r.BatteryLevel, energy: r.EnergyRemaining, lifetime: r.LifetimeEnergyUsed, range: r.RatedRange, charge: r.DetailedChargeState },
        now,
      );
      expect(snapshot.charging_state).toBe(charging ? "Charging" : "Disconnected");
      expect(r.ChargePortDoorOpen.at(-1)?.value).toBe(charging);
      if (charging) {
        expect(parkedNow).toBeNull();
        expect(newest.ended_at).toBeNull();
        expect(newest.kind).toBe("ac");
        // No drive runs into the charge.
        expect(drives.every((d) => d.end <= Date.parse(newest.started_at))).toBe(true);
      } else {
        expect(parkedNow).not.toBeNull();
        expect(sessions.every((s) => s.ended_at !== null)).toBe(true);
      }
    });
  }
  test("charging at most times of day", () => {
    expect(times.filter((t) => String(generateDemo(ist(t)).readings.DetailedChargeState.at(-1)?.value).endsWith("Charging")).length).toBeGreaterThanOrEqual(3);
  });
});
