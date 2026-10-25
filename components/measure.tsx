import { Fragment } from "react";
import { measureParts } from "@/lib/measure";
import { cn } from "@/lib/utils";

// How the unit sits after a number in mono text:
// - tile: a Figures tile, the unit small and faint;
// - headline: a big headline value, the unit smaller and faint, like the home headline's;
// - inline: a table cell or row, the unit the same size and colour, in the sans face with a thin gap.
const UNIT = {
  tile: "text-xs font-normal tracking-normal text-faint",
  headline: "text-base font-normal tracking-normal text-faint sm:text-xl",
  inline: "font-sans",
} as const;
const BEFORE = { tile: "ml-1", headline: "ml-1", inline: "ml-[0.2em]" } as const;
const AFTER = { tile: "mr-1.5", headline: "mr-1.5", inline: "mr-[0.3em]" } as const;

// A value ("46 km", "1 h 15 min", "₹1,240") set inside mono text, its unit after the number without a
// monospace space (see measureParts). Signs before a number ("≈", "≥", "₹") stay as they are.
export function Measure({ text, size = "inline" }: { text: string; size?: keyof typeof UNIT }) {
  const parts = measureParts(text);
  return parts.map((part, k) =>
    part.unit ? (
      <span key={k} className={cn(UNIT[size], k > 0 && BEFORE[size], k < parts.length - 1 && AFTER[size])}>
        {part.text}
      </span>
    ) : (
      <Fragment key={k}>{part.text}</Fragment>
    ),
  );
}

// A big headline value, inside the headline's mono text.
export function Value({ text }: { text: string }) {
  return <Measure text={text} size="headline" />;
}
