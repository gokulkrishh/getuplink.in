import { beforeEach, describe, expect, mock, test } from "bun:test";
import { aggregate, FIGURES_VERSION, MIN_CARS, type OwnerStats, STATS_VERSION } from "@/lib/owners";
import { istDay, istDayStart } from "@/lib/telemetry-derive";
import { FakeDb } from "./fake-db";

// Two made-up accounts: A (1) doesn't share, B (2) does. Each has day rows, as if A had shared before.

let fake: FakeDb;
mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const { asOwner } = await import("@/lib/server/data/owner");
const { dateOf, dueDays, keptOn, loadOwners, NOT_SHARING_MESSAGE, ownerComparisons, runOwners, setSharing } = await import("@/lib/server/owners");
const { demoOwnerSummaries } = await import("@/lib/server/demo/owners");

const A = asOwner(1, "tesla-a");
const B = asOwner(2, "tesla-b");
// 3:30 AM IST on 28 Oct 2026, when the daily run goes.
const NOW = Date.parse("2026-10-28T03:30:00+05:30");
const TODAY = istDay(NOW);

const dayRow = (user_id: number, day: number, km = 10) => ({
  user_id,
  vehicle_id: String(user_id),
  vin_hash: "h".repeat(64),
  day: dateOf(day),
  computed_at: new Date(NOW - 3_600_000).toISOString(),
  figures: { v: FIGURES_VERSION, km, drives: [km], energyKm: km, energyKwh: km * 0.13, hourKm: { weekday: Array(24).fill(0), weekend: Array(24).fill(0) }, parkedHours: 0, parkedKwh: 0, charges: [], hard: null, onePedal: null, regen: null, speed: null, climate: null, seatCooling: null, parkedModes: null, installs: [], latest: null },
});

const STATS: OwnerStats = { v: STATS_VERSION, owners: 6, cars: 6, metrics: {} };

beforeEach(() => {
  fake = new FakeDb({
    users: [
      { id: 1, tesla_sub: "tesla-a", status: "approved", share_with_owners: false, shared_since: null },
      { id: 2, tesla_sub: "tesla-b", status: "approved", share_with_owners: true, shared_since: "2026-10-01T00:00:00Z" },
    ],
    vehicles: [
      { user_id: 1, id: "1", vin: "VIN_A", created_at: "2026-09-01T00:00:00Z", readings_until: null },
      { user_id: 2, id: "2", vin: "VIN_B", created_at: "2026-09-01T00:00:00Z", readings_until: null },
    ],
    fleet_car_days: [dayRow(1, TODAY - 2), dayRow(1, TODAY - 1), dayRow(2, TODAY - 2), dayRow(2, TODAY - 1)],
    fleet_stats: [],
  });
  fake.autoIds.add("fleet_stats");
});

describe("turning sharing on and off", () => {
  test("off deletes the account's day rows at once, and only theirs, and leaves the totals to the morning run", async () => {
    await setSharing(B, false, NOW);
    expect(fake.rows("users")[1]).toEqual(expect.objectContaining({ share_with_owners: false, shared_since: null }));
    expect(fake.rows("fleet_car_days").map((r) => r.user_id)).toEqual([1, 1]);
    expect(fake.calls.filter((c) => c.table === "fleet_car_days" && c.op === "delete").every((c) => c.filters.includes("user_id = 2"))).toBe(true);
    // Totals published now would differ from the last ones by this car alone.
    expect(fake.calls.some((c) => c.table === "fleet_stats")).toBe(false);
  });

  test("on records when, and leaves the rows for the morning run", async () => {
    await setSharing(A, true, NOW);
    expect(fake.rows("users")[0]).toEqual(expect.objectContaining({ share_with_owners: true, shared_since: new Date(NOW).toISOString() }));
    expect(fake.rows("fleet_car_days")).toHaveLength(4);
  });
});

