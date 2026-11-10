import { secureRandom } from "@/lib/questions/draw";
import { getSeatingVersion, getTvSeating } from "@/lib/seating/service";
import type { DbClient } from "@/lib/supabase-client";
import type { TvScreenDto, TvSpotlightDto } from "@/types";
import { pickPerson } from "./draw";
import { isTvSpotlightKind, normalizeSpotlightText, tvScreenVersion } from "./rules";

// What the organizer shows on the TV over the seating (tv-spotlight) of one event. Functions take the client and the
// event id as parameters (no `astro:*`), so they are tested against the local DB; every read and write is limited to
// that event (multi-tenant-events). Supabase errors always throw.
//
// public.tv_spotlight: every show inserts a new row and then deletes the older ones, hiding deletes them all; readers
// take the newest row. Its id is the last part of the TV polling token, so every show is a new version for the TV.

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

interface SpotlightRow {
  id: number;
  spotlight: TvSpotlightDto;
}

async function newestRow(db: DbClient, eventId: number): Promise<SpotlightRow | null> {
  const { data, error } = await db
    .from("tv_spotlight")
    .select("id, kind, text, shown_at")
    .eq("event_id", eventId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    fail("odczytać ekranu TV", error.message);
  }
  if (!data) {
    return null;
  }
  if (!isTvSpotlightKind(data.kind)) {
    fail("odczytać ekranu TV", `nieznany rodzaj ${data.kind}`);
  }
  return { id: data.id, spotlight: { kind: data.kind, text: data.text, shownAt: data.shown_at } };
}

async function newestId(db: DbClient, eventId: number): Promise<number | null> {
  const { data, error } = await db
    .from("tv_spotlight")
    .select("id")
    .eq("event_id", eventId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    fail("odczytać ekranu TV", error.message);
  }
  return data?.id ?? null;
}

// What is on the TV now (null = the plan).
export async function getTvSpotlight(db: DbClient, eventId: number): Promise<TvSpotlightDto | null> {
  return (await newestRow(db, eventId))?.spotlight ?? null;
}

async function show(
  db: DbClient,
  eventId: number,
  kind: TvSpotlightDto["kind"],
  text: string,
): Promise<TvSpotlightDto> {
  const { data, error } = await db
    .from("tv_spotlight")
    .insert({ event_id: eventId, kind, text })
    .select("id, shown_at")
    .single();
  if (error) {
    fail("pokazać na TV", error.message);
  }
  const older = await db.from("tv_spotlight").delete().eq("event_id", eventId).lt("id", data.id);
  if (older.error) {
    fail("pokazać na TV", older.error.message);
  }
  return { kind, text, shownAt: data.shown_at };
}

export type ShowOnTvResult = { status: "shown"; spotlight: TvSpotlightDto } | { status: "invalid" };

// The organizer sends a question or an AI topic to the TV; it stays there until hidden or replaced.
export async function showOnTv(
  db: DbClient,
  eventId: number,
  kind: "question" | "topic",
  rawText: string,
): Promise<ShowOnTvResult> {
  const text = normalizeSpotlightText(rawText);
  if (text === null) {
    return { status: "invalid" };
  }
  return { status: "shown", spotlight: await show(db, eventId, kind, text) };
}

export type DrawPersonResult = { status: "shown"; spotlight: TvSpotlightDto } | { status: "nobody" };

// Draws one PRESENT guest (CSPRNG) and puts their name on the TV; never the person on the TV right now unless they
// are the only one present.
export async function drawPersonOnTv(db: DbClient, eventId: number): Promise<DrawPersonResult> {
  const [guests, current] = await Promise.all([
    db.from("guest").select("display_name").eq("event_id", eventId).eq("is_absent", false),
    newestRow(db, eventId),
  ]);
  if (guests.error) {
    fail("odczytać listy gości", guests.error.message);
  }
  const shownName = current?.spotlight.kind === "person" ? current.spotlight.text : null;
  const name = pickPerson(
    guests.data.map((guest) => guest.display_name),
    shownName,
    secureRandom,
  );
  if (name === null) {
    return { status: "nobody" };
  }
  return { status: "shown", spotlight: await show(db, eventId, "person", name) };
}

// Back to the plan.
export async function hideTvSpotlight(db: DbClient, eventId: number): Promise<void> {
  const { error } = await db.from("tv_spotlight").delete().eq("event_id", eventId);
  if (error) {
    fail("schować z TV", error.message);
  }
}

// Everything the TV shows (the TV page and its poll use this one function, so their versions match).
// event-modules (S-17): with „Pokaż na TV” off (`spotlightOn` false) the TV shows no spotlight and the token's last part
// is 0, so the TV drops it on its next poll; the row stays and comes back when the module is on again.
export async function getTvScreen(db: DbClient, eventId: number, spotlightOn = true): Promise<TvScreenDto> {
  const [seating, current] = await Promise.all([
    getTvSeating(db, eventId),
    spotlightOn ? newestRow(db, eventId) : Promise.resolve(null),
  ]);
  return {
    ...seating,
    version: tvScreenVersion(seating.version, current?.id ?? null),
    spotlight: current?.spotlight ?? null,
  };
}

// The TV polling token without reading the seating (the 204 path): three tiny queries in parallel.
export async function getTvScreenVersion(db: DbClient, eventId: number, spotlightOn = true): Promise<string> {
  const [seatingVersion, spotlightId] = await Promise.all([
    getSeatingVersion(db, eventId),
    spotlightOn ? newestId(db, eventId) : Promise.resolve(null),
  ]);
  return tvScreenVersion(seatingVersion, spotlightId);
}
