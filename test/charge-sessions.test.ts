import { describe, expect, test } from "bun:test";
import { levelThroughEnd } from "@/lib/charge-curve";
import { buildSessions, type ChargeReading, chargeEfficiency } from "@/lib/charge-sessions";
import { formatTempRange } from "@/lib/format";
import { applyStream } from "@/lib/telemetry";
import { typicalChargeKw } from "@/lib/telemetry-derive";
import type { Snapshot } from "@/lib/server/dashboard";

// The real third-party DC charge of 25 Oct 2026 (IST), as the car streamed it. Invoiced 14.74 kWh.
const day = (clock: string) => `2026-10-25T${clock}+05:30`;
const r = (clock: string, field: string, value: unknown): ChargeReading => ({ at: day(clock), field, value });
const STATE = (s: string) => `DetailedChargeState${s}`;

const REAL: ChargeReading[] = [
  r("21:12:59", "BatteryLevel", 46.940593812616186),
  r("21:12:59", "EnergyRemaining", 30.759999312460423),
  r("21:14:43", "ModuleTempMax", 30.5),
  r("21:17:59", "BatteryLevel", 46.38949568083824),
  r("21:17:59", "EnergyRemaining", 30.379999320954084),
  r("21:19:59", "ChargingCableType", "CableTypeIEC"),
  r("21:19:59", "DCChargingEnergyIn", 0),
  r("21:19:59", "DetailedChargeState", STATE("NoPower")),
  r("21:22:53", "DetailedChargeState", STATE("Disconnected")),
  r("21:22:59", "BatteryLevel", 46.29224306934801),
  r("21:23:53", "ChargingCableType", "CableTypeIEC"),
  r("21:23:53", "DetailedChargeState", STATE("NoPower")),
  r("21:24:56", "DetailedChargeState", STATE("Stopped")),
  r("21:24:56", "FastChargerPresent", true),
  r("21:24:56", "FastChargerType", "FastChargerCombo"),
  r("21:25:30", "DCChargingPower", 18.64147958333045),
  r("21:25:41", "DCChargingEnergyIn", 0.05999999865889549),
  r("21:25:43", "ModuleTempMax", 31.5),
  r("21:25:52", "EnergyRemaining", 30.499999318271875),
  r("21:25:56", "DetailedChargeState", STATE("Charging")),
  r("21:26:30", "DCChargingPower", 29.340629344185814),
  r("21:26:41", "DCChargingEnergyIn", 0.4599999897181988),
  r("21:27:59", "BatteryLevel", 48.17246022482573),
  r("21:30:42", "DCChargingPower", 29.16959934800863),
  r("21:30:52", "EnergyRemaining", 32.75999926775694),
  r("21:32:33", "ModuleTempMax", 32.5),
  r("21:32:59", "BatteryLevel", 52.0301471472714),
  r("21:37:59", "BatteryLevel", 56.08233929269751),
  r("21:40:33", "ModuleTempMax", 33.5),
  r("21:42:59", "BatteryLevel", 59.90760867797977),
  r("21:45:41", "DCChargingEnergyIn", 9.759999781847),
  r("21:47:31", "ModuleTempMax", 34.5),
  r("21:47:59", "BatteryLevel", 64.02463589773272),
  r("21:52:31", "ModuleTempMax", 35.5),
  r("21:52:59", "BatteryLevel", 67.78507020868815),
  r("21:54:41", "DCChargingEnergyIn", 14.119999684393406),
  r("21:55:41", "DCChargingEnergyIn", 14.55999967455864),
  r("21:55:52", "EnergyRemaining", 44.3799990080297),
  r("21:55:54", "DCChargingPower", 0),
  r("21:55:54", "DetailedChargeState", STATE("Complete")),
  r("21:56:05", "FastChargerPresent", false),
  r("21:56:41", "DCChargingEnergyIn", 14.6399996727705),
  r("21:56:54", "DetailedChargeState", STATE("Disconnected")),
  r("21:57:31", "ModuleTempMax", 36.5),
  r("21:57:59", "BatteryLevel", 70.18396795878043),
  r("22:00:52", "EnergyRemaining", 44.11999901384115),
  r("22:02:59", "BatteryLevel", 69.56803475267564),
];

