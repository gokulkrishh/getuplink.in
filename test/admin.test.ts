import { describe, expect, test } from "bun:test";
import { DECISIONS, isDecision, isFull, parseMaxUsers, placesLine } from "@/lib/admin";

describe("parseMaxUsers", () => {
  test("defaults to 25 when unset or not a positive whole number", () => {
    for (const value of [undefined, "", " ", "0", "-3", "2.5", "lots"]) expect(parseMaxUsers(value)).toBe(25);
  });

  test("reads a positive whole number", () => {
    expect(parseMaxUsers(" 40 ")).toBe(40);
  });
});

describe("decisions", () => {
  test("approve and restore take a place, the rest don't", () => {
    expect(Object.entries(DECISIONS).filter(([, d]) => d.takesPlace).map(([k]) => k)).toEqual(["approve", "restore"]);
  });

  test("each moves from the state it belongs to", () => {
    expect(DECISIONS.approve).toMatchObject({ from: ["waitlist"], to: "approved" });
    expect(DECISIONS.decline).toMatchObject({ from: ["waitlist"], to: "declined" });
    expect(DECISIONS.suspend).toMatchObject({ from: ["approved"], to: "suspended" });
    expect(DECISIONS.restore).toMatchObject({ from: ["suspended"], to: "approved" });
    expect(DECISIONS.reopen).toMatchObject({ from: ["declined"], to: "waitlist" });
  });

  test("only known decisions pass", () => {
    expect(isDecision("approve")).toBe(true);
    expect(isDecision("toString")).toBe(false);
    expect(isDecision("delete")).toBe(false);
    expect(isDecision(undefined)).toBe(false);
  });
});

describe("the cap", () => {
  test("is full at the cap", () => {
    expect(isFull(24, 25)).toBe(false);
    expect(isFull(25, 25)).toBe(true);
    expect(isFull(26, 25)).toBe(true);
  });

  test("reads as places used", () => {
    expect(placesLine(12, 25)).toBe("12 of 25 places used");
    expect(placesLine(1, 1)).toBe("1 of 1 place used");
  });
});
