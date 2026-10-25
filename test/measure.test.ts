import { describe, expect, test } from "bun:test";
import { measureParts } from "@/lib/measure";

const shape = (text: string) => measureParts(text).map((p) => (p.unit ? `[${p.text}]` : p.text));

describe("measureParts", () => {
  test("a number and its unit, the unit trimmed so no monospace space is left", () => {
    expect(shape("46 km")).toEqual(["46", "[km]"]);
    expect(shape("12.4 kWh")).toEqual(["12.4", "[kWh]"]);
    expect(shape("1,240 W")).toEqual(["1,240", "[W]"]);
  });
  test("% is a unit, with or without a space", () => {
    expect(shape("62%")).toEqual(["62", "[%]"]);
    expect(shape("58% to 80%")).toEqual(["58", "[% to]", "80", "[%]"]);
  });
  test("durations keep each number with its unit", () => {
    expect(shape("1 h 15 min")).toEqual(["1", "[h]", "15", "[min]"]);
  });
  test("signs before a number stay as they are, spaces included", () => {
    expect(shape("₹1,240")).toEqual(["₹", "1,240"]);
    expect(shape("₹12/kWh")).toEqual(["₹", "12", "[/kWh]"]);
    expect(shape("≈ 412 km")).toEqual(["≈ ", "412", "[km]"]);
  });
  test("words before a number are a unit too", () => {
    expect(shape("Battery 58% to 51%")).toEqual(["[Battery]", "58", "[% to]", "51", "[%]"]);
  });
  test("punctuation and spaces between numbers are kept", () => {
    expect(shape("25 Oct 2026, 9:12 AM")).toEqual(["25", "[Oct]", "2026", ", ", "9", ":", "12", "[AM]"]);
    expect(shape("3 of 12")).toEqual(["3", "[of]", "12"]);
    expect(shape("1,240 1,300")).toEqual(["1,240", " ", "1,300"]);
  });
  test("a bare number or a version is left whole", () => {
    expect(shape("42")).toEqual(["42"]);
    expect(shape("2026.38.3.1")).toEqual(["2026.38.3.1"]);
    expect(shape("")).toEqual([]);
  });
});
