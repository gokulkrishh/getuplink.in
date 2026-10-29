// A poll error that means the Tesla tokens were refused or missing, so the owner has to sign in again.
export function isTokenError(error: string): boolean {
  return /not connected|Token request failed|\(401\)/i.test(error);
}

// A token error from a run that ended before the tokens were last saved (a sign-in since) is out of date:
// the new tokens haven't been tried yet. The run keeps its time; only the error goes.
export function withoutStaleTokenError<T extends { finished_at: string | null; ok: boolean | null; error: string | null }>(
  run: T,
  tokensSavedAt: string | null,
): T {
  if (run.ok !== false || !run.error || !isTokenError(run.error) || !run.finished_at || !tokensSavedAt) return run;
  return new Date(run.finished_at).getTime() < new Date(tokensSavedAt).getTime() ? { ...run, error: null } : run;
}

// Uplink's own database failing around a token refresh (lib/server/tesla.ts: claiming it, or storing the new
// pair), its time-out included: not Tesla's doing, though the message may say "aborted".
const isTokenDbError = (error: string) => /Saving tokens failed|Claiming the token refresh failed/.test(error);

// Turns a raw poll error (usually a Fleet API response) into one plain sentence.
export function describeRunError(error: string): string {
  if (isTokenDbError(error)) return "The last check didn't finish. Uplink will try again at the next check.";
  if (/must be registered in the current region/i.test(error)) {
    return "Uplink isn't set up with Tesla for your region yet. Uplink will try again at the next check.";
  }
  if (isTokenError(error)) {
    return "Tesla access has expired. Sign out and sign in with Tesla again.";
  }
  if (/\(429\)/.test(error)) return "Tesla asked Uplink to slow down. Uplink will try again at the next check.";
  if (/\(5\d\d\)|fetch failed|aborted|operation timed out/i.test(error)) return "Tesla didn't respond. Uplink will try again at the next check.";
  return "The last check didn't finish. Uplink will try again at the next check.";
}

// The same errors as a short reason, for the admin's list of failed checks.
export function runErrorReason(error: string | null): string {
  if (!error || isTokenDbError(error)) return "Didn't finish";
  if (/must be registered in the current region/i.test(error)) return "Region not set up with Tesla";
  if (isTokenError(error)) return "Tesla access expired";
  if (/\(429\)/.test(error)) return "Tesla asked to slow down";
  if (/\(5\d\d\)|fetch failed|aborted|operation timed out/i.test(error)) return "Tesla didn't respond";
  return "Didn't finish";
}
