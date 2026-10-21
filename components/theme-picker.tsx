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
    <div role="radiogroup" aria-label="Theme" className="inline-flex border">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => choose(value)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            theme === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {/* Icons only on phones so the switch fits beside its row title. */}
          <span className="sr-only sm:not-sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