describe("the page outside demo mode", () => {
  test("an owner who doesn't share gets no figures, only how many do", async () => {
    fake.rows("fleet_stats").push({ id: 1, computed_at: new Date(NOW).toISOString(), cars: 6, stats: STATS });
    const page = await loadOwners(A, NOW);
    expect(page).toEqual({ kind: "off", sharers: 1 });
  });

  test("the published totals, never the demo set", async () => {
    fake.rows("fleet_stats").push({ id: 1, computed_at: new Date(NOW).toISOString(), cars: 6, stats: STATS });
    const page = await loadOwners(B, NOW);
    expect(page.kind).toBe("ready");
    if (page.kind !== "ready") return;
    expect(page.stats).toEqual(STATS);
    expect(page.stats.cars).not.toBe(demoOwnerSummaries(NOW).length);
    expect(page.you?.days).toBe(2);
  });

  test("with no totals yet, or fewer than 5 cars or owners, it waits; it never falls back to the demo set", async () => {
    expect(await loadOwners(B, NOW)).toEqual({ kind: "waiting", counted: 0 });
    fake.rows("fleet_stats").push({ id: 1, computed_at: new Date(NOW).toISOString(), cars: 4, stats: { ...STATS, owners: 3, cars: 4 } });
    expect(await loadOwners(B, NOW)).toEqual({ kind: "waiting", counted: 3 });
    fake.rows("fleet_stats").push({ id: 2, computed_at: new Date(NOW + 1).toISOString(), cars: 6, stats: { ...STATS, owners: 4 } });
    expect(await loadOwners(B, NOW)).toEqual({ kind: "waiting", counted: 4 });
  });

  test("the waiting count is owners in the latest totals, not accounts that share", async () => {
    // 6 accounts share, but the last run counted the cars of only 2 of them.
    fake.rows("users").push(...[3, 4, 5, 6, 7].map((id) => ({ id, tesla_sub: `tesla-${id}`, status: "approved", share_with_owners: true, shared_since: "2026-10-27T00:00:00Z" })));
    fake.rows("fleet_stats").push({ id: 1, computed_at: new Date(NOW).toISOString(), cars: 2, stats: { ...STATS, owners: 2, cars: 2 } });
    expect(await loadOwners(B, NOW)).toEqual({ kind: "waiting", counted: 2 });
    const out = await ownerComparisons(B, NOW);
    expect(out.message).toBe("2 of 5 owners counted so far. Figures show once 5 owners' cars are counted. Cars are counted at 3:30 AM each day.");
  });
});

describe("the connector's get_owner_comparisons", () => {
  const publish = () => {
    const stats = aggregate(demoOwnerSummaries(NOW));
    fake.rows("fleet_stats").push({ id: 1, computed_at: new Date(NOW).toISOString(), cars: stats.cars, stats });
  };

  test("an owner who doesn't share gets the way to start, and no figures", async () => {
    publish();
    const out = await ownerComparisons(A, NOW);
    expect(out).toEqual({ sharing: false, message: NOT_SHARING_MESSAGE });
    expect(NOT_SHARING_MESSAGE).toContain("Share with other owners");
  });

  test("an owner who shares gets totals only: no car's values, VINs or places, every figure across at least 5 cars", async () => {
    publish();
    fake.rows("vehicles").push(
      ...Array.from({ length: 5 }, (_, k) => ({ user_id: 3, id: String(10 + k), vin: `VIN_KA${k}`, current_version: "2026.38.5", home_state: "KA" })),
      { user_id: 4, id: "20", vin: "VIN_TN", current_version: "2026.38.5", home_state: "TN" },
    );
    const out = await ownerComparisons(B, NOW);
    expect(out.sharing && "ready" in out && out.ready).toBe(true);
    if (!("comparisons" in out) || !out.comparisons) throw new Error("no comparisons");
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/VIN_|demo-|vinHash|"owner"|"values"/);
    expect(out.comparisons.length).toBeGreaterThan(20);
    expect(out.comparisons.every((c) => c.cars >= MIN_CARS)).toBe(true);
    // The owner's own figure only in their own group.
    expect(out.comparisons.filter((c) => !c.yours_is_this_group).every((c) => c.yours === null)).toBe(true);
    // Every state's own count, as Rollout shows it, small ones too.
    expect(out.cars_by_state.states).toEqual([
      { state: "Karnataka", cars: 5 },
      { state: "Tamil Nadu", cars: 1 },
    ]);
    expect(out.cars_by_state.total_cars).toBe(8);
    expect(out.cars_by_state.about).toContain("Not all Teslas in India");
  });
});

