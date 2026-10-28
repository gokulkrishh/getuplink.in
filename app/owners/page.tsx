import { ChevronDown, EyeOff, Trash2, Users } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { CarTabs } from "@/components/car-tabs";
import { ChartCard } from "@/components/chart-card";
import { Header } from "@/components/header";
import { OptionBar } from "@/components/owners/option-bar";
import { BandBar, ShareStrip } from "@/components/owners/highlight-bar";
import { ShareButton, StopSharing } from "@/components/owners/share-controls";
import { Spread, type SpreadBin } from "@/components/owners/spread";
import { Loading, Ph, SkFigures } from "@/components/skeleton";
import { Figures } from "@/components/stats/figures";
import { Words } from "@/components/stats/charge-supply";
import { Bars } from "@/components/stats/bars";
import { DEMO } from "@/lib/demo";
import { formatCount, formatHour, formatNumber } from "@/lib/format";
import {
  batteryLine,
  binWords,
  busiestHour,
  type Card,
  CARDS,
  carsWords,
  type ChoiceMetric,
  type ChoiceStat,
  edgeWords,
  factLine,
  rangeWords,
  halfLine,
  type Highlight,
  highlights,
  hourWords,
  hoursLine,
  type HoursStat,
  type HoursValue,
  MIN_CARS,
  metric,
  type MetricKey,
  nightLine,
  optionLabel,
  percentOf,
  SECTIONS,
  SETTING_GROUPS,
  settingLine,
  sentryLine,
  type SpreadMetric,
  type SpreadStat,
  type Stat,
  topLine,
  valueWords,
  viewerStat,
  viewerValue,
  youChoiceLine,
  youHoursLine,
  youLine,
} from "@/lib/owners";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadOwners, type OwnersPage } from "@/lib/server/owners";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Owners" };

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadOwnersPage(): Promise<OwnersPage> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return loadOwners(owner, Date.now());
}

type Ready = Extract<OwnersPage, { kind: "ready" }>;

// The stat a metric is compared with for this owner, and their own value (lib/owners.ts viewerStat).
const statOf = (page: Ready, key: MetricKey): Stat | null => viewerStat(page.stats, key, page);
const yours = (page: Ready, key: MetricKey) => viewerValue(key, page);

function spreadBins(m: SpreadMetric, stat: SpreadStat, you: number | null): SpreadBin[] {
  const mine = you === null ? -1 : stat.bins.findIndex((b) => (b.from === null || you >= b.from) && (b.to === null || you < b.to));
  return stat.bins.map((b, k) => ({
    key: String(k),
    span: binWords(m, b),
    axis: b.from === null ? "" : edgeWords(m, b.from),
    cars: b.cars,
    middle: (b.from ?? -Infinity) < stat.high && (b.to ?? Infinity) > stat.low,
    you: k === mine,
  }));
}

function SpreadChart({ m, stat, you, title }: { m: SpreadMetric; stat: SpreadStat; you: number | null; title: string }) {
  const unit = m.axis ?? m.unit;
  return <Spread bins={spreadBins(m, stat, you)} unit={unit.length <= 5 ? unit : undefined} label={`${title}, cars in each range`} />;
}

const spreadLines = (m: SpreadMetric, stat: SpreadStat, you: number | null) => [halfLine(m, stat), you === null ? null : youLine(m, you, stat)].filter(Boolean).join(" ");

// One row per option with a bar for its share, the owner's own marked. A mix (speeds) shows the owners'
// average share and a tick at the owner's own.
function ChoiceRows({ m, stat, you, tight = false }: { m: ChoiceMetric; stat: ChoiceStat; you: string | number[] | null; tight?: boolean }) {
  const keys = Array.isArray(m.options) ? m.options.map((o) => o.key) : [];
  return (
    <ul className={cn("divide-y", !tight && "border-t")}>
      {stat.options.map((o) => {
        const mine = typeof you === "string" && you === o.key;
        const tick = m.mix && Array.isArray(you) ? (you[keys.indexOf(o.key)] ?? 0) : null;
        const share = percentOf(o.share);
        const lines = m.mix ? [`${share} of driving time`, ...(tick !== null ? [`Yours ${percentOf(tick)}`] : [])] : [`${share} of owners`, ...(mine ? ["Yours"] : [])];
        return (
          <li key={o.key} className={cn("space-y-1.5", tight ? "py-1.5" : "py-2.5")}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className={cn("min-w-0", mine && "font-medium")}>
                {optionLabel(m, o.key)}
                {mine && <span className="ml-2 text-xs font-medium text-chart-you">You</span>}
              </span>
              <span className="shrink-0 text-right tabular-nums">
                {tick !== null && <span className="font-medium text-chart-you">You {percentOf(tick)} · </span>}
                <span className="font-mono">{share}</span>
              </span>
            </div>
            <OptionBar share={o.share} strong={mine} tick={tick} lines={lines} />
          </li>
        );
      })}
    </ul>
  );
}

