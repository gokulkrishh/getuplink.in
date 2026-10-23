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
} as const;

export type DemoScenario = keyof typeof DEMO_SCENARIOS;

export function parseScenario(value: unknown): DemoScenario {
  return typeof value === "string" && Object.hasOwn(DEMO_SCENARIOS, value) ? (value as DemoScenario) : "normal";
}
