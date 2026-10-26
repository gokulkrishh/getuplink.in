"use client";

import { type RefObject, useLayoutEffect } from "react";

const GAP = 6; // px kept between two labels

// Thins a bar chart's x-axis labels to what fits, measured in the browser: every label element (marked
// data-axis-label, one per column, in order, starting hidden) is measured against its column, and the
// smallest stride from the newest column (at least `minStride`) whose labels don't touch is shown. A label
// that would run past either end of the chart is nudged inside it. Runs again when the chart resizes, so a
// phone shows fewer labels than a desktop and none ever collide.
export function useAxisLabels(box: RefObject<HTMLElement | null>, minStride = 1) {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const layout = () => {
      const labels = [...el.querySelectorAll<HTMLElement>("[data-axis-label]")];
      // Unrounded, unlike clientWidth, so a label nudged to the right edge ends exactly at it.
      const { left: origin, width } = el.getBoundingClientRect();
      if (labels.length === 0 || width === 0) return;
      // Edge labels (blocks of hours, see AxisLabel) sit on the boundary before their column, midway
      // through the gap, and are thinned from the first column to every 2, 3, 6, 12 or 24 hours, strides
      // that divide a day, so midnight, and each day's name on a two-day chart, always shows.
      const edge = labels.some((label) => label.dataset.axisEdge !== undefined);
      const columns = labels.map((label) => label.parentElement!.getBoundingClientRect());
      const marks = labels.map((label, k) => {
        const column = columns[k];
        const w = label.scrollWidth;
        const center = column.left - origin + column.width / 2;
        const anchor = edge ? (k === 0 ? column.left : (columns[k - 1].right + column.left) / 2) - origin : center;
        const left = Math.max(0, Math.min(width - w, anchor - w / 2));
        return { label, w, left, shift: left - (center - w / 2), empty: !label.textContent?.trim() };
      });
      const n = marks.length;
      const picked = (k: number, stride: number) => (edge ? k : n - 1 - k) % stride === 0;
      let stride = Math.max(1, minStride);
      for (; stride < n; stride = edge ? (stride === 2 ? 3 : stride * 2) : stride + 1) {
        const shown = marks.filter((m, k) => picked(k, stride) && !m.empty);
        if (shown.every((m, i) => i === 0 || shown[i - 1].left + shown[i - 1].w + GAP <= m.left)) break;
      }
      marks.forEach((m, k) => {
        const show = picked(k, stride);
        // Only the label's own `invisible` is lifted, never visibility: visible, which would show it through a
        // hidden parent (the periods not picked, laid out underneath the one shown).
        m.label.classList.toggle("invisible", !show);
        m.label.style.transform = show && m.shift ? `translateX(${m.shift}px)` : "";
      });
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(el);
    return () => observer.disconnect();
  });
}

const MODES = ["full", "bare", "none"] as const;
const VALUE_GAP = 3; // px kept between two values above bars

// Picks how a bar chart's values above its bars show (see ValueLabel), measured in the browser: with their
// unit ("46.2 km") when no two touch and none runs past the chart, else bare numbers ("46.2"), else none,
// leaving the value to the tip. One choice for the whole chart, so every value reads alike. Runs again
// when the chart resizes, so a desktop can show units a phone has no room for.
export function useValueLabels(box: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const layout = () => {
      const labels = [...el.querySelectorAll<HTMLElement>("[data-value-label]")];
      const { left: start, right: end, width } = el.getBoundingClientRect();
      if (labels.length === 0 || width === 0) return;
      const apply = (mode: (typeof MODES)[number]) =>
        labels.forEach((label) => {
          const bare = label.querySelector<HTMLElement>('[data-value="bare"]');
          const full = label.querySelector<HTMLElement>('[data-value="full"]')!;
          full.classList.toggle("hidden", mode === "bare" && bare !== null);
          bare?.classList.toggle("hidden", mode !== "bare");
          label.classList.toggle("invisible", mode === "none");
        });
      for (const mode of MODES) {
        apply(mode);
        if (mode === "none") break;
        const boxes = labels.map((label) => label.getBoundingClientRect());
        const fits = boxes.every((b, k) => b.left >= start - 1 && b.right <= end + 1 && (k === 0 || boxes[k - 1].right + VALUE_GAP <= b.left));
        if (fits) break;
      }
      // Bare numbers get their unit once, at the start of the value row in the y gutter ("km 17.0 15.7 …").
      const unit = el.closest(".chart-touch")?.querySelector<HTMLElement>("[data-value-unit]");
      unit?.classList.toggle("hidden", !labels[0].querySelector('[data-value="bare"]:not(.hidden)'));
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(el);
    return () => observer.disconnect();
  });
}

// Puts each column's tip (marked data-bar-tip, laid out hidden) beside its column, never over it, so the
// bar being read stays in view: on the right of a column in the chart's left half, on the left in its right
// half, kept inside the chart where it can't fit. Measured in the browser like the labels; runs again when
// the chart resizes.
export function useBarTips(box: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const layout = () => {
      const { left: origin, width } = el.getBoundingClientRect();
      if (width === 0) return;
      for (const tip of el.querySelectorAll<HTMLElement>("[data-bar-tip]")) {
        const column = tip.parentElement!.getBoundingClientRect();
        const w = tip.offsetWidth;
        const start = column.left - origin;
        const centre = start + column.width / 2;
        // The bar is at most 48px (BAR_MAX), centred in its column: the tip clears the bar, not the column.
        const half = Math.min(column.width, 48) / 2;
        const gap = 6;
        const wanted = centre < width / 2 ? centre + half + gap : centre - half - gap - w;
        const left = Math.max(0, Math.min(width - w, wanted));
        tip.style.left = `${left - start}px`;
      }
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(el);
    return () => observer.disconnect();
  });
}
