import { describe, expect, test } from "bun:test";
import { batteryState } from "@/components/battery-gauge";
import { bannerText } from "@/components/updates/update-banner";
import { flatLevelNote } from "@/lib/charge-level";
import { noneWords } from "@/lib/periods";
import type { Snapshot } from "@/lib/server/dashboard";

// What the home page says on a quiet day: a tile with nothing says one thing, a flat charge level is a
// sentence, and the car's state line is only what was seen.

const snapshot = (over: Partial<Snapshot>): Snapshot => ({
  polled_at: "2026-10-26T15:00:00Z",
  state: "online",
  car_version: "2026.38.5.1",
  update_status: null,
  update_version: null,
  download_perc: null,
  install_perc: null,
  expected_duration_sec: null,
  scheduled_time_ms: null,
  battery_level: 66,
  battery_range_km: 287,
  charging_state: "Disconnected",
  charge_limit: 80,
  charge_power_kw: null,
  charge_energy_kwh: null,
  time_to_full_h: null,
  error: null,
  ...over,
});

describe("noneWords", () => {
  test("names the period, short enough for a tile", () => {
    expect(noneWords({ period: "day" })).toBe("None today");
    expect(noneWords({ period: "week" })).toBe("None in 7 days");
    expect(noneWords({ period: "month" })).toBe("None this month");
    expect(noneWords({ period: "year" })).toBe("None this year");
    expect(noneWords({ period: "all" })).toBe("None yet");
  });
  test("a range picked by date has no period", () => {
    expect(noneWords({})).toBe("None in these dates");
  });
});

describe("flatLevelNote", () => {
  const at = (h: number, level: number) => ({ at: h * 3_600_000, level });
  test("a level that never moved is one sentence", () => {
    expect(flatLevelNote([at(0, 61), at(6, 61), at(12, 61)], 0)).toBe("Stayed at 61%.");
  });
  test("a small fall with no charge is one sentence, levels before and after", () => {
    expect(flatLevelNote([at(0, 61), at(12, 60), at(23, 59)], 0)).toBe("Went from 61% to 59%, with no charging.");
  });
  test("a charge, a bigger move or too few readings keep the chart", () => {
    expect(flatLevelNote([at(0, 61), at(12, 61)], 1)).toBeNull();
    expect(flatLevelNote([at(0, 61), at(12, 58)], 0)).toBeNull();
    expect(flatLevelNote([at(0, 61)], 0)).toBeNull();
  });
});

const NOW = Date.UTC(2026, 9, 28, 12, 0);

describe("batteryState", () => {
  test("charging says the power, the limit and the time left on one line", () => {
    expect(batteryState(snapshot({ charging_state: "Charging", charge_power_kw: 7.2, time_to_full_h: 1.3 }), null, NOW)).toBe("Charging at 7.2 kW to 80% · Full in 1 h 18 min");
  });
  test("charging without streamed power says only the limit", () => {
    expect(batteryState(snapshot({ charging_state: "Charging" }), null, NOW)).toBe("Charging to 80%");
  });
  test("charging says the energy added so far, after the time left", () => {
    // 31 Oct 2026, 2:12 PM, a 60 kW CCS charger: 5.88 kWh in, the same as the charger's own app (5.79).
    const dc = snapshot({ charging_state: "Charging", charge_limit: 70, charge_power_kw: 59.6, charge_energy_kwh: 5.88 });
    expect(batteryState(dc, null, NOW)).toBe("Charging at 59.6 kW to 70% · 5.9 kWh added");
    const ac = snapshot({ charging_state: "Charging", charge_power_kw: 7.2, time_to_full_h: 1.3, charge_energy_kwh: 3.21 });
    expect(batteryState(ac, null, NOW)).toBe("Charging at 7.2 kW to 80% · Full in 1 h 18 min · 3.2 kWh added");
    // The first minute: nothing worth saying yet.
    expect(batteryState(snapshot({ charging_state: "Charging", charge_power_kw: 7.2, charge_energy_kwh: 0.02 }), null, NOW)).toBe("Charging at 7.2 kW to 80%");
  });
  test("not charging says when it parked, only when the readings say so", () => {
    // NOW is 28 Oct 2026, 5:30 PM IST.
    expect(batteryState(snapshot({}), { start: NOW - 2 * 3_600_000, fromFirstReading: false }, NOW)).toBe("Parked since 3:30 PM");
    expect(batteryState(snapshot({}), { start: NOW - 22 * 3_600_000, fromFirstReading: false }, NOW)).toBe("Parked since yesterday, 7:30 PM");
    expect(batteryState(snapshot({}), { start: NOW - 3 * 86_400_000, fromFirstReading: true }, NOW)).toBe("Parked since before 25 Oct, 5:30 PM");
    expect(batteryState(snapshot({}), null, NOW)).toBeNull();
  });
});

describe("bannerText", () => {
  test("progress is its own part, so a phone can cut the version short and keep the number", () => {
    expect(bannerText(snapshot({ update_status: "downloading", update_version: "2026.44.5", download_perc: 42 }))).toEqual({ text: "Downloading 2026.44.5", progress: "42%" });
    expect(bannerText(snapshot({ update_status: "installing", update_version: "2026.44.5", install_perc: 10 }))).toEqual({ text: "Installing 2026.44.5", progress: "10%" });
    expect(bannerText(snapshot({ update_status: "downloading", update_version: "2026.44.5" }))).toEqual({ text: "Downloading 2026.44.5", progress: null });
  });
  test("the other states have no progress", () => {
    expect(bannerText(snapshot({ update_status: "available", update_version: "2026.44.5" }))).toEqual({ text: "2026.44.5 ready to install", progress: null });
    expect(bannerText(snapshot({ update_status: "scheduled", update_version: "2026.44.5" }))).toEqual({ text: "2026.44.5 scheduled", progress: null });
    expect(bannerText(snapshot({ update_status: "downloading_wifi_wait", update_version: "2026.44.5" }))).toEqual({ text: "2026.44.5 waiting for Wi-Fi", progress: null });
    expect(bannerText(snapshot({ update_status: "queued", update_version: "2026.44.5" }))).toEqual({ text: "2026.44.5 queued as the next update", progress: null });
  });
});