// 24 columns of the share by IST hour, the owner's busiest hour drawn strong.
function HoursChart({ stat, you, words, label }: { stat: HoursStat; you: HoursValue | null; words: string; label: string }) {
  const mine = you ? busiestHour(you.shares) : -1;
  return (
    <Bars
      ariaLabel={label}
      unit="%"
      labelEvery={1}
      fit
      valueWords={words}
      bars={stat.shares.map((share, h) => ({
        key: String(h),
        label: hourWords(h),
        axis: formatHour(h),
        edge: true,
        value: share * 100,
        display: formatNumber(share * 100, 0),
        isCurrent: h === mine,
        tip: h === mine ? "Your busiest hour" : undefined,
      }))}
    />
  );
}

// A switch or setting in a list: the share of owners with it on, and the owner's own.
function ListRow({ page, keyName }: { page: Ready; keyName: MetricKey }) {
  const m = metric(keyName) as ChoiceMetric;
  const stat = statOf(page, keyName);
  if (stat?.kind !== "choice") return null;
  const you = yours(page, keyName) as string | null;
  const isSwitch = Array.isArray(m.options) && m.options.length === 2 && m.options[0].key === "on";
  if (!isSwitch) {
    return (
      <li className="space-y-1 pt-5 pb-2 first:pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
          <span className="font-medium">{m.label}</span>
          {you && <span className="font-medium text-chart-you">You: {optionLabel(m, you).toLowerCase()}</span>}
        </div>
        <ChoiceRows m={m} stat={stat} you={you} tight />
      </li>
    );
  }
  const on = stat.options.find((o) => o.key === "on")?.share ?? 0;
  const yes = m.yes ?? "on";
  const no = m.yes ? `not ${m.yes}` : "off";
  return (
    <li className="space-y-1.5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
        <span>{m.label}</span>
        <span className="text-muted-foreground tabular-nums">
          <span className="font-mono text-foreground">{percentOf(on)}</span> of owners
          {you && <> · You: {you === "on" ? yes : no}</>}
        </span>
      </div>
      <OptionBar share={on} strong={you === "on"} lines={[`${percentOf(on)} of owners`, `${Math.round(on * stat.cars)} of ${carsWords(stat.cars)}`]} />
    </li>
  );
}

// A card's figure count, under its chart.
const count = (stat: Stat) => carsWords(stat.cars);

