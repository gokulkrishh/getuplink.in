import { expect, test } from "bun:test";
import { incidents } from "@/lib/status";
import { currentErrors } from "@/lib/stream-health";

const at = (h: number) => new Date(Date.UTC(2026, 9, 26) + h * 3_600_000).toISOString();

test("failed checks close together are one issue, with every reason found", () => {
  const list = incidents([
    { component: "Car data stream", status: "degraded", problems: ["A"], checked_at: at(0) },
    { component: "Car data stream", status: "down", problems: ["B"], checked_at: at(1) },
    { component: "Car data stream", status: "degraded", problems: ["A"], checked_at: at(10) },
    { component: "Database", status: "down", problems: [], checked_at: at(1) },
  ]);
  expect(list.map((i) => [i.component, i.status, i.from, i.to, i.problems])).toEqual([
    ["Car data stream", "degraded", at(10), at(10), ["A"]],
    ["Database", "down", at(1), at(1), []],
    ["Car data stream", "down", at(0), at(1), ["A", "B"]],
  ]);
});

test("a Tesla stream error counts only until a reading arrives after it", () => {
  const errors = [{ error_name: "cloud_manager_error", created_at: at(0) }];
  expect(currentErrors(errors, at(5))).toEqual([]);
  expect(currentErrors(errors, at(-1))).toEqual(["cloud_manager_error"]);
  expect(currentErrors(errors, null)).toEqual(["cloud_manager_error"]);
});
