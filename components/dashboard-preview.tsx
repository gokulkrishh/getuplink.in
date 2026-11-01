"use client";

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

export function DashboardPreview() {
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

  return (
    <div ref={root} className="w-full max-w-[560px]">
      <FigureStage className="h-[436px] sm:h-[420px]">
        {/* The page, cropped: whole at the top and left, running off the right and bottom. */}
        <div className={`absolute top-5 left-5 w-[420px] rounded-xl sm:top-8 sm:left-[120px] sm:w-[600px] ${SURFACE}`}>
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
            <span className="hidden gap-4 pr-[220px] sm:flex">
              <Bar className="w-10" />
              <Bar className="w-12" />
              <Bar className="w-9" />
            </span>
          </div>

          <div className="px-4 pt-3 pb-40 sm:px-6 sm:pt-5">
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

            {/* This week's tiles, as filler under the small chart. */}
            <div className="mt-6 grid w-[520px] grid-cols-3 gap-3">
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
            <div className="mt-4 h-40 w-[520px] rounded-lg bg-muted" />
          </div>
        </div>

        {/* The Software version chart, across the page's left edge: the new step lands as the update does. */}
        <div className={`absolute top-[252px] left-5 w-[196px] rounded-xl px-3.5 pt-3 pb-3.5 sm:top-[236px] sm:w-[208px] sm:px-4 ${SATELLITE}`}>
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
