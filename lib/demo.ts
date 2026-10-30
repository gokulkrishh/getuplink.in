// Demo mode fills every page with generated data for one car and signs you in without Tesla or the
// database (db() refuses to run). Locally: `bun run demo` (UPLINK_DEMO=1 bun dev; production builds ignore
// that flag). The public demo site, demo.getuplink.in, is its own Vercel project built with
// UPLINK_DEMO_SITE=1, so the real app can never switch into it by accident.
export const DEMO_SITE = process.env.UPLINK_DEMO_SITE === "1";
export const DEMO = (process.env.NODE_ENV === "development" && process.env.UPLINK_DEMO === "1") || DEMO_SITE;

// Where the public demo lives, for the links in Settings and on the home page.
export const DEMO_URL = "https://demo.getuplink.in";

export const DEMO_SCENARIOS = {
  normal: "Parked",
  charging: "Charging",
  updating: "Downloading an update",
  installing: "Installing an update",
  // A car connected four days ago: nothing before then, so the home page says "Tracking since <date>".
  firstWeek: "First week",
  // A car just added, with the key paired and live data set up, that has sent nothing yet: no drives, no
  // charges, no readings, one check. Process-wide, set before starting the server (see demoScenario).
  justConnected: "Just connected",
  // The home cards that show once: an owner's welcome tour, and release notes with sample entries.
  welcome: "Welcome card",
  news: "Release dialog",
  // Home as a guest sees it on a shared car: the guest tour instead of the owner's.
  guest: "Guest tour",
} as const;

export type DemoScenario = keyof typeof DEMO_SCENARIOS;

export function parseScenario(value: unknown): DemoScenario {
  return typeof value === "string" && Object.hasOwn(DEMO_SCENARIOS, value) ? (value as DemoScenario) : "normal";
}

// The scenario the whole demo copy runs, from UPLINK_DEMO_SCENARIO. Unlike the others it reshapes the
// generated car itself (see blankSlate), so every page, API and tool sees it, not one page's loader.
export function demoScenario(): DemoScenario {
  return parseScenario(process.env.UPLINK_DEMO_SCENARIO);
}
