import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife, cacheTag, io } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { Zap } from "lucide-react";
import { type ReactNode, Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { Logo } from "@/components/logo";
import { ShowMore } from "@/components/show-more";
import { type Listed, rate, SessionRow } from "@/components/session-row";
import { Bars } from "@/components/stats/bars";
import { StackedBars, type StackedBar } from "@/components/stats/stacked-bars";
import { DriveList } from "@/components/stats/drive-list";
import { ParkedDrain } from "@/components/stats/parked-drain";
import { BatteryTrend } from "@/components/stats/battery-trend";
import { AwakeTimeline } from "@/components/stats/awake-timeline";
import { ChargeLevelChart } from "@/components/stats/charge-level";
import { ProjectedRange } from "@/components/stats/projected-range";
import { type Period, PERIODS, monthIndex, monthKey, monthShort, parsePeriod, parseView, yearOf } from "@/components/stats/periods";
import { ByPeriod, StatsTabs } from "@/components/stats/stats-tabs";
import { formatDays, formatKwh, formatMoney, formatMonth, formatShortDate } from "@/lib/format";
import { chargeEfficiency, matchSessions } from "@/lib/charge-sessions";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type ChargingSession, loadChargingSessions, syncChargingHistoryThrottled } from "@/lib/server/charging";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadAwake } from "@/lib/server/awake";
import { type DayStrip, hasPresence } from "@/lib/awake";
import type { ChargeLevel, WeeklyRange } from "@/lib/charge-level";
import { loadMonthlyEnergy, type MonthlyEnergy } from "@/lib/server/energy";
import { loadUpdateRows } from "@/lib/server/updates";
import { loadMonthlyDistance, loadWindowStats, type MonthlyDistance } from "@/lib/server/driving";
import { loadStreamSessions, syncStreamSessionsForAllCars, type StreamChargeSession } from "@/lib/server/stream-charging";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";
import { type DayKm, type UpdateRow, type WeeklyPack, combinedWhPerKm, updateStats } from "@/lib/telemetry-derive";
import { LIST_PREVIEW } from "@/lib/list";
import type { Driving } from "@/lib/drives";

export const metadata: Metadata = { title: "Stats · Uplink" };


function totals(rows: ChargingSession[]) {
  return {
    cost: rows.reduce((sum, s) => sum + (s.cost_total ?? 0), 0),
    energy: rows.reduce((sum, s) => sum + (s.energy_kwh ?? 0), 0),
    count: rows.length,
    currency: rows.find((s) => s.currency)?.currency ?? "INR",
  };
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
      <Bars bars={bars} ariaLabel={period === "all" ? "Spend per year" : "Spend per month"} prefix="₹" />
    </section>
  );
}

const ENERGY_LABELS: Record<Period, string> = {
  month: "this month",
  "6m": "in the last 6 months",
  year: "this year",
  all: "in total",
};

const kwhCompact = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// Tones from the foreground down, so the series read apart without colour.
const ENERGY_SERIES = [
  { label: "Supercharger", className: "bg-chart-1" },
  { label: "Third-party DC", className: "bg-chart-2" },
  { label: "AC", className: "bg-chart-3" },
];

