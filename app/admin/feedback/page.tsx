import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { Figures } from "@/components/stats/figures";
import { botherLabel, deviceName, topicLabel } from "@/lib/feedback";
import { formatDateTime } from "@/lib/format";
import { isAdmin } from "@/lib/server/admin";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { FEEDBACK_TAG, type FeedbackView, loadFeedback, PAGE_SIZE } from "@/lib/server/feedback";
import { cn } from "@/lib/utils";
import type { TipScope } from "@/lib/ai-tips";
import { loadVoteSummary } from "@/lib/server/tip-votes";
import { type KindSummary, kindLabel, SCOPE_LABELS } from "@/lib/tip-votes";
import { MarkButtons } from "./mark-buttons";

export const metadata: Metadata = { title: "Feedback · Admin" };

// As /admin: the admin check runs before anything streams, so anyone else gets a real 404.
export const instant = false;

const number = new Intl.NumberFormat("en-IN");
const link = "underline decoration-border underline-offset-4 hover:decoration-foreground";

// One page of messages; the tiles count all of them without loading them.
async function loadPage(page: number): Promise<FeedbackView> {
  "use cache: private";
  cacheTag(FEEDBACK_TAG);
  // As the other admin tabs: long enough to come with a link's prefetch; a new message refreshes it at once.
  cacheLife({ stale: 300 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  if (!(await isAdmin())) notFound();
  return loadFeedback(page, Date.now());
}

// "?page=2"; anything else is the first page.
function pageOf(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

function Pager({ page, pages, total, shown }: { page: number; pages: number; total: number; shown: number }) {
  if (pages <= 1) return null;
  const first = (page - 1) * PAGE_SIZE + 1;
  return (
    <nav aria-label="Feedback pages" className="flex items-center justify-between gap-4 text-sm text-muted-foreground tabular-nums">
      <span>
        {number.format(first)} to {number.format(first + shown - 1)} of {number.format(total)}
      </span>
      <span className="flex gap-4">
        {page > 1 && (
          <Link href={page === 2 ? "/admin/feedback" : `/admin/feedback?page=${page - 1}`} className={link}>
            Newer
          </Link>
        )}
        {page < pages && (
          <Link href={`/admin/feedback?page=${page + 1}`} className={link}>
            Older
          </Link>
        )}
      </span>
    </nav>
  );
}

async function Feedback({ searchParams }: Pick<PageProps<"/admin/feedback">, "searchParams">) {
  const { rows, total, page, pages, counts, available } = await loadPage(pageOf((await searchParams).page));
  return (
    <>
      <Figures
        figures={[
          { label: "New", value: number.format(counts.new) },
          { label: "Last 7 days", value: number.format(counts.week) },
          { label: "Bothers a lot", value: number.format(counts.lot) },
          { label: "Something's wrong", value: number.format(counts.broken) },
        ]}
      />
      {!available ? (
        <p className="text-sm text-faint">Feedback isn&apos;t set up yet. Apply the feedback migrations.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-faint">No feedback yet.</p>
      ) : (
        <div className="space-y-4">
          {/* One entry per message, the owner's words first and every detail on a line under them, so
              nothing hides off the side of the screen. */}
          <ol className="divide-y border-y">
            {rows.map((r) => (
              <li key={r.id} className={cn("space-y-2 py-5", r.status === "done" && "opacity-50")}>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  {r.status === "new" && <span className="size-2 rounded-full bg-chart-accent" aria-label="New" />}
                  {r.status === "done" && <span className="text-muted-foreground">Done ·</span>}
                  <span className="font-medium">{topicLabel(r.topic)}</span>
                  {r.bother && (
                    <>
                      <span className="text-faint">·</span>
                      <span className={r.bother === "lot" ? "text-destructive" : "text-chart-worse"}>{botherLabel(r.bother)}</span>
                    </>
                  )}
                  <span className="ml-auto text-muted-foreground tabular-nums">{formatDateTime(r.created_at)}</span>
                </p>
                <p className="text-base break-words whitespace-pre-wrap">{r.message}</p>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    #{r.user_id}
                    {r.car && ` · ${r.car}`}
                  </span>
                  <Link href={r.page_path} title={r.page_title ?? undefined} className={cn("break-all text-foreground", link)}>
                    {r.page_path}
                  </Link>
                  <span>{[deviceName(r.user_agent), r.viewport, r.theme].filter(Boolean).join(" · ")}</span>
                  {r.app_version && <span className="font-mono">{r.app_version}</span>}
                </p>
                <MarkButtons id={r.id} status={r.status} />
              </li>
            ))}
          </ol>
          <Pager page={page} pages={pages} total={total} shown={rows.length} />
        </div>
      )}
    </>
  );
}

// Which kinds of AI tip work, from every owner's latest votes: one row per page and kind, the kinds that need
// work first (see summariseVotes).
async function loadVotes(): Promise<KindSummary[] | null> {
  "use cache: private";
  cacheTag(FEEDBACK_TAG);
  cacheLife({ stale: 300 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  if (!(await isAdmin())) notFound();
  return loadVoteSummary(VOTES_READ);
}

const VOTES_READ = 1000;
// A kind gets a verdict only from this many votes: one or two say little.
const MIN_VOTES = 5;
// Under this share useful a kind needs work; from WORKING it is working well.
const NEEDS_WORK = 0.5;
const WORKING = 0.75;

function verdict(k: KindSummary): { words: string; tone: string } {
  if (k.useful + k.notUseful < MIN_VOTES) return { words: "Too few votes", tone: "text-faint" };
  if (k.share < NEEDS_WORK) return { words: "Needs work", tone: "text-chart-worse" };
  return k.share >= WORKING ? { words: "Working well", tone: "text-chart-better" } : { words: "Mixed", tone: "text-muted-foreground" };
}

// The votes at a glance: totals, then one bar per kind of tip split into useful (green) and not useful (red),
// the most voted first, each bar as long as its votes against the busiest kind. The tips voted on sit under
// each kind behind a fold, for when a kind needs a closer look.
async function TipVotes() {
  const kinds = await loadVotes();
  const useful = (kinds ?? []).reduce((a, k) => a + k.useful, 0);
  const notUseful = (kinds ?? []).reduce((a, k) => a + k.notUseful, 0);
  const total = useful + notUseful;
  const sorted = [...(kinds ?? [])].sort((a, b) => b.useful + b.notUseful - (a.useful + a.notUseful));
  const most = Math.max(1, ...sorted.map((k) => k.useful + k.notUseful));
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-heading">Tip votes</h2>
        <p className="text-sm text-muted-foreground">How owners voted on each kind of AI tip.</p>
      </div>
      {kinds === null ? (
        <p className="text-sm text-faint">Tip votes aren&apos;t set up yet. Apply the tip votes migration.</p>
      ) : kinds.length === 0 ? (
        <p className="text-sm text-faint">No votes yet.</p>
      ) : (
        <>
          <Figures
            figures={[
              { label: "Votes", value: number.format(total) },
              { label: "Useful", value: `${Math.round((useful / total) * 100)}%`, note: `${number.format(useful)} of ${number.format(total)}` },
              { label: "Kinds voted on", value: number.format(kinds.length) },
            ]}
          />
          <div className="space-y-4">
            <p className="flex gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="size-2 bg-chart-better" aria-hidden="true" />Useful</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2 bg-chart-worse" aria-hidden="true" />Not useful</span>
            </p>
            <ol className="space-y-4">
              {sorted.map((k) => {
                const n = k.useful + k.notUseful;
                const v = verdict(k);
                return (
                  <li key={`${k.scope}:${k.kind}`} className="space-y-1.5">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium">{kindLabel(k.kind)}</span>
                      <span className="text-xs text-muted-foreground">{SCOPE_LABELS[k.scope as TipScope] ?? k.scope}</span>
                      <span className={cn("ml-auto text-xs", v.tone)}>{v.words}</span>
                    </p>
                    <div className="flex h-2 bg-muted" role="img" aria-label={`${k.useful} useful, ${k.notUseful} not useful`} style={{ width: `${(n / most) * 100}%` }}>
                      <span className="h-full bg-chart-better" style={{ width: `${(k.useful / n) * 100}%` }} />
                      <span className="h-full bg-chart-worse" style={{ width: `${(k.notUseful / n) * 100}%` }} />
                    </div>
                    <details className="group text-xs text-muted-foreground">
                      <summary className="cursor-pointer list-none tabular-nums hover:text-foreground [&::-webkit-details-marker]:hidden">
                        {number.format(k.useful)} useful · {number.format(k.notUseful)} not useful · <span className="underline decoration-dotted underline-offset-4">tips voted on</span>
                      </summary>
                      <ul className="mt-2 space-y-1 text-sm text-foreground">
                        {k.examples.map((e, m) => (
                          <li key={m} className="break-words">
                            <span className="text-xs text-muted-foreground">{e.vote === 1 ? "Useful" : "Not useful"}:</span> {e.tip}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}

// Messages from the feedback button, or (?view=tips) how owners voted on the AI tips. The votes are mostly for
// tuning the tips, so they sit behind their own switch rather than among the messages.
async function Views({ searchParams }: Pick<PageProps<"/admin/feedback">, "searchParams">) {
  const tips = (await searchParams).view === "tips";
  const tab = (on: boolean) => cn("px-3 py-1.5 text-sm transition-colors duration-150", on ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground");
  return (
    <>
      <nav aria-label="Show" className="inline-flex border">
        <Link href="/admin/feedback" aria-current={tips ? undefined : "page"} className={tab(!tips)}>
          Messages
        </Link>
        <Link href="/admin/feedback?view=tips" aria-current={tips ? "page" : undefined} className={tab(tips)}>
          Tip votes
        </Link>
      </nav>
      {tips ? <TipVotes /> : <Feedback searchParams={searchParams} />}
    </>
  );
}

export default function Page({ searchParams }: PageProps<"/admin/feedback">) {
  return (
    <AdminPage description={<p>What owners sent from the feedback button, newest first, with the page they were on.</p>}>
      <Suspense fallback={null}>
        <Views searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}
