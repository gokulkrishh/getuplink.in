"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Tip } from "@/components/tip";
import { Button } from "@/components/ui/button";

// The VIN masked to its last 4 characters, with an eye button to show it in full.
export function Vin({ vin }: { vin: string }) {
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeOff : Eye;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5">
      <span>VIN</span>
      <span className="inline-flex items-center gap-1">
        <span className="font-mono">{shown ? vin : `••••${vin.slice(-4)}`}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => setShown(!shown)}
          aria-label={shown ? "Hide VIN" : "Show full VIN"}
          aria-pressed={shown}
          className="group relative text-faint"
        >
          <Icon className="size-3.5" aria-hidden="true" />
          <Tip>{shown ? "Hide VIN" : "Show full VIN"}</Tip>
        </Button>
      </span>
    </span>
  );
}
