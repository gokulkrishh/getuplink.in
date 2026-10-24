"use client";

import { useEffect, useRef, type ComponentProps } from "react";

// A bar chart's list of columns whose tips also open on tap. Hover tips are `group-hover`, which Tailwind
// only applies on devices that can hover, so on a phone a tap marks its column (`data-tapped`) instead,
// and BarTip shows for that too. Tapping the column again or anywhere else hides it. It acts on the click
// rather than the touch, so swiping a scrolling strip doesn't open a tip.
export function TapColumns(props: ComponentProps<"ol">) {
  const list = useRef<HTMLOListElement>(null);
  const touch = useRef(false);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node)) mark(list.current, null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  return (
    <ol
      {...props}
      ref={list}
      onPointerDown={(e) => (touch.current = e.pointerType !== "mouse")}
      onClick={(e) => {
        if (!touch.current) return;
        const column = (e.target as Element).closest<HTMLElement>("li.group");
        mark(list.current, column?.dataset.tapped === "true" ? null : column);
      }}
    />
  );
}

// The attribute is set on the DOM directly: the columns may be rendered on the server, and only one is marked.
function mark(list: HTMLOListElement | null, column: HTMLElement | null | undefined) {
  list?.querySelectorAll<HTMLElement>("li[data-tapped]").forEach((li) => li !== column && delete li.dataset.tapped);
  if (column) column.dataset.tapped = "true";
}
