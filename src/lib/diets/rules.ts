import { normalizeDisplayName } from "@/lib/guests/names";
import { dietMessages } from "./messages";

// Diets and allergies of the guests (guest-import-diets, S-23; PRD v2 FR-035, FR-036), pure: the kitchen's fixed set
// of tags, the note's rule and the words a spreadsheet may use for each tag (Polish and English). No DB, no `astro:*`.
//
// Health data (GDPR art. 9; NFR-021): only the client, the event restaurant's staff and the kitchen tablet ever see
// them — never another guest, the TV, a seating snapshot or an AI prompt (src/lib/diets/privacy.test.ts).

// The order is the display order everywhere (counts, badges, checkboxes). The DB CHECK guest_diets_known mirrors it.
export const DIET_TAGS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "lactose-free",
  "nut-allergy",
  "seafood-allergy",
  "halal",
  "no-pork",
] as const;

export type DietTag = (typeof DIET_TAGS)[number];

// Allergies are drawn as such (red, „!”): a mistake there can hurt someone.
const ALLERGY_TAGS: ReadonlySet<DietTag> = new Set<DietTag>(["nut-allergy", "seafood-allergy"]);

export const MAX_DIET_NOTE_LENGTH = 120;

const TAG_SET: ReadonlySet<string> = new Set(DIET_TAGS);

export function isDietTag(value: unknown): value is DietTag {
  return typeof value === "string" && TAG_SET.has(value);
}

export function isAllergyTag(tag: DietTag): boolean {
  return ALLERGY_TAGS.has(tag);
}

// Known tags only, each once, in DIET_TAGS order (what the DB stores and every view shows).
export function normalizeDiets(tags: readonly unknown[]): DietTag[] {
  const present = new Set(tags.filter(isDietTag));
  return DIET_TAGS.filter((tag) => present.has(tag));
}

export type DietNoteResult = { ok: true; note: string | null } | { ok: false; problem: "too-long" };

// A note is normalized like a name (single spaces, no invisible characters); empty = no note.
export function parseDietNote(raw: string | null | undefined): DietNoteResult {
  if (raw === null || raw === undefined) {
    return { ok: true, note: null };
  }
  const note = normalizeDisplayName(raw);
  if (note === "") {
    return { ok: true, note: null };
  }
  if (Array.from(note).length > MAX_DIET_NOTE_LENGTH) {
    return { ok: false, problem: "too-long" };
  }
  return { ok: true, note };
}

export interface DietHolder {
  diets: readonly DietTag[];
  dietNote: string | null;
}

export function hasDiet(guest: DietHolder): boolean {
  return guest.diets.length > 0 || guest.dietNote !== null;
}

// --- Words in a spreadsheet's diet column --------------------------------------------------------------------------

