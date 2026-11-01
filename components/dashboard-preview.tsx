"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { Bar, FigureStage, SATELLITE, SURFACE } from "@/components/home/figure";

// The home page hero: a crop of Uplink's own Home as an update reaches the car. It downloads, installs,
// the version line rolls to the new version and the Software version chart steps up. It plays once when
// it comes into view and holds the result; with reduced motion it shows the result straight away.
// Real Tesla versions; the dates and odometer are illustrative. It reads no data.

const FROM = "2026.38.3.1";
const TO = "2026.38.5.1";
const ODOMETER = "24,082 km";

// Version steps for the small chart, oldest first: x is the share of the period, the new one arrives last.
const STEPS = [
  { x: 0, level: 0 },
  { x: 0.3, level: 1 },
  { x: 0.55, level: 2 },
  { x: 0.8, level: 3 },
];
const NEW_STEP = { x: 0.93, level: 4 };

type Phase = "downloading" | "installing" | "installed";

const DOWNLOAD_FROM = 42;
const TIMING = { start: 700, download: 3000, gap: 500, install: 2200, settle: 400 };

export type HeroLook = "corner" | "dark" | "fade" | "wide";

// This week's tiles, as the real Home shows them; used only where the page is shown wide enough to read.
const WEEK = [
  { label: "Driven", value: "293.5", unit: "km" },
  { label: "Energy added", value: "42.2", unit: "kWh" },
  { label: "Spent", value: "₹318.24", unit: "" },
];

// The dark look sets the app's dark colours on this picture only: lighter surfaces on a near-black stage.
const DARK = {
  "--background": "#141414",
  "--foreground": "#f3f3f3",
  "--muted": "#1f1f1f",
  "--muted-foreground": "#b4b4b4",
  "--faint": "#949494",
  "--border": "#2a2a2a",
  "--chart-accent": "#5f93d6",
} as React.CSSProperties;

