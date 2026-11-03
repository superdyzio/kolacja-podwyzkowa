import { defineMessages } from "@/lib/i18n/locale";
import { pluralEn, pluralPl } from "@/lib/i18n/plural";
import type { QuestionCategory } from "@/types";

// Texts of the question base and the draw (S-07), both languages (i18n). The questions themselves (the starter base
// included) are content and stay as written. Pure: shared by the server, the organizer's page and the guest's phone.

// The categories as people read them (the stored values never change).
export const categoryMessages = defineMessages<{
  labels: Readonly<Record<QuestionCategory, string>>;
  hints: Readonly<Record<QuestionCategory, string>>;
  all: string;
}>(
  {
    labels: { kontrowersyjne: "Kontrowersyjne", generyczne: "Generyczne", refleksyjne: "Refleksyjne" },
    hints: {
      kontrowersyjne: "Odważne, dzielą stół na pół.",
      generyczne: "Lekkie, dla każdego.",
      refleksyjne: "Głębsze, o sobie.",
    },
    all: "Wszystkie",
  },
  {
    labels: { kontrowersyjne: "Controversial", generyczne: "General", refleksyjne: "Reflective" },
    hints: {
      kontrowersyjne: "Bold ones that split the table in half.",
      generyczne: "Light ones, for everyone.",
      refleksyjne: "Deeper ones, about yourself.",
    },
    all: "All",
  },
);

function questionsPl(count: number): string {
  return `${count} ${pluralPl(count, "pytanie", "pytania", "pytań")}`;
}

function questionsEn(count: number): string {
  return `${count} ${pluralEn(count, "question", "questions")}`;
}

function linesPl(count: number): string {
  return `${count} ${pluralPl(count, "linię", "linie", "linii")}`;
}

function linesEn(count: number): string {
  return `${count} ${pluralEn(count, "line", "lines")}`;
}

// Text rules, paste results, the draw, the shell card and the server's answers.
export const questionMessages = defineMessages(
  {
    tooShort: (min: number) => `Pytanie musi mieć co najmniej ${min} znaków.`,
    tooLong: (max: number) => `Pytanie może mieć najwyżej ${max} znaków.`,
    skipDuplicate: "już jest w bazie.",
    skipRepeated: "powtarza się we wklejce.",
    skipTooShort: (min: number) => `za krótkie (min. ${min} znaków).`,
    skipTooLong: (max: number) => `za długie (maks. ${max} znaków).`,
    skipLine: (line: number, preview: string, reason: string) => `Linia ${line}: „${preview}” — ${reason}`,
    nothingAdded: "Nic nie dodano.",
    nothingAddedSkipped: (skipped: number) => `Nic nie dodano — pominięto ${linesPl(skipped)}.`,
    added: (count: number) => `Dodano ${questionsPl(count)}.`,
    skipped: (count: number) => `Pominięto ${linesPl(count)}.`,
    summaryEmpty: "Baza pytań jest pusta",
    summaryCount: (count: number) => questionsPl(count),
    // The Polish card keeps the stored category values („kontrowersyjne 30”).
    summaryCategory: (category: QuestionCategory, count: number) => `${category} ${count}`,
    emptyCategory: "W tej kategorii nie ma jeszcze pytań.",
    emptyBase: "Baza pytań jest pusta.",
    notFound: "Nie znaleziono pytania.",
    duplicate: "To pytanie już jest w bazie.",
    pasteEmpty: "Wpisz co najmniej jedno pytanie.",
    tooMany: (max: number, existing: number) =>
      `Baza może mieć najwyżej ${max} pytań (jest już ${existing}). Nic nie zostało dodane.`,
  },
  {
    tooShort: (min: number) => `A question needs at least ${min} characters.`,
    tooLong: (max: number) => `A question can have at most ${max} characters.`,
    skipDuplicate: "already in the base.",
    skipRepeated: "repeated in the paste.",
    skipTooShort: (min: number) => `too short (min. ${min} characters).`,
    skipTooLong: (max: number) => `too long (max. ${max} characters).`,
    skipLine: (line: number, preview: string, reason: string) => `Line ${line}: “${preview}” — ${reason}`,
    nothingAdded: "Nothing added.",
    nothingAddedSkipped: (skipped: number) => `Nothing added — skipped ${linesEn(skipped)}.`,
    added: (count: number) => `Added ${questionsEn(count)}.`,
    skipped: (count: number) => `Skipped ${linesEn(count)}.`,
    summaryEmpty: "The question base is empty",
    summaryCount: (count: number) => questionsEn(count),
    summaryCategory: (category: QuestionCategory, count: number) =>
      `${categoryMessages("en").labels[category].toLowerCase()} ${count}`,
    emptyCategory: "No questions in this category yet.",
    emptyBase: "The question base is empty.",
    notFound: "Question not found.",
    duplicate: "This question is already in the base.",
    pasteEmpty: "Enter at least one question.",
    tooMany: (max: number, existing: number) =>
      `The base can have at most ${max} questions (it has ${existing}). Nothing was added.`,
  },
);

