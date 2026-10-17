import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

let client: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Privileged client using the Supabase secret (service-role) key. Bypasses RLS.
 * Server-only: the `server-only` import makes any client-bundle import a build error.
 * Callers are responsible for authenticating and authorizing the acting player first.
 */
export function createServiceClient() {
  if (client) return client;
  client = createClient<Database>(publicEnv().supabaseUrl, serverEnv().supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
