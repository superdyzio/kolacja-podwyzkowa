import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";

export type DbClient = SupabaseClient<Database>;

// Pure factory (no `astro:*` imports) so tests can build the same client from process.env.
// The service-role key bypasses RLS: call this only on the server.
export function createServiceClient(url: string, serviceRoleKey: string): DbClient {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
