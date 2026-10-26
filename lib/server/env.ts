import "server-only";
import { parseMaxUsers } from "@/lib/admin";

export const FLEET_API_DEFAULT = "https://fleet-api.prd.na.vn.cloud.tesla.com";

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export function fleetApiBase(): string {
  return (process.env.TESLA_FLEET_API_BASE_URL || FLEET_API_DEFAULT).replace(/\/$/, "");
}

// Vercel's env UI keeps newlines, but a pasted one-liner may use literal "\n".
export function pem(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export function missingEnv(): string[] {
  return [
    "TESLA_CLIENT_ID",
    "TESLA_CLIENT_SECRET",
    "TESLA_REDIRECT_URI",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TOKEN_ENCRYPTION_KEY",
    "CRON_SECRET",
  ].filter((name) => !process.env[name]);
}

// Optional: MAX_USERS caps approved accounts, admins included (default 25). Approving past it is refused.
export function maxUsers(): number {
  return parseMaxUsers(process.env.MAX_USERS);
}

export const SIGNUP_MODES = ["closed", "invite", "waitlist", "open"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

// Optional: SIGNUP_MODE says who may sign up (lib/server/tesla.ts signIn). Unset or unknown is "closed":
// only approved users sign in, and invite links don't work. "invite": a Tesla account Uplink doesn't know
// joins only through an invite link; without one it's refused. "waitlist": it joins the waitlist, and
// invite links work too. "open" acts as "waitlist" for now: auto-approval waits for step 4, until which
// two users can't track one car.
export function signupMode(): SignupMode {
  const value = process.env.SIGNUP_MODE?.trim().toLowerCase();
  return SIGNUP_MODES.find((mode) => mode === value) ?? "closed";
}
