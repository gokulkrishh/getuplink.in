import "server-only";
import type { ChargingRates } from "@/lib/charging-rates";
import { DEMO } from "@/lib/demo";
import { db } from "./supabase";

const DEMO_RATES: ChargingRates = { home: 8.5, other: 20 };

// Numeric columns come back from PostgREST as numbers or strings.
function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// No rates (both null) when none are saved, the table is missing or the read fails, with a log line.
export async function loadChargingRates(): Promise<ChargingRates> {
  if (DEMO) return DEMO_RATES;
  const { data, error } = await db().from("owner_settings").select("home_rate_inr, other_rate_inr").eq("owner", "tesla").maybeSingle();
  if (error) {
    console.warn("Charging rates unavailable:", error.message);
    return { home: null, other: null };
  }
  return { home: num(data?.home_rate_inr), other: num(data?.other_rate_inr) };
}

export async function saveChargingRates(rates: ChargingRates): Promise<void> {
  if (DEMO) return;
  const { error } = await db()
    .from("owner_settings")
    .upsert({ owner: "tesla", home_rate_inr: rates.home, other_rate_inr: rates.other, updated_at: new Date().toISOString() }, { onConflict: "owner" });
  if (error) throw new Error(error.message);
}
