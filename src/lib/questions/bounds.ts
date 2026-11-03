import type { Locale } from "@/lib/i18n/locale";

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

// The same bounds for English AI topics (i18n: a guest or organizer using the app in English gets English topics). A
// separate list on purpose: an English prefix such as "god" would trip Polish "godzina", a Polish one such as "chor"
// English "chorus". Exact words where a prefix would hit harmless ones ("dead" vs "deadline", "tax" vs "taxi").
export const DENIED_WORD_PREFIXES_EN = [
  // party politics
  "politic",
  "partisan",
  "government",
  "election",
  "electoral",
  "parliament",
  "president",
  "senat",
  "congress",
  "taxat",
  "immigra",
  "emigra",
  "refugee",
  "democrat",
  "republican",
  // religion, the afterlife, fate, astrology
  "religi",
  "church",
  "pray",
  "heaven",
  "afterlife",
  "bible",
  "horoscop",
  "astrolog",
  "zodiac",
  // health, alcohol, diet and weight, sleep, burnout, therapy, aging and death
  "health",
  "sick",
  "illness",
  "disease",
  "doctor",
  "medic",
  "hospital",
  "therap",
  "psycholog",
  "alcohol",
  "drunk",
  "beer",
  "vodka",
  "booze",
  "hangover",
  "diet",
  "weight",
  "sleep",
  "insomnia",
  "burnout",
  "aging",
  "ageing",
  "retire",
  "death",
  "dying",
  "funeral",
  "cancer",
];
export const ALLOWED_WORD_PREFIXES_EN = ["doctorat", "weightless"];
export const DENIED_WORDS_EN = [
  "god",
  "gods",
  "sin",
  "sins",
  "hell",
  "faith",
  "fate",
  "destiny",
  "karma",
  "vote",
  "votes",
  "voting",
  "voter",
  "voters",
  "tax",
  "taxes",
  "eu",
  "wine",
  "wines",
  "dead",
  "die",
  "dies",
];
export const DENIED_PHRASES_EN = [
  "at this table",
  "at the table",
  "who among us",
  "which of us",
  "who of us",
  "which of you",
  "who of you",
  "how much do you earn",
  "how much you earn",
  "your salary",
  "your pay",
  "your income",
  "your raise",
  "your wage",
  "prime minister",
  "left wing",
  "right wing",
  "left-wing",
  "right-wing",
  "old age",
];

const BOUNDS: Record<
  Locale,
  { prefixes: readonly string[]; allowed: readonly string[]; words: readonly string[]; phrases: readonly string[] }
> = {
  pl: {
    prefixes: DENIED_WORD_PREFIXES,
    allowed: ALLOWED_WORD_PREFIXES,
    words: DENIED_WORDS,
    phrases: DENIED_PHRASES,
  },
  en: {
    prefixes: DENIED_WORD_PREFIXES_EN,
    allowed: ALLOWED_WORD_PREFIXES_EN,
    words: DENIED_WORDS_EN,
    phrases: DENIED_PHRASES_EN,
  },
};

// The denied words and phrases found in `text` (empty = within the bounds), by the list of the text's language.
export function deniedIn(text: string, locale: Locale = "pl"): string[] {
  const { prefixes, allowed, words: denied, phrases } = BOUNDS[locale];
  const lower = text.toLocaleLowerCase(locale);
  const words = lower.match(/\p{L}+/gu) ?? [];
  const hits = words.filter(
    (word) =>
      denied.includes(word) ||
      (prefixes.some((prefix) => word.startsWith(prefix)) && !allowed.some((prefix) => word.startsWith(prefix))),
  );
  return [...hits, ...phrases.filter((phrase) => containsPhrase(lower, phrase, locale))];
}

// Polish phrases match anywhere (as always); English ones only as whole words ("which of you" is not in "which of
// your").
function containsPhrase(lower: string, phrase: string, locale: Locale): boolean {
  if (locale === "pl") {
    return lower.includes(phrase);
  }
  let from = lower.indexOf(phrase);
  while (from !== -1) {
    const before = lower.slice(0, from);
    const after = lower.slice(from + phrase.length);
    if (!/\p{L}$/u.test(before) && !/^\p{L}/u.test(after)) {
      return true;
    }
    from = lower.indexOf(phrase, from + 1);
  }
  return false;
}
