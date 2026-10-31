"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

// The VIN masked to its last 4 characters, with an eye button to show it in full.
// label={false} where the row already says VIN.
export function Vin({ vin, label = true }: { vin: string; label?: boolean }) {
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeOff : Eye;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5">
      {label && <span>VIN</span>}
      <span className="inline-flex items-center gap-1">
        <span className="font-mono">{shown ? vin : `••••${vin.slice(-4)}`}</span>
        {/* shadcn's Tooltip: a label for the mouse and keyboard. On a phone the tap does the job itself. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => setShown(!shown)} aria-label={shown ? "Hide VIN" : "Show full VIN"} aria-pressed={shown} className="text-faint" />
            }
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>{shown ? "Hide VIN" : "Show full VIN"}</TooltipContent>
        </Tooltip>
      </span>
    </span>
  );
}
