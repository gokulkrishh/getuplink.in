import { describe, expect, mock, test } from "bun:test";
import type { Owner } from "@/lib/server/data/owner";
import { UPDATE_FIELDS } from "@/lib/telemetry";

// loadCarState lays the streamed update over the last online check, so whatever fields a page asks for, the
// update's own fields are read too: the home page's list names them by hand and had no InProgress.
mock.module("server-only", () => ({}));
const empty = () => {
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_, key: string) =>
        key === "then" ? (resolve: (v: unknown) => void) => resolve({ data: [], error: null }) : key === "maybeSingle" ? async () => ({ data: null, error: null }) : () => chain,
    },
  );
  return chain;
};
mock.module("@/lib/server/supabase", () => ({ db: () => ({ from: empty, rpc: empty }) }));

const real = await import("@/lib/server/telemetry");
let asked: string[][] = [];
mock.module("@/lib/server/telemetry", () => ({
  ...real,
  loadStream: async (owner: Owner, vin: string, fields?: string[]) => {
    asked.push(fields ?? real.STREAM_FIELDS);
    return {};
  },
}));
const { loadCarState } = await import("@/lib/server/dashboard");

describe("loadCarState", () => {
  test("always reads every update field, with the page's own", async () => {
    asked = [];
    await loadCarState({ sub: "owner" } as Owner, { id: "1", vin: "VIN1" }, "normal", Date.now(), ["BatteryLevel"]);
    expect(asked[0]).toEqual(["BatteryLevel", ...UPDATE_FIELDS]);
  });

  test("the default list gains SoftwareUpdateInProgress", async () => {
    asked = [];
    await loadCarState({ sub: "owner" } as Owner, { id: "1", vin: "VIN1" }, "normal", Date.now());
    expect(asked[0]).toContain("SoftwareUpdateInProgress");
    expect(new Set(asked[0]).size).toBe(asked[0].length);
  });
});