// Lower case, no diacritics (ł → l), single spaces, no surrounding punctuation: „Bezglutenowa.” → "bezglutenowa".
export function foldDietWord(text: string): string {
  return normalizeDisplayName(text)
    .toLocaleLowerCase("pl")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/^[\s.!?:"'„”“()[\]-]+|[\s.!?:"'„”“()[\]]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Folded words per tag (the tag key and the labels are matched too). Kept generous: an unknown word is a blocking
// problem in the import, never silently rewritten.
const ALIASES: Record<DietTag, readonly string[]> = {
  vegetarian: [
    "vegetarian",
    "veggie",
    "veg",
    "vege",
    "v",
    "wege",
    "wegetarianska",
    "wegetarianski",
    "wegetarianin",
    "wegetarianka",
    "wegetarianizm",
    "jarska",
    "jarski",
    "bez miesa",
    "no meat",
    "meat free",
    "meat-free",
  ],
  vegan: ["vegan", "vg", "ve", "weganska", "weganski", "weganin", "weganka", "weganizm", "roslinna", "plant based"],
  "gluten-free": [
    "gluten free",
    "glutenfree",
    "gluten",
    "gf",
    "bezglutenowa",
    "bezglutenowy",
    "bez glutenu",
    "glutenu",
    "celiakia",
    "celiac",
    "coeliac",
    "nietolerancja glutenu",
  ],
  "lactose-free": [
    "lactose free",
    "lactose",
    "lactose intolerance",
    "lf",
    "bez laktozy",
    "bezlaktozowa",
    "bezlaktozowy",
    "laktoza",
    "laktozy",
    "nietolerancja laktozy",
  ],
  "nut-allergy": [
    "nut allergy",
    "nuts",
    "nut",
    "nut free",
    "peanut",
    "peanuts",
    "peanut allergy",
    "tree nuts",
    "orzechy",
    "orzech",
    "orzechow",
    "orzeszki",
    "orzeszkow",
    "orzeszki ziemne",
    "alergia na orzechy",
    "bez orzechow",
  ],
  "seafood-allergy": [
    "seafood allergy",
    "seafood",
    "fish",
    "fish allergy",
    "shellfish",
    "shellfish allergy",
    "ryby",
    "ryba",
    "ryb",
    "owoce morza",
    "owocow morza",
    "skorupiaki",
    "skorupiakow",
    "alergia na ryby",
    "alergia na owoce morza",
  ],
  halal: ["halal", "halal food"],
  "no-pork": [
    "no pork",
    "pork free",
    "pork",
    "without pork",
    "bez wieprzowiny",
    "wieprzowina",
    "wieprzowiny",
    "nie je wieprzowiny",
  ],
};

// What a cell says when there is no diet.
const NONE_WORDS: ReadonlySet<string> = new Set([
  "",
  "-",
  "brak",
  "nie",
  "none",
  "no",
  "n/a",
  "nie dotyczy",
  "bez diety",
  "brak diety",
  "standard",
  "standardowa",
  "zwykla",
  "normalna",
  "tradycyjna",
  "regular",
  "normal",
]);

// Wrappers a person may put around a word: „dieta wegańska”, „alergia na orzechy”, "nut allergy", "allergy to fish".
const PREFIXES = ["dieta ", "diet ", "alergia na ", "uczulenie na ", "nietolerancja ", "allergy to ", "allergic to "];
const SUFFIXES = [" diet", " allergy", " intolerance", " (alergia)", " alergia"];

// Every alias, the tag key and the visible labels in both languages („bez glutenu”, "gluten-free" as on screen).
const WORD_TO_TAG: ReadonlyMap<string, DietTag> = (() => {
  const map = new Map<string, DietTag>();
  const labels = [dietMessages("pl").labels, dietMessages("en").labels];
  for (const tag of DIET_TAGS) {
    for (const word of [tag, tag.replace(/-/g, " "), ...ALIASES[tag], ...labels.map((label) => label[tag])]) {
      const folded = foldDietWord(word);
      if (folded !== "" && !map.has(folded)) {
        map.set(folded, tag);
      }
    }
  }
  return map;
})();

// One word or phrase of a diet cell → its tag, "none" for „brak” / "-" and the like, or null when unknown.
export function matchDietWord(raw: string): DietTag | "none" | null {
  const word = foldDietWord(raw);
  if (NONE_WORDS.has(word)) {
    return "none";
  }
  const direct = WORD_TO_TAG.get(word);
  if (direct) {
    return direct;
  }
  for (const prefix of PREFIXES) {
    if (word.startsWith(prefix)) {
      const found = WORD_TO_TAG.get(word.slice(prefix.length).trim());
      if (found) {
        return found;
      }
    }
  }
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix)) {
      const found = WORD_TO_TAG.get(word.slice(0, -suffix.length).trim());
      if (found) {
        return found;
      }
    }
  }
  return null;
}

// „wegetariańska, bez glutenu”, "vegan / nuts", „bez glutenu i laktozy” → tags; words it does not know are returned
// as typed (trimmed) so the import can name them.
// A line break inside a quoted cell counts as a comma.
const CELL_SEPARATORS = /[,;/+&|]| i | oraz | and /iu;

export function parseDietCell(cell: string): { tags: DietTag[]; unknown: string[] } {
  const tags: DietTag[] = [];
  const unknown: string[] = [];
  const whole = matchDietWord(cell);
  if (whole === "none") {
    return { tags: [], unknown: [] };
  }
  const parts = whole === null ? normalizeDisplayName(cell.replace(/\r\n|\n|\r/g, ",")).split(CELL_SEPARATORS) : [cell];
  for (const part of parts) {
    const trimmed = normalizeDisplayName(part);
    const match = matchDietWord(trimmed);
    if (match === "none") {
      continue;
    }
    if (match === null) {
      unknown.push(trimmed);
    } else {
      tags.push(match);
    }
  }
  return { tags: normalizeDiets(tags), unknown };
}
