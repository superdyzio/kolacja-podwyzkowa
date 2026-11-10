import type { z } from "astro/zod";
import type { DbClient } from "@/lib/supabase-client";
import type { GuestQuizDto, QuizBoardDto, TvQuizDto } from "@/types";
import { GuestQuizRpcSchema, QuizBoardRpcSchema, TvQuizRpcSchema, type QuizRunRequest } from "./api";
import {
  MAX_QUIZ_QUESTIONS,
  parseQuizQuestion,
  rankQuiz,
  tvQuizResults,
  type QuizInputProblem,
  type QuizQuestionInput,
} from "./rules";

// The pub quiz of one event (pub-quiz, S-28; PRD v2 FR-049). Every function takes the client and the event id
// (NFR-012); a question or guest of another event is an unknown one. Supabase errors always throw; expected outcomes
// come back as status unions. The run and the answers change only through the DB functions quiz_run_action and
// save_quiz_answer (per-event lock 3013; an answer only to the OPEN question). The module gate (pubQuiz) is the
// edge's (middleware, dispatcher, the guest and TV readers' callers), never checked here.

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

function parsed<T>(action: string, schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    fail(action, `nieoczekiwana odpowiedź bazy: ${result.error.message}`);
  }
  return result.data;
}

// The client's whole quiz (null for an unknown event or a template).
export async function getQuizBoard(db: DbClient, eventId: number): Promise<QuizBoardDto | null> {
  const { data, error } = await db.rpc("quiz_board", { p_event_id: eventId });
  if (error) {
    fail("odczytać quizu", error.message);
  }
  if (data === null) {
    return null;
  }
  const board = parsed("odczytać quizu", QuizBoardRpcSchema, data);
  const questions = board.questions.map((question, index) => ({
    id: question.id,
    number: index + 1,
    text: question.text,
    options: question.options,
    correct: question.correct,
    askedAt: question.askedAt,
    closedAt: question.closedAt,
    answers: question.counts.reduce((sum, count) => sum + count, 0),
    counts: question.counts,
  }));
  return {
    run: board.run,
    questions,
    standings: rankQuiz(board.standings),
    closed: questions.filter((question) => question.closedAt !== null).length,
    guestCount: board.guestCount,
    maxQuestions: MAX_QUIZ_QUESTIONS,
  };
}

interface QuestionRow {
  id: number;
  text: string;
  options: string[];
  correct_option: number;
  asked_at: string | null;
}

async function findQuestion(db: DbClient, eventId: number, questionId: number): Promise<QuestionRow | null> {
  const { data, error } = await db
    .from("quiz_question")
    .select("id, text, options, correct_option, asked_at")
    .eq("event_id", eventId)
    .eq("id", questionId)
    .maybeSingle();
  if (error) {
    fail("odczytać pytania quizu", error.message);
  }
  return data;
}

export type AddQuizQuestionResult = { status: "added"; id: number } | { status: "full" };

// A new question at the end of the list (the input already checked by parseQuizQuestion).
export async function addQuizQuestion(
  db: DbClient,
  eventId: number,
  input: QuizQuestionInput,
): Promise<AddQuizQuestionResult> {
  const { count, error: countError } = await db
    .from("quiz_question")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (countError) {
    fail("policzyć pytań quizu", countError.message);
  }
  if ((count ?? 0) >= MAX_QUIZ_QUESTIONS) {
    return { status: "full" };
  }
  const { data, error } = await db
    .from("quiz_question")
    .insert({ event_id: eventId, text: input.text, options: input.options, correct_option: input.correct })
    .select("id")
    .single();
  if (error) {
    fail("dodać pytania quizu", error.message);
  }
  return { status: "added", id: data.id };
}

export interface QuizQuestionPatch {
  text?: string;
  options?: string[];
  correct?: number;
}

export type UpdateQuizQuestionResult =
  | { status: "updated" }
  | { status: "not-found" }
  | { status: "locked" }
  | { status: "invalid"; problem: QuizInputProblem };

// Edits a question never asked (an asked one is locked: its answers would change meaning). The patch is merged with
// the stored question and the whole is checked again by the rule.
export async function updateQuizQuestion(
  db: DbClient,
  eventId: number,
  questionId: number,
  patch: QuizQuestionPatch,
): Promise<UpdateQuizQuestionResult> {
  const row = await findQuestion(db, eventId, questionId);
  if (!row) {
    return { status: "not-found" };
  }
  if (row.asked_at !== null) {
    return { status: "locked" };
  }
  const checked = parseQuizQuestion({
    text: patch.text ?? row.text,
    options: patch.options ?? row.options,
    correct: patch.correct ?? row.correct_option,
  });
  if (!checked.ok) {
    return { status: "invalid", problem: checked.problem };
  }
  // `asked_at is null` again in the write: a question asked in the meantime stays as it was.
  const { data, error } = await db
    .from("quiz_question")
    .update({ text: checked.value.text, options: checked.value.options, correct_option: checked.value.correct })
    .eq("event_id", eventId)
    .eq("id", questionId)
    .is("asked_at", null)
    .select("id");
  if (error) {
    fail("zapisać pytania quizu", error.message);
  }
  return data.length > 0 ? { status: "updated" } : { status: "locked" };
}

