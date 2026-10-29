import { describe, expect, test } from "bun:test";
import { isMissingStatsDetail } from "@/lib/stats-paths";

describe("isMissingStatsDetail", () => {
  test("turns away what can't be a drive or a charge", () => {
    expect(isMissingStatsDetail("/stats/driving/notadate")).toBe(true);
    expect(isMissingStatsDetail("/stats/charging/does-not-exist")).toBe(true);
    expect(isMissingStatsDetail("/stats/driving/202610231815/extra")).toBe(true);
  });

  test("lets real addresses and the topic pages through", () => {
    expect(isMissingStatsDetail("/stats/driving/202610231815")).toBe(false);
    expect(isMissingStatsDetail("/stats/driving/20261023181530")).toBe(false);
    expect(isMissingStatsDetail("/stats/charging/1234")).toBe(false);
    expect(isMissingStatsDetail("/stats/driving")).toBe(false);
    expect(isMissingStatsDetail("/stats/charging/")).toBe(false);
    expect(isMissingStatsDetail("/stats/battery/anything")).toBe(false);
    expect(isMissingStatsDetail("/stats")).toBe(false);
  });
});
