import { normalizeQuestionText } from "@/lib/questions/text";

// Turns what the AI wrote into one clean topic, or null (S-08), pure. Models sometimes add quotes, markdown, a label
// („Temat:”) or spread the question over lines; the topic is shown as plain text, so all of that goes. An empty
// result is a failed attempt (it does not consume the limit).

export const MIN_TOPIC_LENGTH = 5;
export const MAX_TOPIC_LENGTH = 300;

const CODE_FENCE = /```[^\n]*\n?/g;
const LINE_BREAK = /\r\n|\n|\r/;
const HEADING = /^#{1,6}\s*/u;
const LIST_MARKER = /^(?:[-*•–—]|\d{1,3}[.)])\s+/u;
const LABEL = /^(?:temat(?:\s+do\s+rozmowy)?|pytanie(?:\s+do\s+rozmowy)?)\s*[:–—-]\s*/iu;
const EMPHASIS = /\*\*|__|[*`]|(?<=^|\s)_+|_+(?=\s|$|[?.!,])/gu;
const QUOTES = new Set(["„", "“", "”", '"', "«", "»", "'", "‚", "‘", "’"]);
const SENTENCE_END = /[.?!…]/u;

function cleanLine(line: string): string {
  let text = line.trim().replace(HEADING, "");
  text = text.replace(LIST_MARKER, "");
  text = text.replace(EMPHASIS, "");
  return text.trim().replace(LABEL, "").trim();
}

// Removes quotes wrapping the whole text („…”, "„…”", «…»). Only when nothing inside is quoted: in
// „kawa” czy „herbata” the first and last characters are quotes of two different words.
function stripWrappingQuotes(text: string): string {
  const characters = Array.from(text);
  const leading = characters.findIndex((character) => !QUOTES.has(character));
  if (leading <= 0) {
    return text;
  }
  const trailing = characters.length - 1 - characters.findLastIndex((character) => !QUOTES.has(character));
  for (let depth = Math.min(leading, trailing); depth > 0; depth--) {
    const inner = characters.slice(depth, characters.length - depth);
    if (!inner.some((character) => QUOTES.has(character))) {
      return inner.join("").trim();
    }
  }
  return text;
}

// Cuts an over-long topic at the last sentence end within the cap, else at the last space with an ellipsis.
function capLength(text: string): string {
  const characters = Array.from(text);
  if (characters.length <= MAX_TOPIC_LENGTH) {
    return text;
  }
  const head = characters.slice(0, MAX_TOPIC_LENGTH);
  for (let index = head.length - 1; index >= MAX_TOPIC_LENGTH / 3; index--) {
    if (SENTENCE_END.test(head[index] ?? "")) {
      return head.slice(0, index + 1).join("");
    }
  }
  const room = head.slice(0, MAX_TOPIC_LENGTH - 1);
  const lastSpace = room.lastIndexOf(" ");
  const cut = lastSpace > 0 ? room.slice(0, lastSpace) : room;
  return `${cut.join("").trimEnd()}…`;
}

export function sanitizeTopic(raw: string): string | null {
  const lines = raw.replace(CODE_FENCE, "").split(LINE_BREAK).map(cleanLine).filter(Boolean);
  const text = capLength(stripWrappingQuotes(normalizeQuestionText(lines.join(" "))));
  return Array.from(text).length >= MIN_TOPIC_LENGTH ? text : null;
}
