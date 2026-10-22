"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { MAX_RATE, parseRate } from "@/lib/charging-rates";
import { messageOf } from "@/lib/errors";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { saveChargingRates } from "@/lib/server/charging-rates";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";

// What was typed comes back, so the form keeps it when React resets the fields after the action.
export type RatesState = { error: string | null; saved: boolean; home: string; other: string } | null;

export async function saveRates(_: RatesState, form: FormData): Promise<RatesState> {
  // Reachable by POST from anywhere, so it re-checks the session.
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  const home = String(form.get("home") ?? "");
  const other = String(form.get("other") ?? "");
  const homeRate = parseRate(home);
  const otherRate = parseRate(other);
  if (!homeRate.ok || !otherRate.ok) {
    return { error: `Enter a rate above ₹0 and up to ₹${MAX_RATE}, with at most 2 decimals.`, saved: false, home, other };
  }
  try {
    await saveChargingRates({ home: homeRate.value, other: otherRate.value });
  } catch (err) {
    console.error("Saving charging rates failed:", messageOf(err));
    return { error: "Couldn't save your rates. Try again in a moment.", saved: false, home, other };
  }
  // Settings and Stats read the rates through the owner data cache.
  updateTag(OWNER_DATA_TAG);
  return { error: null, saved: true, home, other };
}
