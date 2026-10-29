import "server-only";
import { z } from "zod";
import { BOTHER, type Bother, isProblem, MESSAGE_MAX, TOPICS, type Topic } from "@/lib/feedback";
import { type Owner, ownerDb } from "@/lib/server/data/owner";
import { type FeedbackRow, type FeedbackStatus, feedbackCounts, feedbackPage, newFeedbackCount, setFeedbackStatus } from "@/lib/server/data/system";

export const FEEDBACK_TAG = "admin-feedback";
// Enough for an owner with a lot to say; a stuck form or a script can't fill the table.
const PER_DAY = 20;

// What the form sends: the owner's answers and where they were. Everything past the message is read from
// the browser, never typed. A problem needs how much it bothers; anything else has none.
export const feedbackInput = z
  .object({
    topic: z.enum(TOPICS.map((t) => t.value) as [Topic, ...Topic[]]),
    bother: z.enum(BOTHER.map((b) => b.value) as [Bother, ...Bother[]]).nullable(),
    message: z.string().trim().min(1).max(MESSAGE_MAX),
    pagePath: z.string().min(1).max(300).startsWith("/"),
    pageTitle: z.string().max(200).optional(),
    viewport: z.string().regex(/^\d{2,5}x\d{2,5}$/).optional(),
    userAgent: z.string().max(400).optional(),
    theme: z.enum(["light", "dark"]).optional(),
  })
  .refine((f) => (isProblem(f.topic) ? f.bother !== null : f.bother === null));
export type FeedbackInput = z.infer<typeof feedbackInput>;

export type SaveResult = { ok: true } | { ok: false; error: string };

// One owner's feedback, with where they were and the build they saw.
export async function saveFeedback(owner: Owner, input: FeedbackInput, now: number): Promise<SaveResult> {
  const scope = ownerDb(owner).from("feedback");
  const since = new Date(now - 86_400_000).toISOString();
  const { count, error: countError } = await scope.select("id", { count: "exact", head: true }).gte("created_at", since);
  if (countError) {
    console.warn("Counting feedback failed:", countError.code);
    return { ok: false, error: "Uplink couldn't send this. Try again in a moment." };
  }
  if ((count ?? 0) >= PER_DAY) return { ok: false, error: "That's a lot of feedback for one day. Send more tomorrow." };
  const { error } = await scope.insert({
    bother: input.bother,
    topic: input.topic,
    message: input.message,
    page_path: input.pagePath,
    page_title: input.pageTitle || null,
    viewport: input.viewport ?? null,
    user_agent: input.userAgent || null,
    theme: input.theme ?? null,
    app_version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  });
  if (error) {
    console.warn("Saving feedback failed:", error.code);
    return { ok: false, error: "Uplink couldn't send this. Try again in a moment." };
  }
  return { ok: true };
}

export const PAGE_SIZE = 20;

export type FeedbackView = {
  rows: FeedbackRow[];
  total: number;
  page: number;
  pages: number;
  counts: { new: number; week: number; lot: number; broken: number };
  available: boolean;
};

// One page of every owner's feedback for Admin, with the tiles' counts. Empty before the migration.
export async function loadFeedback(page: number, now: number): Promise<FeedbackView> {
  const empty: FeedbackView = { rows: [], total: 0, page: 1, pages: 1, counts: { new: 0, week: 0, lot: 0, broken: 0 }, available: false };
  try {
    const since = new Date(now - 7 * 86_400_000).toISOString();
    const [{ rows, total }, counts] = await Promise.all([feedbackPage((page - 1) * PAGE_SIZE, PAGE_SIZE), feedbackCounts(since)]);
    return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), counts, available: true };
  } catch (err) {
    if (!/feedback/.test(String(err))) console.warn("Feedback unavailable:", (err as Error).message);
    return empty;
  }
}

// Unread messages, for the tab's dot: 0 when the table or column isn't there yet.
export async function unreadFeedback(): Promise<number> {
  try {
    return await newFeedbackCount();
  } catch {
    return 0;
  }
}

export const STATUSES: FeedbackStatus[] = ["new", "read", "done"];
export const markFeedbackRow = setFeedbackStatus;