describe("buildSessions on the real 25 Oct DC charge", () => {
  const [s] = buildSessions(REAL);

  test("one DC session, from Charging to Complete, not a Supercharger", () => {
    expect(buildSessions(REAL)).toHaveLength(1);
    expect(s.started_at).toBe(new Date(day("21:25:56")).toISOString());
    expect(s.ended_at).toBe(new Date(day("21:55:54")).toISOString());
    expect(s.kind).toBe("dc");
    expect(s.supercharger).toBe(false);
    expect(s.peak_power_kw).toBe(29.3);
    expect(s.cable_type).toBeNull();
  });

  test("energy added takes the counter's last count, sent 47 s after Complete", () => {
    // 14.56 at 21:55:41 was stored before; the car's own charge_energy_added also read 14.64.
    expect(s.energy_added_kwh).toBe(14.64);
  });

  test("end level is the reading just after the end, not the one 3 minutes before it", () => {
    // 67.79% at 21:52:59 (2 min 55 s before), 70.18% at 21:57:59 (2 min 5 s after): the limit was 70%.
    expect(s.start_level).toBe(46.29);
    expect(s.end_level).toBe(70.18);
  });

  test("end energy stays on the reading 2 s before the end, not the one 5 minutes after", () => {
    expect(s.start_energy_kwh).toBe(30.5);
    expect(s.end_energy_kwh).toBe(44.38);
  });

  test("battery temperatures are the readings seen while it ran", () => {
    expect(s.temp_start_c).toBe(31.5);
    expect(s.temp_max_c).toBe(35.5);
  });

  test("DC efficiency from the pack's gain over the energy added", () => {
    expect(chargeEfficiency([s])).toBeCloseTo((44.38 - 30.5) / 14.64, 4);
  });

  test("while the session is open, nothing after the last reading is assumed", () => {
    const open = buildSessions(REAL.filter((x) => Date.parse(x.at) < Date.parse(day("21:55:00"))));
    expect(open[0].ended_at).toBeNull();
    expect(open[0].end_level).toBe(67.79);
  });

  test("before the late readings arrive, the end figures are the ones seen so far", () => {
    const early = buildSessions(REAL.filter((x) => Date.parse(x.at) <= Date.parse(day("21:56:00"))));
    expect(early[0].energy_added_kwh).toBe(14.56);
    expect(early[0].end_level).toBe(67.79);
  });
});

describe("buildSessions after the end", () => {
  const base = [
    r("10:00:00", "BatteryLevel", 50),
    r("10:00:10", "DetailedChargeState", STATE("Charging")),
    r("10:01:00", "ACChargingPower", 7.2),
    r("10:30:00", "ACChargingEnergyIn", 3.5),
    r("10:58:00", "BatteryLevel", 58),
    r("11:00:00", "DetailedChargeState", STATE("Complete")),
  ];

  test("a level reading more than one interval after the end is not taken", () => {
    const [s] = buildSessions([...base, r("11:06:00", "BatteryLevel", 59)]);
    expect(s.end_level).toBe(58);
  });

  test("a counter reading more than 3 minutes after the end is not taken", () => {
    const [s] = buildSessions([...base, r("11:04:00", "ACChargingEnergyIn", 9)]);
    expect(s.energy_added_kwh).toBe(3.5);
  });

  test("a lower count after the end is a reset, not this session", () => {
    const [s] = buildSessions([...base, r("11:01:00", "ACChargingEnergyIn", 0)]);
    expect(s.energy_added_kwh).toBe(3.5);
  });

  test("the next session's readings never settle the one before", () => {
    const sessions = buildSessions([...base, r("11:01:00", "DetailedChargeState", STATE("Charging")), r("11:02:00", "BatteryLevel", 59)]);
    expect(sessions[0].end_level).toBe(58);
  });
});

