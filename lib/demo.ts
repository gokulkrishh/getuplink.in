// Local demo mode: `UPLINK_DEMO=1 bun dev` shows sample data without signing in.
// Only `next dev` sets NODE_ENV=development, so production builds ignore the flag.
export const DEMO = process.env.NODE_ENV === "development" && process.env.UPLINK_DEMO === "1";
