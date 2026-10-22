import { describe, expect, test } from "bun:test";
import { likelyLfp, motorLayout, trimLabel, tyrePressureLabel } from "@/lib/car";

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
  test("equal front and rear shows once", () => {
    expect(tyrePressureLabel(2.9, 2.9)).toBe("2.9 bar (42 psi)");
  });
  test("different front and rear", () => {
    expect(tyrePressureLabel(2.9, 3.1)).toBe("2.9 bar front · 3.1 bar rear (42 psi · 45 psi)");
  });
  test("missing values show nothing", () => {
    expect(tyrePressureLabel(null, 2.9)).toBeNull();
  });
});