describe("buildSessions, stopped and started again without unplugging", () => {
  const readings = [
    r("10:00:00", "DetailedChargeState", STATE("Charging")),
    r("10:01:00", "ACChargingPower", 7.2),
    r("10:30:00", "ACChargingEnergyIn", 4),
    r("10:40:00", "DetailedChargeState", STATE("Stopped")),
    r("11:00:00", "DetailedChargeState", STATE("Charging")),
    r("11:01:00", "ACChargingPower", 7.1),
    r("11:30:00", "ACChargingEnergyIn", 6.5),
    r("11:40:00", "DetailedChargeState", STATE("Complete")),
  ];

  test("the second session counts only what it added", () => {
    const sessions = buildSessions(readings);
    expect(sessions.map((s) => s.energy_added_kwh)).toEqual([4, 2.5]);
  });

  test("a counter reset for the second session still counts from 0", () => {
    const reset = readings.map((x) => (x.at === day("11:30:00") ? { ...x, value: 2.5 } : x));
    expect(buildSessions(reset).map((s) => s.energy_added_kwh)).toEqual([4, 2.5]);
  });

  test("after an unplug the next plug-in counts from 0", () => {
    const unplugged = [
      ...readings.slice(0, 4),
      r("10:45:00", "DetailedChargeState", STATE("Disconnected")),
      ...readings.slice(4).map((x) => (x.at === day("11:30:00") ? { ...x, value: 5 } : x)),
    ];
    expect(buildSessions(unplugged).map((s) => s.energy_added_kwh)).toEqual([4, 5]);
  });
});

describe("levelThroughEnd", () => {
  const level = REAL.filter((x) => x.field === "BatteryLevel").map((x) => ({ at: x.at, value: x.value }));
  const end = Date.parse(day("21:55:54"));

  test("the line ends on the reading the session's end level is, at its own time", () => {
    const kept = levelThroughEnd(level, end);
    expect(kept.at(-1)).toEqual({ at: day("21:57:59"), value: 70.18396795878043 });
    expect(kept.some((x) => x.at === day("22:02:59"))).toBe(false);
  });

  test("no reading after the end is added when the one before is nearer", () => {
    const kept = levelThroughEnd(level, Date.parse(day("21:53:30")));
    expect(kept.at(-1)?.at).toBe(day("21:52:59"));
  });
});

describe("typicalChargeKw", () => {
  test("weighs each reading by how long it held, so a short taper doesn't outvote hours of steady draw", () => {
    const readings = [
      { at: day("01:00:00"), value: 7.2 },
      { at: day("04:50:00"), value: 6 },
      { at: day("04:52:00"), value: 5 },
      { at: day("04:54:00"), value: 4 },
      { at: day("04:56:00"), value: 3 },
      { at: day("04:58:00"), value: 0 },
    ];
    expect(typicalChargeKw(readings, Date.parse(day("05:00:00")))).toBe(7.2);
  });

  test("ramp-up and closing zeros are skipped; nothing drawn reads null", () => {
    expect(typicalChargeKw([{ at: day("01:00:00"), value: 0.3 }, { at: day("02:00:00"), value: 0 }], Date.parse(day("03:00:00")))).toBeNull();
  });
});

describe("formatTempRange", () => {
  test("half degrees stay as the car reported them", () => {
    expect(formatTempRange(30.5, 35.5)).toBe("30.5 to 35.5 °C");
    expect(formatTempRange(31, 36)).toBe("31 to 36 °C");
  });
});

