import { EVENT_ID } from "@/lib/event";
import { secureRandom } from "@/lib/questions/draw";
import { getSeatingVersion, getTvSeating } from "@/lib/seating/service";
import type { DbClient } from "@/lib/supabase-client";
import type { TvScreenDto, TvSpotlightDto } from "@/types";
import { pickPerson } from "./draw";
import { isTvSpotlightKind, normalizeSpotlightText, tvScreenVersion } from "./rules";

// What the organizer shows on the TV over the seating (tv-spotlight) for the singleton event. Functions take the client
// as a parameter (no `astro:*`), so they are tested against the local DB. Supabase errors always throw.
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

async function newestRow(db: DbClient): Promise<SpotlightRow | null> {
  const { data, error } = await db
    .from("tv_spotlight")
    .select("id, kind, text, shown_at")
    .eq("event_id", EVENT_ID)
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

async function newestId(db: DbClient): Promise<number | null> {
  const { data, error } = await db
    .from("tv_spotlight")
    .select("id")
    .eq("event_id", EVENT_ID)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    fail("odczytać ekranu TV", error.message);
  }
  return data?.id ?? null;
}

// What is on the TV now (null = the plan).
export async function getTvSpotlight(db: DbClient): Promise<TvSpotlightDto | null> {
  return (await newestRow(db))?.spotlight ?? null;
}

async function show(db: DbClient, kind: TvSpotlightDto["kind"], text: string): Promise<TvSpotlightDto> {
  const { data, error } = await db
    .from("tv_spotlight")
    .insert({ event_id: EVENT_ID, kind, text })
    .select("id, shown_at")
    .single();
  if (error) {
    fail("pokazać na TV", error.message);
  }
  const older = await db.from("tv_spotlight").delete().eq("event_id", EVENT_ID).lt("id", data.id);
  if (older.error) {
    fail("pokazać na TV", older.error.message);
  }
  return { kind, text, shownAt: data.shown_at };
}

export type ShowOnTvResult = { status: "shown"; spotlight: TvSpotlightDto } | { status: "invalid" };

// The organizer sends a question or an AI topic to the TV; it stays there until hidden or replaced.
export async function showOnTv(db: DbClient, kind: "question" | "topic", rawText: string): Promise<ShowOnTvResult> {
  const text = normalizeSpotlightText(rawText);
  if (text === null) {
    return { status: "invalid" };
  }
  return { status: "shown", spotlight: await show(db, kind, text) };
}

export type DrawPersonResult = { status: "shown"; spotlight: TvSpotlightDto } | { status: "nobody" };

// Draws one PRESENT guest (CSPRNG) and puts their name on the TV; never the person on the TV right now unless they
// are the only one present.
export async function drawPersonOnTv(db: DbClient): Promise<DrawPersonResult> {
  const [guests, current] = await Promise.all([
    db.from("guest").select("display_name").eq("is_absent", false),
    newestRow(db),
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
  return { status: "shown", spotlight: await show(db, "person", name) };
}

// Back to the plan.
export async function hideTvSpotlight(db: DbClient): Promise<void> {
  const { error } = await db.from("tv_spotlight").delete().eq("event_id", EVENT_ID);
  if (error) {
    fail("schować z TV", error.message);
  }
}

// Everything the TV shows (the TV page and its poll use this one function, so their versions match).
export async function getTvScreen(db: DbClient): Promise<TvScreenDto> {
  const [seating, current] = await Promise.all([getTvSeating(db), newestRow(db)]);
  return {
    ...seating,
    version: tvScreenVersion(seating.version, current?.id ?? null),
    spotlight: current?.spotlight ?? null,
  };
}

// The TV polling token without reading the seating (the 204 path): three tiny queries in parallel.
export async function getTvScreenVersion(db: DbClient): Promise<string> {
  const [seatingVersion, spotlightId] = await Promise.all([getSeatingVersion(db), newestId(db)]);
  return tvScreenVersion(seatingVersion, spotlightId);
}
