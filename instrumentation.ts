import { assertSandboxAllowed, guardFetch, sandboxOn } from "@/lib/sandbox/flag";

// Runs once as each server starts. The local sandbox (UPLINK_SANDBOX=1, docs/sandbox.md) refuses to start in
// production or on Vercel, and while it runs nothing may reach Tesla or Supabase: any fetch to them throws.
export function register() {
  assertSandboxAllowed();
  if (sandboxOn()) {
    globalThis.fetch = guardFetch(globalThis.fetch);
    console.info("Local sandbox: fake Tesla, throwaway data. Tesla and Supabase are unreachable.");
  }
}
