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
      const marks = labels.map((label) => {
        const column = label.parentElement!.getBoundingClientRect();
        const w = label.scrollWidth;
        const center = column.left - origin + column.width / 2;
        const left = Math.max(0, Math.min(width - w, center - w / 2));
        return { label, w, left, shift: left - (center - w / 2), empty: !label.textContent?.trim() };
      });
      const n = marks.length;
      let stride = Math.max(1, minStride);
      for (; stride < n; stride++) {
        const shown = marks.filter((m, k) => (n - 1 - k) % stride === 0 && !m.empty);
        if (shown.every((m, i) => i === 0 || shown[i - 1].left + shown[i - 1].w + GAP <= m.left)) break;
      }
      marks.forEach((m, k) => {
        const show = (n - 1 - k) % stride === 0;
        m.label.style.visibility = show ? "visible" : "hidden";
        m.label.style.transform = show && m.shift ? `translateX(${m.shift}px)` : "";
      });
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(el);
    return () => observer.disconnect();
  });
}
