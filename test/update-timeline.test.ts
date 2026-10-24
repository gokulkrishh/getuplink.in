import { describe, expect, test } from "bun:test";
import { type Reading, updateTimeline } from "@/lib/telemetry-derive";

// The 2026.38.3.2 update on 23–24 Oct 2026 (UTC), as streamed.
const r = (at: string, value: unknown): Reading => ({ at: `2026-10-${at}Z`, value });
const series = {
  pending: [r("23T13:28:50", " "), r("23T18:28:39", "2026.38.3.2"), r("24T02:33:03", " ")],
  download: [r("23T13:28:50", 0), r("23T18:28:39", 100), r("23T18:32:19", 0), r("23T18:33:19", 25), r("23T18:34:19", 100)],
  // The car prepares the update in the background at midnight IST; the install itself starts at 7:42 AM.
  install: [r("23T13:28:50", 1), r("23T18:30:28", 3), r("23T18:33:52", 4), r("23T18:39:05", 10), r("24T02:18:15", 30), r("24T02:30:11", 100)],
  installed: [r("23T13:28:50", "2026.38.3.1"), r("24T02:31:46", "2026.38.3.1"), r("24T02:32:47", "2026.38.3.2")],
  started: [r("23T13:28:50", false), r("24T02:11:57", true), r("24T02:31:46", true), r("24T02:32:47", false)],
};

describe("updateTimeline", () => {
  test("times the install from InProgress, not the background preparation", () => {
    expect(updateTimeline("2026.38.3.2", series)?.installMin).toBe(21);
  });

  test("falls back to the installation percent when InProgress wasn't streamed", () => {
    expect(updateTimeline("2026.38.3.2", { ...series, started: undefined })?.installMin).toBe(482);
  });
});