export type DeleteQuizQuestionResult = { status: "deleted" } | { status: "not-found" } | { status: "on-tv" };

// Deletes a question with its answers (a closed one changes the live standings); never the one on the TV now. One DB
// function under the quiz lock (3013, event), so an `ask` of the same question at the same moment either waits for
// the delete or makes it refuse (review-fixes; the check and the delete were two requests before).
export async function deleteQuizQuestion(
  db: DbClient,
  eventId: number,
  questionId: number,
): Promise<DeleteQuizQuestionResult> {
  const { error } = await db.rpc("delete_quiz_question", { p_event_id: eventId, p_question_id: questionId });
  if (error) {
    if (error.message.includes("QUESTION_ON_TV")) {
      return { status: "on-tv" };
    }
    if (error.message.includes("QUESTION_NOT_FOUND")) {
      return { status: "not-found" };
    }
    fail("usunąć pytania quizu", error.message);
  }
  return { status: "deleted" };
}

export type QuizRunResult =
  | { status: "done" }
  | { status: "not-found" }
  | { status: "question-open" }
  | { status: "question-asked" }
  | { status: "no-open-question" };

// One step of the run (start, ask, close, results, end) under the quiz lock. An unknown question (or another
// event's, or an unknown event) is `not-found`.
export async function runQuizAction(db: DbClient, eventId: number, request: QuizRunRequest): Promise<QuizRunResult> {
  const { error } = await db.rpc("quiz_run_action", {
    p_event_id: eventId,
    p_action: request.action,
    p_question_id: request.action === "ask" ? request.questionId : null,
  });
  if (error) {
    if (error.message.includes("QUESTION_OPEN")) {
      return { status: "question-open" };
    }
    if (error.message.includes("QUESTION_ASKED")) {
      return { status: "question-asked" };
    }
    if (error.message.includes("NO_OPEN_QUESTION")) {
      return { status: "no-open-question" };
    }
    if (error.message.includes("QUESTION_NOT_FOUND") || error.message.includes("EVENT_NOT_FOUND")) {
      return { status: "not-found" };
    }
    fail("zmienić przebiegu quizu", error.message);
  }
  return { status: "done" };
}

export type AnswerQuizResult =
  { status: "saved" } | { status: "closed" } | { status: "out-of-range" } | { status: "not-found" };

// The guest's own answer: only to the event's OPEN question (any other id — unknown, another event's, not asked,
// closed — is `closed`, one answer for all), an option of that question.
export async function answerQuiz(
  db: DbClient,
  eventId: number,
  guestId: number,
  questionId: number,
  option: number,
): Promise<AnswerQuizResult> {
  const { error } = await db.rpc("save_quiz_answer", {
    p_event_id: eventId,
    p_guest_id: guestId,
    p_question_id: questionId,
    p_choice: option,
  });
  if (error) {
    if (error.message.includes("QUIZ_CLOSED")) {
      return { status: "closed" };
    }
    if (error.message.includes("OPTION_OUT_OF_RANGE")) {
      return { status: "out-of-range" };
    }
    if (error.message.includes("GUEST_NOT_FOUND")) {
      return { status: "not-found" };
    }
    fail("zapisać odpowiedzi w quizie", error.message);
  }
  return { status: "saved" };
}

// The guest's own quiz for the phone (null without a run): one RPC, on both poll paths.
export async function getGuestQuiz(db: DbClient, eventId: number, guestId: number): Promise<GuestQuizDto | null> {
  const { data, error } = await db.rpc("quiz_guest_state", { p_event_id: eventId, p_guest_id: guestId });
  if (error) {
    fail("odczytać quizu gościa", error.message);
  }
  if (data === null) {
    return null;
  }
  return parsed("odczytać quizu gościa", GuestQuizRpcSchema, data);
}

export interface TvQuizState {
  version: string;
  quiz: TvQuizDto;
}

// What the TV shows of the quiz with its token part (computed in the same statement), or null without a run.
export async function getTvQuiz(db: DbClient, eventId: number): Promise<TvQuizState | null> {
  const { data, error } = await db.rpc("quiz_tv_state", { p_event_id: eventId });
  if (error) {
    fail("odczytać quizu na TV", error.message);
  }
  if (data === null) {
    return null;
  }
  const state = parsed("odczytać quizu na TV", TvQuizRpcSchema, data);
  return {
    version: state.version,
    quiz: {
      phase: state.phase,
      total: state.total,
      closed: state.closed,
      question: state.question,
      results: state.results ? tvQuizResults(state.results.players, state.results.top) : null,
    },
  };
}

// The TV token's quiz part without reading the state (the 204 path), or null without a run.
export async function getTvQuizVersion(db: DbClient, eventId: number): Promise<string | null> {
  const { data, error } = await db.rpc("quiz_tv_version", { p_event_id: eventId });
  if (error) {
    fail("odczytać wersji quizu na TV", error.message);
  }
  return data ?? null;
}
