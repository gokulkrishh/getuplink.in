import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO } from "@/lib/demo";
import { env } from "./env";

let client: SupabaseClient | undefined;

// Service role client. Server only: the key bypasses RLS.
export function db(): SupabaseClient {
  // Demo mode never touches the database (the local env points at the real one). A loader that
  // forgot its demo branch fails here instead of reading or writing real data.
  if (DEMO) throw new Error("The database is off in demo mode");
  client ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
