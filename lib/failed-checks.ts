// What Admin's list of failed checks says about each one: which account, and whether it is still a problem.

export type Outcome = { state: "open" } | { state: "fixed"; at: string; how: "check" | "sign-in" };

// Only known facts. A failure is fixed when a good check ran after it, or, for expired Tesla access, when the
// owner's tokens were saved after it (a sign-in). Otherwise it is open: no good check has been seen since.
export function failureOutcome(failure: { at: string; reason: string }, since: { lastGoodAt: string | null; tokensSavedAt: string | null }): Outcome {
  const after = (t: string | null): t is string => t !== null && Date.parse(t) > Date.parse(failure.at);
  const signedIn = failure.reason === "Tesla access expired" && after(since.tokensSavedAt) ? since.tokensSavedAt : null;
  const good = after(since.lastGoodAt) ? since.lastGoodAt : null;
  if (signedIn && (!good || Date.parse(signedIn) <= Date.parse(good))) return { state: "fixed", at: signedIn, how: "sign-in" };
  if (good) return { state: "fixed", at: good, how: "check" };
  return { state: "open" };
}

// An account as Admin > Access names it (accountCars): the invite label or the car's name, with the end of its VIN.
// With no car known it is "Account 7".
export function accountLabel(userId: number, car: { name: string | null; vinSuffix: string | null } | undefined): { name: string; vin: string | null } {
  return { name: car?.name ?? `Account ${userId}`, vin: car?.vinSuffix ?? null };
}

// Where an account's row sits on Admin > Access.
export const accessAnchor = (userId: number) => `account-${userId}`;

// The line under a failed check. `time` is the time as shown on the page ("5:30 AM", "26 Oct, 6:00 AM").
export function outcomeLine(outcome: Outcome, time: (at: string) => string): string {
  if (outcome.state === "open") return "No good check since";
  return outcome.how === "sign-in" ? `Signed in again, ${time(outcome.at)}` : `Worked again, ${time(outcome.at)}`;
}
