"use client";

import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { chartFileName } from "@/lib/chart-image";
import { cn } from "@/lib/utils";

const PAD = 24;
const FOOTER = 28;
// Room above the chart for a line only the image has (data-capture-only), like the rollout map's version.
const EXTRA_LINE = 32;

// The download button beside a chart's title (ChartCard). It saves the chart itself (the card's
// [data-chart-plot], without its title, figures or caption) as a PNG in the page's own theme, with the
// site's name under it, for the owner to post or keep.
// The image library loads on the first tap, so pages carry none of it.
export function ChartDownload({ title, className }: { title?: string; className?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // The note under a failed save goes after a few seconds, so it never sits over the chart for long.
  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => setFailed(false), 5000);
    return () => clearTimeout(timer);
  }, [failed]);

  // Fetch the image library as soon as the owner points at the button, so the save itself starts at once.
  const warm = () => void import("modern-screenshot").catch(() => {});

  async function save() {
    if (busy) return;
    const chart = button.current?.closest<HTMLElement>("[data-chart-card]")?.querySelector<HTMLElement>("[data-chart-plot]");
    setFailed(false);
    if (!chart) return setFailed(true);
    setBusy(true);
    try {
      const { domToCanvas } = await import("modern-screenshot");
      const page = getComputedStyle(document.body);
      const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
      const extra = chart.querySelector("[data-capture-only]") ? EXTRA_LINE : 0;
      const height = chart.offsetHeight + extra;
      const shot = await domToCanvas(chart, {
        scale,
        height,
        backgroundColor: page.backgroundColor,
        // A chart scrolled sideways (ScrollEnd) saves the part on screen, with no scrollbar.
        features: { restoreScrollPosition: true },
        onCloneNode: (clone) => {
          if (!(clone instanceof HTMLElement)) return;
          clone.querySelectorAll<HTMLElement>("[data-scroll-end]").forEach((el) => (el.style.overflow = "hidden"));
          // Words the page says elsewhere but the image needs, like the rollout map's version, on a line of
          // their own above the chart.
          if (extra) {
            clone.style.paddingTop = `${extra}px`;
            clone.style.height = `${height}px`;
            clone.querySelectorAll<HTMLElement>("[data-capture-only]").forEach((el) => (el.style.display = "block"));
          }
        },
      });
      // Room round the chart, and the site's name at the bottom right.
      const out = document.createElement("canvas");
      out.width = shot.width + 2 * PAD * scale;
      out.height = shot.height + (2 * PAD + FOOTER) * scale;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("No canvas");
      ctx.fillStyle = page.backgroundColor;
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(shot, PAD * scale, PAD * scale);
      ctx.font = `500 ${13 * scale}px Geist, Arial, sans-serif`;
      ctx.fillStyle = getComputedStyle(chart).getPropertyValue("--muted-foreground") || page.color;
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("getuplink.in", out.width - PAD * scale, out.height - PAD * scale);
      const blob = await new Promise<Blob | null>((done) => out.toBlob(done, "image/png"));
      if (!blob) throw new Error("No image");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = chartFileName(title, new Date());
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {/* Not disabled while saving, so focus stays on the button; a second tap is ignored instead. */}
      <button
        ref={button}
        type="button"
        onClick={save}
        onPointerEnter={warm}
        onFocus={warm}
        onTouchStart={warm}
        aria-busy={busy}
        aria-label={title ? `Download ${title} as an image` : "Download chart as an image"}
        title="Download image"
        className={cn(
          "relative inline-flex size-6 items-center justify-center rounded-full text-faint transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-ring after:absolute after:-inset-2",
          busy && "cursor-progress",
          failed && "text-destructive",
        )}
      >
        <Download className={cn("size-4", busy && "motion-safe:animate-pulse")} aria-hidden="true" />
      </button>
      {/* Over the page, so nothing moves. */}
      {failed && (
        <span role="status" className="absolute top-full right-0 z-10 mt-1 w-max max-w-56 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm">
          Couldn&apos;t save the image. Try again.
        </span>
      )}
    </span>
  );
}
