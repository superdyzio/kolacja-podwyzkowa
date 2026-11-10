import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getGuestState, getGuestStateVersion } from "@/lib/guest-links";
import { addGuests, deleteGuest } from "@/lib/guests";
import { ALL_GUEST_MODULES } from "@/lib/modules/rules";
import {
  addQuizQuestion,
  answerQuiz,
  deleteQuizQuestion,
  getGuestQuiz,
  getQuizBoard,
  getTvQuiz,
  getTvQuizVersion,
  parseQuizQuestion,
  runQuizAction,
  updateQuizQuestion,
} from "@/lib/quiz";
import { getResetPreview, resetEvent } from "@/lib/reset/service";
import type { DbClient } from "@/lib/supabase-client";
import { getTvScreen, getTvScreenVersion } from "@/lib/tv-spotlight/service";
import { createTestEvent, hasLocalDb, localDb, releaseTestEvent, type TestEvent } from "./helpers";

// pub-quiz (S-28; FR-049): questions locked once asked, answers only to the OPEN question (a late one after the close
// is refused under the lock), points from closed questions only, competition places at the results, the phone's and
// the TV's tokens equal on the 204 and the 200 path, nothing of event B through event A, the reset part `quiz`, and a
// deleted guest's answers gone with them.

describe.skipIf(!hasLocalDb)("pub quiz (integration)", () => {
  let db: DbClient;
  let a: TestEvent;
  let b: TestEvent;
  const guest: Record<string, { id: number; displayName: string }> = {};
  let foreignGuest = 0;
  let foreignQuestion = 0;
  const question: number[] = [];

  async function add(eventId: number, text: string, options: string[], correct: number): Promise<number> {
    const checked = parseQuizQuestion({ text, options, correct });
    if (!checked.ok) {
      throw new Error(checked.problem);
    }
    const result = await addQuizQuestion(db, eventId, checked.value);
    if (result.status !== "added") {
      throw new Error(result.status);
    }
    return result.id;
  }

  async function phoneTokensAgree(name: string): Promise<string> {
    const state = await getGuestState(db, a.id, guest[name], ALL_GUEST_MODULES);
    expect(await getGuestStateVersion(db, a.id, guest[name], ALL_GUEST_MODULES)).toBe(state.version);
    return state.version;
  }

  async function tvTokensAgree(): Promise<string> {
    const screen = await getTvScreen(db, a.id, true, true);
    expect(await getTvScreenVersion(db, a.id, true, true)).toBe(screen.version);
    return screen.version;
  }

  beforeAll(async () => {
    db = localDb();
    a = await createTestEvent(db, "quiz A");
    b = await createTestEvent(db, "quiz B");
    const added = await addGuests(db, a.id, ["Ania Quiz", "Bartek Quiz", "Celina Quiz", "Darek Quiz"]);
    if (added.status !== "added") {
      throw new Error(added.status);
    }
    for (const row of added.added) {
      guest[row.displayName.split(" ")[0]] = { id: row.id, displayName: row.displayName };
    }
    const other = await addGuests(db, b.id, ["Obcy Quiz"]);
    if (other.status !== "added") {
      throw new Error(other.status);
    }
    foreignGuest = other.added[0].id;
    foreignQuestion = await add(b.id, "Pytanie B?", ["Tak", "Nie"], 0);
  });

  afterAll(async () => {
    await releaseTestEvent(db, a);
    await releaseTestEvent(db, b);
  });

  it("starts empty: no run, no phone quiz, no TV quiz, the TV token without a quiz part when the module is off", async () => {
    const board = await getQuizBoard(db, a.id);
    expect(board).toMatchObject({ run: null, questions: [], standings: [], closed: 0, guestCount: 4 });
    expect(await getGuestQuiz(db, a.id, guest.Ania.id)).toBeNull();
    expect(await getTvQuiz(db, a.id)).toBeNull();
    expect(await getTvQuizVersion(db, a.id)).toBeNull();
    const off = await getTvScreenVersion(db, a.id, true, false);
    const on = await getTvScreenVersion(db, a.id, true, true);
    expect(on).toBe(`${off}.0`);
    expect((await getTvScreen(db, a.id, true, false)).quiz).toBeNull();
    const quizOff = await getGuestState(db, a.id, guest.Ania, { ...ALL_GUEST_MODULES, pubQuiz: false });
    expect(quizOff.quiz).toBeNull();
  });

  it("adds and edits questions in order; another event's question is unknown", async () => {
    question.push(await add(a.id, "Ile lat Ania pracuje?", ["2", "5", "10"], 1));
    question.push(await add(a.id, "Ulubiony kolor Bartka?", ["Zielony", "Niebieski"], 0));
    question.push(await add(a.id, "Gdzie była integracja?", ["Zakopane", "Sopot", "Mazury", "Kraków"], 3));
    expect((await updateQuizQuestion(db, a.id, question[1], { correct: 1 })).status).toBe("updated");
    expect(await updateQuizQuestion(db, a.id, question[1], { options: ["Zielony", "zielony"] })).toEqual({
      status: "invalid",
      problem: "duplicate",
    });
    expect(await updateQuizQuestion(db, a.id, question[1], { correct: 2 })).toEqual({
      status: "invalid",
      problem: "correct",
    });
    expect((await updateQuizQuestion(db, a.id, foreignQuestion, { correct: 1 })).status).toBe("not-found");
    expect((await deleteQuizQuestion(db, a.id, foreignQuestion)).status).toBe("not-found");
    expect((await runQuizAction(db, a.id, { action: "ask", questionId: foreignQuestion })).status).toBe("not-found");
    const board = await getQuizBoard(db, a.id);
    expect(board?.questions.map((q) => [q.number, q.text, q.correct, q.counts])).toEqual([
      [1, "Ile lat Ania pracuje?", 1, [0, 0, 0]],
      [2, "Ulubiony kolor Bartka?", 1, [0, 0]],
      [3, "Gdzie była integracja?", 3, [0, 0, 0, 0]],
    ]);
  });

  it("runs a question: the phone and the TV show it without the correct option, answers change until the close", async () => {
    const before = await tvTokensAgree();
    expect((await runQuizAction(db, a.id, { action: "close" })).status).toBe("no-open-question");
    expect((await runQuizAction(db, a.id, { action: "start" })).status).toBe("done");
    expect((await getGuestQuiz(db, a.id, guest.Ania.id))?.phase).toBe("intro");
    const intro = await tvTokensAgree();
    expect(intro).not.toBe(before);

    expect((await runQuizAction(db, a.id, { action: "ask", questionId: question[0] })).status).toBe("done");
    const phoneBefore = await phoneTokensAgree("Ania");
    const shown = await getGuestQuiz(db, a.id, guest.Ania.id);
    expect(shown).toMatchObject({
      phase: "question",
      total: 3,
      closed: 0,
      question: { id: question[0], number: 1, options: ["2", "5", "10"], correct: null },
      answer: null,
      points: 0,
      result: null,
    });
    expect((await getTvQuiz(db, a.id))?.quiz.question).toMatchObject({
      number: 1,
      answered: 0,
      correct: null,
      counts: null,
    });

    // Locked once asked; never deleted while on the TV; nothing else asked while it is open.
    expect((await updateQuizQuestion(db, a.id, question[0], { text: "Inne?" })).status).toBe("locked");
    expect((await deleteQuizQuestion(db, a.id, question[0])).status).toBe("on-tv");
    expect((await runQuizAction(db, a.id, { action: "ask", questionId: question[1] })).status).toBe("question-open");
    expect((await runQuizAction(db, a.id, { action: "results" })).status).toBe("question-open");

    const tvBefore = await tvTokensAgree();
    expect((await answerQuiz(db, a.id, guest.Ania.id, question[0], 0)).status).toBe("saved");
    expect((await answerQuiz(db, a.id, guest.Ania.id, question[0], 1)).status).toBe("saved");
    expect((await answerQuiz(db, a.id, guest.Bartek.id, question[0], 2)).status).toBe("saved");
    expect((await answerQuiz(db, a.id, guest.Celina.id, question[0], 1)).status).toBe("saved");
    expect((await answerQuiz(db, a.id, guest.Darek.id, question[0], 3)).status).toBe("out-of-range");
    // Any other question id is „closed”: not asked yet, another event's, unknown.
    expect((await answerQuiz(db, a.id, guest.Darek.id, question[1], 0)).status).toBe("closed");
    expect((await answerQuiz(db, a.id, guest.Darek.id, foreignQuestion, 0)).status).toBe("closed");
    expect((await answerQuiz(db, a.id, guest.Darek.id, 999_999_999, 0)).status).toBe("closed");
    // Event B's guest through event B (its key) sees no open question; through event A it is no guest of A.
    expect((await answerQuiz(db, b.id, foreignGuest, question[0], 0)).status).toBe("closed");
    expect((await answerQuiz(db, a.id, foreignGuest, question[0], 0)).status).toBe("not-found");

    expect((await getGuestQuiz(db, a.id, guest.Ania.id))?.answer).toBe(1);
    expect(await phoneTokensAgree("Ania")).not.toBe(phoneBefore);
    expect(await tvTokensAgree()).not.toBe(tvBefore);
    const tv = await getTvQuiz(db, a.id);
    expect(tv?.quiz.question).toMatchObject({ answered: 3, correct: null, counts: null });
    expect(JSON.stringify(tv)).not.toContain("Ania Quiz");
  });

  it("closes: the correct option and counts show, a late answer is refused, points count", async () => {
    expect((await runQuizAction(db, a.id, { action: "close" })).status).toBe("done");
    expect((await answerQuiz(db, a.id, guest.Darek.id, question[0], 1)).status).toBe("closed");
    expect(await getGuestQuiz(db, a.id, guest.Ania.id)).toMatchObject({
      phase: "reveal",
      closed: 1,
      question: { correct: 1 },
      answer: 1,
      points: 1,
    });
    expect((await getGuestQuiz(db, a.id, guest.Bartek.id))?.points).toBe(0);
    expect((await getTvQuiz(db, a.id))?.quiz.question).toMatchObject({ correct: 1, counts: [0, 2, 1] });
    expect((await runQuizAction(db, a.id, { action: "ask", questionId: question[0] })).status).toBe("question-asked");
    expect((await deleteQuizQuestion(db, a.id, question[0])).status).toBe("on-tv");
    const board = await getQuizBoard(db, a.id);
    expect(board?.closed).toBe(1);
    expect(board?.standings.map((row) => [row.place, row.name, row.points, row.answered])).toEqual([
      [1, "Ania Quiz", 1, 1],
      [1, "Celina Quiz", 1, 1],
      [3, "Bartek Quiz", 0, 1],
    ]);
  });

  it("ends with an open question closed, then shows the results with places 1–3 by name", async () => {
    expect((await runQuizAction(db, a.id, { action: "ask", questionId: question[1] })).status).toBe("done");
    expect((await answerQuiz(db, a.id, guest.Bartek.id, question[1], 1)).status).toBe("saved");
    expect((await answerQuiz(db, a.id, guest.Darek.id, question[1], 1)).status).toBe("saved");
    expect((await runQuizAction(db, a.id, { action: "end" })).status).toBe("done");
    expect(await getGuestQuiz(db, a.id, guest.Ania.id)).toBeNull();
    expect(await getTvQuiz(db, a.id)).toBeNull();
    const ended = await getQuizBoard(db, a.id);
    expect(ended?.run).toBeNull();
    expect(ended?.questions[1]?.closedAt).not.toBeNull();

    expect((await runQuizAction(db, a.id, { action: "results" })).status).toBe("done");
    const tv = await getTvQuiz(db, a.id);
    expect(tv?.quiz.phase).toBe("results");
    expect(tv?.quiz.question).toBeNull();
    // Ania 1, Celina 1, Bartek 1 (0 + 1), Darek 1 → everyone first.
    expect(tv?.quiz.results).toEqual({
      players: 4,
      entries: [
        { place: 1, name: "Ania Quiz", points: 1 },
        { place: 1, name: "Bartek Quiz", points: 1 },
        { place: 1, name: "Celina Quiz", points: 1 },
        { place: 1, name: "Darek Quiz", points: 1 },
      ],
      more: 0,
    });
    expect(await getGuestQuiz(db, a.id, guest.Darek.id)).toMatchObject({
      phase: "results",
      question: null,
      answer: null,
      points: 1,
      result: { place: 1, players: 4 },
    });
    await phoneTokensAgree("Darek");
    await tvTokensAgree();
  });

  it("takes a deleted guest's answers and score with them", async () => {
    expect((await deleteGuest(db, a.id, guest.Darek.id)).status).toBe("deleted");
    const tv = await getTvQuiz(db, a.id);
    expect(tv?.quiz.results?.players).toBe(3);
    expect(JSON.stringify(tv)).not.toContain("Darek");
    expect((await getQuizBoard(db, a.id))?.standings.map((row) => row.name)).not.toContain("Darek Quiz");
  });

  it("resets the quiz part: answers, scores and the run go, the questions stay and can be asked again", async () => {
    const preview = await getResetPreview(db, a.id);
    expect(preview?.counts).toMatchObject({ quizAnswers: 4, quizAsked: 2 });
    const result = await resetEvent(db, a.id, ["quiz"]);
    expect(result.status).toBe("reset");
    const board = await getQuizBoard(db, a.id);
    expect(board?.run).toBeNull();
    expect(board?.standings).toEqual([]);
    expect(board?.questions.map((q) => [q.askedAt, q.closedAt, q.answers])).toEqual([
      [null, null, 0],
      [null, null, 0],
      [null, null, 0],
    ]);
    expect((await getResetPreview(db, a.id))?.counts).toMatchObject({ quizAnswers: 0, quizAsked: 0 });
    expect((await runQuizAction(db, a.id, { action: "ask", questionId: question[0] })).status).toBe("done");
    expect((await runQuizAction(db, a.id, { action: "end" })).status).toBe("done");
    // Event B's quiz is untouched by A's reset.
    expect((await getQuizBoard(db, b.id))?.questions).toHaveLength(1);
  });

  it("frees a run whose question was deleted from under it (no stuck phase)", async () => {
    const extra = await add(a.id, "Pytanie do usunięcia?", ["A", "B"], 0);
    expect((await runQuizAction(db, a.id, { action: "ask", questionId: extra })).status).toBe("done");
    const { error } = await db.from("quiz_question").delete().eq("event_id", a.id).eq("id", extra);
    expect(error).toBeNull();
    expect((await getGuestQuiz(db, a.id, guest.Ania.id))?.question).toBeNull();
    expect((await runQuizAction(db, a.id, { action: "start" })).status).toBe("done");
    expect((await runQuizAction(db, a.id, { action: "end" })).status).toBe("done");
  });
});
