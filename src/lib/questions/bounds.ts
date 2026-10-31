// Content bounds of conversation questions and AI topics (shape-notes `AI topics`): no party politics, religion,
// health (incl. alcohol, diet, sleep, aging and death) or personal jabs, and nobody is asked about their own salary.
// Pure. Used by the starter-base test (S-07) and as the runtime safety net on AI output (S-08): an AI topic that hits
// the list is treated as a failed attempt, which does not consume the guest's limit.
//
// Matched on whole lowercase words (prefixes or exact words) and on phrases, so "porządek" never trips "rząd" and
// "bogaty" never trips "boga".
export const DENIED_WORD_PREFIXES = [
  // party politics
  "polity",
  "partyj",
  "partii",
  "partia",
  "rząd",
  "podat",
  "imigr",
  "emigr",
  "wybory",
  "wyborach",
  "wyborc",
  "sejm",
  "prezydent",
  "premier",
  "lewic",
  "prawic",
  // religion, the afterlife, fate, astrology
  "religi",
  "kościo",
  "kościel",
  "modl",
  "grzech",
  "piekł",
  "zaświat",
  "przeznaczeni",
  "horoskop",
  "astrolog",
  "zodiak",
  // health, alcohol, diet and weight, sleep, burnout, therapy, aging and death
  "zdrow",
  "chor",
  "lekarz",
  "lekarst",
  "terapi",
  "psycholog",
  "alkohol",
  "wódk",
  "piw",
  "diet",
  "odchudz",
  "schud",
  "bezsenn",
  "wypalen",
  "starze",
  "starość",
  "emeryt",
  "śmier",
  "umier",
  "umrz",
  "pogrzeb",
  "zmarł",
];
// Harmless words that start with a denied prefix (a film premiere, Croatia, a cellar…): every false hit is a billed AI
// attempt thrown away.
export const ALLOWED_WORD_PREFIXES = [
  "premiera",
  "premiery",
  "premierę",
  "premierą",
  "premierze",
  "premierow",
  "piwnic",
  "piwoni",
  "chorwac",
  "choreograf",
  "chorągi",
];
export const DENIED_WORDS = [
  "bóg",
  "boga",
  "bogu",
  "wiara",
  "wiary",
  "karma",
  "karmy",
  "ue",
  "unia",
  "unii",
  "sen",
  "snu",
  "spać",
  "wino",
  "waga",
  "wagi",
  "wagę",
  "kac",
];
export const DENIED_PHRASES = [
  "przy tym stole",
  "przy stole",
  "kto z nas",
  "kto z was",
  "ile zarabiasz",
  "twoja pensja",
  "twoje zarobki",
  "twoja wypłata",
];

// The denied words and phrases found in `text` (empty = within the bounds).
export function deniedIn(text: string): string[] {
  const lower = text.toLocaleLowerCase("pl");
  const words = lower.match(/\p{L}+/gu) ?? [];
  const hits = words.filter(
    (word) =>
      DENIED_WORDS.includes(word) ||
      (DENIED_WORD_PREFIXES.some((prefix) => word.startsWith(prefix)) &&
        !ALLOWED_WORD_PREFIXES.some((prefix) => word.startsWith(prefix))),
  );
  return [...hits, ...DENIED_PHRASES.filter((phrase) => lower.includes(phrase))];
}
