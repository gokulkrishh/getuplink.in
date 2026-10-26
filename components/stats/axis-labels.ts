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
      // through the gap, and are thinned from the first column by halving (every 3, 6 or 12 hours), so
      // midnight, and each day's name on a two-day chart, always shows.
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
      for (; stride < n; stride = edge ? stride * 2 : stride + 1) {
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
