"use server";

import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { type Decision, isDecision } from "@/lib/admin";
import { DEMO } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import { parseLabel, parseVinSuffix } from "@/lib/invites";
import { requestHost } from "@/lib/session";
import { adminOwner } from "@/lib/server/admin";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { InvitesUnavailable } from "@/lib/server/data/system";
import { maxUsers } from "@/lib/server/env";
import { createInvite, inviteForRenewal, inviteTokenAgain, inviteUrl, revokeInvite } from "@/lib/server/invites";
import { decide, WAITLIST_TAG } from "@/lib/server/waitlist";

const REFUSED = "Not allowed.";

// One action for every decision, the decision and the account bound in by the button. Server actions are
// reachable by POST from anywhere, so this checks again, uncached, that the request comes from the admin:
// a current Tesla session whose user has the admin role. Then it checks what was bound in.
// For useActionState: returns the message to show, or null when done.
export async function decideAccount(decision: Decision, id: number, _previous: string | null, _form?: FormData): Promise<string | null> {
  const admin = await adminOwner();
  if (!admin) return REFUSED;
  if (!isDecision(decision) || !Number.isSafeInteger(id) || id <= 0) return REFUSED;
  if (DEMO) return "Demo mode: nothing changes.";
  try {
    const result = await decide(admin, id, decision);
    if (result === "full") return `All ${maxUsers()} places are used.`;
    if (result === "gone") return "Already decided. Reload to see it.";
  } catch (err) {
    console.error("Waitlist decision failed:", messageOf(err));
    return "Couldn't save that. Try again in a moment.";
  }
  updateTag(WAITLIST_TAG);
  updateTag(OWNER_DATA_TAG); // /admin's owner count
  revalidatePath("/admin/waitlist");
  return null;
}

// ---- Invite links. Each action checks the admin again, as above. A token is never logged. ----

// What an invite action hands back: the link to copy or share, or why there's none.
export type LinkResult = { url: string; message?: undefined } | { url?: undefined; message: string } | null;

const UNAVAILABLE = "Invites aren't set up yet. Apply the invites migration.";

// The origin the admin is on (app.getuplink.in, or the local or demo host), for the link.
async function origin(): Promise<string> {
  const h = await headers();
  const host = requestHost(h) ?? "app.getuplink.in";
  const proto = h.get("x-forwarded-proto") ?? (host.split(":")[0].endsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function inviteFailed(err: unknown): LinkResult {
  if (err instanceof InvitesUnavailable) return { message: UNAVAILABLE };
  console.error("Invite action failed:", messageOf(err));
  return { message: "Couldn't save that. Try again in a moment." };
}

function invitesChanged() {
  updateTag(WAITLIST_TAG);
  revalidatePath("/admin/waitlist");
}

// "Create invite link": the friend's last 6 VIN characters (required) and an optional label.
export async function createInviteLink(_previous: LinkResult, form: FormData): Promise<LinkResult> {
  const admin = await adminOwner();
  if (!admin) return { message: REFUSED };
  const vinSuffix = parseVinSuffix(form.get("vin"));
  if (!vinSuffix) return { message: "Enter the last 6 characters of the car's VIN." };
  try {
    const token = await createInvite(admin, vinSuffix, parseLabel(form.get("label")), Date.now());
    invitesChanged();
    return { url: inviteUrl(await origin(), token) };
  } catch (err) {
    return inviteFailed(err);
  }
}

// Copy on an unused invite: the same link again.
export async function copyInviteLink(id: number, _previous: LinkResult, _form?: FormData): Promise<LinkResult> {
  if (!(await adminOwner())) return { message: REFUSED };
  if (!Number.isSafeInteger(id) || id <= 0) return { message: REFUSED };
  try {
    const token = await inviteTokenAgain(id, Date.now());
    return token ? { url: inviteUrl(await origin(), token) } : { message: "This link is used or expired. Reload to see it." };
  } catch (err) {
    return inviteFailed(err);
  }
}

// New link on an expired or revoked invite: a fresh one for the same car and label.
export async function renewInviteLink(id: number, _previous: LinkResult, _form?: FormData): Promise<LinkResult> {
  const admin = await adminOwner();
  if (!admin) return { message: REFUSED };
  if (!Number.isSafeInteger(id) || id <= 0) return { message: REFUSED };
  try {
    const old = DEMO ? { vinSuffix: "B70033", label: null } : await inviteForRenewal(id);
    if (!old) return { message: "This invite was used. Reload to see it." };
    const token = await createInvite(admin, old.vinSuffix, old.label, Date.now());
    invitesChanged();
    return { url: inviteUrl(await origin(), token) };
  } catch (err) {
    return inviteFailed(err);
  }
}

// Revoke an unused invite. For DecisionButton: the message to show, or null when done.
export async function revokeInviteLink(id: number, _previous: string | null, _form?: FormData): Promise<string | null> {
  if (!(await adminOwner())) return REFUSED;
  if (!Number.isSafeInteger(id) || id <= 0) return REFUSED;
  if (DEMO) return "Demo mode: nothing changes.";
  try {
    if (!(await revokeInvite(id, Date.now()))) return "Already used or revoked. Reload to see it.";
  } catch (err) {
    return inviteFailed(err)?.message ?? null;
  }
  invitesChanged();
  return null;
}
