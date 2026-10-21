import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Download, Zap } from "lucide-react";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { Logo } from "@/components/logo";
import { ShowMore } from "@/components/show-more";
import { Tip } from "@/components/tip";
import { buttonVariants } from "@/components/ui/button";
import { formatClock, formatDuration, formatKwh, formatMoney, formatMonth, formatShortDate } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type ChargingSession, loadChargingSessions } from "@/lib/server/charging";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Stats · Uplink" };

// Sessions shown per month before "Show N more".
const MONTH_PREVIEW = 5;

const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Asia/Kolkata" });

// "Bengaluru, Nexus Koramangala" -> { place: "Nexus Koramangala", city: "Bengaluru" }
function splitSite(name: string | null): { place: string; city: string | null } {
  if (!name) return { place: "Supercharger", city: null };
  const i = name.indexOf(", ");
  if (i === -1) return { place: name, city: null };
  return { place: name.slice(i + 2), city: name.slice(0, i) };
}

function totals(rows: ChargingSession[]) {
  return {
    cost: rows.reduce((sum, s) => sum + (s.cost_total ?? 0), 0),
    energy: rows.reduce((sum, s) => sum + (s.energy_kwh ?? 0), 0),
    count: rows.length,
    currency: rows.find((s) => s.currency)?.currency ?? "INR",
  };
}

function rate(cost: number, energy: number, currency: string): string | null {
  return energy > 0 ? `${formatMoney(cost / energy, currency)}/kWh` : null;
}

function Header() {
  return (
    <header className="mb-16 flex items-center justify-between gap-4 text-sm">
      <Link href="/" prefetch={true} className="flex items-center gap-2.5 font-medium">
        <Logo className="size-5" />
        Uplink
      </Link>
      <nav className="flex items-baseline gap-4 text-muted-foreground">
        <Link href="/" prefetch={true} className="hover:text-foreground">
          Dashboard
        </Link>
        <Link href="/settings" prefetch={true} className="hover:text-foreground">
          Settings
        </Link>
      </nav>
    </header>
  );
}

