import { describe, expect, mock, test } from "bun:test";
import { standIn } from "./stand-in";

// The Charging page's reads, with each loader held until the test lets it go: what starts before what
// lands shows which reads wait on others.

type Held<T> = { promise: Promise<T>; resolve: (v: T) => void };
const held = <T,>(): Held<T> => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

let started: string[] = [];
let tesla: Held<unknown[]>;
let stream: Held<unknown[]>;
let invoices: Held<Map<number, unknown>>;
let extras: Held<unknown>[] = [];

mock.module("server-only", () => ({}));
await standIn("@/lib/server/charging", { loadChargingSessions: () => (started.push("tesla"), tesla.promise) });
await standIn("@/lib/server/stream-charging", { loadStreamSessions: () => (started.push("stream"), stream.promise) });
await standIn("@/lib/server/receipts", { invoicesBySession: () => (started.push("invoices"), invoices.promise) });
await standIn("@/lib/server/charging-extra", {
  loadChargingExtras: () => {
    started.push("extras");
    const h = held<unknown>();
    extras.push(h);
    return h.promise;
  },
});
await standIn("@/lib/server/google-place-names", { withGoogleNamesBy: async (spots: unknown) => spots });

const { loadChargingLists } = await import("@/lib/server/charging-lists");
const { asOwner } = await import("@/lib/server/data/owner");

const OWNER = asOwner(1, "made-up");
const tick = () => new Promise((r) => setTimeout(r, 0));
const session = (id: number, started_at: string) => ({ id, started_at, supercharger: false });

function reset() {
  started = [];
  tesla = held();
  stream = held();
  invoices = held();
  extras = [];
}

describe("loadChargingLists", () => {
  test("asks for the invoices once the car's charges are in, without waiting for Tesla's", async () => {
    reset();
    const lists = loadChargingLists(OWNER, "VIN", Date.now(), null);
    stream.resolve([session(1, "2026-10-20T10:00:00Z")]);
    await tick();
    expect(started).toContain("invoices");
    tesla.resolve([]);
    invoices.resolve(new Map());
    await tick();
    extras[0].resolve({ curves: [], pins: [], spots: {} });
    expect((await lists).rangeExtras).toBeNull();
  });

  test("reads a picked range's extras alongside every charge's", async () => {
    reset();
    const span = { from: Date.parse("2026-10-15T00:00:00Z"), to: Date.parse("2026-10-25T00:00:00Z") };
    const lists = loadChargingLists(OWNER, "VIN", Date.now(), span);
    stream.resolve([session(1, "2026-10-20T10:00:00Z"), session(2, "2026-09-01T10:00:00Z")]);
    tesla.resolve([]);
    invoices.resolve(new Map());
    await tick();
    await tick();
    // Both started before either is done.
    expect(started.filter((s) => s === "extras")).toHaveLength(2);
    extras[0].resolve({ curves: [], pins: [], spots: { 1: "all" } });
    extras[1].resolve({ curves: [], pins: [], spots: { 1: "range" } });
    const result = await lists;
    expect(result.extras.spots as unknown).toEqual({ 1: "all" });
    expect(result.rangeExtras?.spots as unknown).toEqual({ 1: "range" });
  });
});