// One card, or null when too few cars have its figure. A plain function, so a section knows it's empty.
function ownerCard(card: Card, page: Ready): ReactNode {
  const title = card.title ?? "";
  if (card.list) {
    const list = (keys: MetricKey[]) => (
      <ul className="divide-y border-t">
        {keys.map((k) => (
          <ListRow key={k} page={page} keyName={k} />
        ))}
      </ul>
    );
    // The settings: one row per group, opening to its settings, so the list isn't one long scroll.
    if (card.key === "settings") {
      const groups = SETTING_GROUPS.flatMap((g) => {
        const keys = g.metrics.filter((k) => statOf(page, k));
        if (keys.length === 0) return [];
        const lead = statOf(page, g.lead);
        return [{ ...g, keys, line: lead ? settingLine(g.lead, lead) : null }];
      });
      if (groups.length === 0) return null;
      return groups.map((g) => (
        <ChartCard key={g.key} fold as="h3" title={g.title} description={g.line}>
          {list(g.keys)}
        </ChartCard>
      ));
    }
    const rows = card.metrics.filter((k) => statOf(page, k));
    if (rows.length === 0) return null;
    return card.title ? (
      <ChartCard fold as="h3" title={title} info={card.info} description="Which of these owners used, with yours.">
        {list(rows)}
      </ChartCard>
    ) : (
      list(rows)
    );
  }

  if (card.key === "sentry") {
    const used = statOf(page, "sentryUsed");
    const hours = statOf(page, "sentryHours");
    if (used?.kind !== "choice") return null;
    const m = metric("sentryHours") as SpreadMetric;
    const you = yours(page, "sentryHours") as number | null;
    const lines = [sentryLine(used.options.find((o) => o.key === "on")?.share ?? 0), hours?.kind === "spread" ? spreadLines(m, hours, you) : null].filter(Boolean).join(" ");
    return (
      <ChartCard fold as="h3" title={title} info={card.info} description={lines} caption={hours ? count(hours) : count(used)}>
        {hours?.kind === "spread" && <SpreadChart m={m} stat={hours} you={you} title={title} />}
      </ChartCard>
    );
  }

  if (card.key === "installs") {
    const wait = statOf(page, "installWait");
    if (wait?.kind !== "choice") return null;
    const night = statOf(page, "installNight");
    const m = metric("installWait") as ChoiceMetric;
    const you = yours(page, "installWait") as string | null;
    const lines = [topLine(m, wait), you ? youChoiceLine(m, you) : null, night?.kind === "share" ? nightLine(night.share) : null].filter(Boolean).join(" ");
    return (
      <ChartCard fold as="h3" title={title} description={lines} caption={count(wait)}>
        <ChoiceRows m={m} stat={wait} you={you} />
      </ChartCard>
    );
  }

  const charts = card.metrics.flatMap((key) => {
    const stat = statOf(page, key);
    return stat ? [{ key, m: metric(key), stat, you: yours(page, key) }] : [];
  });
  if (charts.length === 0) return null;

  // Two histograms in one card (front and rear tyres): each with its own line.
  if (charts.length > 1) {
    return (
      <ChartCard fold as="h3" title={title} info={card.info} description={charts.map(({ m, stat, you }) => (m.kind === "spread" && stat.kind === "spread" ? spreadLines(m, stat, you as number | null) : "")).join(" ")} caption={count(charts[0].stat)}>
        <div className="space-y-6">
          {charts.map(({ key, m, stat, you }) =>
            m.kind === "spread" && stat.kind === "spread" ? (
              <div key={key} className="space-y-3">
                <p className="text-sm text-muted-foreground">{spreadLines(m, stat, you as number | null)}</p>
                <SpreadChart m={m} stat={stat} you={you as number | null} title={title} />
              </div>
            ) : null,
          )}
        </div>
      </ChartCard>
    );
  }

  const { key, m, stat, you } = charts[0];
  if (m.kind === "spread" && stat.kind === "spread") {
    return (
      <ChartCard fold as="h3" title={title} info={card.info} description={spreadLines(m, stat, you as number | null)} caption={count(stat)}>
        <SpreadChart m={m} stat={stat} you={you as number | null} title={title} />
      </ChartCard>
    );
  }
  if (m.kind === "choice" && stat.kind === "choice") {
    const mine = typeof you === "string" ? youChoiceLine(m, you) : null;
    return (
      <ChartCard
        fold
        as="h3"
        title={title}
        info={card.info}
        description={[topLine(m, stat), mine].filter(Boolean).join(" ")}
        summary={m.segment === "battery" ? <p className="text-sm text-muted-foreground">{batteryLine(page.lfp)}</p> : undefined}
        caption={count(stat)}
      >
        <ChoiceRows m={m} stat={stat} you={you as string | number[] | null} />
      </ChartCard>
    );
  }
  if (m.kind === "hours" && stat.kind === "hours") {
    const value = you as HoursValue | null;
    return (
      <ChartCard fold as="h3" title={title} info={card.info} description={[hoursLine(key, stat), value ? youHoursLine(key, value) : null].filter(Boolean).join(" ")} caption={count(stat)}>
        <HoursChart stat={stat} you={value} words={key === "plugHours" ? "of plug-ins" : "of driving"} label={title} />
      </ChartCard>
    );
  }
  return null;
}

