import type { DbClient } from "@/lib/supabase-client";
import type { QuestionCategory, QuestionDto, QuestionListDto, QuestionRow } from "@/types";
import { isQuestionCategory, QUESTION_CATEGORIES } from "./categories";
import { pickQuestion, secureRandom } from "./draw";
import { starterQuestionRows } from "./seed";
import {
  MAX_QUESTIONS,
  normalizeQuestionText,
  questionKey,
  validateQuestionText,
  type QuestionTextProblem,
} from "./text";

// The event's question base and the draw (S-07, PRD FR-014, FR-015). Functions take the client as a parameter (no
// `astro:*`), so they are tested against the local DB. Supabase errors always throw; expected outcomes (not found,
// duplicate, limits) come back as status unions.
//
// Every insert is one "on conflict (event_id, text_key) do nothing" upsert: text_key = lower(text) is unique per
// event across categories, so pastes and the starter load are idempotent, and what was added is counted from the
// rows the insert returned (never from a pre-check that a concurrent request could have made stale).

export const QUESTION_NOT_FOUND_MESSAGE = "Nie znaleziono pytania.";
export const QUESTION_DUPLICATE_MESSAGE = "To pytanie już jest w bazie.";
export const EMPTY_CATEGORY_MESSAGE = "W tej kategorii nie ma jeszcze pytań.";
export const EMPTY_BASE_MESSAGE = "Baza pytań jest pusta.";

const UNIQUE_VIOLATION = "23505";
const COLUMNS = "id, category, text";
const ON_CONFLICT = "event_id,text_key";

type QuestionColumns = Pick<QuestionRow, "id" | "category" | "text">;

export type AddQuestionsResult =
  | { status: "added"; added: QuestionDto[]; duplicates: string[] }
  | { status: "too-many"; limit: number; existing: number };

export type UpdateQuestionResult =
  | { status: "updated"; question: QuestionDto }
  | { status: "not-found" }
  | { status: "duplicate" }
  | { status: "invalid"; reason: QuestionTextProblem };

export type DeleteQuestionResult = { status: "deleted" } | { status: "not-found" };

export interface QuestionPatch {
  text?: string;
  category?: QuestionCategory;
}

export interface DrawRequest {
  // null = every category.
  category: QuestionCategory | null;
  // Ids this person drew lately, oldest first (see pickQuestion).
  recent: readonly number[];
}

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

function toQuestionDto(row: QuestionColumns): QuestionDto {
  if (!isQuestionCategory(row.category)) {
    throw new Error(`Nieznana kategoria pytania: ${row.category}`);
  }
  return { id: row.id, category: row.category, text: row.text };
}

function compareQuestions(a: QuestionDto, b: QuestionDto): number {
  return QUESTION_CATEGORIES.indexOf(a.category) - QUESTION_CATEGORIES.indexOf(b.category) || a.id - b.id;
}

// Starter questions whose text is not in the base (in any category).
function countStarterMissing(questions: readonly QuestionDto[]): number {
  const keys = new Set(questions.map((question) => questionKey(question.text)));
  return starterQuestionRows().filter((row) => !keys.has(questionKey(row.text))).length;
}

// The whole base: category order, then by id (the starter base keeps its list order).
export async function getQuestionList(db: DbClient): Promise<QuestionListDto> {
  const { data, error } = await db.from("question").select(COLUMNS);
  if (error) {
    fail("odczytać bazy pytań", error.message);
  }
  const questions = data.map(toQuestionDto).sort(compareQuestions);
  return { questions, starterMissing: countStarterMissing(questions) };
}

