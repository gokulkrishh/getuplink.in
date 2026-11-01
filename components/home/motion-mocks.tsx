"use client";

import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { Bar, FigureStage, SATELLITE, SURFACE } from "@/components/home/figure";
import { useInView } from "@/components/home/in-view";

// The "motion" set of home page pictures: each plays once when it comes into view and holds its end
// state; with reduced motion the end state shows straight away. All values are illustrative.

// Every trip and charge: three invoices land on a loose pile, the top one the only one with words.
const PILE = [
  { rotate: -6, x: -14, y: 10 },
  { rotate: 4, x: 12, y: 4 },
  { rotate: -2, x: 0, y: 0 },
];

export function InvoiceStackMock() {
  const { ref, seen } = useInView<HTMLDivElement>();
  return (
    <div ref={ref}>
      <FigureStage className="h-[380px] sm:h-[420px]">
        <div className="absolute inset-x-0 top-10 flex justify-center sm:top-12">
          <div className="relative h-[300px] w-[240px] sm:w-[260px]">
            {PILE.map((card, i) => {
              const top = i === PILE.length - 1;
              return (
                <div
                  key={i}
                  className={`absolute inset-0 rounded-xl p-5 text-sm transition-[transform,opacity] duration-700 ease-out ${top ? SATELLITE : SURFACE}`}
                  style={{
                    transform: seen
                      ? `translate(${card.x}px, ${card.y}px) rotate(${card.rotate}deg)`
                      : `translate(${card.x}px, ${card.y - 40}px) rotate(${card.rotate * 2}deg)`,
                    opacity: seen ? 1 : 0,
                    transitionDelay: `${i * 220}ms`,
                  }}
                >
                  {top ? (
                    <>
                      <span className="flex items-center gap-2 text-xs text-faint">
                        <FileText className="size-3.5" />
                        Invoice · 21 Oct
                      </span>
                      <p className="mt-3">Whitefield Supercharger</p>
                      <p className="mt-0.5 text-xs text-faint tabular-nums">17.2 kWh at ₹24/kWh</p>
                      <div className="mt-6 space-y-3 border-t pt-4">
                        <Bar className="w-32" />
                        <Bar className="w-24 opacity-60" />
                        <Bar className="w-28 opacity-60" />
                      </div>
                      <div className="mt-6 flex items-baseline justify-between border-t pt-4">
                        <span className="text-faint">Total</span>
                        <span className="font-mono text-xl tracking-tight tabular-nums">₹412.80</span>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <Bar className="w-20" />
                      <Bar className="w-32 opacity-60" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </FigureStage>
    </div>
  );
}

// Your car at a glance: the charge level chart, a hairline and dot moving across it, the headline
// value rolling to the day under it. It scrubs on its own once, then follows the pointer.
const LEVELS = [78, 71, 64, 58, 80, 74, 69, 62, 55, 80, 76, 72];
const DAYS = ["21 Oct", "22 Oct", "23 Oct", "24 Oct", "25 Oct", "26 Oct", "27 Oct", "28 Oct", "29 Oct", "30 Oct", "31 Oct", "1 Nov"];

export function ChargeScrubMock() {
  const { ref, seen, reduced } = useInView<HTMLDivElement>();
  const last = LEVELS.length - 1;
  const [at, setAt] = useState(last);
  useEffect(() => {
    if (!seen || reduced) return;
    // Sweep from the first day to today, one day at a time.
    let i = 0;
    setAt(0);
    const timer = setInterval(() => {
      i += 1;
      setAt(i);
      if (i >= last) clearInterval(timer);
    }, 260);
    return () => clearInterval(timer);
  }, [seen, reduced, last]);

  const W = 100;
  const H = 40;
  const x = (i: number) => (i / last) * W;
  // 40% to 90%: the range a car spends its days in, so the line fills the chart.
  const y = (v: number) => H - ((v - 40) / 50) * H;
  const d = LEVELS.map((v, i) => `${i ? "L" : "M"}${x(i)} ${y(v)}`).join(" ");

  return (
    <div ref={ref}>
      <FigureStage className="h-[380px] sm:h-[420px]">
        <div className={`absolute top-5 right-5 left-5 h-[460px] rounded-xl p-5 text-sm sm:top-8 sm:right-8 sm:left-8 sm:p-6 ${SURFACE}`}>
          <p className="font-medium">Charge level</p>
          <p className="mt-4 flex items-baseline gap-3">
            <span className="font-mono text-4xl font-medium tracking-tight tabular-nums">{LEVELS[at]}%</span>
            <span className="text-muted-foreground tabular-nums">{DAYS[at]}</span>
          </p>
          <div
            className="relative mt-6 h-44 touch-none"
            onPointerMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              setAt(Math.max(0, Math.min(last, Math.round(((e.clientX - box.left) / box.width) * last))));
            }}
          >
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              <path d={d} fill="none" className="stroke-chart-accent" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="absolute inset-y-0 w-px bg-foreground/30 transition-[left] duration-200 ease-out" style={{ left: `${x(at)}%` }} />
            <span
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-chart-accent transition-[left,top] duration-200 ease-out"
              style={{ left: `${x(at)}%`, top: `${(y(LEVELS[at]) / H) * 100}%` }}
            />
          </div>
          <p className="mt-3 flex justify-between text-xs text-faint tabular-nums">
            <span>{DAYS[0]}</span>
            <span>{DAYS[last]}</span>
          </p>
        </div>
      </FigureStage>
    </div>
  );
}

// Ask your AI: the question is sent, the assistant looks at your charging, the answer streams in.
const WORDS = "₹3,180 over 9 charges. ₹2,438 at Superchargers and ₹742 on ChargeMOD.".split(" ");

export function AiStreamMock() {
  const { ref, seen, reduced } = useInView<HTMLDivElement>();
  const words = WORDS;
  const [shown, setShown] = useState(0);
  const [looking, setLooking] = useState(false);
  useEffect(() => {
    if (!seen) return;
    if (reduced) {
      setShown(words.length);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setLooking(true), 500));
    timers.push(
      setTimeout(() => {
        setLooking(false);
        words.forEach((_, i) => timers.push(setTimeout(() => setShown(i + 1), i * 90)));
      }, 2200),
    );
    return () => timers.forEach(clearTimeout);
  }, [seen, reduced]);

  const started = shown > 0 || looking;
  return (
    <div ref={ref}>
      <FigureStage className="h-[380px] sm:h-[420px]">
        <div className={`absolute top-10 right-10 left-5 h-[440px] rounded-xl p-5 text-sm sm:top-14 sm:right-14 sm:left-8 sm:p-6 ${SURFACE}`}>
          <p
            className="ml-auto w-fit max-w-[85%] rounded-2xl bg-muted px-3.5 py-2 transition-[transform,opacity] duration-500 ease-out"
            style={{ opacity: seen ? 1 : 0, transform: seen ? "none" : "translateY(8px)" }}
          >
            How much did I spend on charging in October?
          </p>
          <p className={`mt-5 text-xs text-faint transition-opacity duration-300 ${looking ? "ai-shimmer" : ""}`} style={{ opacity: started ? 1 : 0 }}>
            Looked at your charging
          </p>
          {/* The whole answer takes its space from the start, so nothing below it moves as it streams. */}
          <p className="mt-1.5 leading-relaxed">
            {words.map((w, i) => (
              <span key={i} className="transition-opacity duration-200" style={{ opacity: i < shown ? 1 : 0 }}>
                {w}{" "}
              </span>
            ))}
          </p>
          <div className="mt-6 ml-auto w-3/5 rounded-2xl bg-muted px-3.5 py-3">
            <Bar className="w-full" />
            <Bar className="mt-2 w-2/3" />
          </div>
          <Bar className="mt-6 w-24 opacity-60" />
          <Bar className="mt-3 w-4/5" />
        </div>
        <span className={`absolute top-10 right-16 flex -translate-y-1/2 items-center gap-2 rounded-full py-1.5 pr-3.5 pl-3 text-xs font-medium sm:top-14 sm:right-20 ${SATELLITE}`}>
          <Logo className="size-3.5" />
          Uplink connector
        </span>
      </FigureStage>
    </div>
  );
}
