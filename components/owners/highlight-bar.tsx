"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// The two small visuals of a "Picked for you" card. Each mark shows its tip on hover, focus or tap, in the
// chart tooltips' style, like OptionBar; Escape or a tap elsewhere hides it.

function useTip<K>() {
  const [open, setOpen] = useState<K | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === null) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const handlers = (key: K) => ({
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === "mouse" && setOpen(key),
    onPointerLeave: (e: React.PointerEvent) => e.pointerType === "mouse" && setOpen(null),
    onClick: () => setOpen(key),
    onFocus: () => setOpen(key),
    onBlur: () => setOpen(null),
    onKeyDown: (e: React.KeyboardEvent) => e.key === "Escape" && setOpen(null),
  });
  return { open, box, handlers };
}

function Tip({ lines, at }: { lines: string[]; at: number }) {
  // Kept inside the bar: anchored left on the left half, right on the right half.
  const right = at > 0.5;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-full z-10 mb-2 border bg-background px-2 py-1 text-left text-xs whitespace-nowrap tabular-nums shadow-sm"
      style={right ? { right: `${(1 - at) * 100}%` } : { left: `${at * 100}%` }}
    >
      {lines.map((line, k) => (
        <span key={line} className={cn("block", k === 0 ? "font-mono" : "text-muted-foreground")}>
          {line}
        </span>
      ))}
    </span>
  );
}

const MARK = "chart-touch absolute outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring";

// Owners' middle half as a band on a line from `from` to `to`, and the owner's own value as a dot. `lines`:
// the tip, the owner's figure first. `ends` label the line's two ends.
export function BandBar({ from, to, low, high, value, lines, ends }: { from: number; to: number; low: number; high: number; value: number; lines: string[]; ends: [string, string] }) {
  const { open, box, handlers } = useTip<"bar">();
  const at = (v: number) => Math.min(1, Math.max(0, (v - from) / (to - from || 1)));
  const dot = at(value);
  return (
    <div ref={box} className="space-y-1.5">
      <div className="relative h-3">
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-muted dark:bg-card" />
        <span aria-hidden="true" className="absolute top-1/2 h-1.5 -translate-y-1/2 bg-chart-accent/40" style={{ left: `${at(low) * 100}%`, width: `${(at(high) - at(low)) * 100}%` }} />
        <span aria-hidden="true" className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-you ring-2 ring-background" style={{ left: `${dot * 100}%` }} />
        <button type="button" aria-label={lines.join(", ")} className={cn(MARK, "inset-x-0 -inset-y-2")} {...handlers("bar")} />
        {open && <Tip lines={lines} at={dot} />}
      </div>
      <div aria-hidden="true" className="flex justify-between text-xs text-faint tabular-nums">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  );
}

// Each option's share of owners as a stretch of one bar, the owner's own drawn strong. Under the bar, the
// owner's option is named, and the most common one too when the two names don't crowd each other.
export function ShareStrip({ options }: { options: { key: string; label: string; share: number; yours: boolean; lines: string[] }[] }) {
  const { open, box, handlers } = useTip<string>();
  let start = 0;
  const marks = options.map((o) => {
    const mark = { ...o, start, centre: start + o.share / 2 };
    start += o.share;
    return mark;
  });
  const mine = marks.find((m) => m.yours);
  const top = marks.filter((m) => !m.yours).sort((a, b) => b.share - a.share)[0];
  const names = [
    ...(mine ? [{ key: mine.key, text: `You: ${mine.label}`, at: mine.centre, strong: true }] : []),
    ...(top && (!mine || Math.abs(top.centre - mine.centre) > 0.35) ? [{ key: top.key, text: top.label, at: top.centre, strong: false }] : []),
  ];
  return (
    <div ref={box} className="space-y-1.5">
      <div className="relative h-3">
        {marks.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-label={m.lines.join(", ")}
            className={cn(MARK, "top-1/2 h-1.5 -translate-y-1/2 border-r-2 border-background last:border-r-0 after:absolute after:inset-x-0 after:-inset-y-2", m.yours ? "bg-chart-you" : "bg-chart-accent/30")}
            style={{ left: `${m.start * 100}%`, width: `${m.share * 100}%` }}
            {...handlers(m.key)}
          />
        ))}
        {marks.map((m) => open === m.key && <Tip key={m.key} lines={m.lines} at={m.centre} />)}
      </div>
      {names.length > 0 && (
        <div aria-hidden="true" className="relative h-4 text-xs tabular-nums">
          {names.map((n) => (
            <span
              key={n.key}
              className={cn("absolute whitespace-nowrap", n.strong ? "font-medium text-chart-you" : "text-faint")}
              style={n.at > 0.5 ? { right: `${Math.max(0, 1 - n.at - 0.1) * 100}%` } : { left: `${Math.max(0, n.at - 0.1) * 100}%` }}
            >
              {n.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
