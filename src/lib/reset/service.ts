import { EVENT_ID } from "@/lib/event";
import { starterQuestionRows } from "@/lib/questions/seed";
import type { DbClient } from "@/lib/supabase-client";
import { hideTvSpotlight } from "@/lib/tv-spotlight/service";
import type { ResetPart, ResetPreviewDto, ResetResultDto } from "@/types";
import { ResetCountsSchema, ResetEventAnswerSchema } from "./api";
import { expandResetParts } from "./parts";
import { describeResetResult } from "./summary";

// The organizer reset against the DB (DB functions reset_counts and reset_event, migration
// 20261030120000_reset_event.sql). Functions take the client as a parameter (no `astro:*`), so they are tested
// against the local DB. Supabase errors always throw; an event that does not exist comes back as null / not-found.
//
// The whole reset is ONE call of reset_event: one transaction, the starter questions passed in as data, so either
// every chosen part is reset or nothing is. After it, whatever the organizer put on the TV (tv-spotlight) is taken
// down, so no deleted guest's name or question stays there.

export type ResetEventResult = { status: "reset"; result: ResetResultDto } | { status: "not-found" };

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

// Fresh counts for the modal; null when the event does not exist.
export async function getResetPreview(db: DbClient): Promise<ResetPreviewDto | null> {
  const { data, error } = await db.rpc("reset_counts", { p_event_id: EVENT_ID });
  if (error) {
    if (error.message === "EVENT_NOT_FOUND") {
      return null;
    }
    fail("policzyć danych do resetu", error.message);
  }
  const counts = ResetCountsSchema.safeParse(data);
  if (!counts.success) {
    fail("policzyć danych do resetu", "nieoczekiwana odpowiedź bazy");
  }
  return { counts: counts.data, starterQuestions: starterQuestionRows().length };
}

// Resets the chosen parts (implied ones added here and again in the DB) in one transaction.
export async function resetEvent(db: DbClient, parts: readonly ResetPart[]): Promise<ResetEventResult> {
  const expanded = expandResetParts(parts);
  if (expanded.length === 0) {
    throw new TypeError("Nie wybrano niczego do resetu.");
  }
  const { data, error } = await db.rpc("reset_event", {
    p_event_id: EVENT_ID,
    p_parts: expanded,
    p_starter_questions: expanded.includes("questions") ? starterQuestionRows() : [],
  });
  if (error) {
    if (error.message === "EVENT_NOT_FOUND") {
      return { status: "not-found" };
    }
    fail("zresetować danych", error.message);
  }
  const answer = ResetEventAnswerSchema.safeParse(data);
  if (!answer.success) {
    fail("zresetować danych", "nieoczekiwana odpowiedź bazy");
  }
  // Best effort: the reset is already committed, so a failure here must not answer as if it had not happened.
  try {
    await hideTvSpotlight(db);
  } catch (spotlightError) {
    // eslint-disable-next-line no-console -- the only trace of it (Lambda logs); the reset itself is done
    console.error("Nie udało się zdjąć treści z ekranu TV po resecie:", spotlightError);
  }
  return { status: "reset", result: { ...answer.data, summary: describeResetResult(answer.data) } };
}
