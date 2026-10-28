// Invite links, without the database: what an invite names (the last 6 characters of a friend's VIN), how
// long it lasts and what the admin's list says about it. Server side: lib/server/invites.ts.

// A link works for one sign-in, within a day of being made.
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export const VIN_SUFFIX_LENGTH = 6;
const VIN_SUFFIX = /^[A-Z0-9]{6}$/;

// The admin types the last 6 characters of the friend's VIN. Spaces are dropped and case is ignored;
// anything else that isn't 6 letters or digits is refused (null).
export function parseVinSuffix(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const suffix = value.replace(/\s+/g, "").toUpperCase();
  return VIN_SUFFIX.test(suffix) ? suffix : null;
}

// Whether a car on the signed-in Tesla account is the one the invite names.
export function vinMatches(vin: unknown, suffix: string): boolean {
  return typeof vin === "string" && vin.length >= VIN_SUFFIX_LENGTH && vin.toUpperCase().endsWith(suffix.toUpperCase());
}

export const LABEL_MAX = 60;

// The admin's optional note ("Arun's Model Y"). Blank is none; longer than LABEL_MAX is cut.
export function parseLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.replace(/\s+/g, " ").trim().slice(0, LABEL_MAX);
  return label || null;
}

// VIN position 4 names the model, for a car whose vehicle list entry doesn't.
const VIN_MODELS: Record<string, string> = { S: "Model S", "3": "Model 3", X: "Model X", Y: "Model Y", C: "Cybertruck" };

// Who joined, as the invites list shows it: the car's model and the last 4 of its VIN, nothing else.
// "Model Y · 4821", or "Tesla · 4821" when the model isn't known.
export function joinedLabel(vin: string): string {
  const model = VIN_MODELS[vin.charAt(3).toUpperCase()] ?? "Tesla";
  return `${model} · ${vin.slice(-4).toUpperCase()}`;
}

export type InviteState = "unused" | "used" | "expired" | "revoked";

export function inviteState(invite: { used_at: string | null; revoked_at: string | null; expires_at: string }, now: number): InviteState {
  if (invite.used_at) return "used";
  if (invite.revoked_at) return "revoked";
  return Date.parse(invite.expires_at) > now ? "unused" : "expired";
}

// The invites still waiting for a friend, as the admin's Waiting list shows them: links not used yet, the
// latest one per car. A used link drops out (who joined shows under Approved), a revoked one too, and an
// expired one once New link has made a newer one for the same car.
export function shownInvites<T extends { vinSuffix: string; createdAt: string; state: InviteState }>(items: T[]): T[] {
  const newest = new Map<string, string>();
  for (const i of items) if ((newest.get(i.vinSuffix) ?? "") < i.createdAt) newest.set(i.vinSuffix, i.createdAt);
  return items.filter((i) => i.state === "unused" || (i.state === "expired" && newest.get(i.vinSuffix) === i.createdAt));
}

// The token in /invite/<token>: 32 random-looking bytes, base64url. Checked before any lookup.
export const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && INVITE_TOKEN.test(value);
}