// Energy added per month (per year for All time), split by charger kind. Supercharger energy is
// Tesla's billed figure; the other two come from the car's own readings.
function EnergyAdded({
  sessions,
  streamOnly,
  now,
  period,
}: {
  sessions: ChargingSession[];
  streamOnly: StreamChargeSession[];
  now: number;
  period: Period;
}) {
  const cur = monthIndex(now);
  const bucket = (index: number) => (period === "all" ? yearOf(index) : index);
  const energy = new Map<number, number[]>();
  let total = 0;
  const add = (startedAt: string, series: number, kwh: number | null) => {
    if (!kwh || kwh <= 0) return;
    const index = monthIndex(startedAt);
    const row = energy.get(bucket(index)) ?? [0, 0, 0];
    row[series] += kwh;
    energy.set(bucket(index), row);
    if (inPeriod(period, index, cur)) total += kwh;
  };
  for (const s of sessions) add(s.started_at, 0, s.energy_kwh);
  for (const s of streamOnly) add(s.started_at, s.supercharger ? 0 : s.kind === "dc" ? 1 : 2, s.energy_added_kwh);
  const current = bucket(cur);
  const bars: StackedBar[] = slotsFor(period, cur).map((slot) => {
    const segments = energy.get(slot.id) ?? [0, 0, 0];
    const sum = segments.reduce((a, b) => a + b, 0);
    return { key: String(slot.id), label: slot.label, total: sum, display: kwhCompact.format(sum), isCurrent: slot.id === current, segments };
  });
  const efficiency = chargeEfficiency(streamOnly.filter((s) => s.kind === "ac" && inPeriod(period, monthIndex(s.started_at), cur)));
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Energy added</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{formatKwh(total)}</p>
        <p className="text-sm text-muted-foreground">{ENERGY_LABELS[period]}</p>
      </div>
      <StackedBars bars={bars} series={ENERGY_SERIES} ariaLabel={period === "all" ? "Energy added per year" : "Energy added per month"} />
      {efficiency !== null && (
        <div className="space-y-1">
          <p className="text-sm">
            AC charging efficiency <span className="font-mono font-medium tabular-nums">{Math.round(efficiency * 100)}%</span>
          </p>
          <p className="text-xs text-muted-foreground">
            How much of the energy from the charger ended up in the battery, estimated from the car&apos;s own readings.
          </p>
        </div>
      )}
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

// Wh/km per month, from the streamed lifetime energy counter and the odometer. It counts everything the
// car drew, parked time included. Months under 50 km are left out.
function EnergyUse({ energy, now, period }: { energy: MonthlyEnergy[]; now: number; period: Period }) {
  const cur = monthIndex(now);
  const byMonth = new Map(energy.map((e) => [e.month, e.energy]));
  const slots =
    period === "year"
      ? slotsFor("year", cur)
      : Array.from({ length: period === "all" ? 12 : 6 }, (_, k) => {
          const id = cur - (period === "all" ? 11 : 5) + k;
          return { id, label: monthShort(id) };
        });
  const inRange = Array.from({ length: 12 }, (_, k) => cur - 11 + k)
    .filter((index) => inPeriod(period, index, cur))
    .flatMap((index) => byMonth.get(monthKey(index)) ?? []);
  const whPerKm = combinedWhPerKm(inRange);
  if (whPerKm === null) return null;
  const regenTotal = inRange.reduce((sum, m) => sum + (m.regenKwh ?? 0), 0);
  const bars = slots.map((slot) => {
    const value = byMonth.get(monthKey(slot.id))?.whPerKm ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: compactNumber.format(Math.round(value)), isCurrent: slot.id === cur };
  });
  const regenBars = slots.map((slot) => {
    const value = byMonth.get(monthKey(slot.id))?.regenKwh ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: kwhCompact.format(value), isCurrent: slot.id === cur };
  });
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Energy use</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{compactNumber.format(Math.round(whPerKm))} Wh/km</p>
        <p className="text-sm text-muted-foreground">{DRIVEN_LABELS[period]}</p>
      </div>
      <Bars bars={bars} ariaLabel="Energy use per month in Wh per km" />
      {regenTotal > 0 && (
        <div className="space-y-4">
          <p className="text-sm">
            Regen won back <span className="font-mono font-medium tabular-nums">{formatKwh(regenTotal)}</span>{" "}
            <span className="text-muted-foreground">{DRIVEN_LABELS[period]}</span>
          </p>
          <Bars bars={regenBars} ariaLabel="Energy won back by regen per month in kWh" />
        </div>
      )}
    </section>
  );
}

