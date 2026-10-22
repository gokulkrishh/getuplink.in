// Local demo mode: `bun run demo` (UPLINK_DEMO=1 bun dev) fills every page with generated data for one
// car and signs you in without Tesla or the database. Only `next dev` sets NODE_ENV=development, so
// production builds ignore the flag.
export const DEMO = process.env.NODE_ENV === "development" && process.env.UPLINK_DEMO === "1";

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
