"use client";

import { useEffect, useRef, type ComponentProps } from "react";

// A bar chart's list of columns whose tips also open on tap. Hover tips are `group-hover`, which Tailwind
// only applies on devices that can hover, so on a phone a tap marks its column (`data-tapped`) instead,
// and BarTip shows for that too. Tapping the column again or anywhere else hides it. It acts on the click
// rather than the touch, so swiping a scrolling strip doesn't open a tip.
// A column that leads somewhere is a link (see Column). A mouse click or Enter follows it, as any link.
// A tap doesn't: the first tap shows the tip, which names where the column leads and carries the link
// there (see BarTip), and a second tap on the column hides the tip again, as before. So reading values
// bar by bar never navigates by accident, and the way on is named before it is taken.
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
      // Capture phase: it runs before the column's own link does, and Next's Link leaves a click alone once
      // its default is prevented.
      onClickCapture={(e) => {
        const target = e.target as Element;
        // The link in the tip, and a click that came from the keyboard (no pointer, so detail 0), go through.
        if (!touch.current || e.detail === 0 || target.closest("[data-tip-link]")) return;
        e.preventDefault();
        const column = target.closest<HTMLElement>("li.group");
        const off = column?.dataset.tapped === "true";
        mark(list.current, off ? null : column);
        // A tap focuses a link on some phones, and focus shows the tip too (see BarTip): let it go with the mark.
        if (off && column?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      }}
    />
  );
}

// The attribute is set on the DOM directly: the columns may be rendered on the server, and only one is marked.
function mark(list: HTMLOListElement | null, column: HTMLElement | null | undefined) {
  list?.querySelectorAll<HTMLElement>("li[data-tapped]").forEach((li) => li !== column && delete li.dataset.tapped);
  if (column) column.dataset.tapped = "true";
}
