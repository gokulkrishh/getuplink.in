"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { resetSandboxStore } from "@/lib/sandbox/db";
import { sandboxOn } from "@/lib/sandbox/flag";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { WAITLIST_TAG } from "@/lib/server/waitlist";

// Reset in the sandbox banner: the throwaway database back to its seed (the owner and their car), and every
// page's cached copy dropped. Refused outside the sandbox, where it changes nothing.
export async function resetSandbox(): Promise<void> {
  if (!sandboxOn()) throw new Error("Not in the sandbox");
  resetSandboxStore();
  updateTag(OWNER_DATA_TAG);
  updateTag(WAITLIST_TAG);
  redirect("/home");
}
