import { describe, expect, test } from "bun:test";
import { metres, nameTarget, parseId, parseName, parsePoint, TAG_RADIUS_M, tagAt, type UserPlace } from "@/lib/user-places";

// Made-up spots. 0.0001° of latitude is about 11.1 m.
const HOME: UserPlace = { id: 1, name: "Maple Court", lat: 10, lng: 20, radiusM: TAG_RADIUS_M };
const north = (m: number) => ({ lat: HOME.lat + m / 111_195, lng: HOME.lng });

describe("tagAt", () => {
  test("matches inside the radius and not past it", () => {
    expect(Math.round(metres(HOME, north(74)))).toBe(74);
    expect(tagAt([HOME], north(74))?.name).toBe("Maple Court");
    expect(tagAt([HOME], north(75))?.name).toBe("Maple Court");
    expect(tagAt([HOME], north(76))).toBeNull();
  });

  test("the nearer of two overlapping tags wins, whatever their order", () => {
    const shop: UserPlace = { ...HOME, id: 2, name: "Corner Shop", lat: HOME.lat + 100 / 111_195 };
    expect(tagAt([HOME, shop], north(60))?.name).toBe("Corner Shop");
    expect(tagAt([shop, HOME], north(40))?.name).toBe("Maple Court");
  });

  test("each tag uses its own radius", () => {
    const wide = { ...HOME, radiusM: 200 };
    expect(tagAt([wide], north(150))?.name).toBe("Maple Court");
  });

  test("no tags, no match", () => {
    expect(tagAt([], north(0))).toBeNull();
  });

  test("nameTarget carries the spot and its tag", () => {
    expect(nameTarget([HOME], north(10))).toEqual({ ...north(10), tag: { id: 1, name: "Maple Court" } });
    expect(nameTarget([HOME], north(500)).tag).toBeNull();
  });
});

describe("input checks", () => {
  test("names are trimmed, squeezed and capped", () => {
    expect(parseName("  Maple   Court ")).toBe("Maple Court");
    expect(parseName("")).toBeNull();
    expect(parseName("   ")).toBeNull();
    expect(parseName("x".repeat(61))).toBeNull();
    expect(parseName("x".repeat(60))).toHaveLength(60);
    expect(parseName(42)).toBeNull();
  });

  test("points must be real coordinates", () => {
    expect(parsePoint("10.5", "20.25")).toEqual({ lat: 10.5, lng: 20.25 });
    expect(parsePoint(91, 0)).toBeNull();
    expect(parsePoint(0, 181)).toBeNull();
    expect(parsePoint(0, 0)).toBeNull();
    expect(parsePoint("abc", 1)).toBeNull();
    expect(parsePoint(null, null)).toBeNull();
  });

  test("ids", () => {
    expect(parseId("12")).toBe(12);
    expect(parseId("0")).toBeNull();
    expect(parseId("1; drop table")).toBeNull();
    expect(parseId(-3)).toBeNull();
  });
});
