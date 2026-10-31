"use client";

import { Download } from "lucide-react";
import { useRef, useState } from "react";
import { chartFileName } from "@/lib/chart-image";
import { cn } from "@/lib/utils";

const PAD = 24;
const FOOTER = 28;

// The download button beside a chart's title (ChartCard). It saves the chart itself (the card's
// [data-chart-plot], without its title, figures or caption) as a PNG in the page's own theme, with the
// site's name under it, for the owner to post or keep.
// The image library loads on the first tap, so pages carry none of it.
export function ChartDownload({ title, className }: { title?: string; className?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save() {
    const chart = button.current?.closest<HTMLElement>("[data-chart-card]")?.querySelector<HTMLElement>("[data-chart-plot]");
    if (!chart || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const { domToCanvas } = await import("modern-screenshot");
      const page = getComputedStyle(document.body);
      const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
      // A chart scrolled sideways (ScrollEnd) clones at its start; shift each clone to where the owner is.
      const scrolled = [...chart.querySelectorAll<HTMLElement>("[data-scroll-end]")].map((el) => el.scrollLeft);
      const shot = await domToCanvas(chart, {
        scale,
        backgroundColor: page.backgroundColor,
        onCloneNode: (clone) => {
          if (!(clone instanceof HTMLElement)) return;
          clone.querySelectorAll<HTMLElement>("[data-scroll-end]").forEach((el, i) => {
            const inner = el.firstElementChild as HTMLElement | null;
            if (!inner || !scrolled[i]) return;
            el.style.overflow = "hidden";
            inner.style.transform = `translateX(-${scrolled[i]}px)`;
          });
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

  const label = failed ? "Couldn't save the image. Try again." : title ? `Download ${title} as an image` : "Download chart as an image";
  return (
    <button
      ref={button}
      type="button"
      onClick={save}
      disabled={busy}
      aria-label={label}
      title={failed ? label : "Download image"}
      className={cn(
        "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-progress after:absolute after:-inset-2",
        failed && "text-destructive",
        className,
      )}
    >
      <Download className={cn("size-4", busy && "motion-safe:animate-pulse")} aria-hidden="true" />
    </button>
  );
}
