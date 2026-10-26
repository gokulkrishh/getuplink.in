import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Info } from "lucide-react";
import { Header } from "@/components/header";
import { Figures } from "@/components/stats/figures";
import { Tip, TipTrigger } from "@/components/tip";
import { type Decision, isFull, placesLine } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { isAdmin } from "@/lib/server/admin";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type Account, loadWaitlist, WAITLIST_TAG, type WaitlistPage } from "@/lib/server/waitlist";
import { decideAccount } from "./actions";
import { DecisionButton } from "./decision-button";

export const metadata: Metadata = { title: "Waitlist · Admin" };

// As /admin: the admin check runs before anything streams, so anyone else gets a real 404.
export const instant = false;

const heading = "text-lg font-medium tracking-heading";
const number = new Intl.NumberFormat("en-IN");

// The cache is for showing the page. Every decision checks the admin again itself (decideAccount).
async function loadPage(): Promise<{ data: WaitlistPage; now: number }> {
  "use cache: private";
  cacheTag(WAITLIST_TAG);
  cacheLife({ stale: 30 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  if (!(await isAdmin())) notFound();
  const now = Date.now();
  return { data: await loadWaitlist(now), now };
}

type Button = { decision: Decision; label: string; pendingLabel: string; variant?: "default" | "outline"; full?: boolean };

function List({ title, accounts, empty, when, buttons, more }: {
  title: string;
  accounts: Account[];
  empty: string;
  when: (a: Account) => string;
  buttons: Button[];
  more?: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className={heading}>{title}</h2>
      {accounts.length === 0 ? (
        <p className="border-t pt-3 text-sm text-faint">{empty}</p>
      ) : (
        <ul className="divide-y border-t">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">Request {a.id}</p>
                <p className="text-sm text-muted-foreground">{when(a)}</p>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                {buttons.map((b) => (
                  <DecisionButton
                    key={b.decision}
                    action={decideAccount.bind(null, b.decision, a.id)}
                    label={b.label}
                    pendingLabel={b.pendingLabel}
                    variant={b.variant}
                    disabled={b.full}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {more && <p className="pt-1 text-xs text-faint">{more}</p>}
    </section>
  );
}

const asked = (a: Account) => `Asked ${formatDateTime(a.askedAt)}`;
const decided = (verb: string) => (a: Account) => `${verb} ${formatDateTime(a.decidedAt)}`;
const latest = (shown: number, total: number) => (total > shown ? `The latest ${shown} of ${number.format(total)}.` : undefined);

export default async function Page() {
  const { data, now } = await loadPage();
  const full = isFull(data.used, data.max);
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header />
      <div className="space-y-12">
        <header className="space-y-1">
          <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">Waitlist</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {placesLine(data.used, data.max)}.{data.simulated && " Demo mode: simulated."}
            <TipTrigger className="text-faint hover:text-foreground">
              <Info aria-hidden className="size-3.5" />
              <span className="sr-only">About places</span>
              <Tip align="start" className="max-w-[min(32ch,calc(100vw-2rem))] whitespace-normal">
                Approved accounts hold a place, yours included. Suspended ones don&apos;t. MAX_USERS sets the number.
              </Tip>
            </TipTrigger>
          </p>
        </header>

        <Figures
          figures={[
            { label: "Waiting", value: number.format(data.counts.pending) },
            { label: "Approved", value: number.format(data.counts.approved), note: "Not counting you" },
            { label: "Suspended", value: number.format(data.counts.suspended) },
            { label: "Declined", value: number.format(data.counts.declined) },
          ]}
        />

        <List
          title="Waiting"
          accounts={data.pending}
          empty="Nobody is waiting."
          when={asked}
          more={full ? "Every place is used. Suspend someone to approve another." : undefined}
          buttons={[
            { decision: "approve", label: "Approve", pendingLabel: "Approving…", variant: "default", full },
            { decision: "decline", label: "Decline", pendingLabel: "Declining…" },
          ]}
        />
        <List
          title="Approved"
          accounts={data.approved}
          empty="Nobody yet."
          when={decided("Approved")}
          more={latest(data.approved.length, data.counts.approved)}
          buttons={[{ decision: "suspend", label: "Suspend", pendingLabel: "Suspending…" }]}
        />
        <List
          title="Suspended"
          accounts={data.suspended}
          empty="Nobody."
          when={decided("Suspended")}
          more={latest(data.suspended.length, data.counts.suspended)}
          buttons={[{ decision: "restore", label: "Restore", pendingLabel: "Restoring…", full }]}
        />
        <List
          title="Declined"
          accounts={data.declined}
          empty="Nobody."
          when={decided("Declined")}
          more={latest(data.declined.length, data.counts.declined) ?? "Restore puts a request back on the waitlist."}
          buttons={[{ decision: "reopen", label: "Restore", pendingLabel: "Restoring…" }]}
        />

        <p className="text-xs text-faint">As of {formatDateTime(now)}</p>
      </div>
    </div>
  );
}
