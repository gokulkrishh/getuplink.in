import { describe, expect, test } from "bun:test";
import { likelyLfp, motorLayout, trimLabel, tyrePressureLabel, unknownCodes } from "@/lib/car";

describe("trimLabel", () => {
  test("maps the known pack badges", () => {
    expect(trimLabel("50")).toBe("Standard Range");
    expect(trimLabel("74")).toBe("Long Range");
    expect(trimLabel("74D")).toBe("Long Range");
  });
  test("unknown or missing codes show nothing", () => {
    expect(trimLabel("100d")).toBeNull();
    expect(trimLabel(undefined)).toBeNull();
  });
});

describe("likelyLfp", () => {
  test("Shanghai-built and charging to max by default", () => {
    expect(likelyLfp("LRWYGCEK3TC100001", true)).toBe(true);
  });
  test("not from Shanghai, or not defaulting to max", () => {
    expect(likelyLfp("7SAYGDEE1TF100001", true)).toBe(false);
    expect(likelyLfp("LRWYGCEK3TC100001", false)).toBe(false);
    expect(likelyLfp("LRWYGCEK3TC100001", undefined)).toBe(false);
    expect(likelyLfp(null, true)).toBe(false);
  });
});

describe("motorLayout", () => {
  test("rear only, both, neither", () => {
    expect(motorLayout("PM216MOSFET", undefined)).toBe("Single rear motor");
    expect(motorLayout("PM216MOSFET", "IM130D")).toBe("Dual motor");
    expect(motorLayout(undefined, undefined)).toBeNull();
  });
});

describe("tyrePressureLabel", () => {
  test("bar in, whole psi out, front and rear", () => {
    expect(tyrePressureLabel(2.9, 2.9)).toBe("42 psi front, 42 psi rear");
    expect(tyrePressureLabel(2.9, 3.1)).toBe("42 psi front, 45 psi rear");
  });
  test("missing values show nothing", () => {
    expect(tyrePressureLabel(null, 2.9)).toBeNull();
  });
});

describe("unknownCodes", () => {
  test("known model and pack codes pass", () => {
    expect(unknownCodes({ car_type: "modely", trim_badging: "74d" })).toEqual([]);
    expect(unknownCodes({ car_type: "Model3", trim_badging: "50" })).toEqual([]);
    expect(unknownCodes({})).toEqual([]);
  });
  test("a new variant is flagged even when its prefix still names a model", () => {
    expect(unknownCodes({ car_type: "modelyl", trim_badging: "82d" })).toEqual(['model "modelyl"', 'pack "82d"']);
  });
});
