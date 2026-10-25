import "server-only";
import { DEMO } from "@/lib/demo";
import { retentionRules } from "@/lib/telemetry-retention";
import { pruneTelemetryBatch } from "./data/system";

// Rows per call. Each call is its own short transaction (see the migration).
const BATCH = 5000;
// The route has 60 s; stop starting batches well before that. What's left goes tomorrow.
const BUDGET_MS = 45_000;

export type RetentionResult = { deleted: number; batches: number; done: boolean; skipped?: string };

// Deletes telemetry_readings past their keep (lib/telemetry-retention.ts), a batch at a time, until a
// batch comes back short or the time runs out. The first runs on a full table may stop at the budget.
export async function pruneTelemetry(now = Date.now): Promise<RetentionResult> {
  if (DEMO) return { deleted: 0, batches: 0, done: true, skipped: "demo" };
  const rules = retentionRules();
  const started = now();
  let deleted = 0;
  let batches = 0;
  while (now() - started < BUDGET_MS) {
    const { data, error } = await pruneTelemetryBatch({
      p_fields: rules.fields,
      p_keep_days: rules.keepDays,
      p_default_days: rules.defaultDays,
      p_near_charge_fields: rules.nearChargeFields,
      p_near_charge_minutes: rules.nearChargeMinutes,
      p_limit: BATCH,
    });
    // Before the migration the function is missing: nothing to do yet.
    if (error?.code === "PGRST202" || error?.code === "42883") return { deleted, batches, done: false, skipped: "no prune function" };
    if (error) throw new Error(error.message);
    const n = typeof data === "number" ? data : 0;
    deleted += n;
    batches++;
    if (n < BATCH) return { deleted, batches, done: true };
  }
  return { deleted, batches, done: false };
}
