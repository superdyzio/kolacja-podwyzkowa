import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  addQuestions,
  deleteQuestion,
  drawQuestion,
  getQuestionList,
  loadStarterQuestions,
  STARTER_QUESTIONS,
  starterQuestionRows,
  updateQuestion,
} from "@/lib/questions";
import type { DbClient } from "@/lib/supabase-client";
import type { QuestionCategory, QuestionDto } from "@/types";
import {
  createTestEvent,
  deleteTestQuestions,
  hasLocalDb,
  localDb,
  releaseTestEvent,
  testTag,
  type TestEvent,
} from "./helpers";

// The question services (S-07) against the local DB. The suite may run next to the user's real question base: every
// text carries a per-run tag and each test deletes only the questions it created. Tests that delete or (re)load
// starter questions run only on an event this suite created itself (a reload would bring back questions the user
// deleted on purpose).
describe.skipIf(!hasLocalDb)("question base and draw against the local DB", () => {
  let db: DbClient;
  let event: TestEvent;
  const tag = testTag();
  let created: number[] = [];

  const tagged = (text: string) => `${text} ${tag}?`;
  const UNKNOWN_ID = 2_000_000_000;

  async function add(category: QuestionCategory, ...texts: string[]): Promise<QuestionDto[]> {
    const result = await addQuestions(db, event.id, category, texts);
    if (result.status !== "added") {
      throw new Error(`addQuestions failed: ${JSON.stringify(result)}`);
    }
    created.push(...result.added.map((question) => question.id));
    return result.added;
  }

  async function idsOf(category: QuestionCategory): Promise<number[]> {
    return (await getQuestionList(db, event.id)).questions
      .filter((question) => question.category === category)
      .map((question) => question.id);
  }

  beforeAll(async () => {
    db = localDb();
    event = await createTestEvent(db);
  });

  afterEach(async () => {
    await deleteTestQuestions(db, created);
    created = [];
  });

  afterAll(async () => {
    await releaseTestEvent(db, event);
  });

  describe("paste, edit, delete", () => {
    it("adds questions to the chosen category and lists them in category order", async () => {
      const [first, second] = await add("refleksyjne", tagged("Pierwsze"), tagged("Drugie"));
      const [third] = await add("kontrowersyjne", tagged("Trzecie"));
      expect(first).toMatchObject({ category: "refleksyjne", text: tagged("Pierwsze") });
      const list = await getQuestionList(db, event.id);
      const own = list.questions.filter((question) => created.includes(question.id));
      expect(own.map((question) => question.id)).toEqual([third.id, first.id, second.id]);
      const categories = list.questions.map((question) => question.category);
      expect(categories).toEqual(
        [...categories].sort(
          (a, b) =>
            ["kontrowersyjne", "generyczne", "refleksyjne"].indexOf(a) -
            ["kontrowersyjne", "generyczne", "refleksyjne"].indexOf(b),
        ),
      );
    });

    it("reports duplicates of the base in any category and letter case, adding the rest", async () => {
      await add("generyczne", tagged("Żółta łódź"));
      const result = await addQuestions(db, event.id, "refleksyjne", [tagged("ŻÓŁTA ŁÓDŹ"), tagged("Całkiem nowe")]);
      expect(result.status).toBe("added");
      if (result.status !== "added") return;
      created.push(...result.added.map((question) => question.id));
      expect(result.added.map((question) => question.text)).toEqual([tagged("Całkiem nowe")]);
      expect(result.duplicates).toEqual([tagged("ŻÓŁTA ŁÓDŹ")]);
    });

    it("refuses a paste that would grow the base past the limit, adding nothing", async () => {
      const count = (await getQuestionList(db, event.id)).questions.length;
      const refused = await addQuestions(
        db,
        event.id,
        "generyczne",
        [tagged("Za dużo 1"), tagged("Za dużo 2")],
        count + 1,
      );
      expect(refused).toEqual({ status: "too-many", limit: count + 1, existing: count });
      expect((await getQuestionList(db, event.id)).questions).toHaveLength(count);
      const [fits] = await (async () => {
        const result = await addQuestions(db, event.id, "generyczne", [tagged("Mieści się")], count + 1);
        if (result.status !== "added") throw new Error(JSON.stringify(result));
        created.push(...result.added.map((question) => question.id));
        return result.added;
      })();
      expect(fits.text).toBe(tagged("Mieści się"));
    });

    it("rejects unparsed text as a caller bug", async () => {
      await expect(addQuestions(db, event.id, "generyczne", ["  nieznormalizowane  "])).rejects.toThrow(TypeError);
      await expect(addQuestions(db, event.id, "generyczne", ["abc"])).rejects.toThrow(TypeError);
    });

    it("edits text and category, normalizing the text", async () => {
      const [question] = await add("generyczne", tagged("Do zmiany"));
      const result = await updateQuestion(db, event.id, question.id, {
        text: `  ${tagged("Po   zmianie")} `,
        category: "kontrowersyjne",
      });
      expect(result).toEqual({
        status: "updated",
        question: { id: question.id, category: "kontrowersyjne", text: tagged("Po zmianie") },
      });
    });

    it("refuses an edit to an existing text, an invalid text and an unknown id", async () => {
      const [a, b] = await add("generyczne", tagged("Pytanie A"), tagged("Pytanie B"));
      expect(await updateQuestion(db, event.id, b.id, { text: tagged("PYTANIE a") })).toEqual({ status: "duplicate" });
      expect(await updateQuestion(db, event.id, a.id, { text: "abc" })).toEqual({
        status: "invalid",
        reason: "too-short",
      });
      expect(await updateQuestion(db, event.id, a.id, { text: "x".repeat(301) })).toEqual({
        status: "invalid",
        reason: "too-long",
      });
      expect(await updateQuestion(db, event.id, UNKNOWN_ID, { category: "generyczne" })).toEqual({
        status: "not-found",
      });
      expect(await updateQuestion(db, event.id, a.id, {})).toMatchObject({ status: "updated" });
    });

    it("deletes a question once", async () => {
      const [question] = await add("refleksyjne", tagged("Do usunięcia"));
      expect(await deleteQuestion(db, event.id, question.id)).toEqual({ status: "deleted" });
      expect(await deleteQuestion(db, event.id, question.id)).toEqual({ status: "not-found" });
    });
  });

  describe("draw", () => {
    it("draws only from the chosen category", async () => {
      await add("refleksyjne", tagged("Losowane"));
      for (let index = 0; index < 10; index++) {
        const drawn = await drawQuestion(db, event.id, { category: "refleksyjne", recent: [] });
        expect(drawn?.category).toBe("refleksyjne");
      }
      const any = await drawQuestion(db, event.id, { category: null, recent: [] });
      expect(any).not.toBeNull();
    });

    it("avoids recent questions: with every other one recent, the fresh one comes out", async () => {
      const [own] = await add("kontrowersyjne", tagged("Jedyne świeże"));
      const others = (await idsOf("kontrowersyjne")).filter((id) => id !== own.id);
      for (let index = 0; index < 5; index++) {
        expect(await drawQuestion(db, event.id, { category: "kontrowersyjne", recent: others })).toEqual(own);
      }
    });

    it("with everything recent, falls back to the oldest drawn", async () => {
      const [own] = await add("generyczne", tagged("Najdawniej losowane"));
      const others = (await idsOf("generyczne")).filter((id) => id !== own.id);
      const drawn = await drawQuestion(db, event.id, { category: "generyczne", recent: [own.id, ...others] }, () => 0);
      expect(drawn).toEqual(own);
    });
  });

  describe("starter base (on the suite's own event)", () => {
    it("a new event starts with exactly the starter base", async () => {
      const list = await getQuestionList(db, event.id);
      expect(list.questions).toHaveLength(starterQuestionRows().length);
      expect(list.starterMissing).toBe(0);
      expect(list.questions.map(({ category, text }) => ({ category, text }))).toEqual(starterQuestionRows());
    });

    it("loading again adds nothing; a deleted starter question comes back on request", async () => {
      expect(await loadStarterQuestions(db, event.id)).toEqual({ added: 0 });
      const list = await getQuestionList(db, event.id);
      const victim = list.questions.find((question) => question.text === STARTER_QUESTIONS.generyczne[0]);
      expect(await deleteQuestion(db, event.id, victim?.id ?? 0)).toEqual({ status: "deleted" });
      expect((await getQuestionList(db, event.id)).starterMissing).toBe(1);
      expect(await loadStarterQuestions(db, event.id)).toEqual({ added: 1 });
      expect((await getQuestionList(db, event.id)).starterMissing).toBe(0);
    });

    it("a starter question moved to another category is not added twice", async () => {
      const list = await getQuestionList(db, event.id);
      const moved = list.questions.find((question) => question.text === STARTER_QUESTIONS.refleksyjne[0]);
      await updateQuestion(db, event.id, moved?.id ?? 0, { category: "generyczne" });
      expect(await loadStarterQuestions(db, event.id)).toEqual({ added: 0 });
      expect((await getQuestionList(db, event.id)).starterMissing).toBe(0);
      await updateQuestion(db, event.id, moved?.id ?? 0, { category: "refleksyjne" });
    });

    it("an empty category draws nothing until the starter base is loaded again", async () => {
      for (const id of await idsOf("refleksyjne")) {
        await deleteQuestion(db, event.id, id);
      }
      expect(await drawQuestion(db, event.id, { category: "refleksyjne", recent: [] })).toBeNull();
      expect(await drawQuestion(db, event.id, { category: "generyczne", recent: [] })).not.toBeNull();
      expect(await loadStarterQuestions(db, event.id)).toEqual({ added: STARTER_QUESTIONS.refleksyjne.length });
      expect((await drawQuestion(db, event.id, { category: "refleksyjne", recent: [] }))?.category).toBe("refleksyjne");
    });
  });
});
