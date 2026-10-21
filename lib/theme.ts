import { SHARED_DOMAINS } from "@/lib/session";

// Theme choice is per browser. "system" follows the device. It lives in a cookie shared by the home
// page and the app (like the session), with localStorage as the fallback for older choices and other hosts.
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_KEY = "uplink-theme";

// Runs before first paint (inlined in <head>) so the page never flashes the wrong theme.
// An older choice saved only in localStorage is copied into the shared cookie.
export const THEME_SCRIPT = `try{var k="${THEME_KEY}",m=document.cookie.match(/(?:^|; )${THEME_KEY}=(light|dark)/),t=m?m[1]:localStorage.getItem(k);if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;if(!m){var h=location.hostname,d=${JSON.stringify(SHARED_DOMAINS)}.find(function(x){return h===x||h.slice(-x.length-1)==="."+x});document.cookie=k+"="+t+"; max-age=31536000; path=/; samesite=lax"+(d?"; domain="+d:"")}}}catch(e){}`;

function cookieDomain(): string | undefined {
  const host = location.hostname;
  return SHARED_DOMAINS.find((d) => host === d || host.endsWith(`.${d}`));
}

function writeCookie(theme: Theme) {
  const domain = cookieDomain();
  const scope = `; path=/; samesite=lax${domain ? `; domain=${domain}` : ""}`;
  document.cookie =
    theme === "system" ? `${THEME_KEY}=; max-age=0${scope}` : `${THEME_KEY}=${theme}; max-age=${60 * 60 * 24 * 365}${scope}`;
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  writeCookie(theme);
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked: the cookie still carries the choice.
  }
}

export function storedTheme(): Theme {
  const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_KEY}=(light|dark)`));
  if (m) return m[1] as Theme;
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}