describe("applyStream while charging", () => {
  const snapshot = (polledAt: string): Snapshot => ({
    polled_at: day(polledAt),
    state: "online",
    car_version: null,
    update_status: null,
    update_version: null,
    download_perc: null,
    install_perc: null,
    expected_duration_sec: null,
    scheduled_time_ms: null,
    battery_level: 56,
    battery_range_km: null,
    charging_state: "Charging",
    charge_limit: 70,
    charge_power_kw: null,
    charge_energy_kwh: null,
    time_to_full_h: null,
    error: null,
  });
  const v = (clock: string, value: unknown) => ({ at: day(clock), value });

  test("power sent before a mid-charge poll still shows: DC power changed only three times in 30 minutes", () => {
    const next = applyStream(snapshot("21:40:00"), {
      DetailedChargeState: v("21:25:56", STATE("Charging")),
      DCChargingPower: v("21:30:42", 29.16959934800863),
    });
    expect(next?.charge_power_kw).toBeCloseTo(29.17, 2);
  });

  test("the energy added is the running charge's counter, on the charger it is using", () => {
    // 31 Oct 2026, a 60 kW CCS charger: the counter read 0 a minute before the charge began, then counted up.
    const next = applyStream(snapshot("14:00:00"), {
      DetailedChargeState: v("14:03:45", STATE("Charging")),
      DCChargingPower: v("14:08:51", 59.60206116779009),
      DCChargingEnergyIn: v("14:11:54", 5.879999868571758),
      ACChargingEnergyIn: v("09:00:00", 12.4),
    });
    expect(next?.charge_energy_kwh).toBeCloseTo(5.88, 2);
  });

  test("energy from an earlier charge is not shown", () => {
    const next = applyStream(snapshot("21:40:00"), {
      DetailedChargeState: v("21:25:56", STATE("Charging")),
      ACChargingEnergyIn: v("09:00:00", 12.4),
    });
    expect(next?.charge_energy_kwh).toBeNull();
  });

  // The car is rarely checked online while it streams, so last night's readings are newer than the check:
  // only readings since this charge began may count.
  const lastNight = (clock: string, value: unknown) => ({ at: `2026-10-24T${clock}+05:30`, value });
  const checkedYesterday = () => ({ ...snapshot("00:00:00"), polled_at: "2026-10-24T20:00:00+05:30" });

  test("last night's AC counter is not this DC charge's energy, before the DC counter has come", () => {
    const next = applyStream(checkedYesterday(), {
      ACChargingEnergyIn: lastNight("23:00:00", 12.4),
      DetailedChargeState: v("14:03:45", STATE("Charging")),
    });
    expect(next?.charge_energy_kwh).toBeNull();
  });

  test("last night's 0 kW AC reading doesn't pick the AC counter over this charge's DC one", () => {
    const next = applyStream(checkedYesterday(), {
      ACChargingPower: lastNight("23:00:00", 0),
      ACChargingEnergyIn: lastNight("23:00:00", 12.4),
      DetailedChargeState: v("14:03:45", STATE("Charging")),
      DCChargingEnergyIn: v("14:06:10", 2.1),
    });
    expect(next?.charge_energy_kwh).toBeCloseTo(2.1, 2);
  });

  test("power from before this charge is not shown", () => {
    const next = applyStream(snapshot("21:40:00"), {
      DetailedChargeState: v("21:25:56", STATE("Charging")),
      ACChargingPower: v("09:00:00", 7.2),
    });
    expect(next?.charge_power_kw).toBeNull();
  });

  test("a third-party DC charger leaves out the car's time to full, which ran at half the real time", () => {
    const next = applyStream(snapshot("21:00:00"), {
      DetailedChargeState: v("21:25:56", STATE("Charging")),
      FastChargerType: v("21:24:56", "FastChargerCombo"),
      DCChargingPower: v("21:26:30", 29.340629344185814),
      TimeToFullCharge: v("21:26:28", 0.25070651613540273),
    });
    expect(next?.charge_power_kw).toBeCloseTo(29.34, 2);
    expect(next?.time_to_full_h).toBeNull();
  });

  test("AC and Superchargers keep the car's time to full, in hours", () => {
    const ac = applyStream(snapshot("21:00:00"), {
      DetailedChargeState: v("21:25:56", STATE("Charging")),
      ACChargingPower: v("21:26:30", 7.2),
      TimeToFullCharge: v("21:26:28", 1.5),
    });
    expect(ac?.time_to_full_h).toBe(1.5);
    const sc = applyStream(snapshot("21:00:00"), {
      DetailedChargeState: v("21:25:56", STATE("Charging")),
      FastChargerType: v("21:24:56", "FastChargerSupercharger"),
      DCChargingPower: v("21:26:30", 90),
      TimeToFullCharge: v("21:26:28", 0.4),
    });
    expect(sc?.time_to_full_h).toBe(0.4);
  });
});
