import "server-only";
import { messageOf } from "@/lib/errors";
import type { Owner } from "./data/owner";
import { cachedAnswer, MissingSchema, saveAnswer } from "./data/usage";
import { fleetGet } from "./tesla";

// The car's streaming config and errors, as Tesla reports them, for the health check. The health bot asks
// every 15 minutes and each answer is two billed requests, so one answer is reused for TESLA_ANSWER_MS,
// stored in the database (tesla_answer_cache) so every server instance shares it. Before that table exists
// every call asks Tesla, as before.

export const TESLA_ANSWER_MS = 60 * 60_000;
const NAME = "stream_health";

export type TelemetryConfig = { synced?: boolean; key_paired?: boolean; config?: { exp?: number } | null } | null;
export type TelemetryErrors = { fleet_telemetry_errors?: { name?: string; error?: string }[] } | null;
export type StreamState = { config: TelemetryConfig; errors: TelemetryErrors; fetchedAt: string };

// Whether a stored answer can stand in for asking Tesla now: about the same car, and young enough.
export function isFresh(stored: { vin: string; fetched_at: string } | null, vin: string, now: number): boolean {
  if (!stored || stored.vin !== vin) return false;
  const age = now - Date.parse(stored.fetched_at);
  return age >= 0 && age < TESLA_ANSWER_MS;
}

let warned = false;
const warnOnce = (err: unknown) => {
  if (err instanceof MissingSchema || warned) return;
  warned = true;
  console.warn("Stored Tesla answer unavailable; asking Tesla:", messageOf(err));
};

export async function streamState(owner: Owner, vin: string, now: number): Promise<StreamState> {
  const stored = await cachedAnswer(NAME).catch((err) => (warnOnce(err), null));
  if (stored && isFresh(stored, vin, now)) {
    const body = stored.body as { config?: TelemetryConfig; errors?: TelemetryErrors } | null;
    return { config: body?.config ?? null, errors: body?.errors ?? null, fetchedAt: stored.fetched_at };
  }
  let errorsAnswered = true;
  const [config, errors] = await Promise.all([
    fleetGet<TelemetryConfig>(owner, `/api/1/vehicles/${vin}/fleet_telemetry_config`),
    fleetGet<TelemetryErrors>(owner, `/api/1/vehicles/${vin}/fleet_telemetry_errors`).catch((): TelemetryErrors => {
      errorsAnswered = false;
      return null;
    }),
  ]);
  const fetchedAt = new Date(now).toISOString();
  // Only a whole answer is kept: a failed errors read is asked again next time.
  if (errorsAnswered) await saveAnswer(owner, NAME, vin, { config, errors }, fetchedAt).catch(warnOnce);
  return { config, errors, fetchedAt };
}
