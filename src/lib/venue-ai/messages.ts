import { defineMessages } from "@/lib/i18n/locale";
import { pluralEn, pluralPl } from "@/lib/i18n/plural";

// Texts of the AI layout read (venue-drawing) shown to the organizer, both languages (i18n). The prompt sent to Claude
// (prompt.ts) is not UI and stays as it is. A leaf module.
export const venueAiMessages = defineMessages(
  {
    // API answers (provider.ts, the layout-proposal route)
    layoutFailed: "Nie udało się odczytać układu ze zdjęcia.",
    badOutputHint: "AI zwróciło układ w nieczytelnej formie — spróbuj ponownie.",
    imageTooLarge: "Zdjęcie jest za duże — najwyżej 1,5 MB.",
    timeout: (seconds: number) => `Przekroczono czas ${String(seconds)} s — spróbuj ponownie.`,
    // The browser side (useLayoutProposal)
    clientTimeout: "AI nie odpowiedziało w ciągu pół minuty. Spróbuj ponownie.",
    imageFailed: "Nie udało się przygotować zdjęcia planu. Odśwież stronę i spróbuj ponownie.",
    // Proposal lines (draft.ts)
    moved: "przesunięty",
    rotation: (degrees: number) => `obrót ${String(degrees)}°`,
    seats: (count: number) => `${String(count)} ${pluralPl(count, "miejsce", "miejsca", "miejsc")}`,
    newOutline: "nowy kontur",
    outline: "kontur",
    pitch: (from: string, to: string) => `Skala krzeseł: ${from} → ${to}`,
    costUnknown: "Koszt odczytu nieznany.",
    cost: (usd: string) => `Koszt odczytu: ≈ ${usd} (nie wlicza się do kosztu tematów AI).`,
    // The proposal panel (LayoutProposal.tsx)
    heading: "Propozycja układu z AI",
    nothingToChange: "AI nie znalazło nic do zmiany.",
    newTable: (name: string, seats: string, room: string) => `Nowy stolik „${name}” (${seats}, ${room})`,
    newTableName: "Nazwa nowego stolika",
    newTableSeats: "Liczba miejsc nowego stolika",
    newTableRoom: "Sala nowego stolika",
    skipped: (count: number) => `Pominięto stoliki bez sali albo ponad limit: ${count}.`,
    explanation:
      "Przerywane linie na planie pokazują zaznaczone zmiany. Przypisania gości do miejsc zostają. TV i telefony pokażą nowy rysunek po publikacji rozsadzenia.",
    apply: "Zastosuj zaznaczone",
    discard: "Odrzuć",
  },
  {
    layoutFailed: "Could not read the layout from the photo.",
    badOutputHint: "The AI returned the layout in an unreadable form — try again.",
    imageTooLarge: "The photo is too large — 1.5 MB at most.",
    timeout: (seconds: number) => `Timed out after ${String(seconds)} s — try again.`,
    clientTimeout: "The AI did not answer within half a minute. Try again.",
    imageFailed: "Could not prepare the plan photo. Refresh the page and try again.",
    moved: "moved",
    rotation: (degrees: number) => `rotated ${String(degrees)}°`,
    seats: (count: number) => `${String(count)} ${pluralEn(count, "seat", "seats")}`,
    newOutline: "new outline",
    outline: "outline",
    pitch: (from: string, to: string) => `Chair scale: ${from} → ${to}`,
    costUnknown: "Cost of the read unknown.",
    cost: (usd: string) => `Cost of the read: ≈ ${usd} (not counted in the AI topics' cost).`,
    heading: "AI layout proposal",
    nothingToChange: "The AI found nothing to change.",
    newTable: (name: string, seats: string, room: string) => `New table “${name}” (${seats}, ${room})`,
    newTableName: "Name of the new table",
    newTableSeats: "Seats of the new table",
    newTableRoom: "Room of the new table",
    skipped: (count: number) => `Skipped tables without a room or over the limit: ${count}.`,
    explanation:
      "Dashed lines on the plan show the ticked changes. The guests' seats stay. The TV and phones show the new drawing after the seating is published.",
    apply: "Apply the ticked ones",
    discard: "Discard",
  },
);
