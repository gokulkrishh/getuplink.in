import "server-only";
import { type Decision, DECISIONS, isFull } from "@/lib/admin";
import { DEMO } from "@/lib/demo";
import { maxUsers } from "./env";
import type { Owner } from "./data/owner";
import { accountCars, type AccountCar, type AccountRow, APPROVED, approvedCount, DECLINED, moveAccount, SUSPENDED, waitlistAccounts, WAITLIST } from "./data/system";

// /admin/waitlist: who asked to join and what was decided. A request still waiting shows as its number and
// times only: Uplink keeps nothing else about it (no name, no email, no Tesla tokens). Once an account has a
// car, it shows the invite's label or the car's name, and the end of its VIN (accountCars).
export type Account = { id: number; askedAt: string; decidedAt: string; name: string | null; vinSuffix: string | null };

export type WaitlistPage = {
  simulated: boolean;
  pending: Account[]; // oldest first
  approved: Account[]; // most recently decided first, here and below
  suspended: Account[];
  declined: Account[];
  // Whole counts: the decided lists above are only the latest DECIDED_SHOWN.
  counts: { pending: number; approved: number; suspended: number; declined: number };
  used: number; // approved accounts, admins included
  max: number;
};

// The page's private cache entry, dropped by every decision.
export const WAITLIST_TAG = "admin-waitlist";

// The decided lists stay short: the latest few of each.
export const DECIDED_SHOWN = 10;

const DAY = 86_400_000;

function demoPage(now: number): WaitlistPage {
  const at = (days: number) => new Date(now - days * DAY).toISOString();
  const row = (id: number, asked: number, decided = asked, name: string | null = null, vinSuffix: string | null = null): Account => ({
    id,
    askedAt: at(asked),
    decidedAt: at(decided),
    name,
    vinSuffix,
  });
  return {
    simulated: true,
    pending: [row(14, 6), row(15, 3), row(17, 0.2)],
    approved: [row(12, 20, 18, "Arun's Model Y", "A48210"), row(9, 30, 29, "Model 3", "C11957")],
    suspended: [row(11, 25, 4, "Neighbour", "B70033")],
    declined: [row(13, 19, 17)],
    counts: { pending: 3, approved: 11, suspended: 1, declined: 1 },
    used: 12,
    max: maxUsers(),
  };
}

const toAccount = (r: AccountRow, car?: AccountCar): Account => ({
  id: r.id,
  askedAt: r.created_at,
  decidedAt: r.updated_at,
  name: car?.name ?? null,
  vinSuffix: car?.vinSuffix ?? null,
});
const latestFirst = (a: Account, b: Account) => b.decidedAt.localeCompare(a.decidedAt);

export async function loadWaitlist(now: number): Promise<WaitlistPage> {
  if (DEMO) return demoPage(now);
  const [rows, used] = await Promise.all([waitlistAccounts(), approvedCount()]);
  const cars = await accountCars(rows.filter((r) => r.status !== WAITLIST).map((r) => r.id));
  const inStatus = (status: string) => rows.filter((r) => r.status === status).map((r) => toAccount(r, cars.get(r.id)));
  const decided = (status: string) => inStatus(status).sort(latestFirst).slice(0, DECIDED_SHOWN);
  return {
    simulated: false,
    pending: inStatus(WAITLIST),
    approved: decided(APPROVED),
    suspended: decided(SUSPENDED),
    declined: decided(DECLINED),
    counts: {
      pending: inStatus(WAITLIST).length,
      approved: inStatus(APPROVED).length, // others' accounts: the admins' aren't listed
      suspended: inStatus(SUSPENDED).length,
      declined: inStatus(DECLINED).length,
    },
    used,
    max: maxUsers(),
  };
}

// "done", or why not: "full" (no place left for approve or restore), "gone" (not in a state this decision
// applies to: decided meanwhile, an admin's own row or an unknown id).
export type DecideResult = "done" | "full" | "gone";

// The caller has checked `admin` is the admin for this very request (adminOwner). The cap is a count then a
// conditional update: with one admin deciding by hand, two approvals racing for the last place isn't a case
// worth a lock.
export async function decide(admin: Owner, id: number, decision: Decision): Promise<DecideResult> {
  if (id === admin.userId) return "gone";
  const rule = DECISIONS[decision];
  if (rule.takesPlace && isFull(await approvedCount(), maxUsers())) return "full";
  return (await moveAccount(id, rule.from, rule.to)) ? "done" : "gone";
}
