// The waitlist's rules, without the database: what each decision moves an account from and to, and the
// cap on approved users. Admin itself is a role on the users row (users.role = 'admin'), set by hand.

export const DEFAULT_MAX_USERS = 25;

// MAX_USERS: how many accounts can be approved at once, admins included. Unset or not a positive whole
// number is the default.
export function parseMaxUsers(value: string | undefined): number {
  const n = Number(value?.trim());
  return value?.trim() && Number.isSafeInteger(n) && n > 0 ? n : DEFAULT_MAX_USERS;
}

export type Decision = "approve" | "decline" | "suspend" | "restore" | "reopen";

// approve and restore take a place, so they are refused at the cap. A suspended account doesn't hold a place.
export const DECISIONS: Record<Decision, { from: string[]; to: string; takesPlace: boolean }> = {
  approve: { from: ["waitlist"], to: "approved", takesPlace: true },
  decline: { from: ["waitlist"], to: "declined", takesPlace: false },
  suspend: { from: ["approved"], to: "suspended", takesPlace: false },
  restore: { from: ["suspended"], to: "approved", takesPlace: true },
  reopen: { from: ["declined"], to: "waitlist", takesPlace: false },
};

export function isDecision(value: unknown): value is Decision {
  return typeof value === "string" && Object.hasOwn(DECISIONS, value);
}

export function isFull(used: number, max: number): boolean {
  return used >= max;
}

// "12 of 25 places used"
export function placesLine(used: number, max: number): string {
  return `${used} of ${max} ${max === 1 ? "place" : "places"} used`;
}
