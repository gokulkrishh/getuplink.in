import { describe, expect, test } from "bun:test";
import { blobPath } from "@/lib/blob";

describe("blobPath", () => {
  test("the same seed always draws the same shape", () => {
    expect(blobPath("abc-123")).toBe(blobPath("abc-123"));
  });
  test("different seeds draw different shapes", () => {
    expect(blobPath("abc-123")).not.toBe(blobPath("def-456"));
  });
  test("a closed curve that stays inside the box", () => {
    const d = blobPath("abc-123", 40);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(42);
  });
});
