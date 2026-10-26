import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO } from "@/lib/demo";
import { sandboxClient } from "@/lib/sandbox/db";
import { sandboxOn } from "@/lib/sandbox/flag";
import { env } from "./env";

let client: SupabaseClient | undefined;

// Service role client. Server only: the key bypasses RLS.
export function db(): SupabaseClient {
  // Demo mode never touches the database (the local env points at the real one). A loader that
  // forgot its demo branch fails here instead of reading or writing real data.
  if (DEMO) throw new Error("The database is off in demo mode");
  // The local sandbox (bun run sandbox) has its own throwaway database in memory: no Supabase client is
  // ever made, and SUPABASE_URL and its key are never read.
  if (sandboxOn()) return sandboxClient() as unknown as SupabaseClient;
  client ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
