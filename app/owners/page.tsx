import { ChevronDown, EyeOff, Trash2, Users } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { CarTabs } from "@/components/car-tabs";
import { ChartCard } from "@/components/chart-card";
import { Header } from "@/components/header";
import { OptionBar } from "@/components/owners/option-bar";
import { BandBar, HourStrip, ShareStrip } from "@/components/owners/highlight-bar";
import { ShareButton } from "@/components/owners/share-controls";
import { Loading, Ph, SkFigures } from "@/components/skeleton";
import { Figures } from "@/components/stats/figures";
import { Words } from "@/components/stats/charge-supply";
import { DEMO } from "@/lib/demo";
import { formatCount, formatHour } from "@/lib/format";
import {
  batteryLine,
  busiestHour,
  type Card,
  CARDS,
  OFF_PAGE,
  carsWords,
  type ChoiceMetric,
  type ChoiceStat,
  bandEnds,
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
import { requireReader } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadOwners, type OwnersPage } from "@/lib/server/owners";
import { GuestNotSharing, GuestSharingLine } from "@/components/owners/guest-lines";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const metadata: Metadata = { title: "Compare" };

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
// guest: someone the owner sent a guest link, who gets no Share button and no way to Settings.
async function loadOwnersPage(): Promise<{ page: OwnersPage; guest: boolean }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const { owner } = await requireReader();
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return { page: await loadOwners(owner, Date.now()), guest: owner.viewOnly === true };
}

type Ready = Extract<OwnersPage, { kind: "ready" }>;

// The stat a metric is compared with for this owner, and their own value (lib/owners.ts viewerStat).
const statOf = (page: Ready, key: MetricKey): Stat | null => viewerStat(page.stats, key, page);
const yours = (page: Ready, key: MetricKey) => viewerValue(key, page);

// A range's picture: the line from the lowest to the highest bin, owners' middle half as a band on it, and
// the owner's own figure as a dot (none when their car isn't in this group).
function bandProps(m: SpreadMetric, stat: SpreadStat, you: number | null) {
  const [start, end] = bandEnds(m, stat);
  const from = Math.min(start, stat.low, you ?? Infinity);
  const to = Math.max(end, stat.high, you ?? -Infinity);
  const unit = m.unit === "%" ? "" : ` ${m.axis ?? m.unit}`;
  return {
    from,
    to,
    low: stat.low,
    high: stat.high,
    value: you,
    lines: [...(you !== null ? [`Yours ${valueWords(m, you)}`] : []), `Half of owners ${rangeWords(m, stat.low, stat.high)}`],
    ends: [edgeWords(m, from), `${edgeWords(m, to)}${unit}`] as [string, string],
  };
}

