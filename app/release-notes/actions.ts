"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { messageOf } from "@/lib/errors";
import { isAdmin } from "@/lib/server/admin";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { MissingSchema } from "@/lib/server/data/usage";
import { closeWelcomeCard, markWhatsNewSeen } from "@/lib/server/whats-new";

// The dialogs' and the page's writes. Server actions are reachable by POST from anywhere, so each re-checks the
// session and acts only on that account. Before the migration they do nothing, quietly: nothing was shown.
// Each returns the error to show, or null.
async function run(what: string, act: (owner: NonNullable<Awaited<ReturnType<typeof currentOwner>>>, admin: boolean) => Promise<void>): Promise<string | null> {
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  try {
    await act(owner, await isAdmin());
  } catch (err) {
    if (!(err instanceof MissingSchema)) {
      console.error(`${what} failed:`, messageOf(err));
      return "Couldn't save that. Try again in a moment.";
    }
  }
  updateTag(OWNER_DATA_TAG);
  return null;
}

export async function closeWelcome(): Promise<string | null> {
  return run("Closing the welcome tour", (owner, admin) => closeWelcomeCard(owner, admin, Date.now()));
}

// `upTo`: the newest entry the release dialog showed (checked on the server); none when the page opens.
export async function markSeen(upTo?: string): Promise<string | null> {
  return run("Marking release notes seen", (owner, admin) => markWhatsNewSeen(owner, admin, upTo));
}
