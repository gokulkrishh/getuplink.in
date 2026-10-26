import "server-only";
import { parseAdminAccounts } from "@/lib/admin";

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

// Optional, so not in missingEnv: ADMIN_ACCOUNTS lists the Tesla accounts (users.tesla_sub) that can open
// /admin, comma-separated. Unset, /admin is a 404 for everyone.
export function adminAccounts(): Set<string> {
  return parseAdminAccounts(process.env.ADMIN_ACCOUNTS);
}

export const SIGNUP_MODES = ["closed", "waitlist", "open"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

// Optional: SIGNUP_MODE says who may sign up. Unset or unknown is "closed": only approved users sign in
// (lib/server/tesla.ts signIn). Nothing reads "waitlist" or "open" yet; step 6 of docs/signup-plan.md
// wires them.
export function signupMode(): SignupMode {
  const value = process.env.SIGNUP_MODE?.trim().toLowerCase();
  return SIGNUP_MODES.find((mode) => mode === value) ?? "closed";
}