const heading = "text-lg font-medium tracking-heading";

// The questions the page answers, so an owner sees what sharing gets them before they share. No figures:
// those only exist for owners who share.
const ANSWERS = [
  "Is my energy use normal for my model?",
  "How full do other owners charge?",
  "When do owners plug in and drive?",
  "How many keep Sentry Mode on?",
  "Which safety warnings do owners turn off?",
  "How fast do they install updates?",
];

const PROMISES: { icon: typeof Users; text: string }[] = [
  { icon: Users, text: "Your car is only counted with at least 4 others, never shown alone" },
  { icon: EyeOff, text: "Nobody sees your car, trips or places" },
  { icon: Trash2, text: "Turn it off in Settings and your figures are deleted" },
];

// What sharing means, and the way in. Owners who don't share see no figures.
function NotSharing({ sharers }: { sharers: number }) {
  return (
    <section className="space-y-8 border p-5 sm:p-8">
      <div className="space-y-2">
        <h2 className={heading}>See how your Tesla compares</h2>
        <p className="text-sm text-muted-foreground">Share your car&apos;s figures and this page answers questions like these, with your car marked.</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ANSWERS.map((q) => (
          <li key={q} className="bg-muted px-3 py-2.5 text-sm dark:bg-card">
            {q}
          </li>
        ))}
      </ul>
      <ul className="space-y-2.5">
        {PROMISES.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <Icon className="size-4 shrink-0 text-faint" aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ShareButton />
        {sharers > 0 && <p className="text-sm text-faint">{sharers === 1 ? "1 owner shares so far" : `${sharers} owners share so far`}</p>}
      </div>
    </section>
  );
}

function Waiting({ sharers }: { sharers: number }) {
  return (
    <section className="space-y-1">
      <h2 className={heading}>{sharers < MIN_CARS ? `${sharers} of ${MIN_CARS} owners sharing so far` : "Totals on the way"}</h2>
      <p className="text-sm text-muted-foreground">
        {sharers < MIN_CARS ? `This page fills in once ${MIN_CARS} owners share.` : "The first totals come with the next update, at 3:30 AM."}
      </p>
    </section>
  );
}