describe("the daily run", () => {
  test("works out each missing day once, keeps to sharing accounts, and converges", async () => {
    fake.tables.fleet_car_days = [];
    // B drove 16 km on 27 Oct, 8 AM IST.
    const at = (h: number, m = 0) => new Date(istDayStart(TODAY - 1) + h * 3_600_000 + m * 60_000).toISOString();
    fake.tables.telemetry_readings = [
      { id: 1, vin: "VIN_B", field: "Gear", created_at: at(7), value: "ShiftStateP" },
      { id: 2, vin: "VIN_B", field: "Gear", created_at: at(8), value: "ShiftStateD" },
      { id: 3, vin: "VIN_B", field: "Gear", created_at: at(8, 30), value: "ShiftStateP" },
      { id: 4, vin: "VIN_B", field: "Odometer", created_at: at(7, 59), value: 1000 },
      { id: 5, vin: "VIN_B", field: "Odometer", created_at: at(8, 31), value: 1010 },
    ];
    const first = await runOwners(() => NOW);
    expect(first).toEqual(expect.objectContaining({ owners: 1, cars: 1, computed: 30, left: 0, failed: 0, published: 1 }));
    const rows = fake.rows("fleet_car_days");
    expect(rows.every((r) => r.user_id === 2 && (r.vin_hash as string).length === 64)).toBe(true);
    const yesterday = rows.find((r) => r.day === dateOf(TODAY - 1))!.figures as { km: number; drives: number[] };
    expect(yesterday.km).toBeCloseTo(16.093, 2);
    expect(yesterday.drives).toHaveLength(1);
    // Nothing of A's (who doesn't share) is read for the totals or worked out.
    expect(fake.calls.some((c) => c.table === "user_telemetry_readings" && c.filters.includes("user_id = 1"))).toBe(false);
    const second = await runOwners(() => NOW);
    expect(second).toEqual(expect.objectContaining({ computed: 0, left: 0 }));
    expect(fake.rows("fleet_car_days")).toHaveLength(30);
  });

  const drove = () => {
    fake.tables.fleet_car_days = [];
    const at = (h: number) => new Date(istDayStart(TODAY - 1) + h * 3_600_000).toISOString();
    fake.tables.telemetry_readings = [
      { id: 1, vin: "VIN_B", field: "Gear", created_at: at(7), value: "ShiftStateP" },
      { id: 2, vin: "VIN_B", field: "Odometer", created_at: at(7), value: 1000 },
    ];
    return at;
  };

  test("a day with a charge still going stays due, and is worked out once the charge has ended", async () => {
    const at = drove();
    // Plugged in at home at 10 PM yesterday, still charging at 3:30 AM.
    const charge = { id: 1, user_id: 2, vin: "VIN_B", started_at: at(22), ended_at: null as string | null, kind: "ac", start_level: 40, energy_added_kwh: 12 };
    fake.tables.stream_charge_sessions = [charge];
    expect(await runOwners(() => NOW)).toEqual(expect.objectContaining({ computed: 29, left: 1, failed: 0 }));
    expect(fake.rows("fleet_car_days").some((r) => r.day === dateOf(TODAY - 1))).toBe(false);
    charge.ended_at = at(29);
    charge.energy_added_kwh = 30;
    const later = NOW + 86_400_000;
    expect(await runOwners(() => later)).toEqual(expect.objectContaining({ failed: 0 }));
    const day = fake.rows("fleet_car_days").find((r) => r.day === dateOf(TODAY - 1))!.figures as { charges: { kwh: number }[] };
    expect(day.charges).toEqual([expect.objectContaining({ kwh: 30 })]);
  });

  test("a failed read of the charges stores nothing for the car, so its days stay due", async () => {
    drove();
    fake.missing.add("stream_charge_sessions");
    expect(await runOwners(() => NOW)).toEqual(expect.objectContaining({ computed: 0, failed: 1 }));
    expect(fake.rows("fleet_car_days")).toHaveLength(0);
  });

  test("a mode or seat setting with no reading before the day began is unknown for that day, not off", async () => {
    const at = drove();
    const before = (h: number) => new Date(istDayStart(TODAY - 3) + h * 3_600_000).toISOString();
    fake.tables.telemetry_readings.push(
      // Sentry Mode and the seat were set 3 days ago; Climate Keeper's setting was first read at noon yesterday.
      { id: 3, vin: "VIN_B", field: "SentryMode", created_at: before(12), value: "SentryModeStateOff" },
      { id: 4, vin: "VIN_B", field: "ClimateSeatCoolingFrontLeft", created_at: before(12), value: 0 },
      { id: 5, vin: "VIN_B", field: "ClimateKeeperMode", created_at: at(12), value: "ClimateKeeperModeStateOff" },
    );
    await runOwners(() => NOW);
    const figures = (day: number) => fake.rows("fleet_car_days").find((r) => r.day === dateOf(day))!.figures as { parkedModes: unknown; seatCooling: unknown };
    expect(figures(TODAY - 1).parkedModes).toBeNull();
    expect(figures(TODAY - 4).parkedModes).toBeNull();
    expect(figures(TODAY - 4).seatCooling).toBeNull();
    fake.tables.telemetry_readings.push({ id: 6, vin: "VIN_B", field: "ClimateKeeperMode", created_at: before(12), value: "ClimateKeeperModeStateOff" });
    fake.tables.fleet_car_days = [];
    await runOwners(() => NOW);
    expect(figures(TODAY - 1).parkedModes).toEqual({ sentryMs: 0, keeperMs: 0, dogMs: 0, campMs: 0 });
  });

  test("every sharing account is read, past the 1,000 rows one request returns, so none has its days pruned", async () => {
    fake.rows("users").push(...Array.from({ length: 1200 }, (_, k) => ({ id: 100 + k, tesla_sub: `t-${k}`, status: "approved", share_with_owners: true, shared_since: null })));
    fake.rows("fleet_car_days").push(dayRow(1250, TODAY - 1));
    await runOwners(() => NOW);
    expect(fake.rows("fleet_car_days").some((r) => r.user_id === 1250)).toBe(true);
    expect(fake.rows("fleet_car_days").some((r) => r.user_id === 1)).toBe(false);
  });

  test("before the migration it skips", async () => {
    fake.missing.add("users");
    expect((await runOwners(() => NOW)).skipped).toBe("no owners tables");
  });

  test("a day is due when missing, by an older method, or worked out before it settled", () => {
    const row = (day: number, v: number, computed: number) => ({ vehicle_id: "2", day: dateOf(day), computed_at: new Date(computed).toISOString(), figures: { v } });
    const rows = [row(TODAY - 1, FIGURES_VERSION, NOW), row(TODAY - 2, FIGURES_VERSION - 1, NOW), row(TODAY - 3, FIGURES_VERSION, istDayStart(TODAY - 2) + 60_000)];
    const due = dueDays(rows, 0, NOW);
    expect(due).toHaveLength(29);
    expect(due).not.toContain(TODAY - 1);
    expect(due).toContain(TODAY - 2);
    expect(due).toContain(TODAY - 3);
    expect(due[0]).toBe(TODAY - 30);
    // Nothing before Uplink tracked the car, and not today.
    expect(dueDays([], istDayStart(TODAY - 5), NOW)).toEqual([TODAY - 5, TODAY - 4, TODAY - 3, TODAY - 2, TODAY - 1]);
  });

  test("a field kept a week is gone for a day older than that", () => {
    expect(keptOn("BrakePedal", TODAY - 1, NOW)).toBe(true);
    expect(keptOn("BrakePedal", TODAY - 6, NOW)).toBe(true);
    expect(keptOn("BrakePedal", TODAY - 8, NOW)).toBe(false);
    expect(keptOn("LongitudinalAcceleration", TODAY - 29, NOW)).toBe(true);
  });
});
