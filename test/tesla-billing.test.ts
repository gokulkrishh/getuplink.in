import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { formatShortDate, formatUsd } from "@/lib/format";
import {
  budgetLevel,
  CATEGORY_OF,
  CHECK_EVERY_MS,
  CREDIT_USD,
  isBillable,
  KINDS,
  kindOf,
  monthStart,
  nextReset,
  parseBudget,
  priceUsage,
  usageMonth,
} from "@/lib/tesla-billing";

const cost = (kinds: { kind: string; count: number }[], signals = 0) => priceUsage(kinds, signals);
const of = (u: ReturnType<typeof cost>, category: string) => u.categories.find((c) => c.category === category)!;

describe("Tesla's prices", () => {
  test("500 data requests, 1,000 commands, 50 wakes or 150,000 signals each cost $1", () => {
    expect(cost([{ kind: "vehicle_data", count: 500 }]).costUsd).toBeCloseTo(1, 10);
    expect(cost([{ kind: "command", count: 1000 }]).costUsd).toBeCloseTo(1, 10);
    expect(cost([{ kind: "wake", count: 50 }]).costUsd).toBeCloseTo(1, 10);
    expect(cost([], 150_000).costUsd).toBeCloseTo(1, 10);
  });

  test("Tesla's own example session: 384 data, 4 commands, 4 wakes come to $0.852", () => {
    const u = cost([
      { kind: "vehicle_data", count: 384 },
      { kind: "command", count: 4 },
      { kind: "wake", count: 4 },
    ]);
    expect(u.costUsd).toBeCloseTo(0.852, 10);
    // And after streaming: 4 commands, 1 wake, 300 signals, $0.026.
    expect(cost([{ kind: "command", count: 4 }, { kind: "wake", count: 1 }], 300).costUsd).toBeCloseTo(0.026, 10);
  });

  test("every kind is priced; all but wakes and commands as data, the dearer guess", () => {
    for (const kind of KINDS) expect(CATEGORY_OF[kind]).toBeDefined();
    const u = cost(KINDS.map((kind) => ({ kind, count: 1 })));
    expect(of(u, "data").count).toBe(KINDS.length - 2);
    expect(of(u, "wakes").count).toBe(1);
    expect(of(u, "commands").count).toBe(1);
  });

  test("an unknown kind counts as data rather than disappearing", () => {
    expect(of(cost([{ kind: "something_new", count: 3 }]), "data").count).toBe(3);
  });

  test("the credit is $10 a month", () => {
    expect(CREDIT_USD).toBe(10);
    expect(formatUsd(CREDIT_USD)).toBe("$10.00");
  });

  test("only answers below 500 are billed", () => {
    expect(isBillable(200)).toBe(true);
    expect(isBillable(401)).toBe(true);
    expect(isBillable(408)).toBe(true);
    expect(isBillable(429)).toBe(true);
    expect(isBillable(500)).toBe(false);
    expect(isBillable(503)).toBe(false);
  });
});