function SpreadChart({ m, stat, you }: { m: SpreadMetric; stat: SpreadStat; you: number | null; title: string }) {
  return <BandBar {...bandProps(m, stat, you)} />;
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
    <HourStrip
      shares={stat.shares}
      mine={mine}
      label={label}
      lines={stat.shares.map((share, h) => [hourWords(h), `${percentOf(share)} ${words}`, ...(h === mine ? ["Your busiest hour"] : [])])}
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
      <ChartCard fold as="h3" title={title} info={card.info} description={lines}>
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
      <ChartCard fold as="h3" title={title} description={lines}>
        <ShareStrip
          options={wait.options.map((o) => ({
            key: o.key,
            label: optionLabel(m, o.key),
            share: o.share,
            yours: o.key === you,
            lines: [optionLabel(m, o.key), `${percentOf(o.share)} of owners`, ...(o.key === you ? ["Yours"] : [])],
          }))}
        />
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
      <ChartCard fold as="h3" title={title} info={card.info} description={charts.map(({ m, stat, you }) => (m.kind === "spread" && stat.kind === "spread" ? spreadLines(m, stat, you as number | null) : "")).join(" ")}>
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
      <ChartCard fold as="h3" title={title} info={card.info} description={spreadLines(m, stat, you as number | null)}>
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
       
      >
        {m.mix ? (
          <ChoiceRows m={m} stat={stat} you={you as number[] | null} />
        ) : (
          <ShareStrip
            options={stat.options.map((o) => ({
              key: o.key,
              label: optionLabel(m, o.key),
              share: o.share,
              yours: o.key === you,
              lines: [optionLabel(m, o.key), `${percentOf(o.share)} of owners`, ...(o.key === you ? ["Yours"] : [])],
            }))}
          />
        )}
      </ChartCard>
    );
  }
  if (m.kind === "hours" && stat.kind === "hours") {
    const value = you as HoursValue | null;
    return (
      <ChartCard fold as="h3" title={title} info={card.info} description={[hoursLine(key, stat), value ? youHoursLine(key, value) : null].filter(Boolean).join(" ")}>
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
    <section className="space-y-8 rounded-lg border p-5 sm:p-8">
      <div className="space-y-2">
        <h2 className={heading}>See how your Tesla compares</h2>
        <p className="text-sm text-muted-foreground">Share your car&apos;s figures and this page answers questions like these, with your car marked.</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ANSWERS.map((q) => (
          <li key={q} className="rounded-md bg-muted px-3 py-2.5 text-sm dark:bg-card">
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

// The line that says the owner shares. Stopping is only in Settings, so it links there.
function SharingOn({ text }: { text: string }) {
  return (
    <p className="min-w-0 flex-1 text-sm">
      {text} Stop any time in{" "}
      <Link href="/settings#share" className="tap-target underline decoration-muted-foreground/60 underline-offset-4">
        Settings
      </Link>
      .
    </p>
  );
}

// Sharing, but too few owners are in the totals yet: how far along it is, as one step per owner needed,
// and what the page will answer once it fills in.
function Waiting({ counted, guest = false }: { counted: number; guest?: boolean }) {
  const short = counted < MIN_CARS;
  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border px-4 py-3">
        {guest ? <GuestSharingLine text="The owner shares this car's figures. It will be part of the totals." /> : <SharingOn text="You're sharing. Your car will be part of the totals." />}
      </section>
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className={heading}>{short ? `${counted} of ${MIN_CARS} owners counted` : "Totals on the way"}</h2>
          <p className="text-sm text-muted-foreground">
            {short
              ? `Figures show once ${MIN_CARS} owners' cars are counted, so no one's car stands alone. Cars are counted at 3:30 AM each day.`
              : "The totals come with the next update, at 3:30 AM."}
          </p>
        </div>
        {short && (
          <div className="flex gap-1.5" role="img" aria-label={`${counted} of ${MIN_CARS} owners counted`}>
            {Array.from({ length: MIN_CARS }, (_, k) => (
              <span key={k} className={cn("h-1.5 flex-1 rounded-full", k < counted ? "bg-chart-you" : "bg-muted dark:bg-card")} />
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className={heading}>What you&apos;ll see</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {ANSWERS.map((q) => (
            <li key={q} className="rounded-md bg-muted px-3 py-2.5 text-sm dark:bg-card">
              {q}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

async function Owners() {
  const { page, guest } = await loadOwnersPage();
  if (page.kind === "off") return guest ? <GuestNotSharing /> : <NotSharing sharers={page.sharers} />;
  if (page.kind === "waiting") return <Waiting counted={page.counted} guest={guest} />;
  const sections = SECTIONS.map((section) => ({
    ...section,
    cards: CARDS.filter((c) => c.section === section.key && !OFF_PAGE.has(c.key))
      .map((card) => ({ key: card.key, node: ownerCard(card, page) }))
      .filter((c) => c.node !== null),
  })).filter((s) => s.cards.length > 0);
  const picks = highlights(page.stats, page);
  const facts = factLine(page.stats, formatHour);
  return (
    <div className="space-y-10">
      {/* That the owner shares, in a box of its own so it isn't missed, with the way to stop in Settings. */}
      <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border px-4 py-3">
        {guest ? <GuestSharingLine text="The owner shares this car's figures. It's part of these totals." /> : <SharingOn text="You're sharing. Your car is part of these totals." />}
      </section>
      <div className="space-y-6">
        {/* Who's in the figures and over what: the page's period, named once. */}
        <Figures
          figures={[
            { label: "Owners sharing", value: formatCount(page.stats.owners) },
            { label: "Cars", value: formatCount(page.stats.cars), note: page.you ? undefined : "Yours join after the next update" },
            { label: "Period", value: <Words>Last 30 days</Words>, note: "Updated daily at 3:30 AM" },
          ]}
        />
        {picks.length > 0 && (
          <section className="space-y-3">
            <h2 className={heading}>Picked for you</h2>
            <ul className="space-y-3">
              {picks.map((h) => (
                <li key={h.key} className="space-y-4 rounded-lg border p-4">
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
      <Collapsible className="group/all">
        <CollapsibleTrigger className="tap-target flex cursor-pointer items-center gap-1.5 text-sm font-medium">
          <span className="group-data-open/all:hidden">See all comparisons</span>
          <span className="hidden group-data-open/all:inline">Hide all comparisons</span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform motion-reduce:transition-none duration-150 group-data-open/all:rotate-180" aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-14 pt-8">
          {sections.map((s) => (
            <section key={s.key} className="space-y-3">
              <div className="space-y-1">
                <h2 className={heading}>{s.title}</h2>
                {s.key === "yours" && page.group && <p className="text-sm text-muted-foreground">{page.group}, like yours.</p>}
              </div>
              {/* One row per question: its answer reads closed, the chart opens on a tap. */}
              <div className="divide-y">
                {s.cards.map((c) => (
                  <div key={c.key}>{c.node}</div>
                ))}
              </div>
            </section>
          ))}
        </CollapsibleContent>
      </Collapsible>
      {DEMO && <p className="text-xs text-faint">Demo mode: a made-up set of 40 cars, with the demo car as yours.</p>}
    </div>
  );
}

// A highlight's visual: owners' middle half as a band with the owner's figure as a dot, or each option's share
// of owners as a stretch of one bar with the owner's own drawn strong.
function HighlightVisual({ h }: { h: Highlight }) {
  const m = metric(h.key);
  if (h.kind === "spread" && m.kind === "spread") return <BandBar {...bandProps(m, h.stat, h.value)} />;
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
      <div className="flex h-[102px] flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border px-4 py-3 sm:h-[58px]">
        <p className="text-sm">
          <Ph>You&apos;re sharing. Your car is part of these totals. Stop any time in Settings.</Ph>
        </p>
      </div>
      <div className="h-[1108.5px] space-y-6 overflow-hidden sm:h-[704px]">
        <SkFigures
          tiles={[
            { label: "Owners sharing", value: "39" },
            { label: "Cars", value: "40" },
            { label: "Period", value: "Last 30 days", note: "Updated daily at 3:30 AM", words: true },
          ]}
        />
        <div className="space-y-3">
          <p className={heading}>
            <Ph>Picked for you</Ph>
          </p>
          {Array.from({ length: 4 }, (_, k) => (
            <div key={k} className="h-[159px] space-y-4 rounded-lg border p-4 sm:h-[109px]">
              <p className="text-sm">
                <Ph>You charge to 80%. Most owners with the same battery charge to 100%.</Ph>
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
