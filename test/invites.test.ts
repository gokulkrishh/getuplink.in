import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "./fake-db";

// Invite links end to end against a fake database and a fake Tesla: the admin makes a link for a friend's
// car (last 6 VIN characters), and a sign-in through it joins only with that car on the account.
// Made-up accounts and VINs only: user 1 is the admin, 2 is approved, 3 is on the waitlist.

let fake: FakeDb;
let cookie: string | undefined;

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));
mock.module("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "tiu_session" && cookie ? { value: cookie } : undefined) }),
  headers: async () => new Headers({ host: "app.example.test", "x-forwarded-proto": "https" }),
}));
mock.module("next/cache", () => ({ updateTag: () => {}, revalidatePath: () => {}, cacheLife: () => {}, cacheTag: () => {} }));

process.env.TESLA_CLIENT_ID = "client";
process.env.TESLA_CLIENT_SECRET = "secret";
process.env.TESLA_REDIRECT_URI = "https://app.example.test/api/auth/callback";
for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]) process.env[name] ??= "test";
process.env.TOKEN_ENCRYPTION_KEY ??= "test-key-not-a-secret";

// Each Tesla account's cars, by the sub the sign-in code names. The fake signs in whoever the code says.
const garages: Record<string, string[]> = {};
const accessSub = new Map<string, string>();
let issued = 0;
let vehicleCalls = 0;
const idToken = (sub: string) => `x.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.y`;

const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("/oauth2/v3/token")) {
    const sub = new URLSearchParams(String(init?.body)).get("code")!;
    const access = `a${++issued}`;
    accessSub.set(access, sub);
    return Response.json({ access_token: access, refresh_token: `r${issued}`, expires_in: 28_800, id_token: idToken(sub) });
  }
  const bearer = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? "";
  const sub = accessSub.get(bearer);
  if (!sub) return new Response("unauthorized", { status: 401 });
  if (url.endsWith("/api/1/users/region")) return Response.json({ response: { region: "na", fleet_api_base_url: "https://fleet-api.prd.na.vn.cloud.tesla.com" } });
  if (url.endsWith("/api/1/vehicles")) {
    vehicleCalls++;
    return Response.json({ response: (garages[sub] ?? []).map((vin, i) => ({ id_s: String(i + 1), vin })), count: garages[sub]?.length ?? 0 });
  }
  return Response.json({ response: "ok" });
}) as typeof fetch;

const { signIn } = await import("@/lib/server/tesla");
const { asOwner } = await import("@/lib/server/data/owner");
const { createInvite, inviteCookieHash, inviteCookieValue, inviteTokenAgain, lookupInvite, tokenHash } = await import("@/lib/server/invites");
const { INVITE_TTL_MS, joinedLabel, shownInvites, parseVinSuffix } = await import("@/lib/invites");
const { createSession } = await import("@/lib/session");
const { copyInviteLink, createInviteLink, revokeInviteLink } = await import("@/app/admin/waitlist/actions");

const ADMIN = asOwner(1, "made-up-admin");
const FRIEND_VIN = "XP7YGCEK0TB104821"; // made up; ends in 104821
const OTHER_VIN = "XP7YGCEK0TB999999";

const user = (id: number, sub: string, status: string, role = "user") => ({
  id,
  tesla_sub: sub,
  status,
  role,
  sessions_valid_after: "-infinity",
  created_at: `2026-10-0${id}T00:00:00Z`,
  updated_at: `2026-10-0${id}T00:00:00Z`,
});

beforeEach(async () => {
  globalThis.fetch = fakeFetch;
  process.env.SIGNUP_MODE = "invite";
  delete process.env.MAX_USERS;
  vehicleCalls = 0;
  for (const key of Object.keys(garages)) delete garages[key];
  fake = new FakeDb({
    users: [user(1, "made-up-admin", "approved", "admin"), user(2, "made-up-approved", "approved"), user(3, "made-up-waiting", "waitlist")],
  });
  fake.autoIds.add("users");
  fake.autoIds.add("invites");
  cookie = await createSession(1);
});

afterEach(() => {
  delete process.env.SIGNUP_MODE;
});

// A link made by the admin now (or `at`), for a car ending in these characters; its hash rides the cookie.
async function invite(suffix = "104821", at = Date.now(), label: string | null = null) {
  const token = await createInvite(ADMIN, suffix, label, at);
  return { token, hash: tokenHash(token), row: () => fake.rows("invites").find((r) => r.token_hash === tokenHash(token))! };
}

