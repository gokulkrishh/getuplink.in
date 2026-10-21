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
import { Bars } from "@/components/stats/bars";
import { BatteryTrend } from "@/components/stats/battery-trend";
import { PeriodSwitch } from "@/components/stats/period-switch";
import { type Period, monthIndex, monthKey, monthShort, parsePeriod, yearOf } from "@/components/stats/periods";
import { formatClock, formatDuration, formatKwh, formatMoney, formatMonth, formatShortDate } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type ChargingSession, loadChargingSessions } from "@/lib/server/charging";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadBatteryTrend } from "@/lib/server/battery";
import { loadDailyDistance, loadMonthlyDistance, type MonthlyDistance } from "@/lib/server/driving";
import type { DayKm, WeeklyPack } from "@/lib/telemetry-derive";

export const metadata: Metadata = { title: "Stats · Uplink" };

// Sessions shown per month before "Show N more".
const MONTH_PREVIEW = 5;

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
      <nav aria-label="Main" className="flex items-baseline gap-4 text-muted-foreground">
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

const compactNumber = new Intl.NumberFormat("en-IN");

const SPENT_LABELS: Record<Period, string> = {
  month: "Spent this month",
  "6m": "Spent in the last 6 months",
  year: "Spent this year",
  all: "Spent in total",
};

const DRIVEN_LABELS: Record<Period, string> = {
  month: "this month",
  "6m": "in the last 6 months",
  year: "this year",
  all: "in the last 12 months",
};

// Which months a period covers, given the current month index.
function inPeriod(period: Period, index: number, cur: number): boolean {
  if (period === "month") return index === cur;
  if (period === "6m") return index > cur - 6 && index <= cur;
  if (period === "year") return yearOf(index) === yearOf(cur);
  return true;
}

// Bar slots: 6 months (Month, 6 months), the 12 months of this year (Year), or 6 years (All time).
function slotsFor(period: Period, cur: number): { id: number; label: string }[] {
  if (period === "year") return Array.from({ length: 12 }, (_, m) => ({ id: yearOf(cur) * 12 + m, label: monthShort(yearOf(cur) * 12 + m) }));
  if (period === "all") return Array.from({ length: 6 }, (_, k) => ({ id: yearOf(cur) - 5 + k, label: String(yearOf(cur) - 5 + k) }));
  return Array.from({ length: 6 }, (_, k) => ({ id: cur - 5 + k, label: monthShort(cur - 5 + k) }));
}

function Summary({ sessions, now, period }: { sessions: ChargingSession[]; now: number; period: Period }) {
  const cur = monthIndex(now);
  // Each session's month is worked out once, then reused for the totals and the bars.
  const dated = sessions.map((s) => ({ s, index: monthIndex(s.started_at) }));
  const { cost, energy, count, currency } = totals(dated.filter((d) => inPeriod(period, d.index, cur)).map((d) => d.s));
  const rateText = rate(cost, energy, currency);
  const bucket = (index: number) => (period === "all" ? yearOf(index) : index);
  const spend = new Map<number, number>();
  for (const { s, index } of dated) spend.set(bucket(index), (spend.get(bucket(index)) ?? 0) + (s.cost_total ?? 0));
  const compact = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });
  const current = bucket(cur);
  const bars = slotsFor(period, cur).map((slot) => {
    const value = spend.get(slot.id) ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: compact.format(value), isCurrent: slot.id === current };
  });
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs tracking-wide text-faint uppercase">{SPENT_LABELS[period]}</p>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{formatMoney(cost, currency)}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {[formatKwh(energy), `${count} ${count === 1 ? "session" : "sessions"}`, rateText && `${rateText} avg`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <Bars bars={bars} ariaLabel={period === "all" ? "Spend per year" : "Spend per month"} />
    </section>
  );
}