export function DashboardPreview({ look = "corner" }: { look?: HeroLook }) {
  const root = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("downloading");
  const [pct, setPct] = useState(DOWNLOAD_FROM);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("installed");
      return;
    }
    let frame = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Count a percentage from `from` to 100 over `ms`, eased out like a real transfer settling.
    const count = (from: number, ms: number, done: () => void) => {
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / ms);
        setPct(Math.round(from + (100 - from) * (1 - (1 - k) ** 2)));
        if (k < 1) frame = requestAnimationFrame(tick);
        else done();
      };
      frame = requestAnimationFrame(tick);
    };
    const play = () => {
      timers.push(
        setTimeout(
          () =>
            count(DOWNLOAD_FROM, TIMING.download, () =>
              timers.push(
                setTimeout(() => {
                  setPhase("installing");
                  setPct(0);
                  count(0, TIMING.install, () => timers.push(setTimeout(() => setPhase("installed"), TIMING.settle)));
                }, TIMING.gap),
              ),
            ),
          TIMING.start,
        ),
      );
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          play();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
    };
  }, []);

  const done = phase === "installed";
  const wide = look === "wide";
  const fade = look === "fade";

  // Per look: the outer width, the stage, the page's place in it and the chart card's place.
  const outer = wide ? "w-full max-w-5xl" : "w-full max-w-[560px]";
  const stage = {
    corner: "h-[436px] sm:h-[420px]",
    dark: "h-[436px] sm:h-[420px] bg-[#0b0b0b]",
    fade: "h-[436px] sm:h-[440px] bg-transparent",
    wide: "h-[436px] sm:h-[460px]",
  }[look];
  const page = {
    corner: "top-5 left-5 w-[420px] sm:top-8 sm:left-[120px] sm:w-[600px]",
    dark: "top-5 left-5 w-[420px] sm:top-8 sm:left-[120px] sm:w-[600px]",
    fade: "top-0 left-0 h-[436px] w-[calc(100%-24px)] sm:h-[440px] sm:w-[calc(100%-72px)] [mask-image:linear-gradient(to_bottom,black_58%,transparent_96%)]",
    wide: "top-5 left-5 w-[420px] sm:top-10 sm:left-[6%] sm:w-[1000px]",
  }[look];
  const card = {
    corner: "top-[252px] left-5 sm:top-[236px]",
    dark: "top-[252px] left-5 sm:top-[236px]",
    fade: "top-[252px] right-0 sm:top-[214px]",
    wide: "top-[252px] left-5 sm:top-[250px] sm:right-[5%] sm:left-auto",
  }[look];

  return (
    <div ref={root} className={`${outer} ${look === "dark" ? "text-foreground" : ""}`} style={look === "dark" ? DARK : undefined}>
      <FigureStage className={stage}>
        {/* The page, cropped: whole at the top and left, running off the right and bottom (or fading out at its foot). */}
        <div className={`absolute overflow-hidden rounded-xl ${page} ${SURFACE}`}>
          <div className="hidden h-9 items-center gap-3 border-b px-3.5 sm:flex">
            <span className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-muted-foreground/25" />
              <span className="size-2.5 rounded-full bg-muted-foreground/25" />
              <span className="size-2.5 rounded-full bg-muted-foreground/25" />
            </span>
            <span className="rounded-md bg-muted px-3 py-0.5 text-xs text-faint">getuplink.in</span>
          </div>
          <div className="flex h-12 items-center justify-between px-4 text-sm sm:px-6">
            <span className="flex items-center gap-2 font-medium">
              <Logo className="size-4" />
              Uplink
            </span>
            {wide ? (
              <span className="hidden gap-5 pr-10 text-muted-foreground sm:flex">
                <span>Driving</span>
                <span>Charging</span>
                <span>Battery</span>
                <span>Car</span>
              </span>
            ) : (
              <span className={`hidden gap-4 sm:flex ${fade ? "" : "pr-[220px]"}`}>
                <Bar className="w-10" />
                <Bar className="w-12" />
                <Bar className="w-9" />
              </span>
            )}
          </div>

          <div className={`px-4 pt-3 pb-40 sm:pt-5 ${wide ? "sm:px-10" : "sm:px-6"}`}>
            <p className="text-xs text-faint">Model Y · Diamond Black</p>
            {/* The Home banner: the version the car runs, and the update on its way. */}
            <div className="mt-3 w-[268px] rounded-lg border px-3.5 py-3 text-[13px] sm:w-[300px] sm:px-4 sm:text-sm">
              <p className="flex items-baseline gap-1 tabular-nums">
                <span className="relative inline-block h-5 overflow-hidden">
                  <span
                    className="flex flex-col transition-transform duration-500 ease-out"
                    style={{ transform: done ? "translateY(-50%)" : "translateY(0)" }}
                  >
                    <span className="h-5 leading-5">{FROM}</span>
                    <span className="h-5 leading-5">{TO}</span>
                  </span>
                </span>
                <span className="text-muted-foreground">· {ODOMETER}</span>
              </p>
              {/* The update line folds away once it's installed, as it does on Home. */}
              <div
                className="grid transition-[grid-template-rows,opacity] duration-500 ease-out"
                style={{ gridTemplateRows: done ? "0fr" : "1fr", opacity: done ? 0 : 1 }}
              >
                <div className="overflow-hidden">
                  <p className="mt-1 flex items-baseline justify-between gap-3 text-muted-foreground tabular-nums">
                    <span className="truncate">
                      {phase === "installing" ? "Installing" : "Downloading"} {TO}
                    </span>
                    <span className="font-mono text-xs">{pct}%</span>
                  </p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* This week's tiles: real figures at full width, filler elsewhere. */}
            {wide ? (
              <div className="mt-8 hidden w-[600px] grid-cols-3 gap-3 sm:grid">
                {WEEK.map((t) => (
                  <div key={t.label} className="rounded-lg border px-4 py-3.5">
                    <p className="text-xs text-muted-foreground">{t.label}</p>
                    <p className="mt-1.5 font-mono text-2xl tracking-tight tabular-nums">
                      {t.value}
                      {t.unit && <span className="ml-1 font-sans text-xs tracking-normal text-faint">{t.unit}</span>}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <div className={`mt-6 grid w-[520px] grid-cols-3 gap-3 ${wide ? "sm:hidden" : ""}`}>
              {[44, 36, 52].map((w) => (
                <div key={w} className="rounded-lg border px-4 py-3.5">
                  <Bar className="w-14" />
                  <span className="mt-3 block h-4 rounded bg-muted-foreground/15" style={{ width: w }} />
                  <Bar className="mt-3 w-20 opacity-60" />
                </div>
              ))}
            </div>
            {/* The charge level chart below, as filler: the page carries on past the crop. */}
            <Bar className="mt-8 w-28" />
            <Bar className="mt-3 w-48 opacity-60" />
            <div className="mt-4 h-40 w-[520px] rounded-lg bg-muted sm:w-[600px]" />
          </div>
        </div>

        {/* The Software version chart, across the page's edge: the new step lands as the update does. */}
        <div className={`absolute w-[196px] rounded-xl px-3.5 pt-3 pb-3.5 sm:w-[208px] sm:px-4 ${card} ${SATELLITE}`}>
          <p className="text-xs font-medium">Software version</p>
          <VersionSteps done={done} />
          <p className="mt-2 flex items-baseline justify-between text-xs tabular-nums">
            <span className="text-faint">Jun</span>
            <span
              className="font-mono text-chart-accent transition-opacity duration-500"
              style={{ opacity: done ? 1 : 0, transitionDelay: done ? "500ms" : "0ms" }}
            >
              {TO}
            </span>
          </p>
        </div>
      </FigureStage>
    </div>
  );
}

// A step line in the chart's accent: each step up is a version arriving. The newest step draws itself in.
function VersionSteps({ done }: { done: boolean }) {
  const W = 180;
  const H = 64;
  const y = (level: number) => H - 6 - level * 13;
  const x = (share: number) => share * W;
  let d = `M0 ${y(0)}`;
  for (const s of STEPS.slice(1)) d += ` H${x(s.x)} V${y(s.level)}`;
  const last = STEPS[STEPS.length - 1];
  const tail = `M${x(last.x)} ${y(last.level)} H${x(NEW_STEP.x)} V${y(NEW_STEP.level)} H${W}`;
  const flat = `M${x(last.x)} ${y(last.level)} H${W}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-16 w-full overflow-visible" preserveAspectRatio="none">
      <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="stroke-border" strokeWidth="1" />
      <path d={d} fill="none" className="stroke-chart-accent" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {/* Before the update the line runs flat to today; after, it steps up near the end. */}
      <path
        d={flat}
        fill="none"
        className="stroke-chart-accent transition-opacity duration-300"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        style={{ opacity: done ? 0 : 1 }}
      />
      <path
        d={tail}
        fill="none"
        pathLength={1}
        className="stroke-chart-accent"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeDasharray="1"
        style={{ strokeDashoffset: done ? 0 : 1, transition: "stroke-dashoffset 700ms ease-out 200ms" }}
      />
    </svg>
  );
}
