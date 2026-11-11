import { pluralEn, pluralPl } from "@/lib/i18n/plural";
import { defineMessages, type Locale } from "@/lib/i18n/locale";
import { EVENT_NAME_MAX } from "@/lib/events/rules";
import type { TemplateUpdateResultDto, VenueTemplateSummaryDto } from "@/types";

// Texts of a restaurant's venue templates (venue-templates, S-15): the „Szablony sal” section of the restaurant page,
// the template page, the template choice of „Nowe wydarzenie”, the event card's „Zapisz salę jako szablon” /
// „Zaktualizuj z szablonu”, their confirms and the API messages, both languages (i18n). Pure.

function list(names: readonly string[]): string {
  return names.join(", ");
}

export const templateMessages = defineMessages(
  {
    // Restaurant page
    heading: "Szablony sal",
    intro:
      "Zapisz układ sali raz i twórz z niego wydarzenia z gotową salą. Zmiana szablonu nie zmienia istniejących wydarzeń.",
    empty: "Brak szablonów sal.",
    openFor: (name: string) => `Otwórz szablon sali ${name}`,
    counts: (template: Pick<VenueTemplateSummaryDto, "roomCount" | "tableCount" | "seatCount" | "hasPlan">) =>
      [
        `${String(template.roomCount)} ${pluralPl(template.roomCount, "sala", "sale", "sal")}`,
        `${String(template.tableCount)} ${pluralPl(template.tableCount, "stolik", "stoliki", "stolików")}`,
        `${String(template.seatCount)} ${pluralPl(template.seatCount, "miejsce", "miejsca", "miejsc")}`,
        ...(template.hasPlan ? [] : ["bez planu"]),
      ].join(" · "),
    newHeading: "Nowy szablon sali",
    newIntro: "Pusty szablon: w edytorze wgrasz plan, dodasz sale i stoliki. Salę wydarzenia zapiszesz z jego karty.",
    nameLabel: "Nazwa szablonu",
    namePlaceholder: "np. Sala główna",
    createButton: "Utwórz szablon",
    creating: "Tworzę…",
    nameEmpty: "Podaj nazwę szablonu.",
    nameTooLong: `Nazwa szablonu może mieć najwyżej ${String(EVENT_NAME_MAX)} znaków.`,
    // Template page
    pageTitle: (name: string) => `Szablon sali: ${name}`,
    backTo: (restaurant: string) => `← ${restaurant}`,
    kicker: "Szablon sali",
    pageIntro:
      "Szablon lokalu nie ma linków ani gości. Wydarzenie utworzone z szablonu dostaje kopię sali; zmiany tutaj nie zmieniają istniejących wydarzeń — przenosi je „Zaktualizuj z szablonu” na karcie wydarzenia.",
    renameButton: "Zapisz nazwę",
    saving: "Zapisuję…",
    renamed: "Zapisano nazwę.",
    deleteButton: "Usuń szablon",
    deleting: "Usuwam…",
    confirmDelete: (name: string) =>
      `Usunąć szablon „${name}”? Jego plan, sale i stoliki znikną. Wydarzenia utworzone z niego zostają bez zmian.`,
    gone: "Ten szablon już nie istnieje.",
    backToRestaurant: "Wróć do restauracji",
    editorHeading: "Sala szablonu",
    // „Nowe wydarzenie”
    templateLabel: "Sala z szablonu (opcjonalnie)",
    templateNone: "Bez szablonu — salę narysuje klient",
    // Event card
    sectionHeading: "Szablon sali",
    saveHeading: "Zapisz salę jako szablon",
    saveIntro: "Kopiuje plan, sale, stoliki i rysunek tego wydarzenia (bez gości) do nowego szablonu lokalu.",
    saveButton: "Zapisz jako szablon",
    savedAs: (name: string) => `Zapisano szablon „${name}”.`,
    openTemplate: "Otwórz szablon",
    defaultName: (eventName: string) => `Sala — ${eventName}`,
    updateHeading: "Zaktualizuj z szablonu",
    updateIntro:
      "Zastępuje salę tego wydarzenia salą z szablonu. Sale i stoliki są dopasowywane po nazwie: goście przy stolikach, które zostają, zachowują miejsca. TV i telefony gości zobaczą zmianę dopiero po „Opublikuj” w rozsadzeniu.",
    chooseLabel: "Szablon",
    noTemplates: "Lokal nie ma jeszcze szablonów sal.",
    checkButton: "Sprawdź zmiany",
    checking: "Sprawdzam…",
    applyButton: "Zaktualizuj salę z szablonu",
    applying: "Aktualizuję…",
    tablesAdded: (names: readonly string[]) => `Nowe stoliki: ${list(names)}`,
    tablesRemoved: (names: readonly string[]) => `Znikną stoliki: ${list(names)}`,
    tablesResized: (names: readonly string[]) => `Mniej miejsc przy: ${list(names)}`,
    roomsAdded: (names: readonly string[]) => `Nowe sale: ${list(names)}`,
    roomsRemoved: (names: readonly string[]) => `Znikną sale: ${list(names)}`,
    planReplaced: "Plan sali, położenie stolików i rysunek przyjdą z szablonu.",
    planRemoved: "Szablon nie ma planu: plan sali wydarzenia zostanie usunięty.",
    lostNone: "Nikt nie straci miejsca.",
    lostHeading: (count: number) => `Miejsce straci ${String(count)} ${pluralPl(count, "osoba", "osoby", "osób")}:`,
    lostLine: (guest: string, table: string, seat: number) => `${guest} — stolik ${table}, miejsce ${String(seat)}`,
    confirmApply: (template: string, lost: readonly string[]) =>
      `Zastąpić salę tego wydarzenia szablonem „${template}”? ` +
      (lost.length === 0 ? "Nikt nie straci miejsca." : `Miejsce stracą: ${list(lost)}.`) +
      " TV i telefony gości zobaczą zmianę po „Opublikuj”.",
    applied: (result: TemplateUpdateResultDto) =>
      `Sala zaktualizowana z szablonu. Usunięte miejsca: ${String(result.seatsBefore - result.seatsAfter)}. TV pokaże zmiany po „Opublikuj” w rozsadzeniu.`,
    templateGone: "Ten szablon już nie istnieje — odśwież stronę.",
  },
  {
    heading: "Venue templates",
    intro:
      "Save a room layout once and create events with the room ready. Changing a template never changes existing events.",
    empty: "No venue templates yet.",
    openFor: (name: string) => `Open venue template ${name}`,
    counts: (template: Pick<VenueTemplateSummaryDto, "roomCount" | "tableCount" | "seatCount" | "hasPlan">) =>
      [
        `${String(template.roomCount)} ${pluralEn(template.roomCount, "room", "rooms")}`,
        `${String(template.tableCount)} ${pluralEn(template.tableCount, "table", "tables")}`,
        `${String(template.seatCount)} ${pluralEn(template.seatCount, "seat", "seats")}`,
        ...(template.hasPlan ? [] : ["no plan"]),
      ].join(" · "),
    newHeading: "New venue template",
    newIntro:
      "An empty template: in the editor you upload the plan and add rooms and tables. Save an event's room from its card.",
    nameLabel: "Template name",
    namePlaceholder: "e.g. Main hall",
    createButton: "Create template",
    creating: "Creating…",
    nameEmpty: "Enter the template's name.",
    nameTooLong: `A template's name can have at most ${String(EVENT_NAME_MAX)} characters.`,
    pageTitle: (name: string) => `Venue template: ${name}`,
    backTo: (restaurant: string) => `← ${restaurant}`,
    kicker: "Venue template",
    pageIntro:
      "A restaurant template has no links and no guests. An event created from it gets a copy of the room; changes here never change existing events — „Update from template” on an event's card brings them over.",
    renameButton: "Save name",
    saving: "Saving…",
    renamed: "Name saved.",
    deleteButton: "Delete template",
    deleting: "Deleting…",
    confirmDelete: (name: string) =>
      `Delete the template „${name}”? Its plan, rooms and tables disappear. Events created from it stay as they are.`,
    gone: "This template no longer exists.",
    backToRestaurant: "Back to the restaurant",
    editorHeading: "Template room",
    templateLabel: "Room from a template (optional)",
    templateNone: "No template — the client draws the room",
    sectionHeading: "Venue template",
    saveHeading: "Save the room as a template",
    saveIntro: "Copies this event's plan, rooms, tables and drawing (no guests) into a new restaurant template.",
    saveButton: "Save as template",
    savedAs: (name: string) => `Template „${name}” saved.`,
    openTemplate: "Open template",
    defaultName: (eventName: string) => `Room — ${eventName}`,
    updateHeading: "Update from template",
    updateIntro:
      "Replaces this event's room with the template's. Rooms and tables are matched by name: guests at tables that stay keep their seats. The TV and the guests' phones show the change only after „Publish” in seating.",
    chooseLabel: "Template",
    noTemplates: "The restaurant has no venue templates yet.",
    checkButton: "Check the changes",
    checking: "Checking…",
    applyButton: "Update the room from the template",
    applying: "Updating…",
    tablesAdded: (names: readonly string[]) => `New tables: ${list(names)}`,
    tablesRemoved: (names: readonly string[]) => `Tables to disappear: ${list(names)}`,
    tablesResized: (names: readonly string[]) => `Fewer seats at: ${list(names)}`,
    roomsAdded: (names: readonly string[]) => `New rooms: ${list(names)}`,
    roomsRemoved: (names: readonly string[]) => `Rooms to disappear: ${list(names)}`,
    planReplaced: "The plan, the table positions and the drawing come from the template.",
    planRemoved: "The template has no plan: the event's plan will be removed.",
    lostNone: "Nobody loses a seat.",
    lostHeading: (count: number) => `${String(count)} ${pluralEn(count, "person loses", "people lose")} a seat:`,
    lostLine: (guest: string, table: string, seat: number) => `${guest} — table ${table}, seat ${String(seat)}`,
    confirmApply: (template: string, lost: readonly string[]) =>
      `Replace this event's room with the template „${template}”? ` +
      (lost.length === 0 ? "Nobody loses a seat." : `Losing their seat: ${list(lost)}.`) +
      " The TV and the guests' phones show the change after „Publish”.",
    applied: (result: TemplateUpdateResultDto) =>
      `Room updated from the template. Seats removed: ${String(result.seatsBefore - result.seatsAfter)}. The TV shows the change after „Publish” in seating.`,
    templateGone: "This template no longer exists — reload the page.",
  },
);

export function templateNameProblemText(reason: "empty" | "too-long", locale: Locale = "pl"): string {
  const t = templateMessages(locale);
  return reason === "empty" ? t.nameEmpty : t.nameTooLong;
}
