import { describe, expect, test } from "bun:test";
import { versionRows } from "@/components/updates/history";
import type { VersionChange } from "@/lib/server/dashboard";

const NOW = Date.parse("2026-10-29T12:00:00+05:30");
const change = (over: Partial<VersionChange>): VersionChange => ({ version: "2026.38.5.1", previous_version: null, detected_at: "2026-10-29T03:30:00Z", available_at: null, odometer_km: 9000, ...over });

describe("versionRows", () => {
  test("the first version seen was installed before Uplink: no install date", () => {
    const [row] = versionRows([change({})], {}, NOW);
    expect(row.installed).toBe("Before Uplink");
    expect(row.firstSeen).toBe("29 Oct");
  });
  test("a later version keeps the day Uplink saw it installed", () => {
    const [row] = versionRows([change({ previous_version: "2026.32.3", available_at: "2026-10-27T03:30:00Z" })], {}, NOW);
    expect(row.installed).toBe("29 Oct");
    expect(row.received).toBe("27 Oct");
    expect(row.firstSeen).toBeNull();
  });
});
