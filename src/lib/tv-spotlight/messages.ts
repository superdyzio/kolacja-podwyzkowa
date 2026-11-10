import { defineMessages } from "@/lib/i18n/locale";
import type { TvSpotlightKind } from "@/types";

// Texts of the TV screen and the organizer's TV controls (S-03, tv-spotlight), both languages (i18n). What is shown
// (a question, a topic, a name) is content and stays as sent. The TV follows its own language cookie / `?lang=`.
export const tvSpotlightMessages = defineMessages<{
  labels: Readonly<Record<TvSpotlightKind, string>>;
  drawing: string;
  noPresentGuests: string;
  invalid: string;
  showsPlan: string;
  showsQuestion: (text: string) => string;
  showsTopic: (text: string) => string;
  showsPerson: (name: string) => string;
  drawAnother: string;
  drawPerson: string;
  hide: string;
  panelHint: string;
  onTv: string;
  showOnTv: string;
}>(
  {
    labels: { question: "Pytanie do rozmowy", topic: "Temat od AI", person: "Wylosowana osoba" },
    drawing: "Losujemy…",
    noPresentGuests: "Nie ma kogo losować — brak obecnych gości na liście.",
    invalid: "Tekst musi mieć od 1 do 300 znaków.",
    showsPlan: "Na TV jest plan rozsadzenia.",
    showsQuestion: (text) => `Na TV jest pytanie: „${text}”`,
    showsTopic: (text) => `Na TV jest temat od AI: „${text}”`,
    showsPerson: (name) => `Na TV jest wylosowana osoba: ${name}`,
    drawAnother: "Wylosuj kolejną osobę",
    drawPerson: "Wylosuj osobę na TV",
    hide: "Schowaj z TV",
    panelHint:
      "Losujemy spośród obecnych gości. Pytanie albo temat od AI wyślesz na TV przyciskiem „Pokaż na TV” pod nim — zostaje tam, dopóki go nie schowasz albo nie pokażesz czegoś innego.",
    onTv: "Jest na TV ✓",
    showOnTv: "Pokaż na TV",
  },
  {
    labels: { question: "Conversation question", topic: "AI topic", person: "Drawn person" },
    drawing: "Drawing…",
    noPresentGuests: "Nobody to draw — there are no present guests on the list.",
    invalid: "The text must have 1 to 300 characters.",
    showsPlan: "The TV shows the seating plan.",
    showsQuestion: (text) => `The TV shows the question: “${text}”`,
    showsTopic: (text) => `The TV shows the AI topic: “${text}”`,
    showsPerson: (name) => `The TV shows the drawn person: ${name}`,
    drawAnother: "Draw another person",
    drawPerson: "Draw a person on the TV",
    hide: "Hide from the TV",
    panelHint:
      "We draw from the present guests. Send a question or an AI topic to the TV with the “Show on TV” button under it — it stays there until you hide it or show something else.",
    onTv: "On the TV ✓",
    showOnTv: "Show on TV",
  },
);

// The TV page itself (S-03).
export const tvScreenMessages = defineMessages(
  {
    pageTitle: (event: string) => `${event} — TV`,
    notPublished: "Rozsadzenie pojawi się tutaj po publikacji.",
    seatingHeading: (event: string) => `${event} — rozsadzenie`,
    planLabel: "Plan sali z miejscami gości",
    offline: "Brak połączenia — ponawiam…",
    updated: "Zaktualizowano",
    // Every other update (TvSeatingView): a live region announces only a CHANGED text.
    updatedAgain: "Zaktualizowano ponownie",
  },
  {
    pageTitle: (event: string) => `${event} — TV`,
    notPublished: "The seating will appear here once it is published.",
    seatingHeading: (event: string) => `${event} — seating`,
    planLabel: "Floor plan with the guests' seats",
    offline: "No connection — retrying…",
    updated: "Updated",
    updatedAgain: "Updated again",
  },
);
