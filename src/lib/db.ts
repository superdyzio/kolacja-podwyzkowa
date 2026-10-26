import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "astro:env/server";
import { createServiceClient, type DbClient } from "@/lib/supabase-client";

// The only place that reads the DB credentials. Server-side only (pages, API routes, middleware).
export function getDb(): DbClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createServiceClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}