function MonthBars({ sessions }: { sessions: ChargingSession[] }) {
  const now = new Date();
  const currency = totals(sessions).currency;
  const compact = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });
  const months = Array.from({ length: 6 }, (_, k) => {
    const back = 5 - k;
    const d = new Date(now.getFullYear(), now.getMonth() - back, 15);
    const key = formatMonth(d);
    const cost = totals(sessions.filter((s) => formatMonth(s.started_at) === key)).cost;
    return { key, label: monthLabel.format(d), cost, isCurrent: back === 0 };
  });
  const max = Math.max(...months.map((m) => m.cost));
  // Months before the first session stay blank, so the bars start where the history starts.
  const first = months.findIndex((m) => m.cost > 0);

  return (
    <div className="bg-muted px-4 pt-5 pb-3">
      <ol className="grid grid-cols-6 items-end gap-3" aria-label="Spend per month">
        {months.map((m, k) =>
          k < first ? (
            <li key={m.key} aria-hidden="true" />
          ) : (
            <li key={m.key} className="flex flex-col items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{compact.format(m.cost)}</span>
              <div className="flex h-20 w-full items-end">
                {m.cost > 0 && (
                  <div
                    className={cn("w-full", m.isCurrent ? "bg-foreground" : "bg-muted-foreground/40")}
                    style={{ height: `${Math.max(4, (m.cost / max) * 100)}%` }}
                  />
                )}
              </div>
              <span className={cn("text-xs", m.isCurrent ? "text-foreground" : "text-faint")}>{m.label}</span>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}

function Summary({ sessions }: { sessions: ChargingSession[] }) {
  const month = formatMonth(new Date());
  const { cost, energy, count, currency } = totals(sessions.filter((s) => formatMonth(s.started_at) === month));
  const rateText = rate(cost, energy, currency);
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs tracking-wide text-faint uppercase">Spent this month</p>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{formatMoney(cost, currency)}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {[formatKwh(energy), `${count} ${count === 1 ? "session" : "sessions"}`, rateText && `${rateText} avg`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <MonthBars sessions={sessions} />
    </section>
  );
}

function SessionRow({ session: s }: { session: ChargingSession }) {
  const invoice = s.invoices.find((i) => i.contentId);
  const { place, city } = splitSite(s.site_name);
  const durationMs = s.stopped_at ? Date.parse(s.stopped_at) - Date.parse(s.started_at) : 0;
  const durationText = durationMs > 0 ? formatDuration(durationMs / 1000) : null;
  const currency = s.currency ?? "INR";
  const rateText = s.cost_total !== null && s.energy_kwh !== null ? rate(s.cost_total, s.energy_kwh, currency) : null;
  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto_1.5rem] items-start gap-x-4 py-3 text-sm">
      <div>
        <p className="tabular-nums">{formatShortDate(s.started_at)}</p>
        <p className="text-xs text-faint tabular-nums">{formatClock(s.started_at)}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium">{place}</p>
        <p className="truncate text-xs text-muted-foreground">{[city, durationText].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="text-right">
        <p className="font-mono font-medium tabular-nums">{s.cost_total === null ? "—" : formatMoney(s.cost_total, currency)}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {s.energy_kwh === null ? "—" : formatKwh(s.energy_kwh)}
          {/* The per-kWh rate is hidden on phones so the site name keeps its room. */}
          {rateText && <span className="hidden sm:inline"> · {rateText}</span>}
        </p>
      </div>
      <div className="flex self-center">
        {invoice?.contentId && (
          <a
            href={`/api/charging/invoice/${encodeURIComponent(invoice.contentId)}`}
            aria-label={`Download invoice for ${formatShortDate(s.started_at)}`}
            className={buttonVariants({ variant: "ghost", size: "icon-xs", className: "group relative" })}
          >
            <Download className="size-3.5" aria-hidden="true" />
            <Tip>Download invoice</Tip>
          </a>
        )}
      </div>
    </li>
  );
}

function SessionList({ sessions }: { sessions: ChargingSession[] }) {
  // Sessions arrive newest first, so each month's group is in order too.
  const groups = new Map<string, ChargingSession[]>();
  for (const s of sessions) {
    const month = formatMonth(s.started_at);
    groups.set(month, [...(groups.get(month) ?? []), s]);
  }
  return (
    <div className="space-y-10">
      {[...groups].map(([month, rows]) => {
        const { cost, count, currency } = totals(rows);
        return (
          <section key={month} className="space-y-2">
            <div className="flex items-baseline justify-between gap-4 text-xs tracking-wide text-faint uppercase">
              <h2 className="font-medium">{month}</h2>
              <p className="tabular-nums">
                {count} {count === 1 ? "session" : "sessions"} · {formatMoney(cost, currency)}
              </p>
            </div>
            <div>
              <ul className="divide-y border-t">
                {rows.slice(0, MONTH_PREVIEW).map((s) => (
                  <SessionRow key={s.session_id} session={s} />
                ))}
              </ul>
              {rows.length > MONTH_PREVIEW && (
                <ShowMore count={rows.length - MONTH_PREVIEW}>
                  <ul className="divide-y border-t">
                    {rows.slice(MONTH_PREVIEW).map((s) => (
                      <SessionRow key={s.session_id} session={s} />
                    ))}
                  </ul>
                </ShowMore>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// Session check plus data in one browser-only private cache, so header links can prefetch it (see app/page.tsx).
async function loadSessions(): Promise<ChargingSession[]> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  return loadChargingSessions();
}

async function Sessions() {
  const sessions = await loadSessions();

  if (sessions.length === 0) {
    return (
      <EmptyState icon={<Zap className="size-7 text-faint" aria-hidden="true" />} title="No Supercharger sessions yet">
        They&apos;ll show up here after you charge at a Tesla Supercharger.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-12">
      <Summary sessions={sessions} />
      <SessionList sessions={sessions} />
    </div>
  );
}

function SessionsSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div aria-busy="true" aria-label="Loading charging sessions" className="space-y-12">
      <div className="space-y-8">
        <div className="space-y-2">
          <div className={`h-4 w-28 ${block}`} />
          <div className={`h-10 w-48 ${block}`} />
          <div className={`h-4 w-64 ${block}`} />
        </div>
        <div className={`h-36 w-full ${block}`} />
      </div>
      <div className={`h-40 w-full ${block}`} />
    </div>
  );
}

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
      <Header />
      <h1 className="text-2xl font-medium tracking-[-0.01em]">Stats</h1>
      <p className="mt-2 mb-12 text-sm text-muted-foreground">Your Tesla Supercharger sessions. Third-party chargers coming soon.</p>
      <Suspense fallback={<SessionsSkeleton />}>
        <Sessions />
      </Suspense>
    </div>
  );
}
