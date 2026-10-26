import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Header } from "@/components/header";
import { Measure } from "@/components/measure";
import { Figures } from "@/components/stats/figures";
import {
  type CostLine,
  costAlerts,
  daysUntil,
  formatDay,
  monthlyCharge,
  monthlyTotal,
  renewsSoon,
  type Source,
} from "@/lib/costs";
import { formatDate, formatDateTime, formatMoney, formatSeen } from "@/lib/format";
import { isAdmin } from "@/lib/server/admin";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { COSTS_TAG, type CostsPage, type Editable, loadCosts, type Rate } from "@/lib/server/costs";
import { cn } from "@/lib/utils";
import { removeEntry, saveBudget, saveEntry, saveRate } from "./actions";
import { EntryForm, NumberForm } from "./forms";

export const metadata: Metadata = { title: "Costs · Admin · Uplink" };

// As /admin: the admin check runs before anything streams, so anyone else gets a real 404.
export const instant = false;

const heading = "text-lg font-medium tracking-heading";
const muted = "text-sm text-faint";

// The admin check, and the clock (reading it while rendering blocks prerendering). Every save checks the
// admin again itself (actions.ts). The costs are read outside this private cache, because the live calls
// have their own hour-long remote cache (lib/server/costs/vercel.ts), which can't nest inside a private one.
async function checkAdmin(): Promise<number> {
  "use cache: private";
  cacheTag(COSTS_TAG);
  cacheLife({ stale: 60 });
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
  return <span className="rounded-md border px-1.5 py-px text-[0.6875rem] leading-4 text-muted-foreground">{SOURCE[source]}</span>;
}

const money = (amount: number, line: Pick<CostLine, "currency">) => formatMoney(amount, line.currency);

// The figure on the right, or why there isn't one.
function amountText(line: CostLine): string | null {
  if (line.amount === null) return null;
  return line.period === "yearly" ? `${money(line.amount, line)} a year` : money(line.amount, line);
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
  if (line.amount !== null && line.period === "yearly") out.push(`${money(monthlyCharge(line)!, line)} a month`);
  if (line.allowance !== undefined) {
    const charged = monthlyCharge(line);
    out.push(
      charged === null
        ? `${money(line.allowance, line)} monthly credit`
        : `${money(line.allowance, line)} credit, ${money(charged, line)} charged`,
    );
  }
  if (line.budget) out.push(`Budget ${money(line.budget, line)}`);
  if (line.resetsOn) {
    const soon = line.source === "fixed" && renewsSoon(line.resetsOn, now);
    const verb = line.source === "fixed" ? "Renews" : "Resets";
    out.push(soon && daysUntil(line.resetsOn, now) <= 1 ? `${verb} ${daysUntil(line.resetsOn, now) === 0 ? "today" : "tomorrow"}` : `${verb} ${formatDay(line.resetsOn)}`);
  }
  return out;
}

function ConnectVercel() {
  return (
    <div className="space-y-1 pt-1 text-xs text-muted-foreground">
      <p>
        Create a team token at{" "}
        <a href="https://vercel.com/account/settings/tokens" target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-4 hover:decoration-foreground">
          Vercel&apos;s account tokens
        </a>
        , then set VERCEL_API_TOKEN and VERCEL_TEAM_ID and redeploy.
      </p>
    </div>
  );
}

function Row({ line, edit, now, ready }: { line: CostLine; edit?: Editable; now: number; ready: boolean }) {
  const text = amountText(line);
  const soon = line.source === "fixed" && line.state === "ok" && renewsSoon(line.resetsOn, now);
  const lines = details(line, now);
  return (
    <li className={cn("py-3", soon && "-mx-3 rounded-lg bg-muted px-3 dark:bg-card")}>
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
            <a href={line.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
              Billing
              <ExternalLink aria-hidden className="size-3" />
              <span className="sr-only">for {line.name}, opens in a new tab</span>
            </a>
          )}
        </div>
      </div>
      {line.id === "vercel" && line.state === "connect" && <ConnectVercel />}
      {edit && ready && (
        <details className="group pt-1">
          <summary className="w-fit cursor-pointer list-none text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:decoration-foreground [&::-webkit-details-marker]:hidden">
            {edit.values ? "Edit" : "Set"}
            <span className="sr-only"> {line.name}</span>
          </summary>
          <EntryForm
            action={saveEntry.bind(null, edit.target)}
            remove={edit.removable ? removeEntry.bind(null, edit.target) : undefined}
            values={edit.values}
            fixedName={edit.fixedName}
            fixedPeriod={edit.fixedName ? line.period : undefined}
          />
        </details>
      )}
    </li>
  );
}

function rateNote(rate: Rate): string {
  if (rate.from === "saved" && rate.setAt) return `Set ${formatDate(rate.setAt)}`;
  if (rate.from === "env") return "From USD_INR";
  return "Default rate";
}

function totalNote(yearly: number, uncounted: number): string | undefined {
  const parts: string[] = [];
  if (yearly > 0) parts.push(yearly === 1 ? "A yearly cost counts as a twelfth" : "Yearly costs count as a twelfth");
  if (uncounted > 0) parts.push(`${uncounted} not counted`);
  return parts.length ? parts.join(". ") : undefined;
}

export default async function Page() {
  const { data, now } = await loadPage();
  const total = monthlyTotal(data.lines, data.rate.value);
  const alerts = costAlerts(data.lines, now);
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header />
      <div className="space-y-12">
        <header className="space-y-1">
          <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">Costs</h1>
          <p className="text-sm text-muted-foreground">
            What running Uplink costs this month.
            {data.simulated && " Demo mode: sample figures."}
            {!data.simulated && !data.ready && " Apply the costs migration to save entries."}
          </p>
        </header>

        <Figures
          figures={[
            { label: "This month", value: formatMoney(total.inr, "INR"), note: totalNote(total.yearly, total.uncounted) },
            { label: "In dollars", value: formatMoney(total.usd, "USD") },
            { label: "Dollar rate", value: formatMoney(data.rate.value, "INR"), note: rateNote(data.rate) },
          ]}
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
              <Row key={line.id} line={line} edit={data.edit[line.id]} now={now} ready={data.ready} />
            ))}
          </ul>
          {data.ready && (
            <details className="pt-2">
              <summary className="w-fit cursor-pointer list-none text-sm underline decoration-border underline-offset-4 hover:decoration-foreground [&::-webkit-details-marker]:hidden">
                Add a cost
              </summary>
              <EntryForm action={saveEntry.bind(null, "new")} values={null} fixedName={false} submitLabel="Add" />
            </details>
          )}
        </section>

        {data.ready && (
          <section className="space-y-4">
            <h2 className={heading}>Rate and budget</h2>
            <div className="grid gap-6 border-t pt-4 sm:grid-cols-2">
              <NumberForm action={saveRate} name="rate" label="Rupees to a dollar" defaultValue={String(data.rate.value)} />
              <NumberForm
                action={saveBudget}
                name="googleBudget"
                label="Google Maps budget, in dollars"
                defaultValue={data.googleBudgetUsd === null ? "" : String(data.googleBudgetUsd)}
                placeholder="None"
              />
            </div>
          </section>
        )}

        <p className="text-xs text-faint">As of {formatDateTime(now)}</p>
      </div>
    </div>
  );
}
