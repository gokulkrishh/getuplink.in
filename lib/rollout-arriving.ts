// What Tesla is offering Indian cars right now, and where the owner's car stands, for the India rollout on /updates. Pure like
// lib/rollout.ts: the loader hands in one row per car and gets totals back, so no car leaves the server.
import { compareVersions, type Rollout } from "@/lib/rollout";
import { normaliseVersion } from "@/lib/versions";

// Tesla's software_update statuses for an update the car has but hasn't installed yet: the keys of
// components/updates/update-status.tsx's labels. Polls store an empty status as null.
export const PENDING_STATUSES = ["available", "scheduled", "downloading", "downloading_wifi_wait", "installing"];

// One car: the version it runs (the vehicles row) and the update its last online check saw offered.
export type OfferedCar = { car: string; version: string | null; status: string | null; offered: string | null };

// One version on offer: cars it's waiting on, and cars already on it.
export type Arriving = { version: string; offered: number; on: number };

// The car's pending update, or null. An offer no newer than what the car runs is a stale check: the car
// installed it since (a streamed version can move the vehicles row without a new snapshot).
export function pendingUpdate(car: Omit<OfferedCar, "car">): string | null {
  const offered = normaliseVersion(car.offered);
  const version = normaliseVersion(car.version);
  if (!offered || !car.status || !PENDING_STATUSES.includes(car.status)) return null;
  return version && compareVersions(offered, version) <= 0 ? null : offered;
}

// The offers with the owner's car as its own pages show it (the last check with newer streamed update
// fields laid over it) instead of its last check alone, so "Arriving now" and "Your car" agree. Other cars
// keep their checks: their streams aren't read here. A car not in the list isn't added.
export function withOwnOffer(offers: OfferedCar[], own: OfferedCar | null): OfferedCar[] {
  return own ? offers.map((o) => (o.car === own.car ? own : o)) : offers;
}

// Each version with cars waiting on it, newest first. Empty when nothing is pending.
export function buildArriving(cars: OfferedCar[]): Arriving[] {
  const latest = new Map(cars.map((c) => [c.car, c])); // one row per car, the last given
  const offered = new Map<string, number>();
  const on = new Map<string, number>();
  for (const car of latest.values()) {
    const pending = pendingUpdate(car);
    if (pending) offered.set(pending, (offered.get(pending) ?? 0) + 1);
    const version = normaliseVersion(car.version);
    if (version) on.set(version, (on.get(version) ?? 0) + 1);
  }
  return [...offered]
    .sort(([a], [b]) => compareVersions(b, a))
    .map(([version, n]) => ({ version, offered: n, on: on.get(version) ?? 0 }));
}

export type YourCar =
  | { kind: "waiting"; version: string }
  | { kind: "newest" }
  | { kind: "behind"; versions: number; newest: string; cars: number };

// The owner's car against the pooled rollout. An update waiting on the car comes first; otherwise how many
// versions that Indian cars run now are newer than its own. Null when the car hasn't reported a version.
export function yourCar(own: Omit<OfferedCar, "car">, rollout: Rollout): YourCar | null {
  const pending = pendingUpdate(own);
  if (pending) return { kind: "waiting", version: pending };
  const version = normaliseVersion(own.version);
  if (!version) return null;
  const newer = rollout.versions.filter((v) => v.carsNow > 0 && compareVersions(v.version, version) > 0);
  if (newer.length === 0) return { kind: "newest" };
  return { kind: "behind", versions: newer.length, newest: newer[0].version, cars: newer[0].carsNow };
}

// The owner's car against India, in one line, in the terms Updates uses: "Newest in India" is the newest
// version cars run.
export function yourCarWords(car: YourCar): string {
  if (car.kind === "waiting") return `${car.version} is waiting to install on your car`;
  if (car.kind === "newest") return "You're on the newest in India";
  return `You're ${car.versions} ${car.versions === 1 ? "version" : "versions"} behind the newest in India`;
}