const userBySub = (sub: string) => fake.rows("users").find((r) => r.tesla_sub === sub);
const tokensOf = (sub: string) => fake.rows("user_tokens").filter((r) => r.user_id === userBySub(sub)?.id);

describe("an invite names a car", () => {
  test("a Tesla account with that car joins as approved, and the invite is used", async () => {
    garages.friend = [OTHER_VIN, FRIEND_VIN.toLowerCase()];
    const { hash, row } = await invite();
    const result = await signIn("friend", { inviteHash: hash });
    expect(typeof result).toBe("object");
    expect(userBySub("friend")?.status).toBe("approved");
    expect(tokensOf("friend")).toHaveLength(1);
    expect(row().used_at).toBeString();
    expect(row().used_by).toBe(userBySub("friend")!.id);
    expect(row().joined_label).toBe("Model Y · 4821");
    expect(vehicleCalls).toBe(1);
  });

  test("an account without that car is refused, and nothing is stored or used", async () => {
    garages.stranger = [OTHER_VIN];
    const { hash, row } = await invite();
    expect(await signIn("stranger", { inviteHash: hash })).toBe("invite-car");
    expect(userBySub("stranger")).toBeUndefined();
    expect(fake.rows("user_tokens")).toHaveLength(0);
    expect(row().used_at ?? null).toBeNull();
    expect(row().used_by ?? null).toBeNull();
  });

  test("a waitlisted account with that car is approved on its own row", async () => {
    garages["made-up-waiting"] = [FRIEND_VIN];
    const { hash } = await invite();
    const result = await signIn("made-up-waiting", { inviteHash: hash });
    expect(result).toMatchObject({ userId: 3 });
    expect(fake.rows("users").filter((r) => r.tesla_sub === "made-up-waiting")).toHaveLength(1);
    expect(userBySub("made-up-waiting")?.status).toBe("approved");
  });

  test("the store keeps only the hash and the 6 characters, and Copy rebuilds the same link", async () => {
    const { token, row } = await invite();
    expect(Object.values(row())).not.toContain(token);
    expect(row().vin_suffix).toBe("104821");
    expect(await inviteTokenAgain(row().id as number, Date.now())).toBe(token);
    expect(await lookupInvite(token, Date.now())).toBe("unused");
  });
});