async function Owners() {
  const page = await loadOwnersPage();
  if (page.kind === "off") return <NotSharing sharers={page.sharers} />;
  if (page.kind === "waiting") return <Waiting sharers={page.sharers} />;
  const sections = SECTIONS.map((section) => ({
    ...section,
    cards: CARDS.filter((c) => c.section === section.key)
      .map((card) => ({ key: card.key, node: ownerCard(card, page) }))
      .filter((c) => c.node !== null),
  })).filter((s) => s.cards.length > 0);
  const picks = highlights(page.stats, page);
  const facts = factLine(page.stats, formatHour);
  return (
    <div className="space-y-10">
      {/* That the owner shares, in a box of its own so it isn't missed, with the way to stop on the right. */}
      <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border px-4 py-3">
        <p className="min-w-0 flex-1 text-sm">You&apos;re sharing. Your car is part of these totals.</p>
        <StopSharing />
      </section>
      <div className="space-y-6">
        {/* Who's in the figures and over what: the page's period, named once. */}
        <Figures
          figures={[
            { label: "Owners sharing", value: formatCount(page.stats.owners) },
            { label: "Cars", value: formatCount(page.stats.cars), note: page.you ? undefined : "Yours join after the next update" },
            { label: "Covers", value: <Words>Last 30 days</Words>, note: "Updated daily at 3:30 AM" },
          ]}
        />
        {picks.length > 0 && (
          <section className="space-y-3">
            <h2 className={heading}>Picked for you</h2>
            <ul className="space-y-3">
              {picks.map((h) => (
                <li key={h.key} className="space-y-4 border p-4">
                  <p className="text-sm">{h.line}</p>
                  <HighlightVisual h={h} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {facts && <p className="text-sm text-muted-foreground">{facts}</p>}
      </div>
      {/* Every comparison, closed until asked for: the highlights above are the page's answer. */}
      <details className="group/all">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span className="group-open/all:hidden">See all comparisons</span>
          <span className="hidden group-open/all:inline">Hide all comparisons</span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform duration-150 group-open/all:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-14 pt-8">
          {sections.map((s) => (
            <section key={s.key} className="space-y-3">
              <div className="space-y-1">
                <h2 className={heading}>{s.title}</h2>
                {s.key === "yours" && page.group && <p className="text-sm text-muted-foreground">{page.group}, like yours.</p>}
              </div>
              {/* One row per question: its answer reads closed, the chart opens on a tap. */}
              <div className="border-t">
                {s.cards.map((c) => (
                  <div key={c.key}>{c.node}</div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </details>
      {DEMO && <p className="text-xs text-faint">Demo mode: a made-up set of 40 cars, with the demo car as yours.</p>}
    </div>
  );
}

// A highlight's visual: owners' middle half as a band with the owner's figure as a dot, or each option's share
// of owners as a stretch of one bar with the owner's own drawn strong.
function HighlightVisual({ h }: { h: Highlight }) {
  const m = metric(h.key);
  if (h.kind === "spread" && m.kind === "spread") {
    const bins = h.stat.bins;
    const width = bins.find((b) => b.from !== null && b.to !== null);
    const step = width ? width.to! - width.from! : m.step;
    // An open end bin has no edge: the line runs a step past the inner one.
    const from = Math.min(bins[0].from ?? bins[0].to! - step, h.stat.low);
    const to = Math.max(bins[bins.length - 1].to ?? bins[bins.length - 1].from! + step, h.stat.high);
    const unit = m.unit === "%" ? "" : ` ${m.axis ?? m.unit}`;
    return (
      <BandBar
        from={from}
        to={to}
        low={h.stat.low}
        high={h.stat.high}
        value={h.value}
        lines={[`Yours ${valueWords(m, h.value)}`, `Half of owners ${rangeWords(m, h.stat.low, h.stat.high)}`]}
        ends={[edgeWords(m, from), `${edgeWords(m, to)}${unit}`]}
      />
    );
  }
  if (h.kind === "choice" && m.kind === "choice") {
    return (
      <ShareStrip
        options={h.stat.options.map((o) => ({
          key: o.key,
          label: optionLabel(m, o.key),
          share: o.share,
          yours: o.key === h.value,
          lines: [optionLabel(m, o.key), `${percentOf(o.share)} of owners`, ...(o.key === h.value ? ["Yours"] : [])],
        }))}
      />
    );
  }
  return null;
}

// The page's shape while it loads: the sharing line, the period line, the highlights and the facts, then the
// closed "See all comparisons", each block at its height on the demo (4 highlights; phone, then sm and up), so
// the loading page is as long as the page.
function OwnersSkeleton() {
  return (
    <Loading className="space-y-10">
      <div className="flex h-[102px] flex-wrap items-center justify-between gap-x-4 gap-y-3 border px-4 py-3 sm:h-[58px]">
        <p className="text-sm">
          <Ph>You&apos;re sharing. Your car is part of these totals.</Ph>
        </p>
        <p className="text-sm">
          <Ph>Stop sharing</Ph>
        </p>
      </div>
      <div className="h-[1108.5px] space-y-6 overflow-hidden sm:h-[704px]">
        <SkFigures
          tiles={[
            { label: "Owners sharing", value: "39" },
            { label: "Cars", value: "40" },
            { label: "Covers", value: "Last 30 days", note: "Updated daily at 3:30 AM", words: true },
          ]}
        />
        <div className="space-y-3">
          <p className={heading}>
            <Ph>Picked for you</Ph>
          </p>
          {Array.from({ length: 4 }, (_, k) => (
            <div key={k} className="h-[159px] space-y-4 border p-4 sm:h-[109px]">
              <p className="text-sm">
                <Ph>You charge to 80%. Most owners with your battery charge to 100%.</Ph>
              </p>
              <Ph className="block h-1.5 w-full">{" "}</Ph>
            </div>
          ))}
        </div>
      </div>
      <p className="h-6 text-sm sm:h-5">
        <Ph>See all comparisons</Ph>
      </p>
    </Loading>
  );
}

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="car" />
      <CarTabs value="owners" />
      <Suspense fallback={<OwnersSkeleton />}>
        <Owners />
      </Suspense>
    </div>
  );
}
