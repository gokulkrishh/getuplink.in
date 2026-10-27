import { describe, expect, test } from "bun:test";
import { rotationLine, rotationNotice, tyreRotation } from "@/lib/tyre-rotation";

describe("tyreRotation", () => {
  test("a new car's first rotation is at 10,000 km", () => {
    const r = tyreRotation(3434.9);
    expect(r && rotationLine(r)).toBe("Rotate the tyres at 10,000 km, 6,565 km from now.");
    expect(rotationNotice(r)).toEqual([]);
  });
  test("due within 500 km before a rotation, and for 500 km after it", () => {
    expect(rotationNotice(tyreRotation(9600))).toEqual(["Tyre rotation is due at 10,000 km. Tesla suggests one every 10,000 km."]);
    expect(rotationNotice(tyreRotation(10_300))).toEqual(["Tyre rotation is due at 10,000 km. Tesla suggests one every 10,000 km."]);
    expect(rotationNotice(tyreRotation(10_800))).toEqual([]);
    expect(rotationNotice(tyreRotation(300))).toEqual([]);
  });
  test("no odometer, no tip", () => {
    expect(tyreRotation(null)).toBeNull();
  });
});