// Adds questions to one category. Expects texts already parsed (parseQuestionPaste); an invalid text is a caller bug.
// Texts already in the base (any category, any letter case) are reported as duplicates. Refuses everything when the
// base would grow past `limit` (a parameter only so tests can reach the boundary).
export async function addQuestions(
  db: DbClient,
  category: QuestionCategory,
  texts: readonly string[],
  limit: number = MAX_QUESTIONS,
): Promise<AddQuestionsResult> {
  const invalid = texts.find((text) => normalizeQuestionText(text) !== text || validateQuestionText(text) !== null);
  if (invalid !== undefined) {
    throw new TypeError(`Nieprawidłowe pytanie: „${invalid}”`);
  }
  if (texts.length === 0) {
    return { status: "added", added: [], duplicates: [] };
  }

  const { data: existing, error: readError } = await db.from("question").select("text");
  if (readError) {
    fail("odczytać bazy pytań", readError.message);
  }
  const taken = new Set(existing.map((row) => questionKey(row.text)));
  const duplicates: string[] = [];
  const fresh: string[] = [];
  for (const text of texts) {
    const key = questionKey(text);
    if (taken.has(key)) {
      duplicates.push(text);
    } else {
      taken.add(key);
      fresh.push(text);
    }
  }
  if (existing.length + fresh.length > limit) {
    return { status: "too-many", limit, existing: existing.length };
  }
  if (fresh.length === 0) {
    return { status: "added", added: [], duplicates };
  }

  const { data, error } = await db
    .from("question")
    .upsert(
      fresh.map((text) => ({ category, text })),
      { onConflict: ON_CONFLICT, ignoreDuplicates: true },
    )
    .select(COLUMNS);
  if (error) {
    fail("dodać pytań", error.message);
  }
  const added = data.map(toQuestionDto).sort((a, b) => a.id - b.id);
  // Someone added the same text in the meantime: the insert skipped it.
  const addedKeys = new Set(added.map((question) => questionKey(question.text)));
  const raced = fresh.filter((text) => !addedKeys.has(questionKey(text)));
  return { status: "added", added, duplicates: [...duplicates, ...raced] };
}

// Changes a question's text and/or category.
export async function updateQuestion(db: DbClient, id: number, patch: QuestionPatch): Promise<UpdateQuestionResult> {
  const update: { text?: string; category?: QuestionCategory } = {};
  if (patch.text !== undefined) {
    const text = normalizeQuestionText(patch.text);
    const problem = validateQuestionText(text);
    if (problem) {
      return { status: "invalid", reason: problem };
    }
    update.text = text;
  }
  if (patch.category !== undefined) {
    update.category = patch.category;
  }

  const query =
    Object.keys(update).length > 0
      ? db.from("question").update(update).eq("id", id).select(COLUMNS).maybeSingle()
      : db.from("question").select(COLUMNS).eq("id", id).maybeSingle();
  const { data, error } = await query;
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { status: "duplicate" };
    }
    fail("zmienić pytania", error.message);
  }
  return data ? { status: "updated", question: toQuestionDto(data) } : { status: "not-found" };
}

export async function deleteQuestion(db: DbClient, id: number): Promise<DeleteQuestionResult> {
  const { data, error } = await db.from("question").delete().eq("id", id).select("id");
  if (error) {
    fail("usunąć pytania", error.message);
  }
  return data.length > 0 ? { status: "deleted" } : { status: "not-found" };
}

// Adds every starter question that is not in the base yet (by text, in any category). Idempotent; never limited by
// MAX_QUESTIONS (the starter base is small and known).
export async function loadStarterQuestions(db: DbClient): Promise<{ added: number }> {
  const { data, error } = await db
    .from("question")
    .upsert(starterQuestionRows(), { onConflict: ON_CONFLICT, ignoreDuplicates: true })
    .select("id");
  if (error) {
    fail("wczytać bazy startowej pytań", error.message);
  }
  return { added: data.length };
}

// Draws one question of the category (or of all), avoiding the drawer's recent ones; null when there is none.
// The result goes only to whoever asked: nothing is stored.
export async function drawQuestion(
  db: DbClient,
  { category, recent }: DrawRequest,
  random: () => number = secureRandom,
): Promise<QuestionDto | null> {
  const query = db.from("question").select(COLUMNS);
  const { data, error } = await (category ? query.eq("category", category) : query);
  if (error) {
    fail("wylosować pytania", error.message);
  }
  return pickQuestion(data.map(toQuestionDto), recent, random);
}
