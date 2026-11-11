import { defineMessages } from "@/lib/i18n";
import { pluralEn, pluralPl } from "@/lib/i18n/plural";

// Texts of the guest search on the venue map (guest-map-search, S-22). Guest, table and room names are DB content and
// stay as they are; `seat` is the published seat number.
export const mapSearchMessages = defineMessages(
  {
    label: "Znajdź gościa na planie",
    placeholder: "Wpisz imię",
    // The organizer's and the staff's plan: say which arrangement is searched.
    publishedNote: "Szuka w opublikowanym rozsadzeniu — tym, które widzą TV i goście.",
    keyboardHint: "Enter pokazuje pierwszą osobę, Escape czyści.",
    resultsLabel: "Znalezione osoby",
    found: (count: number) =>
      `Znaleziono ${String(count)} ${pluralPl(count, "osobę", "osoby", "osób")}. Wybierz, kogo pokazać na planie.`,
    notFound: (query: string) => `Nikt o imieniu „${query}” nie siedzi w tym rozsadzeniu.`,
    more: (count: number) =>
      count === 1
        ? "i jeszcze jedna osoba — wpisz więcej liter"
        : `i jeszcze ${String(count)} ${pluralPl(count, "osoba", "osoby", "osób")} — wpisz więcej liter`,
    place: (table: string, seat: number, room: string) => `${table}, miejsce ${String(seat)} · ${room}`,
    showOnPlan: (name: string, table: string, seat: number) =>
      `Pokaż na planie: ${name} — ${table}, miejsce ${String(seat)}`,
    shown: (name: string, table: string, seat: number, room: string) =>
      `${name}: ${table}, miejsce ${String(seat)}, ${room} — zaznaczone na planie.`,
    clear: "Wyczyść",
    clearLabel: "Wyczyść wyszukiwanie",
  },
  {
    label: "Find a guest on the plan",
    placeholder: "Type a name",
    publishedNote: "Searches the published seating — the one the TV and the guests see.",
    keyboardHint: "Enter shows the first person, Escape clears.",
    resultsLabel: "People found",
    found: (count: number) =>
      `Found ${String(count)} ${pluralEn(count, "person", "people")}. Choose who to show on the plan.`,
    notFound: (query: string) => `Nobody called “${query}” sits in this seating.`,
    more: (count: number) => `and ${String(count)} more ${pluralEn(count, "person", "people")} — type more letters`,
    place: (table: string, seat: number, room: string) => `${table}, seat ${String(seat)} · ${room}`,
    showOnPlan: (name: string, table: string, seat: number) =>
      `Show on the plan: ${name} — ${table}, seat ${String(seat)}`,
    shown: (name: string, table: string, seat: number, room: string) =>
      `${name}: ${table}, seat ${String(seat)}, ${room} — marked on the plan.`,
    clear: "Clear",
    clearLabel: "Clear the search",
  },
);
