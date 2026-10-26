import "server-only";
import type { Currency, EntryInput, FixedService, Period } from "@/lib/costs";
import { db } from "@/lib/server/supabase";

// /admin/costs: fixed and manual cost entries, the exchange rate and budgets, and the last live values.
// Fleet-wide, not one owner's; only the admin page and its actions (which check the admin) call these.
// Until the migration (20261101120000_cost_entries.sql) is applied, reads return null and writes "missing".

const MISSING_TABLE = ["42P01", "PGRST205"];

export type CostEntryRow = {
  id: number;
  service: FixedService | null;
  name: string;
  amount: number;
  currency: Currency;
  period: Period;
  renews_on: string | null;
  link: string | null;
  updated_at: string;
};

const ENTRY_COLUMNS = "id, service, name, amount, currency, period, renews_on, link, updated_at";

export async function costEntries(): Promise<CostEntryRow[] | null> {
  const { data, error } = await db().from("cost_entries").select(ENTRY_COLUMNS).order("id");
  if (error) {
    if (MISSING_TABLE.includes(error.code)) return null;
    throw new Error(`Reading costs failed: ${error.message}`);
  }
  return (data ?? []).map((r) => ({ ...(r as CostEntryRow), id: Number(r.id), amount: Number(r.amount) }));
}

export type WriteResult = "ok" | "missing" | "gone";

function row(input: EntryInput, at: string) {
  return {
    name: input.name,
    amount: input.amount,
    currency: input.currency,
    period: input.period,
    renews_on: input.renewsOn ?? null,
    link: input.link ?? null,
    updated_at: at,
  };
}

function result(error: { code?: string; message: string } | null): WriteResult {
  if (!error) return "ok";
  if (MISSING_TABLE.includes(error.code ?? "")) return "missing";
  throw new Error(`Saving costs failed: ${error.message}`);
}

// A built-in service's one row: created on first save, replaced after.
export async function saveServiceEntry(service: FixedService, input: EntryInput, at: string): Promise<WriteResult> {
  const { error } = await db().from("cost_entries").upsert({ service, ...row(input, at) }, { onConflict: "service" });
  return result(error);
}

export async function addCostEntry(input: EntryInput, at: string): Promise<WriteResult> {
  const { error } = await db().from("cost_entries").insert(row(input, at));
  return result(error);
}

// Owner-added rows only: a built-in service's row is never changed or removed by id.
export async function updateCostEntry(id: number, input: EntryInput, at: string): Promise<WriteResult> {
  const { data, error } = await db().from("cost_entries").update(row(input, at)).eq("id", id).is("service", null).select("id");
  if (error) return result(error);
  return data && data.length > 0 ? "ok" : "gone";
}

export async function deleteCostEntry(id: number): Promise<WriteResult> {
  const { data, error } = await db().from("cost_entries").delete().eq("id", id).is("service", null).select("id");
  if (error) return result(error);
  return data && data.length > 0 ? "ok" : "gone";
}

// ---- Settings and last known values ----

export type CostSettingKey = "usd_inr" | "google_budget_usd" | "snapshot:vercel";
export type CostSetting = { value: Record<string, unknown>; updated_at: string };

export async function costSettings(): Promise<Partial<Record<CostSettingKey, CostSetting>> | null> {
  const { data, error } = await db().from("cost_settings").select("key, value, updated_at");
  if (error) {
    if (MISSING_TABLE.includes(error.code)) return null;
    throw new Error(`Reading cost settings failed: ${error.message}`);
  }
  return Object.fromEntries((data ?? []).map((r) => [r.key as string, { value: r.value as Record<string, unknown>, updated_at: r.updated_at as string }]));
}

export async function saveCostSetting(key: CostSettingKey, value: Record<string, unknown>, at: string): Promise<WriteResult> {
  const { error } = await db().from("cost_settings").upsert({ key, value, updated_at: at }, { onConflict: "key" });
  return result(error);
}

export async function clearCostSetting(key: CostSettingKey): Promise<WriteResult> {
  const { error } = await db().from("cost_settings").delete().eq("key", key);
  return result(error);
}
