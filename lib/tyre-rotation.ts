// When to rotate the tyres, from the odometer. Tesla's maintenance schedule says every 10,000 km. Uplink
// doesn't know when the tyres were last rotated, so it counts from new: rotations fall at 10,000 km,
// 20,000 km and so on. Within NEAR_KM either side of one, the rotation is due.
import { formatRangeKm as km } from "@/lib/format";

export const ROTATE_EVERY_KM = 10_000;
const NEAR_KM = 500;

export type TyreRotation = { nextAtKm: number; toGoKm: number; due: boolean };

export function tyreRotation(odometerKm: number | null): TyreRotation | null {
  if (odometerKm === null || !Number.isFinite(odometerKm) || odometerKm < 0) return null;
  const nextAtKm = (Math.floor(odometerKm / ROTATE_EVERY_KM) + 1) * ROTATE_EVERY_KM;
  const sinceLast = odometerKm % ROTATE_EVERY_KM;
  const toGoKm = nextAtKm - odometerKm;
  return { nextAtKm, toGoKm, due: toGoKm <= NEAR_KM || (odometerKm >= ROTATE_EVERY_KM && sinceLast <= NEAR_KM) };
}

// "Rotate the tyres at 10,000 km, 6,565 km from now." on the Car page.
export function rotationLine(r: TyreRotation): string {
  return `Rotate the tyres at ${km(r.nextAtKm)}, ${km(r.toGoKm)} from now.`;
}

// Home's notice, only while a rotation is due: the one just passed when it's behind the car.
export function rotationNotice(r: TyreRotation | null): string[] {
  if (!r?.due) return [];
  const at = r.toGoKm <= NEAR_KM ? r.nextAtKm : r.nextAtKm - ROTATE_EVERY_KM;
  return [`Tyre rotation is due at ${km(at)}. Tesla suggests one every ${km(ROTATE_EVERY_KM)}.`];
}
