// Pure decisions for the streaming health check (app/api/health/stream), kept free of server-only
// imports so they can be tested on their own.

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// The car counts as recently online within this window; a reading is due within STALE_AFTER of it.
export const ONLINE_WINDOW_MS = 3 * HOUR_MS;
export const STALE_AFTER_MS = 2 * HOUR_MS;
export const EXPIRY_WARN_DAYS = 14;

export type Freshness = { stale: boolean; hours: number };

// Stale = the car was online in the last 3 h, yet no reading arrived within 2 h of that online time.
// `hours` is how long the stream has been silent while the car was online (rounded to 0.1 h).
export function streamFreshness(lastReadingAt: string | null, carLastOnlineAt: string | null, now: number): Freshness {
  const online = carLastOnlineAt ? Date.parse(carLastOnlineAt) : NaN;
  if (Number.isNaN(online) || now - online > ONLINE_WINDOW_MS) return { stale: false, hours: 0 };
  const reading = lastReadingAt ? Date.parse(lastReadingAt) : NaN;
  const since = Number.isNaN(reading) ? null : reading;
  // The stream is fine if a reading landed at or after (online - 2 h).
  if (since !== null && since >= online - STALE_AFTER_MS) return { stale: false, hours: 0 };
  // Silent since the newest reading, or for the whole window when there are none at all.
  const silentSince = since ?? online - STALE_AFTER_MS;
  return { stale: true, hours: Math.round(((now - silentSince) / HOUR_MS) * 10) / 10 };
}

// Whole days until the streaming config expires (`exp` is unix seconds). Null when unknown.
export function daysUntilExpiry(expSeconds: number | null | undefined, now: number): number | null {
  if (typeof expSeconds !== "number" || !Number.isFinite(expSeconds)) return null;
  return Math.floor((expSeconds * 1000 - now) / DAY_MS);
}

export type StreamHealth = {
  ok: boolean;
  problems: string[];
  checked_at: string;
  last_reading_at: string | null;
  car_last_online_at: string | null;
  config: { synced: boolean | null; expires_at: string | null };
};

export function assembleHealth(input: {
  now: number;
  problems: string[];
  lastReadingAt: string | null;
  carLastOnlineAt: string | null;
  synced: boolean | null;
  expiresAt: string | null;
}): StreamHealth {
  return {
    ok: input.problems.length === 0,
    problems: input.problems,
    checked_at: new Date(input.now).toISOString(),
    last_reading_at: input.lastReadingAt,
    car_last_online_at: input.carLastOnlineAt,
    config: { synced: input.synced, expires_at: input.expiresAt },
  };
}

// A short reason for "Couldn't check ...", on one line.
export function shortReason(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/\s+/g, " ").slice(0, 80);
}
