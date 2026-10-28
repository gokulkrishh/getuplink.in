"use client";

import { useEffect } from "react";

// A row that opens a page (`group/row`, with a ROW_LINK inside) opens it on a click anywhere in the row,
// but its text can still be selected and copied: a click that ends a selection, or lands on another
// control, does nothing. Ctrl or Cmd opens it in a new tab, as a link would. Mounted once, in the layout.
export function RowLinks() {
  useEffect(() => {
    const open = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented) return;
      const target = event.target as Element | null;
      if (!target || target.closest("a, button, input, select, textarea, summary, label, [role=button]")) return;
      const row = target.closest('[class*="group/row"]');
      const link = row?.querySelector<HTMLAnchorElement>("a.row-link");
      if (!link) return;
      if (window.getSelection()?.toString()) return;
      if (event.metaKey || event.ctrlKey) window.open(link.href, "_blank", "noopener");
      else link.click();
    };
    document.addEventListener("click", open);
    return () => document.removeEventListener("click", open);
  }, []);
  return null;
}
