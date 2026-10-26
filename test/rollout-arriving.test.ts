import { describe, expect, test } from "bun:test";
import { buildRollout, type RolloutCar } from "@/lib/rollout";
import { buildArriving, type OfferedCar, pendingUpdate, withOwnOffer, yourCar } from "@/lib/rollout-arriving";

// `count` cars named prefix0.. on `version`, each with `offered` pending as `status`.
function group(prefix: string, count: number, version: string, offered: string | null = null, status: string | null = offered && "available") {
  return Array.from({ length: count }, (_, i): OfferedCar => ({ car: `${prefix}${i}`, version, status, offered }));
}

// A rollout of cars now on each version, with no history.
const rollout = (counts: Record<string, number>) =>
  buildRollout(
    Object.entries(counts).flatMap(([version, n]) => Array.from({ length: n }, (_, i): RolloutCar => ({ car: `${version}-${i}`, version }))),
    [],
    {},
  );

describe("pendingUpdate", () => {
  test("every pending status counts, with the build hash dropped", () => {
    for (const status of ["available", "scheduled", "downloading", "downloading_wifi_wait", "installing"]) {
      expect(pendingUpdate({ version: "2026.38.3.1", status, offered: "2026.44.1 abc123" })).toBe("2026.44.1");
    }
  });
  test("no status, an empty one or an unknown one is no offer", () => {
    expect(pendingUpdate({ version: "2026.38.3.1", status: null, offered: "2026.44.1" })).toBeNull();
    expect(pendingUpdate({ version: "2026.38.3.1", status: "", offered: "2026.44.1" })).toBeNull();
    expect(pendingUpdate({ version: "2026.38.3.1", status: "something_new", offered: "2026.44.1" })).toBeNull();
    expect(pendingUpdate({ version: "2026.38.3.1", status: "available", offered: null })).toBeNull();
  });
  test("an offer the car already runs, or is past, is a stale check", () => {
    expect(pendingUpdate({ version: "2026.44.1 abc", status: "installing", offered: "2026.44.1" })).toBeNull();
    expect(pendingUpdate({ version: "2026.44.1", status: "available", offered: "2026.40.2" })).toBeNull();
  });
});

describe("buildArriving", () => {
  test("cars offered each version and cars on it, newest first", () => {
    const cars = [
      ...group("a", 3, "2026.38.3.1", "2026.44.1"),
      ...group("b", 1, "2026.44.1"),
      ...group("c", 2, "2026.32.3", "2026.38.3.1", "downloading"),
    ];
    expect(buildArriving(cars)).toEqual([
      { version: "2026.44.1", offered: 3, on: 1 },
      { version: "2026.38.3.1", offered: 2, on: 3 },
    ]);
  });
  test("a car given twice counts once, from its last row", () => {
    const [car] = group("a", 1, "2026.38.3.1", "2026.44.1");
    expect(buildArriving([car, { ...car, offered: "2026.44.2" }])).toEqual([{ version: "2026.44.2", offered: 1, on: 0 }]);
  });
  test("nothing pending gives nothing, so the section hides", () => {
    expect(buildArriving([...group("a", 2, "2026.38.3.1"), ...group("b", 1, "2026.44.1", "2026.44.1", "installing")])).toEqual([]);
  });
});

describe("yourCar", () => {
  const india = rollout({ "2026.44.1": 12, "2026.40.2": 3, "2026.38.3.1": 5 });
  test("on the newest version cars run", () => {
    expect(yourCar({ version: "2026.44.1", status: null, offered: null }, india)).toEqual({ kind: "newest" });
  });
  test("behind: the versions newer than the car's, and the newest one's cars", () => {
    expect(yourCar({ version: "2026.38.3.1", status: null, offered: null }, india)).toEqual({ kind: "behind", versions: 2, newest: "2026.44.1", cars: 12 });
    expect(yourCar({ version: "2026.40.2", status: null, offered: null }, india)).toEqual({ kind: "behind", versions: 1, newest: "2026.44.1", cars: 12 });
  });
  test("a version no car runs any more doesn't count as one behind", () => {
    const passed = buildRollout([{ car: "x", version: "2026.38.3.1" }], [{ car: "y", version: "2026.40.2", previous: "2026.38.3.1", at: "2026-10-01T00:00:00Z", source: "tracked" }], {});
    expect(yourCar({ version: "2026.38.3.1", status: null, offered: null }, passed)).toEqual({ kind: "newest" });
  });
  test("an update waiting on the car comes first", () => {
    expect(yourCar({ version: "2026.38.3.1", status: "scheduled", offered: "2026.44.1" }, india)).toEqual({ kind: "waiting", version: "2026.44.1" });
  });
  test("a stale offer falls back to where the car stands", () => {
    expect(yourCar({ version: "2026.44.1", status: "available", offered: "2026.44.1" }, india)).toEqual({ kind: "newest" });
  });
  test("no version reported, no line", () => {
    expect(yourCar({ version: null, status: null, offered: null }, india)).toBeNull();
  });
});

describe("withOwnOffer", () => {
  // 23 Oct 2026: every check found the car offline, so its last online check offered nothing, while the
  // stream showed 2026.38.3.2 downloaded and waiting.
  const checks: OfferedCar[] = [
    { car: "own", version: "2026.38.3.1", status: null, offered: null },
    { car: "other", version: "2026.38.3.1", status: "available", offered: "2026.38.3.2" },
  ];
  const own: OfferedCar = { car: "own", version: "2026.38.3.1", status: "available", offered: "2026.38.3.2" };

  test("Arriving now counts the owner's car as Your car does", () => {
    expect(buildArriving(checks)).toEqual([{ version: "2026.38.3.2", offered: 1, on: 0 }]);
    expect(buildArriving(withOwnOffer(checks, own))).toEqual([{ version: "2026.38.3.2", offered: 2, on: 0 }]);
  });

  test("a car that isn't in the list isn't added, and no owner's car changes nothing", () => {
    expect(withOwnOffer(checks, { ...own, car: "elsewhere" })).toEqual(checks);
    expect(withOwnOffer(checks, null)).toBe(checks);
  });
});
