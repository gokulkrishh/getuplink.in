import { beforeEach, describe, expect, mock, test } from "bun:test";
import { standIn } from "./stand-in";

// The header bell's cached read (lib/server/alerts.ts bellAlerts): kept per session for a short while,
// under the owner-data tag that the app's actions clear, and an alert that comes up after a read shows
// on the next one. Made-up car only; the stored answers are faked.

const tags: string[] = [];
const lives: unknown[] = [];
let keyPaired: boolean | null = true;
let signedIn = true;

mock.module("server-only", () => ({}));
await standIn("next/cache", { cacheTag: (t: string) => tags.push(t), cacheLife: (l: unknown) => lives.push(l) });
await standIn("@/lib/server/auth", { currentOwner: async () => (signedIn ? { userId: 1, sub: "made-up" } : null) });
await standIn("@/lib/server/admin", { isAdmin: async () => false });
await standIn("@/lib/server/data/setup", {
  carSetups: async () => [{ vin: "VIN1", name: "Shadow", keyPaired, keyCheckedAt: "2026-10-29T02:00:00.000Z", streaming: "synced", streamingCheckedAt: "2026-10-29T02:00:00.000Z" }],
  configExpiries: async () => new Map(),
});
await standIn("@/lib/server/dashboard", { loadOwnerCars: async () => ({ kind: "ready", vehicles: [], lastRun: null }) });

const { bellAlerts } = await import("@/lib/server/alerts");

beforeEach(() => {
  tags.length = 0;
  lives.length = 0;
  keyPaired = true;
  signedIn = true;
});

describe("bellAlerts", () => {
  test("is kept under the owner-data tag for a minute at most", async () => {
    await bellAlerts();
    expect(tags).toEqual(["owner-data"]);
    expect(lives).toEqual([{ stale: 60 }]);
  });

  test("a key removed after one read shows on the next", async () => {
    const before = await bellAlerts();
    expect(before?.alerts.some((a) => a.kind === "action")).toBe(false);
    keyPaired = false;
    const after = await bellAlerts();
    expect(after?.alerts.map((a) => a.title).join(" ")).toMatch(/key/i);
    expect(typeof after?.now).toBe("number");
  });

  test("signed out, no bell", async () => {
    signedIn = false;
    expect(await bellAlerts()).toBeNull();
  });
});
