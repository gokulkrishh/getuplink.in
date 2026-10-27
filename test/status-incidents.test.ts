import { expect, test } from "bun:test";
import { incidents } from "@/lib/status";
import { currentErrors } from "@/lib/stream-health";

const at = (h: number) => new Date(Date.UTC(2026, 9, 26) + h * 3_600_000).toISOString();

test("failed checks close together are one issue, and what they found never leaves the server", () => {
  const list = incidents([
    { component: "Car data stream", status: "degraded", checked_at: at(0) },
    { component: "Car data stream", status: "down", checked_at: at(1) },
    { component: "Car data stream", status: "degraded", checked_at: at(10) },
    { component: "Database", status: "down", checked_at: at(1) },
  ]);
  expect(list).toEqual([
    { component: "Car data stream", status: "degraded", from: at(10), to: at(10) },
    { component: "Database", status: "down", from: at(1), to: at(1) },
    { component: "Car data stream", status: "down", from: at(0), to: at(1) },
  ]);
});

test("a Tesla stream error counts only until a reading arrives after it", () => {
  const errors = [{ error_name: "cloud_manager_error", created_at: at(0) }];
  expect(currentErrors(errors, at(5))).toEqual([]);
  expect(currentErrors(errors, at(-1))).toEqual(["cloud_manager_error"]);
  expect(currentErrors(errors, null)).toEqual(["cloud_manager_error"]);
});
