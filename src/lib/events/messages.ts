import { defineMessages, type Locale } from "@/lib/i18n/locale";
import { PRODUCT_NAME } from "@/lib/i18n/product";
import type { EventTiming } from "@/types";
import { EVENT_NAME_MAX, EXPECTED_GUESTS_MAX, type EventInputProblem, type EventLinkKind } from "./rules";

// Texts of a restaurant's events (restaurant-events, S-11): the lists and the „Nowe wydarzenie” form on the restaurant
// page, the event card, its confirms and the API messages, both languages (i18n). Pure: islands import it directly.

interface LinkTexts {
  label: string;
  hint: string;
  confirmRotate: (eventName: string) => string;
  rotated: string;
}

export const eventPanelMessages = defineMessages(
  {
    // Restaurant page: lists
    listsHeading: "Wydarzenia",
    tabsLabel: "Listy wydarzeń",
    tabUpcoming: (count: number) => `Nadchodzące (${String(count)})`,
    tabPast: (count: number) => `Minione (${String(count)})`,
    tabArchived: (count: number) => `Archiwum (${String(count)})`,
    emptyUpcoming: "Brak nadchodzących wydarzeń. Utwórz pierwsze powyżej.",
    emptyPast: "Brak minionych wydarzeń.",
    emptyArchived: "Archiwum jest puste.",
    guestsExpected: (count: number) => `gości: ${String(count)}`,
    openCardFor: (name: string) => `Otwórz kartę wydarzenia ${name}`,
    waiterNote: "Dzisiejsze wydarzenia dla kelnerów pojawią się tu wkrótce.",
    // Restaurant page: new event
    newHeading: "Nowe wydarzenie",
    newIntro: "Po utworzeniu zobaczysz kartę wydarzenia z linkiem dla klienta do skopiowania.",
    nameLabel: "Nazwa wydarzenia",
    namePlaceholder: "np. Wigilia firmy Y",
    dateLabel: "Data",
    guestsLabel: "Przewidywana liczba gości (opcjonalnie)",
    guestsPlaceholder: "np. 80",
    createButton: "Utwórz wydarzenie",
    creating: "Tworzę…",
    // Validation and API messages
    nameEmpty: "Wpisz nazwę wydarzenia.",
    nameTooLong: `Nazwa wydarzenia może mieć najwyżej ${String(EVENT_NAME_MAX)} znaków.`,
    dateInvalid: "Wybierz prawidłową datę (RRRR-MM-DD, lata 2000–2100).",
    guestsInvalid: `Liczba gości to liczba całkowita od 1 do ${String(EXPECTED_GUESTS_MAX)} albo puste pole.`,
    nothingToChange: "Nie ma nic do zmiany.",
    // Card: header
    pageTitle: (name: string) => `${name} — ${PRODUCT_NAME}`,
    backTo: (restaurant: string) => `← Wróć do: ${restaurant}`,
    timingLabels: { today: "Dziś", upcoming: "Nadchodzące", past: "Minione" } satisfies Record<EventTiming, string>,
    archivedBadge: "W archiwum",
    dateField: "Data",
    expectedField: "Przewidywana liczba gości",
    expectedUnknown: "nie podano",
    guestListField: "Na liście gości",
    // Card: links
    linksHeading: "Linki wydarzenia",
    linksIntro:
      "Linki są sekretne: kto ma link, ten wchodzi bez logowania. Przekaż każdy tylko właściwej osobie lub urządzeniu.",
    links: {
      organizer: {
        label: "Link dla klienta (organizatora)",
        hint: "Klient wpisuje gości, rozsadza ich i prowadzi atrakcje wieczoru.",
        confirmRotate: (eventName: string) =>
          `Wymienić link klienta wydarzenia „${eventName}”? Stary link przestanie działać od razu: klient i każda jego otwarta karta (także kopia bez sieci) stracą dostęp, dopóki nie dostaną nowego linku — trzeba mu go wysłać. Linki gości, TV i tabletu obsługi działają dalej.`,
        rotated: "Link klienta wymieniony. Stary już nie działa — wyślij klientowi nowy.",
      },
      tv: {
        label: "Link TV (ekran z rozsadzeniem)",
        hint: "Otwórz na telewizorze lub rzutniku w sali — tylko do odczytu.",
        confirmRotate: (eventName: string) =>
          `Wymienić link TV wydarzenia „${eventName}”? Ekran otwarty na starym linku przestanie się odświeżać od razu — trzeba otworzyć na nim nowy link. Klient zobaczy nowy link TV u siebie po odświeżeniu strony. Linki klienta, gości i tabletu działają dalej.`,
        rotated: "Link TV wymieniony. Otwórz nowy link na ekranie.",
      },
      restaurant: {
        label: "Link tabletu obsługi (kuchnia i sala)",
        hint: "Kuchnia i kelnerzy widzą zamówienia i serwowanie — tylko do odczytu.",
        confirmRotate: (eventName: string) =>
          `Wymienić link tabletu obsługi wydarzenia „${eventName}”? Tablety i telefony kuchni i obsługi otwarte na starym linku od razu stracą podgląd zamówień — trzeba otworzyć na nich nowy link. Linki klienta, gości i TV działają dalej.`,
        rotated: "Link tabletu wymieniony. Otwórz nowy link na tabletach obsługi.",
      },
    } satisfies Record<EventLinkKind, LinkTexts>,
    copy: "Kopiuj",
    copyLabel: (label: string) => `Kopiuj: ${label}`,
    copied: "Skopiowano do schowka.",
    copySelected: "Adres jest zaznaczony — skopiuj go (Ctrl+C / Cmd+C).",
    open: "Otwórz",
    openLabel: (label: string) => `Otwórz w nowej karcie: ${label}`,
    rotate: "Wymień link",
    rotateLabel: (label: string) => `Wymień: ${label}`,
    // Card: details
    detailsHeading: "Szczegóły wydarzenia",
    saveDetails: "Zapisz zmiany",
    saving: "Zapisuję…",
    detailsSaved: "Zapisano zmiany.",
    // Card: archive
    archiveHeading: "Archiwum",
    archiveHint:
      "Archiwizacja tylko przenosi wydarzenie do zakładki „Archiwum”. Linki klienta, TV, gości i tabletu działają dalej. Możesz je w każdej chwili przywrócić.",
    archivedHint: "Wydarzenie jest w archiwum. Jego linki działają dalej.",
    archive: "Przenieś do archiwum",
    restore: "Przywróć z archiwum",
    confirmArchive: (name: string) =>
      `Przenieść wydarzenie „${name}” do archiwum? Zniknie z list nadchodzących i minionych, ale jego linki (klienta, TV, gości, tabletu) działają dalej. Możesz je potem przywrócić.`,
    confirmRestore: (name: string) => `Przywrócić wydarzenie „${name}” z archiwum?`,
    archived: "Wydarzenie przeniesione do archiwum.",
    restored: "Wydarzenie przywrócone z archiwum.",
    // Card: delete (owner only)
    deleteHeading: "Usuń trwale",
    deleteHint:
      "Usuwa wydarzenie ze wszystkimi danymi: gośćmi, salą, rozsadzeniem, zamówieniami, strzałami i pytaniami. Tego nie da się cofnąć.",
    deleteButton: "Usuń wydarzenie trwale",
    deleting: "Usuwam…",
    confirmDelete: (name: string) =>
      `Usunąć trwale wydarzenie „${name}”? Znikną goście, sala, rozsadzenie, zamówienia, napoje, strzały i pytania. Przestaną działać link klienta, TV, tabletu obsługi oraz linki wszystkich gości i ich karteczki z kodem QR. Tego nie da się cofnąć.`,
    gone: "To wydarzenie zostało usunięte albo nie masz już do niego dostępu.",
    regionLabel: "Komunikat",
  },
  {
    listsHeading: "Events",
    tabsLabel: "Event lists",
    tabUpcoming: (count: number) => `Upcoming (${String(count)})`,
    tabPast: (count: number) => `Past (${String(count)})`,
    tabArchived: (count: number) => `Archive (${String(count)})`,
    emptyUpcoming: "No upcoming events. Create the first one above.",
    emptyPast: "No past events.",
    emptyArchived: "The archive is empty.",
    guestsExpected: (count: number) => `guests: ${String(count)}`,
    openCardFor: (name: string) => `Open the event card of ${name}`,
    waiterNote: "Today's events for waiters will appear here soon.",
    newHeading: "New event",
    newIntro: "Once it is created you will see the event card with the client's link to copy.",
    nameLabel: "Event name",
    namePlaceholder: "e.g. Company Y Christmas party",
    dateLabel: "Date",
    guestsLabel: "Expected number of guests (optional)",
    guestsPlaceholder: "e.g. 80",
    createButton: "Create event",
    creating: "Creating…",
    nameEmpty: "Enter the event's name.",
    nameTooLong: `The event's name can have at most ${String(EVENT_NAME_MAX)} characters.`,
    dateInvalid: "Pick a valid date (YYYY-MM-DD, years 2000–2100).",
    guestsInvalid: `The number of guests is a whole number from 1 to ${String(EXPECTED_GUESTS_MAX)}, or leave it empty.`,
    nothingToChange: "There is nothing to change.",
    pageTitle: (name: string) => `${name} — ${PRODUCT_NAME}`,
    backTo: (restaurant: string) => `← Back to: ${restaurant}`,
    timingLabels: { today: "Today", upcoming: "Upcoming", past: "Past" },
    archivedBadge: "Archived",
    dateField: "Date",
    expectedField: "Expected guests",
    expectedUnknown: "not given",
    guestListField: "On the guest list",
    linksHeading: "Event links",
    linksIntro:
      "Links are secret: whoever has a link gets in without logging in. Hand each one only to the right person or device.",
    links: {
      organizer: {
        label: "Client (organizer) link",
        hint: "The client enters the guests, seats them and runs the evening's activities.",
        confirmRotate: (eventName: string) =>
          `Replace the client's link of „${eventName}”? The old link stops working at once: the client and every page they have open (the offline copy too) lose access until they get the new link — you need to send it to them. The guests', TV and tablet links keep working.`,
        rotated: "Client's link replaced. The old one no longer works — send the client the new one.",
      },
      tv: {
        label: "TV link (seating screen)",
        hint: "Open it on the TV or projector in the room — read-only.",
        confirmRotate: (eventName: string) =>
          `Replace the TV link of „${eventName}”? A screen showing the old link stops updating at once — open the new link on it. The client sees the new TV link after reloading their page. The client's, guests' and tablet links keep working.`,
        rotated: "TV link replaced. Open the new link on the screen.",
      },
      restaurant: {
        label: "Staff tablet link (kitchen and floor)",
        hint: "The kitchen and waiters see the orders and where to serve — read-only.",
        confirmRotate: (eventName: string) =>
          `Replace the staff tablet link of „${eventName}”? Kitchen and staff tablets or phones on the old link lose the order view at once — open the new link on them. The client's, guests' and TV links keep working.`,
        rotated: "Tablet link replaced. Open the new link on the staff tablets.",
      },
    },
    copy: "Copy",
    copyLabel: (label: string) => `Copy: ${label}`,
    copied: "Copied to the clipboard.",
    copySelected: "The address is selected — copy it (Ctrl+C / Cmd+C).",
    open: "Open",
    openLabel: (label: string) => `Open in a new tab: ${label}`,
    rotate: "Replace link",
    rotateLabel: (label: string) => `Replace: ${label}`,
    detailsHeading: "Event details",
    saveDetails: "Save changes",
    saving: "Saving…",
    detailsSaved: "Changes saved.",
    archiveHeading: "Archive",
    archiveHint:
      "Archiving only moves the event to the „Archive” tab. The client's, TV, guests' and tablet links keep working. You can restore it at any time.",
    archivedHint: "The event is archived. Its links keep working.",
    archive: "Move to the archive",
    restore: "Restore from the archive",
    confirmArchive: (name: string) =>
      `Move „${name}” to the archive? It leaves the upcoming and past lists, but its links (client, TV, guests, tablet) keep working. You can restore it later.`,
    confirmRestore: (name: string) => `Restore „${name}” from the archive?`,
    archived: "Event moved to the archive.",
    restored: "Event restored from the archive.",
    deleteHeading: "Delete permanently",
    deleteHint:
      "Deletes the event with all its data: guests, venue, seating, orders, guesses and questions. This cannot be undone.",
    deleteButton: "Delete the event permanently",
    deleting: "Deleting…",
    confirmDelete: (name: string) =>
      `Delete „${name}” permanently? Its guests, venue, seating, orders, drinks, guesses and questions disappear. The client, TV and staff tablet links stop working, and so do every guest's link and their QR cards. This cannot be undone.`,
    gone: "This event was deleted or you no longer have access to it.",
    regionLabel: "Message",
  },
);

// The message of an input problem (API answers and the forms).
export function eventInputProblemText(problem: EventInputProblem, locale: Locale = "pl"): string {
  const t = eventPanelMessages(locale);
  switch (problem) {
    case "name-empty":
      return t.nameEmpty;
    case "name-too-long":
      return t.nameTooLong;
    case "date":
      return t.dateInvalid;
    case "guests":
      return t.guestsInvalid;
    case "nothing":
      return t.nothingToChange;
  }
}
