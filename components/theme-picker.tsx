"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { applyTheme, storedTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, storedTheme, () => "system" as Theme);
  const choose = (value: Theme) => {
    applyTheme(value);
    listeners.forEach((fn) => fn());
  };

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex gap-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => choose(value)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 px-3 text-sm font-medium outline-none transition-[background-color,color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring",
            theme === value ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
