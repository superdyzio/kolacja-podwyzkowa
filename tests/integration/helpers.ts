import { EVENT_ID } from "@/lib/event";
import { createServiceClient, type DbClient } from "@/lib/supabase-client";

// Integration tests run only against a LOCAL Supabase (127.0.0.1 / localhost) so they can never touch a hosted
// database, even if .env points at one. Without local credentials they are skipped (e.g. in the CI lint job).

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export interface LocalDbEnv {
  url: string;
  serviceRoleKey: string;
}

export function localDbEnv(): LocalDbEnv | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname) ? { url, serviceRoleKey } : null;
  } catch {
    return null;
  }
}

export const hasLocalDb = localDbEnv() !== null;

export function localDb(): DbClient {
  const env = localDbEnv();
  if (!env) {
    throw new Error(
      "Brak lokalnej bazy: ustaw SUPABASE_URL (127.0.0.1) i SUPABASE_SERVICE_ROLE_KEY (npm run env:local).",
    );
  }
  return createServiceClient(env.url, env.serviceRoleKey);
}

export interface TestEvent {
  name: string;
  organizerKey: string;
  tvKey: string;
  // Only an event the test created itself may be deleted afterwards; a pre-existing event is real data.
  createdByTest: boolean;
}

export async function readEvent(db: DbClient): Promise<Omit<TestEvent, "createdByTest">> {
  const { data, error } = await db.from("event").select("name, organizer_key, tv_key").eq("id", EVENT_ID).single();
  if (error) {
    throw new Error(`Nie udało się odczytać wydarzenia: ${error.message}`);
  }
  return { name: data.name, organizerKey: data.organizer_key, tvKey: data.tv_key };
}

export async function releaseEvent(db: DbClient, event: TestEvent): Promise<void> {
  if (!event.createdByTest) {
    return;
  }
  const { error } = await db.from("event").delete().eq("organizer_key", event.organizerKey);
  if (error) {
    throw new Error(`Nie udało się usunąć testowego wydarzenia: ${error.message}`);
  }
}
