import { generateAccessKey } from "@/lib/access/keys";
import { loadStarterQuestions } from "@/lib/questions/service";
import type { DbClient } from "@/lib/supabase-client";

// The dinner is a singleton row (id = 1) in public.event. Functions take the client as a parameter so they can be
// tested against the local DB without Astro. Supabase errors always throw: a broken DB must never look like
// "no event" or "no access".

export const EVENT_ID = 1;

const UNIQUE_VIOLATION = "23505";

export type CreateEventResult =
  { status: "created"; organizerKey: string; tvKey: string } | { status: "already-exists" };

export async function hasEvent(db: DbClient): Promise<boolean> {
  const { data, error } = await db.from("event").select("id").eq("id", EVENT_ID).maybeSingle();
  if (error) {
    throw new Error(`Nie udało się odczytać wydarzenia: ${error.message}`);
  }
  return data !== null;
}

export async function createEvent(db: DbClient): Promise<CreateEventResult> {
  const organizerKey = generateAccessKey();
  let tvKey = generateAccessKey();
  while (tvKey === organizerKey) {
    tvKey = generateAccessKey();
  }

  const { error } = await db.from("event").insert({ id: EVENT_ID, organizer_key: organizerKey, tv_key: tvKey });
  if (error) {
    // The singleton primary key turns a second (or concurrent) creation into a unique violation.
    if (error.code === UNIQUE_VIOLATION) {
      return { status: "already-exists" };
    }
    throw new Error(`Nie udało się utworzyć wydarzenia: ${error.message}`);
  }

  // S-07: a new event starts with the starter question base. Best effort: the caller's redirect is the only moment
  // the organizer link is handed out, so a failure here must never turn it into an error page. The organizer can
  // load the base later ("Wczytaj bazę startową"). Only the creator gets here, so a racing creation seeds nothing.
  try {
    await loadStarterQuestions(db);
  } catch (seedError) {
    // eslint-disable-next-line no-console -- the only trace of a failed seed (Worker logs); the event itself is fine
    console.error("Nie udało się wczytać bazy startowej pytań:", seedError);
  }
  return { status: "created", organizerKey, tvKey };
}