// The question draw (shared by the guest's phone and the organizer) and the organizer's questions page.
export const questionUiMessages = defineMessages(
  {
    // QuestionDrawPanel (also on the guest's phone)
    drawCategoryLabel: "Kategoria pytania",
    allHint: "Z dowolnej kategorii.",
    drawing: "Losuję…",
    drawNext: "Losuj kolejne",
    draw: "Losuj pytanie",
    offline: "Brak połączenia — spróbuj ponownie.",
    // The organizer's page
    pageTitle: (event: string) => `Pytania do rozmowy — ${event}`,
    backToPanel: "← Panel organizatora",
    heading: "Pytania do rozmowy",
    intro: "Gość widzi tylko pytanie, które sam wylosuje. Listę widzisz tylko Ty.",
    tvHeading: "Na ekranie TV",
    drawHeading: "Losuj pytanie",
    aiHeading: "Temat od AI",
    close: "Zamknij",
    listHeading: (count: number) => `Pytania (${count})`,
    baseEmpty: "Baza jest pusta — wczytaj bazę startową albo wklej pytania.",
    filterLabel: "Filtr kategorii",
    categoryEmpty: "Brak pytań w tej kategorii.",
    deleteConfirm: (preview: string) => `Usunąć pytanie „${preview}”?`,
    // QuestionAddForm
    addHeading: "Dodaj pytania",
    category: "Kategoria",
    pasteLabel: "Pytania — jedno pytanie w linii",
    pastePlaceholder: "Co Cię ostatnio najbardziej zaskoczyło?\nGdzie chcesz być za pięć lat?",
    pasteHint:
      "Możesz wkleić wiele pytań naraz. Puste linie, powtórki i pytania, które już są w bazie, zostaną pominięte.",
    add: "Dodaj",
    // QuestionRow
    questionText: "Treść pytania",
    save: "Zapisz",
    cancel: "Anuluj",
    edit: "Edytuj",
    remove: "Usuń",
    // StarterCard
    starterHeading: "Baza startowa",
    starterText:
      "Gotowe pytania w trzech kategoriach. Wczytanie dodaje tylko te, których brakuje w bazie — niczego nie usuwa ani nie zmienia.",
    starterComplete: "Baza startowa jest kompletna.",
    // Kept exactly as before: „pytania” only for 1.
    starterMissing: (count: number) => `Brakuje ${count} ${count === 1 ? "pytania" : "pytań"} z bazy startowej.`,
    loadStarter: "Wczytaj bazę startową",
  },
  {
    drawCategoryLabel: "Question category",
    allHint: "From any category.",
    drawing: "Drawing…",
    drawNext: "Draw another",
    draw: "Draw a question",
    offline: "No connection — please try again.",
    pageTitle: (event: string) => `Conversation questions — ${event}`,
    backToPanel: "← Organizer panel",
    heading: "Conversation questions",
    intro: "A guest sees only the question they draw themselves. Only you see the list.",
    tvHeading: "On the TV screen",
    drawHeading: "Draw a question",
    aiHeading: "AI topic",
    close: "Close",
    listHeading: (count: number) => `Questions (${count})`,
    baseEmpty: "The base is empty — load the starter base or paste questions.",
    filterLabel: "Category filter",
    categoryEmpty: "No questions in this category.",
    deleteConfirm: (preview: string) => `Delete the question “${preview}”?`,
    addHeading: "Add questions",
    category: "Category",
    pasteLabel: "Questions — one per line",
    pastePlaceholder: "What surprised you most lately?\nWhere do you want to be in five years?",
    pasteHint:
      "You can paste many questions at once. Blank lines, repeats and questions already in the base are skipped.",
    add: "Add",
    questionText: "Question text",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    remove: "Delete",
    starterHeading: "Starter base",
    starterText:
      "Ready-made questions in three categories. Loading adds only the ones missing from the base — it never deletes or changes anything.",
    starterComplete: "The starter base is complete.",
    starterMissing: (count: number) =>
      `${count} ${pluralEn(count, "question", "questions")} from the starter base ${count === 1 ? "is" : "are"} missing.`,
    loadStarter: "Load the starter base",
  },
);