// How long updates take to arrive and how often. Needs two real updates to say anything.
function Updates({ rows, now, period }: { rows: UpdateRow[]; now: number; period: Period }) {
  const stats = updateStats(rows, now);
  if (!stats) return null;
  const cur = monthIndex(now);
  const count = rows.filter((r) => inPeriod(period, monthIndex(r.detected_at), cur)).length;
  const items = [
    stats.avgWaitSec !== null && { label: "Average wait, available to installed", value: formatDays(stats.avgWaitSec) },
    { label: `Updates ${ENERGY_LABELS[period]}`, value: String(count) },
    { label: "Average time between updates", value: formatDays(stats.avgGapSec) },
    { label: "Longest on one version", value: formatDays(stats.longestSec) },
  ].filter((item) => item !== false);
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Updates</h2>
      <dl className="divide-y border-t">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-4 py-3 text-sm">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="font-mono font-medium tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Kilometres per day for the last 90 days, from the streamed odometer; 30 fit the panel and the rest scroll.
function DailyDriving({ days }: { days: DayKm[] }) {
  // One day of readings has nothing to compare against, so the section waits for a second.
  if (days.filter((d) => d.km !== null).length < 2) return null;
  const total = days.slice(-30).reduce((sum, d) => sum + (d.km ?? 0), 0);
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
      <Bars bars={bars} ariaLabel="Distance per day" labelEvery={7} visible={30} />
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

function SessionList({ sessions }: { sessions: Listed[] }) {
  // Sessions arrive newest first, so each month's group is in order too. Numbers count from the first
  // charge, so the newest has the highest.
  const serial = new Map(sessions.map((s, i) => [s.key, sessions.length - i]));
  const energyTotal = sessions.reduce((sum, s) => sum + ((s.tesla ? s.tesla.energy_kwh : s.stream?.energy_added_kwh) ?? 0), 0);
  const groups = new Map<string, Listed[]>();
  for (const s of sessions) {
    const month = formatMonth(s.started_at);
    groups.set(month, [...(groups.get(month) ?? []), s]);
  }
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4 text-xs tracking-wide text-faint uppercase">
          <h2 className="font-medium">Charging sessions</h2>
          <p className="tabular-nums">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
            {energyTotal > 0 && ` · ${formatKwh(energyTotal)}`}
          </p>
        </div>
      </div>
    {/* On phones the list keeps its columns and scrolls sideways. */}
    <div className="max-sm:-mx-1 max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:px-1">
    <div className="max-sm:min-w-xl space-y-10">
      {[...groups].map(([month, rows]) => {
        const billed = totals(rows.flatMap((r) => (r.tesla ? [r.tesla] : [])));
        return (
          <section key={month} className="space-y-2">
            <h3 className="text-xs font-medium tracking-wide text-faint uppercase">{month}</h3>
            <div>
              <ul className="divide-y border-t">
                {rows.slice(0, LIST_PREVIEW).map((s) => (
                  <SessionRow key={s.key} item={s} serial={serial.get(s.key) ?? 0} />
                ))}
              </ul>
              {rows.length > LIST_PREVIEW && (
                <ShowMore count={rows.length - LIST_PREVIEW}>
                  <ul className="divide-y border-t">
                    {rows.slice(LIST_PREVIEW).map((s) => (
                      <SessionRow key={s.key} item={s} serial={serial.get(s.key) ?? 0} />
                    ))}
                  </ul>
                </ShowMore>
              )}
            </div>
            <p className="pt-1 text-right text-xs text-faint tabular-nums">
              {rows.length} {rows.length === 1 ? "session" : "sessions"}
              {billed.count > 0 && `, ${formatMoney(billed.cost, billed.currency)} at Superchargers`}
            </p>
          </section>
        );
      })}
    </div>
    </div>
    </section>
  );
}

// Session check plus data in one browser-only private cache, so header links can prefetch it (see app/page.tsx).
// One cache, so the session is checked and the car read once; the loaders share its id and VIN.
async function loadStats(): Promise<{
  sessions: ChargingSession[];
  streamSessions: StreamChargeSession[];
  distance: MonthlyDistance[];
  energy: MonthlyEnergy[];
  updates: UpdateRow[];
  days: DayKm[];
  trend: WeeklyPack[];
  driving: Driving;
  level: ChargeLevel | null;
  range: WeeklyRange[];
  awake: DayStrip[];
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const vehicle = loadPrimaryVehicle();
  const [sessions, streamSessions, distance, energy, updates, { days, trend, driving, level, range }, awake] = await Promise.all([
    loadChargingSessions(),
    loadStreamSessions(),
    vehicle.then((v) => loadMonthlyDistance(v?.vin ?? null)),
    vehicle.then((v) => loadMonthlyEnergy(v?.vin ?? null)),
    vehicle.then((v) => loadUpdateRows(v?.id ?? null)),
    vehicle.then((v) => loadWindowStats(v?.vin ?? null, now)),
    vehicle.then((v) => loadAwake(v, now)),
  ]);
  return { sessions, streamSessions, distance, energy, updates, days, trend, driving, level, range, awake, now };
}

// Rebuilds sessions from the car's readings, and pulls Supercharger history (at most every 30 minutes),
// once the response is sent, so the next visit has them.
// The sync reads the clock, so it waits for a real request and stays out of the prerendered page.
async function SyncStreamSessions() {
  await io();
  after(() => Promise.all([syncStreamSessionsForAllCars(), syncChargingHistoryThrottled()]));
  return null;
}

// A section that depends on the period, rendered for each one so the switch needs no server trip (see ByPeriod).
function eachPeriod(render: (period: Period) => ReactNode) {
  return <ByPeriod panels={Object.fromEntries(PERIODS.map(({ value }) => [value, render(value)])) as Record<Period, ReactNode>} />;
}

async function Sessions({ searchParams }: Pick<PageProps<"/stats">, "searchParams">) {
  // Read outside the cache: the tab and period only pick what's shown first, and switch in the browser.
  const params = await searchParams;
  const period = parsePeriod(params.period);
  const view = parseView(params.view);
  const { sessions, streamSessions, distance, energy, updates, days, trend, driving, level, range, awake, now } = await loadStats();

  const { pairs, streamOnly } = matchSessions(sessions, streamSessions, now);
  const listed: Listed[] = [
    ...pairs.map((p) => ({ key: p.tesla.session_id, started_at: p.tesla.started_at, tesla: p.tesla, stream: p.stream })),
    ...streamOnly.map((s) => ({ key: `stream-${s.id}`, started_at: s.started_at, tesla: null, stream: s })),
  ].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));

  // Mirrors each section's own "enough data" rule, so an empty tab says so instead of showing nothing.
  const hasDriving = distance.some((d) => d.km > 0) || days.filter((d) => d.km !== null).length >= 2 || energy.length > 0 || driving.drives.length > 0;
  const notYet = (title: string, body: string) => (
    <EmptyState icon={<Zap className="size-7 text-faint" aria-hidden="true" />} title={title}>
      {body}
    </EmptyState>
  );

  return (
    <StatsTabs
      initial={view}
      initialPeriod={period}
      panels={{
        charging:
          listed.length === 0 ? (
            notYet("No charging sessions yet", "Your charges will show up here, wherever you plug in.")
          ) : (
            <div className="space-y-12">
              {sessions.length > 0 && eachPeriod((p) => <Summary sessions={sessions} now={now} period={p} />)}
              {streamSessions.length > 0 && eachPeriod((p) => <EnergyAdded sessions={sessions} streamOnly={streamOnly} now={now} period={p} />)}
              <SessionList sessions={listed} />
            </div>
          ),
        driving: hasDriving ? (
          <div className="space-y-12">
            {eachPeriod((p) => <Distance distance={distance} now={now} period={p} />)}
            <DailyDriving days={days} />
            {eachPeriod((p) => <EnergyUse energy={energy} now={now} period={p} />)}
            <DriveList drives={driving.drives} now={now} />
            <ParkedDrain drain={driving.drain} />
          </div>
        ) : (
          notYet("Not enough driving yet", "Distance and energy use show up after a couple of days of driving.")
        ),
        battery:
          trend.length >= 2 || range.length > 0 || (level?.points.length ?? 0) >= 2 ? (
            <div className="space-y-12">
              <Battery trend={trend} />
              <ProjectedRange weeks={range} />
              <ChargeLevelChart level={level} now={now} />
            </div>
          ) : (
            notYet("Not enough readings yet", "The battery trend shows up after two weeks of readings.")
          ),
        updates: updateStats(updates, now) || hasPresence(awake) ? (
          <div className="space-y-12">
            {eachPeriod((p) => <Updates rows={updates} now={now} period={p} />)}
            <AwakeTimeline days={awake} now={now} />
          </div>
        ) : (
          notYet("Not enough updates yet", "Update stats show up after your car's second update.")
        ),
      }}
    />
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
      <p className="mt-2 mb-12 text-sm text-muted-foreground">Charging, driving, battery and updates over time.</p>
      <Suspense fallback={<SessionsSkeleton />}>
        <Sessions searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <SyncStreamSessions />
      </Suspense>
    </div>
  );
}