function Distance({ distance, now, period }: { distance: MonthlyDistance[]; now: number; period: Period }) {
  // A single reading gives no distance yet, so the section stays out of the way.
  if (!distance.some((d) => d.km > 0)) return null;
  const cur = monthIndex(now);
  const km = new Map(distance.map((d) => [d.month, d.km]));
  // The loader has 12 months, so All time shows those 12 and Year shows this calendar year's months.
  const slots =
    period === "year"
      ? slotsFor("year", cur)
      : Array.from({ length: period === "all" ? 12 : 6 }, (_, k) => {
          const id = cur - (period === "all" ? 11 : 5) + k;
          return { id, label: monthShort(id) };
        });
  const total = Array.from({ length: 12 }, (_, k) => cur - 11 + k)
    .filter((index) => inPeriod(period, index, cur))
    .reduce((sum, index) => sum + (km.get(monthKey(index)) ?? 0), 0);
  const bars = slots.map((slot) => {
    const value = km.get(monthKey(slot.id)) ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: compactNumber.format(value), isCurrent: slot.id === cur };
  });
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Distance</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{compactNumber.format(total)} km</p>
        <p className="text-sm text-muted-foreground">{DRIVEN_LABELS[period]}</p>
      </div>
      <Bars bars={bars} ariaLabel="Distance per month" />
    </section>
  );
}

// Kilometres per day for the last 30 days, from the streamed odometer.
function DailyDriving({ days }: { days: DayKm[] }) {
  // One day of readings has nothing to compare against, so the section waits for a second.
  if (days.filter((d) => d.km !== null).length < 2) return null;
  const total = days.reduce((sum, d) => sum + (d.km ?? 0), 0);
  const bars = days.map((d, k) => ({
    key: String(d.day),
    label: formatShortDate(d.start),
    value: d.km ?? 0,
    display: `${compactNumber.format(d.km ?? 0)} km`,
    isCurrent: k === days.length - 1,
    blank: d.km === null,
  }));
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Driving per day</h2>
        <p className="text-sm text-muted-foreground tabular-nums">{compactNumber.format(total)} km in the last 30 days</p>
      </div>
      <Bars bars={bars} ariaLabel="Distance per day" labelEvery={7} />
    </section>
  );
}

// The estimated full pack by week, from the streamed energy remaining and battery level.
function Battery({ trend }: { trend: WeeklyPack[] }) {
  if (trend.length < 2) return null;
  const latest = trend[trend.length - 1];
  return (
    <section id="battery" className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Battery</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{formatKwh(latest.kwh)}</p>
        <p className="text-sm text-muted-foreground">Estimated full pack, weekly median</p>
      </div>
      <BatteryTrend points={trend} />
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
    <li className="grid grid-cols-session items-start gap-x-4 py-3 text-sm">
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
            className={buttonVariants({ variant: "ghost", size: "icon-xs", className: "group" })}
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
async function loadStats(): Promise<{ sessions: ChargingSession[]; distance: MonthlyDistance[]; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const [sessions, distance] = await Promise.all([loadChargingSessions(), loadMonthlyDistance()]);
  return { sessions, distance, now: Date.now() };
}

// Streamed odometer and battery readings, cached the same way as the sessions.
async function loadTelemetryStats(): Promise<{ days: DayKm[]; trend: WeeklyPack[] }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  const [days, trend] = await Promise.all([loadDailyDistance(), loadBatteryTrend()]);
  return { days, trend };
}

async function Sessions({ searchParams }: Pick<PageProps<"/stats">, "searchParams">) {
  // Read outside the cache: the period only changes how the cached list is summed.
  const period = parsePeriod((await searchParams).period);
  const [{ sessions, distance, now }, { days, trend }] = await Promise.all([loadStats(), loadTelemetryStats()]);

  if (sessions.length === 0) {
    return (
      <EmptyState icon={<Zap className="size-7 text-faint" aria-hidden="true" />} title="No Supercharger sessions yet">
        They&apos;ll show up here after you charge at a Tesla Supercharger.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-12">
      <PeriodSwitch period={period} />
      <Summary sessions={sessions} now={now} period={period} />
      <Distance distance={distance} now={now} period={period} />
      <DailyDriving days={days} />
      <SessionList sessions={sessions} />
      <Battery trend={trend} />
    </div>
  );
}

function SessionsSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div role="status" aria-busy="true" className="space-y-12">
      <span className="sr-only">Loading…</span>
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

export default function Page({ searchParams }: PageProps<"/stats">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
      <Header />
      <h1 className="text-2xl font-medium tracking-heading">Stats</h1>
      <p className="mt-2 mb-12 text-sm text-muted-foreground">Your Tesla Supercharger sessions. Third-party chargers coming soon.</p>
      <Suspense fallback={<SessionsSkeleton />}>
        <Sessions searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
