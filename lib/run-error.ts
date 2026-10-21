// Turns a raw poll error (usually a Fleet API response) into one plain sentence.
export function describeRunError(error: string): string {
  if (/must be registered in the current region/i.test(error)) {
    return "This app isn't registered with Tesla for your region yet. Run scripts/register-partner.mjs, then check again.";
  }
  if (/not connected|Token request failed|\(401\)/i.test(error)) {
    return "Tesla access has expired. Sign out and sign in with Tesla again.";
  }
  if (/\(429\)/.test(error)) return "Tesla is rate-limiting requests. The next scheduled check will try again.";
  if (/\(5\d\d\)|fetch failed/i.test(error)) return "Tesla's servers didn't respond. The next scheduled check will try again.";
  return "The last check failed. Uplink tries again at the next scheduled check.";
}
