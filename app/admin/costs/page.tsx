import { LINK as link } from "@/lib/link-style";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { type ReactNode, Suspense } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { DEMO } from "@/lib/demo";
import { Measure } from "@/components/measure";
import { Figures } from "@/components/stats/figures";
import {
  type CostLine,
  costAlerts,
  daysUntil,
  formatDay,
  googleParts,
  monthlyCharge,
  monthlyTotal,
  renews,
  renewsSoon,
  type Source,
  type Part,
  teslaParts,
  type Total,
  usd,
} from "@/lib/costs";
import { formatDateTime, formatSeen } from "@/lib/format";
import { isAdmin } from "@/lib/server/admin";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { COSTS_TAG, type CostsPage, type Editable, loadCosts } from "@/lib/server/costs";
import { openRouterParts } from "@/lib/server/costs/openrouter";
import { cn } from "@/lib/utils";
import { removeEntry, saveBudget, saveEntry } from "./actions";
import { EntryForm, NumberForm } from "./forms";

export const metadata: Metadata = { title: "Costs · Admin" };

// As /admin: the admin check runs before anything streams, so anyone else gets a real 404.
export const instant = false;

const heading = "text-lg font-medium tracking-heading";
const muted = "text-sm text-faint";

// The admin check, and the clock (reading it while rendering blocks prerendering). Every save checks the
// admin again itself (actions.ts). The costs are read outside this private cache, because the live calls
// have their own remote caches (lib/server/costs/*), which can't nest inside a private one.
async function checkAdmin(): Promise<number> {
  "use cache: private";
  cacheTag(COSTS_TAG);
  // 5 minutes or more lets the page come along with a link's prefetch, so the tabs switch at once (Next's
  // instant-navigation guide); saves still refresh it at once (updateTag).
  cacheLife({ stale: 300 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  if (!(await isAdmin())) notFound();
  return Date.now();
}

async function loadPage(): Promise<{ data: CostsPage; now: number }> {
  const now = await checkAdmin();
  return { data: await loadCosts(now), now };
}

const SOURCE: Record<Source, string> = { live: "Live", estimated: "Estimated", fixed: "Fixed" };

function Badge({ source }: { source: Source }) {
  return <span className="rounded-md border px-1.5 py-px text-xs leading-4 text-muted-foreground">{SOURCE[source]}</span>;
}

// The figure on the right, or why there isn't one.
function amountText(line: CostLine): string | null {
  if (line.amount === null) return null;
  const figure = `${line.approx ? "≈ " : ""}${usd(line.amount)}`;
  return line.period === "yearly" ? `${figure} a year` : figure;
}

const MISSING: Record<string, string> = {
  connect: "Not connected",
  unavailable: "Unavailable",
  "not-tracked": "Not tracked yet",
  "not-set": "Not set",
};

// The short lines under a service's name.
function details(line: CostLine, now: number): string[] {
  const out: string[] = [];
  if (line.note) out.push(line.note);
  if (line.state === "stale" && line.asOf) out.push(`Last read ${formatSeen(line.asOf, now)}`);
  if (line.amount !== null && line.period === "yearly") out.push(`${usd(monthlyCharge(line)!)} a month`);
  if (line.allowance !== undefined) {
    const charged = monthlyCharge(line);
    out.push(charged === null ? `${usd(line.allowance)} monthly credit` : `${usd(line.allowance)} credit, ${usd(charged)} charged`);
  }
  if (line.budget) out.push(`Budget ${usd(line.budget)}`);
  if (line.resetsOn) {
    const verb = renews(line) ? "Renews" : "Resets";
    const days = daysUntil(line.resetsOn, now);
    const soon = renews(line) && renewsSoon(line.resetsOn, now) && days <= 1;
    out.push(soon ? `${verb} ${days === 0 ? "today" : "tomorrow"}` : `${verb} ${formatDay(line.resetsOn)}`);
  }
  return out;
}

const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-muted px-1 py-px font-mono text-xs break-words">{children}</code>;

const Out = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className={link}>
    {children}
  </a>
);

// How to connect a service whose token isn't set. Full steps are in docs/costs.md.
const CONNECT: Record<string, ReactNode> = {
  vercel: (
    <>
      Create a team token at <Out href="https://vercel.com/account/settings/tokens">Vercel&apos;s account tokens</Out>, then set{" "}
      <Code>VERCEL_API_TOKEN</Code> and <Code>VERCEL_TEAM_ID</Code> and redeploy.
    </>
  ),
  supabase: (
    <>
      Create a scoped token at <Out href="https://supabase.com/dashboard/account/tokens">Supabase&apos;s access tokens</Out> for
      this org, with Read on Projects, Organization Settings and Add-ons. Set <Code>SUPABASE_ACCESS_TOKEN</Code> and redeploy.
    </>
  ),
  fly: (
    <>
      Run <Code>fly tokens create readonly --org personal --name &quot;Uplink costs&quot; --expiry 8760h</Code>, set <Code>FLY_API_TOKEN</Code> to
      what it prints and redeploy.
    </>
  ),
  openrouter: (
    <>
      Set <Code>OPENROUTER_API_KEY</Code>, the key drive wording and tips use, and redeploy.
    </>
  ),
};

// What a usage-billed row is made of (teslaParts and googleParts in lib/costs.ts, openRouterParts), closed until opened.
function Breakdown({ name, parts }: { name: string; parts: Part[] }) {
  return (
    <details className="pt-1">
      <summary className={cn("w-fit cursor-pointer list-none text-xs text-muted-foreground [&::-webkit-details-marker]:hidden", link)}>
        Breakdown
        <span className="sr-only"> of {name}</span>
      </summary>
      <dl className="mt-2 divide-y border-y text-sm">
        {parts.map((p) => (
          <div key={p.label} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-muted-foreground">{p.label}</dt>
            <dd className={p.muted ? "text-right text-faint" : "font-mono tabular-nums"}>{p.muted ? p.value : <Measure text={p.value} />}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Row({ line, edit, parts, now, ready, readOnly }: { line: CostLine; edit?: Editable; parts?: Part[]; now: number; ready: boolean; readOnly: boolean }) {
  const text = amountText(line);
  const soon = renews(line) && line.amount !== null && renewsSoon(line.resetsOn, now);
  const lines = details(line, now);
  return (
    <li id={`cost-${line.id}`} className={cn("scroll-mt-6 py-3", soon && "-mx-3 rounded-lg bg-muted px-3 dark:bg-card")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {line.name}
            <Badge source={line.source} />
          </p>
          {lines.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {lines.map((l, k) => (
                <span key={l} className={cn(k > 0 && "before:mx-1.5 before:content-['·']", soon && l.startsWith("Renews") && "font-medium text-foreground")}>
                  {l}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          {text ? (
            <span className="font-mono text-sm font-medium tabular-nums">
              <Measure text={text} />
            </span>
          ) : (
            <span className={muted}>{MISSING[line.state] ?? "Unavailable"}</span>
          )}
          {line.link && (
            <a href={line.link} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", link)}>
              Billing
              <ExternalLink aria-hidden className="size-3" />
              <span className="sr-only">for {line.name}, opens in a new tab</span>
            </a>
          )}
        </div>
      </div>
      {line.state === "connect" && CONNECT[line.id] && <p className="pt-1 text-sm text-muted-foreground">{CONNECT[line.id]}</p>}
      {parts && parts.length > 0 && <Breakdown name={line.name} parts={parts} />}
      {edit && ready && (
        <details className="group pt-1">
          <summary className={cn("w-fit cursor-pointer list-none text-xs text-muted-foreground [&::-webkit-details-marker]:hidden", link)}>
            Edit
            <span className="sr-only"> {line.name}</span>
          </summary>
          <EntryForm action={saveEntry.bind(null, edit.target)} remove={removeEntry.bind(null, edit.target)} values={edit.values} readOnly={readOnly} />
        </details>
      )}
    </li>
  );
}

// Under the total: which services it leaves out, each linking to its row, and how yearly costs count.
function totalNote(total: Total): ReactNode {
  const parts: ReactNode[] = [];
  if (total.missing.length > 0) {
    parts.push(
      <span key="missing">
        Not counted:{" "}
        {total.missing.map((m, k) => (
          <span key={m.id}>
            {k > 0 && ", "}
            <a href={`#cost-${m.id}`} className={link}>
              {m.name}
            </a>
          </span>
        ))}
      </span>,
    );
  }
  if (total.yearly > 0) parts.push(<span key="yearly">{total.yearly === 1 ? "A yearly cost counts as a twelfth" : "Yearly costs count as a twelfth"}</span>);
  if (parts.length === 0) return undefined;
  return parts.map((p, k) => (
    <span key={k} className="block">
      {p}
    </span>
  ));
}

async function Costs() {
  const { data, now } = await loadPage();
  const total = monthlyTotal(data.lines);
  const alerts = costAlerts(data.lines, now);
  const parts: Record<string, Part[]> = {};
  if (data.tesla) parts.tesla = teslaParts(data.tesla, now);
  if (data.google) parts.google = googleParts(data.google);
  parts.openrouter = openRouterParts(data.openRouter);
  return (
    <>
      {!data.simulated && !data.ready && <p className="text-sm text-muted-foreground">Apply the costs migration to add your own.</p>}
        <Figures
          figures={[{ label: "This month", value: usd(total.usd), note: totalNote(total) }]}
          info="Estimated lines are list prices for what each provider's API reports, refreshed every 6 hours."
        />

        {alerts.length > 0 && (
          <section className="space-y-2" aria-labelledby="cost-alerts">
            <h2 id="cost-alerts" className={heading}>
              Alerts
            </h2>
            <ul className="divide-y border-t">
              {alerts.map((a) => (
                <li key={`${a.kind}-${a.id}`} className={cn("flex items-center gap-2 py-3 text-sm", a.kind === "budget" && "text-destructive")}>
                  <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", a.kind === "budget" ? "bg-destructive" : "bg-foreground")} />
                  {a.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-2">
          <h2 className={heading}>Services</h2>
          <ul className="divide-y border-t">
            {data.lines.map((line) => (
              <Row key={line.id} line={line} edit={data.edit[line.id]} parts={parts[line.id]} now={now} ready={data.ready} readOnly={data.simulated} />
            ))}
          </ul>
          {data.ready && (
            <details className="pt-2">
              <summary className={cn("w-fit cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden", link)}>Add a cost</summary>
              <EntryForm action={saveEntry.bind(null, "new")} values={null} submitLabel="Add" readOnly={data.simulated} />
            </details>
          )}
        </section>

        {data.ready && (
          <section className="space-y-4">
            <h2 className={heading}>Budget</h2>
            <div className="border-t pt-4">
              <NumberForm
                action={saveBudget}
                name="googleBudget"
                label="Google Maps budget, in dollars"
                defaultValue={data.googleBudgetUsd === null ? "" : String(data.googleBudgetUsd)}
                placeholder="None"
                readOnly={data.simulated}
              />
            </div>
          </section>
        )}

        <p className="text-xs text-faint">As of {formatDateTime(now)}</p>
    </>
  );
}

// The admin check first (a real 404 for anyone else), then the frame and tabs at once, with the costs
// streaming in under them: the providers' figures can take a moment.
export default async function Page() {
  await checkAdmin();
  return (
    <AdminPage description={<p>What running Uplink costs this month, in dollars.{DEMO && " Demo: sample figures, read-only."}</p>}>
      <Suspense fallback={<div role="status" aria-busy="true" className="h-64 bg-muted motion-safe:animate-pulse"><span className="sr-only">Loading…</span></div>}>
        <Costs />
      </Suspense>
    </AdminPage>
  );
}
