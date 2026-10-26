"use server";

import { revalidatePath, updateTag } from "next/cache";
import { parseBudget, parseEntry } from "@/lib/costs";
import { DEMO } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import { adminOwner } from "@/lib/server/admin";
import { COSTS_TAG } from "@/lib/server/costs";
import { addCostEntry, clearCostSetting, deleteCostEntry, saveCostSetting, updateCostEntry, type WriteResult } from "@/lib/server/data/costs";

// Server actions are reachable by POST from anywhere, so each checks again, uncached, that the request is
// the admin's, then checks what was bound in and what was typed. For useActionState: the message to show,
// or null when saved. Only rows the owner adds are typed in; every built-in service is read automatically.

const REFUSED = "Not allowed.";
const MISSING = "Apply the costs migration first.";
const FAILED = "Couldn't save that. Try again in a moment.";

const field = (form: FormData | undefined, name: string) => {
  const v = form?.get(name);
  return typeof v === "string" ? v : undefined;
};

// "new" or an added row's id.
type Target = { kind: "new" } | { kind: "entry"; id: number };

function parseTarget(target: unknown): Target | null {
  if (target === "new") return { kind: "new" };
  if (typeof target === "string" && /^[1-9]\d{0,15}$/.test(target)) {
    const id = Number(target);
    if (Number.isSafeInteger(id)) return { kind: "entry", id };
  }
  return null;
}

function done(result: WriteResult): string | null {
  if (result === "missing") return MISSING;
  if (result === "gone") return "That row is gone. Reload to see it.";
  updateTag(COSTS_TAG);
  revalidatePath("/admin/costs");
  return null;
}

// Amounts are in dollars: the form has no currency, and anything else posted is refused.
export async function saveEntry(target: string, _previous: string | null, form?: FormData): Promise<string | null> {
  if (!(await adminOwner())) return REFUSED;
  const to = parseTarget(target);
  if (!to) return REFUSED;
  const parsed = parseEntry({
    name: field(form, "name"),
    amount: field(form, "amount"),
    currency: field(form, "currency"),
    period: field(form, "period"),
    renewsOn: field(form, "renewsOn"),
    link: field(form, "link"),
  });
  if (!parsed.ok) return parsed.message;
  if (DEMO) return "Demo mode: nothing changes.";
  const at = new Date().toISOString();
  try {
    if (to.kind === "new") return done(await addCostEntry(parsed.value, at));
    return done(await updateCostEntry(to.id, parsed.value, at));
  } catch (err) {
    console.error("Saving a cost failed:", messageOf(err));
    return FAILED;
  }
}

export async function removeEntry(target: string, _previous: string | null, _form?: FormData): Promise<string | null> {
  if (!(await adminOwner())) return REFUSED;
  const to = parseTarget(target);
  if (to?.kind !== "entry") return REFUSED;
  if (DEMO) return "Demo mode: nothing changes.";
  try {
    return done(await deleteCostEntry(to.id));
  } catch (err) {
    console.error("Removing a cost failed:", messageOf(err));
    return FAILED;
  }
}

// The Google Maps budget, in USD. Empty clears it.
export async function saveBudget(_previous: string | null, form?: FormData): Promise<string | null> {
  if (!(await adminOwner())) return REFUSED;
  const parsed = parseBudget(field(form, "googleBudget"));
  if (!parsed.ok) return parsed.message;
  if (DEMO) return "Demo mode: nothing changes.";
  try {
    if (parsed.value === null) return done(await clearCostSetting("google_budget_usd"));
    return done(await saveCostSetting("google_budget_usd", { usd: parsed.value }, new Date().toISOString()));
  } catch (err) {
    console.error("Saving the budget failed:", messageOf(err));
    return FAILED;
  }
}
