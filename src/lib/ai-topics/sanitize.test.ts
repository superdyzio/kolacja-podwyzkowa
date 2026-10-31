import { describe, expect, it } from "vitest";
import { MAX_TOPIC_LENGTH, sanitizeTopic } from "./sanitize";

const TOPIC = "Czy lepiej zarabiać więcej w nudnej pracy, czy mniej w takiej, która cieszy?";

describe("sanitizeTopic", () => {
  it("keeps a clean topic as it is", () => {
    expect(sanitizeTopic(TOPIC)).toBe(TOPIC);
  });

  it("strips wrapping quotes of any kind", () => {
    expect(sanitizeTopic(`„${TOPIC}”`)).toBe(TOPIC);
    expect(sanitizeTopic(`"${TOPIC}"`)).toBe(TOPIC);
    expect(sanitizeTopic(`«${TOPIC}»`)).toBe(TOPIC);
    expect(sanitizeTopic(`  "„${TOPIC}”"  `)).toBe(TOPIC);
  });

  it("keeps quotes that belong to words inside the topic", () => {
    const quoted = "„Kawa” czy „herbata” — co mówi o człowieku poranny wybór?";
    expect(sanitizeTopic(quoted)).toBe(quoted);
    const inner = "Co dla Ciebie znaczy słowo „sukces”?";
    expect(sanitizeTopic(inner)).toBe(inner);
  });

  it("drops markdown, labels, list markers and code fences", () => {
    expect(sanitizeTopic(`**Temat:** ${TOPIC}`)).toBe(TOPIC);
    expect(sanitizeTopic(`Temat do rozmowy: „${TOPIC}”`)).toBe(TOPIC);
    expect(sanitizeTopic(`Pytanie — ${TOPIC}`)).toBe(TOPIC);
    expect(sanitizeTopic(`## ${TOPIC}`)).toBe(TOPIC);
    expect(sanitizeTopic(`1. ${TOPIC}`)).toBe(TOPIC);
    expect(sanitizeTopic(`- *${TOPIC}*`)).toBe(TOPIC);
    expect(sanitizeTopic("```\n" + TOPIC + "\n```")).toBe(TOPIC);
    expect(sanitizeTopic(`_${TOPIC}_`)).toBe(TOPIC);
  });

  it("joins a topic spread over lines and normalizes spaces", () => {
    expect(sanitizeTopic("Wyobraź sobie rok bez internetu.\n\nCo zmieniłoby się najbardziej?")).toBe(
      "Wyobraź sobie rok bez internetu. Co zmieniłoby się najbardziej?",
    );
    expect(sanitizeTopic("Co  wybierasz: góry\tczy morze?")).toBe("Co wybierasz: góry czy morze?");
  });

  it("keeps Polish letters and emoji", () => {
    expect(sanitizeTopic("Żółć czy słodycz — jaki smak opisuje Twój tydzień? 🍋")).toBe(
      "Żółć czy słodycz — jaki smak opisuje Twój tydzień? 🍋",
    );
  });

  it("caps an over-long topic at a sentence end, else at a word with an ellipsis", () => {
    const sentence = `Czy ${"naprawdę ".repeat(14)}warto?`;
    expect(Array.from(sentence).length).toBeGreaterThan(MAX_TOPIC_LENGTH / 3);
    const long = `${sentence} ${"bardzo ".repeat(60)}długie`;
    expect(sanitizeTopic(long)).toBe(sentence);
    const words = "słowo ".repeat(80);
    const capped = sanitizeTopic(words) ?? "";
    expect(Array.from(capped).length).toBeLessThanOrEqual(MAX_TOPIC_LENGTH);
    expect(capped.endsWith("słowo…")).toBe(true);
  });

  it("refuses empty or too short output", () => {
    expect(sanitizeTopic("")).toBeNull();
    expect(sanitizeTopic("   \n  ")).toBeNull();
    expect(sanitizeTopic("„”")).toBeNull();
    expect(sanitizeTopic("**")).toBeNull();
    expect(sanitizeTopic("Co?")).toBeNull();
  });
});
