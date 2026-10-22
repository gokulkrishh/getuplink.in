"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import { Segmented } from "@/components/segmented";
import { applyTheme, storedTheme, type Theme } from "@/lib/theme";

const ICON = "size-3.5";
const OPTIONS: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: "system", label: "System", icon: <Monitor className={ICON} aria-hidden="true" /> },
  { value: "light", label: "Light", icon: <Sun className={ICON} aria-hidden="true" /> },
  { value: "dark", label: "Dark", icon: <Moon className={ICON} aria-hidden="true" /> },
];

const subscribe = () => () => {};

// The stored theme is read once the page is in the browser (the server can't see it). A pick is kept in
// state instead of re-read from the store: store updates render outside any Transition, and the
// highlight only slides inside one.
export function ThemePicker() {
  const stored = useSyncExternalStore(subscribe, storedTheme, () => "system" as Theme);
  const [picked, setPicked] = useState<Theme | null>(null);
  const choose = (value: Theme) => {
    applyTheme(value);
    setPicked(value);
  };

  // Icons only on phones so the switch fits beside its row title.
  return <Segmented label="Theme" role="radio" size="md" phoneLabels={false} options={OPTIONS} value={picked ?? stored} onChange={choose} />;
}