describe("single use, one day", () => {
  test("a link works once", async () => {
    garages.friend = [FRIEND_VIN];
    garages.second = [FRIEND_VIN]; // a second account with the same car (a shared car)
    const { hash } = await invite();
    expect(typeof (await signIn("friend", { inviteHash: hash }))).toBe("object");
    expect(await signIn("second", { inviteHash: hash })).toBe("invite-invalid");
    expect(userBySub("second")).toBeUndefined();
  });

  test("two sign-ins racing through one link: only one joins", async () => {
    garages.one = [FRIEND_VIN];
    garages.two = [FRIEND_VIN];
    const { hash } = await invite();
    const results = await Promise.all([signIn("one", { inviteHash: hash }), signIn("two", { inviteHash: hash })]);
    expect(results.filter((r) => typeof r === "object")).toHaveLength(1);
    expect(results.filter((r) => r === "invite-invalid")).toHaveLength(1);
    expect(fake.rows("users").filter((r) => r.status === "approved")).toHaveLength(3);
  });

  test("a link lasts one day", async () => {
    const at = Date.now();
    const { token, row } = await invite("104821", at);
    expect(Date.parse(row().expires_at as string) - Date.parse(row().created_at as string)).toBe(INVITE_TTL_MS);
    expect(INVITE_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(await lookupInvite(token, at + INVITE_TTL_MS - 1000)).toBe("unused");
    expect(await lookupInvite(token, at + INVITE_TTL_MS + 1000)).toBe("expired");
  });

  test("an expired link is refused", async () => {
    garages.friend = [FRIEND_VIN];
    const { hash } = await invite("104821", Date.now() - INVITE_TTL_MS - 60_000);
    expect(await signIn("friend", { inviteHash: hash })).toBe("invite-invalid");
    expect(userBySub("friend")).toBeUndefined();
  });

  test("a revoked link is refused", async () => {
    garages.friend = [FRIEND_VIN];
    const { hash, row } = await invite();
    expect(await revokeInviteLink(row().id as number, null)).toBeNull();
    expect(await signIn("friend", { inviteHash: hash })).toBe("invite-invalid");
    expect(userBySub("friend")).toBeUndefined();
  });
});

describe("places and modes", () => {
  test("the cap is respected: a full Uplink refuses, and the invite stays unused", async () => {
    process.env.MAX_USERS = "2"; // the admin and user 2 hold both places
    garages.friend = [FRIEND_VIN];
    const { hash, row } = await invite();
    expect(await signIn("friend", { inviteHash: hash })).toBe("full");
    expect(userBySub("friend")).toBeUndefined();
    expect(row().used_at ?? null).toBeNull();
  });

  test("two invites redeemed at once for the last place: one joins, the other is told it's full and its invite stays unused", async () => {
    process.env.MAX_USERS = "3"; // the admin and user 2 hold two places
    garages.friend = [FRIEND_VIN];
    garages.neighbour = [OTHER_VIN];
    const [first, second] = [await invite(), await invite("999999")];
    const results = await Promise.all([signIn("friend", { inviteHash: first.hash }), signIn("neighbour", { inviteHash: second.hash })]);
    expect(results.filter((r) => typeof r === "object")).toHaveLength(1);
    expect(results).toContain("full");
    expect(fake.rows("users").filter((u) => u.status === "approved")).toHaveLength(3);
    expect([first.row().used_at ?? null, second.row().used_at ?? null].filter((at) => at === null)).toHaveLength(1);
  });

  test("before the approve_within_cap migration, an invite still joins, and a full Uplink still refuses", async () => {
    fake.missingRpcs.add("approve_within_cap");
    garages.friend = [FRIEND_VIN];
    const { hash, row } = await invite();
    expect(typeof (await signIn("friend", { inviteHash: hash }))).toBe("object");
    expect(userBySub("friend")?.status).toBe("approved");
    expect(row().used_by).toBe(userBySub("friend")!.id);
    process.env.MAX_USERS = "3";
    garages.neighbour = [OTHER_VIN];
    expect(await signIn("neighbour", { inviteHash: (await invite("999999")).hash })).toBe("full");
  });

  test("an unknown login without an invite is refused in invite mode", async () => {
    garages.stranger = [FRIEND_VIN];
    expect(await signIn("stranger")).toBe("invite-only");
    expect(userBySub("stranger")).toBeUndefined();
    expect(fake.rows("user_tokens")).toHaveLength(0);
  });

  test("closed mode ignores invites", async () => {
    process.env.SIGNUP_MODE = "closed";
    garages.friend = [FRIEND_VIN];
    const { hash, row } = await invite();
    expect(await signIn("friend", { inviteHash: hash })).toBe("not-owner");
    expect(row().used_at ?? null).toBeNull();
  });

  test("waitlist mode still takes requests without an invite", async () => {
    process.env.SIGNUP_MODE = "waitlist";
    expect(await signIn("asker")).toBe("waitlist");
    expect(userBySub("asker")?.status).toBe("waitlist");
  });

  test("the approved owner signs in as always, in invite mode and with an invite in hand", async () => {
    garages["made-up-admin"] = [FRIEND_VIN];
    expect(await signIn("made-up-admin")).toMatchObject({ userId: 1 });
    const { hash, row } = await invite();
    expect(await signIn("made-up-admin", { inviteHash: hash })).toMatchObject({ userId: 1 });
    expect(row().used_at ?? null).toBeNull();
    expect(vehicleCalls).toBe(0);
  });

  test("a suspended account isn't let back in by an invite", async () => {
    fake.rows("users").push(user(4, "made-up-suspended", "suspended"));
    garages["made-up-suspended"] = [FRIEND_VIN];
    const { hash, row } = await invite();
    expect(await signIn("made-up-suspended", { inviteHash: hash })).toBe("not-approved");
    expect(row().used_at ?? null).toBeNull();
  });

  test("before the migration: invites are unavailable and sign-in is unchanged", async () => {
    fake.missing.add("invites");
    garages.friend = [FRIEND_VIN];
    expect(await signIn("friend", { inviteHash: "0".repeat(64) })).toBe("invite-invalid");
    expect(userBySub("friend")).toBeUndefined();
    expect(await signIn("made-up-approved")).toMatchObject({ userId: 2 });
    expect(await lookupInvite("A".repeat(43), Date.now())).toBe("unavailable");
    expect(await createInviteLink(null, form({ vin: "104821" }))).toEqual({ message: "Invites aren't set up yet. Apply the invites migration." });
  });
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

describe("the admin's actions", () => {
  test("only the admin can create, copy or revoke, checked on every call", async () => {
    cookie = await createSession(2);
    expect(await createInviteLink(null, form({ vin: "104821" }))).toEqual({ message: "Not allowed." });
    cookie = undefined;
    expect(await createInviteLink(null, form({ vin: "104821" }))).toEqual({ message: "Not allowed." });
    expect(fake.rows("invites")).toHaveLength(0);
    cookie = await createSession(1);
    const made = await createInviteLink(null, form({ vin: " 1048 21 ", label: "  A friend's car " }));
    expect(made?.url).toMatch(/^https:\/\/app\.example\.test\/invite\/[A-Za-z0-9_-]{43}$/);
    const row = fake.rows("invites")[0];
    expect(row).toMatchObject({ vin_suffix: "104821", label: "A friend's car", created_by: 1 });
    fake.rows("users")[0].role = "user";
    expect(await copyInviteLink(row.id as number, null)).toEqual({ message: "Not allowed." });
    expect(await revokeInviteLink(row.id as number, null)).toBe("Not allowed.");
  });

  test("the VIN characters must be 6 letters or digits", async () => {
    for (const vin of ["", "12345", "1234567", "12-456", "ABCDÉ1"]) {
      expect(await createInviteLink(null, form({ vin }))).toEqual({ message: "Enter the last 6 characters of the car's VIN." });
    }
    expect(parseVinSuffix("ab12cd")).toBe("AB12CD");
    expect(fake.rows("invites")).toHaveLength(0);
  });

  test("Copy gives the same link while unused, and nothing once used", async () => {
    const made = await createInviteLink(null, form({ vin: "104821" }));
    const id = fake.rows("invites")[0].id as number;
    expect(await copyInviteLink(id, null)).toEqual({ url: made!.url! });
    garages.friend = [FRIEND_VIN];
    await signIn("friend", { inviteHash: fake.rows("invites")[0].token_hash as string });
    expect((await copyInviteLink(id, null))?.url).toBeUndefined();
  });
});

describe("the invite cookie", () => {
  test("carries the hash, and refuses a forged or stale one", () => {
    const hash = "a".repeat(64);
    const now = Date.now();
    const value = inviteCookieValue(hash, now);
    expect(inviteCookieHash(value, now)).toBe(hash);
    expect(inviteCookieHash(value, now + 11 * 60 * 1000)).toBeNull();
    expect(inviteCookieHash(value.replace(hash, "b".repeat(64)), now)).toBeNull();
    // A changed last character: "0" unless it already is one (1 time in 16), which would change nothing.
    expect(inviteCookieHash(`${value.slice(0, -1)}${value.endsWith("0") ? "1" : "0"}`, now)).toBeNull();
    expect(inviteCookieHash(undefined, now)).toBeNull();
  });
});

test("Delete account takes the car and the admin's note off the invite it joined through", async () => {
  garages.friend = [FRIEND_VIN];
  const { hash, row } = await invite("104821", Date.now(), "A friend's Model Y");
  await signIn("friend", { inviteHash: hash });
  expect(row().label).toBe("A friend's Model Y");
  const { deleteUser } = await import("@/lib/server/data/system");
  await deleteUser(asOwner(userBySub("friend")!.id as number, "friend"));
  expect(row().joined_label).toBeNull();
  expect(row().label).toBeNull();
  expect(row().used_at).toBeString(); // still used: the link can't come back
});

test("who joined shows as the model and the last 4 of the VIN only", () => {
  expect(joinedLabel(FRIEND_VIN)).toBe("Model Y · 4821");
  expect(joinedLabel("XP73XXXXXXXX00042")).toBe("Model 3 · 0042");
  expect(joinedLabel("XXXQXXXXXXXX00042")).toBe("Tesla · 0042");
});

describe("the admin's list", () => {
  const item = (id: number, vinSuffix: string, createdAt: string, state: "unused" | "used" | "expired" | "revoked") => ({ id, vinSuffix, createdAt, state });
  test("New link replaces an expired link for the same car", () => {
    const items = [
      item(3, "773485", "2026-10-28T16:41:00Z", "unused"),
      item(2, "844522", "2026-10-28T16:03:00Z", "used"),
      item(1, "773485", "2026-10-28T12:56:00Z", "expired"),
      item(0, "B70033", "2026-10-20T10:00:00Z", "expired"),
    ];
    expect(shownInvites(items).map((i) => i.id)).toEqual([3, 0]);
  });
  test("a revoked link drops out", () => {
    expect(shownInvites([item(1, "773485", "2026-10-28T12:56:00Z", "revoked")])).toEqual([]);
  });
  test("a used link drops out: who joined shows under Approved", () => {
    const items = [item(2, "773485", "2026-10-28T16:41:00Z", "used"), item(1, "773485", "2026-10-27T16:41:00Z", "revoked")];
    expect(shownInvites(items)).toEqual([]);
  });
});
