"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

// Home's tyre rotation notice, which the owner can dismiss once it's done. Dismissing hides this rotation
// only (by its km), in this browser: the next one, 10,000 km on, shows again. Shown once the browser has
// said it wasn't dismissed, so a dismissed notice never flashes.
export function RotationNotice({ atKm, text }: { atKm: number; text: string }) {
  const key = `uplink:tyre-rotation-done:${atKm}`;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    try {
      setShown(localStorage.getItem(key) === null);
    } catch {
      setShown(true);
    }
  }, [key]);
  if (!shown) return null;
  const dismiss = () => {
    setShown(false);
    try {
      localStorage.setItem(key, "1");
    } catch {}
  };
  return (
    <div role="status" className="flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm">
      <p>{text}</p>
      <Button type="button" variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Dismiss" title="Dismiss" className="-my-1.5 -mr-1.5 shrink-0 text-muted-foreground">
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