describe("Uplink's kinds", () => {
  test("each path Uplink calls maps to its kind", () => {
    expect(kindOf("GET", "/api/1/vehicles")).toBe("vehicle_list");
    expect(kindOf("GET", "/api/1/vehicles/VINVIN/vehicle_data?endpoints=charge_state%3Bdrive_state")).toBe("vehicle_data");
    expect(kindOf("GET", "/api/1/dx/charging/history?vin=VINVIN&pageNo=1")).toBe("charging_history");
    expect(kindOf("GET", "/api/1/dx/charging/invoice/abc-123")).toBe("charging_invoice");
    expect(kindOf("GET", "/api/1/vehicles/VINVIN/release_notes?staged=true")).toBe("release_notes");
    expect(kindOf("GET", "/api/1/vehicles/VINVIN/fleet_telemetry_config")).toBe("telemetry_config");
    expect(kindOf("DELETE", "/api/1/vehicles/VINVIN/fleet_telemetry_config")).toBe("telemetry_config");
    expect(kindOf("GET", "/api/1/vehicles/VINVIN/fleet_telemetry_errors")).toBe("telemetry_errors");
    expect(kindOf("POST", "/api/1/vehicles/fleet_telemetry_config_jws")).toBe("telemetry_config");
    expect(kindOf("POST", "/api/1/vehicles/fleet_status")).toBe("fleet_status");
    expect(kindOf("GET", "/api/1/users/region")).toBe("region");
    expect(kindOf("POST", "/api/1/vehicles/VINVIN/wake_up")).toBe("wake");
    expect(kindOf("POST", "/api/1/vehicles/VINVIN/command/honk_horn")).toBe("command");
    expect(kindOf("GET", "/api/1/products")).toBe("other");
  });

  test("Uplink never wakes a car: no wake_up call anywhere in the app", () => {
    const root = join(import.meta.dir, "..");
    const files = (dir: string): string[] =>
      readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
        e.name === "node_modules" || e.name.startsWith(".") ? [] : e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
      );
    const hits = ["app", "components", "lib"]
      .flatMap(files)
      .filter((f) => f !== join("lib", "tesla-billing.ts"))
      .filter((f) => /wake_up/.test(readFileSync(join(root, f), "utf8").replace(/\/\/.*$/gm, "")));
    expect(hits.map((f) => relative(root, join(root, f)))).toEqual([]);
  });
});

describe("the billing month", () => {
  test("is the UTC calendar month", () => {
    const at = Date.parse("2026-10-26T09:00:00Z");
    expect(usageMonth(at)).toBe("2026-10-01");
    expect(monthStart(at).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(nextReset(at).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  test("resets on 1 Nov, read in India", () => {
    expect(formatShortDate(nextReset(Date.parse("2026-10-26T09:00:00Z")))).toBe("1 Nov");
    // Midnight UTC is 5:30 AM IST, still the 1st.
    expect(formatShortDate(nextReset(Date.parse("2026-10-31T23:59:59Z")))).toBe("1 Nov");
  });

  test("rolls over the year", () => {
    const at = Date.parse("2026-12-15T00:00:00Z");
    expect(usageMonth(at)).toBe("2026-12-01");
    expect(nextReset(at).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  test("an hour after midnight IST on the 1st is still the old month in UTC", () => {
    // 1 Nov, 1:00 AM IST = 31 Oct, 7:30 PM UTC: one of the edges docs/tesla-billing.md calls ambiguous.
    expect(usageMonth(Date.parse("2026-10-31T19:30:00Z"))).toBe("2026-10-01");
    expect(usageMonth(Date.parse("2026-11-01T00:00:00Z"))).toBe("2026-11-01");
  });
});

describe("the budget", () => {
  test("TESLA_BUDGET_USD defaults to the credit", () => {
    expect(parseBudget(undefined)).toBe(10);
    expect(parseBudget("")).toBe(10);
    expect(parseBudget("abc")).toBe(10);
    expect(parseBudget("0")).toBe(10);
    expect(parseBudget("-3")).toBe(10);
    expect(parseBudget(" 25 ")).toBe(25);
    expect(parseBudget("7.5")).toBe(7.5);
  });

  test("checks slow at 80% and stop at 100%", () => {
    expect(budgetLevel(0, 10)).toBe("normal");
    expect(budgetLevel(7.99, 10)).toBe("normal");
    expect(budgetLevel(8, 10)).toBe("slow");
    expect(budgetLevel(9.99, 10)).toBe("slow");
    expect(budgetLevel(10, 10)).toBe("stopped");
    expect(budgetLevel(14, 10)).toBe("stopped");
    expect(budgetLevel(4, 5)).toBe("slow");
    expect(budgetLevel(4, 50)).toBe("normal");
  });

  test("normal checks every 12 hours, slow every 24", () => {
    expect(CHECK_EVERY_MS.normal).toBe(12 * 3_600_000);
    expect(CHECK_EVERY_MS.slow).toBe(24 * 3_600_000);
  });
});
