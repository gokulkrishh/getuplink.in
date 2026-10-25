import "server-only";
import { carNotices } from "@/lib/car-notices";
import type { CheckedTyres, TyreFlags } from "@/lib/car-now";
import { DEMO } from "@/lib/demo";
import { demoData } from "./demo";
import { type Owner, ownerDb } from "./data/owner";

// What the latest online check said beyond the car's state: Tesla's notices (an unpaid Supercharger
// balance, the car in service) and which tyres it warned about. Only checks that found the car online keep
// Tesla's response (see poll.ts), so a car asleep since still shows what its last online check said.
export type CarFlagsNow = { notices: string[]; tyres: CheckedTyres | null };

const SIDES = ["fl", "fr", "rl", "rr"] as const;

// Picked keys only: nothing else of the response is read. loadCarState adds them to its read of the same
// check, so home and the car page get the flags without a query of their own.
export const FLAG_COLUMNS = [
  "payment:raw->supercharger_payment_needed",
  "service:raw->in_service",
  ...SIDES.flatMap((s) => [`soft_${s}:raw->vehicle_state->tpms_soft_warning_${s}`, `hard_${s}:raw->vehicle_state->tpms_hard_warning_${s}`]),
].join(", ");

// The keys FLAG_COLUMNS adds to a row, so a reader can take them back off.
export const FLAG_KEYS = ["payment", "service", ...SIDES.flatMap((s) => [`soft_${s}`, `hard_${s}`])];

function flags(row: Record<string, unknown>, kind: "soft" | "hard"): TyreFlags {
  const out: TyreFlags = {};
  for (const s of SIDES) {
    const v = row[`${kind}_${s}`];
    if (typeof v === "boolean") out[s] = v;
  }
  return out;
}

// The flags from a row read with polled_at and FLAG_COLUMNS; none without a row.
export function carFlagsFrom(row: Record<string, unknown> | null): CarFlagsNow {
  if (!row) return { notices: [], tyres: null };
  const soft = flags(row, "soft");
  const hard = flags(row, "hard");
  return {
    notices: carNotices({ supercharger_payment_needed: row.payment, in_service: row.service }),
    tyres: Object.keys(soft).length || Object.keys(hard).length ? { at: row.polled_at as string, soft, hard } : null,
  };
}

// The demo car's tyre warnings are streamed (see generate.ts), newer than its last check.
export const demoCarFlags = (): CarFlagsNow => ({ notices: carNotices(demoData().flags), tyres: null });

// Nothing to say when the read fails: these are extras on pages that work without them.
export async function loadCarFlags(owner: Owner, vehicleId: string): Promise<CarFlagsNow> {
  if (DEMO) return demoCarFlags();
  const { data, error } = await ownerDb(owner)
    .from("snapshots")
    .select(`polled_at, ${FLAG_COLUMNS}`)
    .eq("vehicle_id", vehicleId)
    .eq("state", "online")
    .not("raw", "is", null)
    .order("polled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("Last check's flags unavailable:", error.message);
    return { notices: [], tyres: null };
  }
  // A select built from a string has no row type.
  return carFlagsFrom(data as unknown as Record<string, unknown> | null);
}
