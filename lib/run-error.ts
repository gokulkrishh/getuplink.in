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

// Turns a raw poll error (usually a Fleet API response) into one plain sentence.
export function describeRunError(error: string): string {
  if (/must be registered in the current region/i.test(error)) {
    return "This app isn't registered with Tesla for your region yet. Run scripts/register-partner.mjs, then check again.";
  }
  if (isTokenError(error)) {
    return "Tesla access has expired. Sign out and sign in with Tesla again.";
  }
  if (/\(429\)/.test(error)) return "Tesla is rate-limiting requests. The next scheduled check will try again.";
  if (/\(5\d\d\)|fetch failed/i.test(error)) return "Tesla's servers didn't respond. The next scheduled check will try again.";
  return "The last check failed. Uplink tries again at the next scheduled check.";
}
