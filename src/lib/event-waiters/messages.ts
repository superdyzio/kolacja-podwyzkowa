import { defineMessages, type Locale } from "@/lib/i18n/locale";
import type { EventWaiterStatus } from "@/types";

// Texts of the per-event waiter (event-waiter-access, S-21b), both languages (i18n): the „Kelnerzy na imprezę”
// section of the panel's event card, its API's messages, the entry page /kelner, the one-time link page and the
// waiter's floor page. Pure: islands import this module directly.

export const eventWaiterMessages = defineMessages(
  {
    // The event card (owners and managers)
    heading: "Kelnerzy na imprezę",
    intro:
      "Kelner bez konta i hasła: wpisz imię, a dostaniesz jednorazowy link i krótki kod do przekazania. Działają tylko na sali tego wydarzenia, w dniu imprezy (od północy) do południa następnego dnia. Pierwsze wejście zużywa link i kod razem — po wylogowaniu albo zgubieniu dostępu cofnij go i dodaj kelnera ponownie.",
    nameLabel: "Imię kelnera",
    addButton: "Dodaj kelnera",
    closed:
      "To wydarzenie jest zarchiwizowane albo jego okno już minęło (południe dnia po imprezie) — kelnera na imprezę nie da się dodać.",
    empty: "Nie ma jeszcze kelnerów na imprezę.",
    listHeading: (count: number) => `Dodani kelnerzy (${String(count)})`,
    status: {
      unused: "link i kod czekają na użycie",
      redeemed: "wszedł na salę",
      expired: "dostęp wygasł",
    } satisfies Record<EventWaiterStatus, string>,
    validUntil: (time: string) => `ważny do ${time}`,
    revoke: "Cofnij dostęp",
    revokeFor: (name: string) => `Cofnij dostęp: ${name}`,
    confirmRevoke: (name: string) =>
      `Cofnąć dostęp kelnera „${name}”? Jego link, kod i otwarta sesja przestaną działać od razu.`,
    issuedHeading: (name: string) => `Dostęp dla: ${name}`,
    issuedLinkLabel: "Link jednorazowy",
    issuedCodeLabel: (entry: string) => `albo kod do wpisania na ${entry}`,
    issuedValidUntil: (time: string) => `Działa raz, w dniu imprezy do ${time}.`,
    issuedOnlyNow: "Link i kod widać tylko teraz — przekaż jedno z nich kelnerowi. Pierwsze użycie jednego zużywa oba.",
    copyLink: "Kopiuj link",
    copyCode: "Kopiuj kod",
    copied: "Skopiowano.",
    copySelected: "Zaznaczone — skopiuj (Ctrl+C / ⌘C).",
    dismiss: "Zamknij",
    // API messages
    nameEmpty: "Wpisz imię kelnera.",
    nameTooLong: (max: number) => `Imię kelnera może mieć najwyżej ${String(max)} znaków.`,
    tooMany: (max: number) =>
      `To wydarzenie ma już ${String(max)} kelnerów na imprezę. Cofnij dostęp komuś, kto go już nie potrzebuje.`,
    // The entry page /kelner
    entryTitle: "Wejście kelnera",
    entryHeading: "Wejście kelnera na salę",
    entryIntro: "Wpisz kod od menedżera lokalu albo otwórz link, który od niego dostałeś.",
    codeLabel: "Kod",
    codeHint: "Na przykład 57-K7MQ-X3PA. Kod działa raz, tylko w dniu imprezy (do południa następnego dnia).",
    enterButton: "Wejdź na salę",
    invalid:
      "Ten link lub kod nie działa: jest błędny, został już użyty, wygasł albo impreza jeszcze się nie zaczęła. Poproś menedżera o nowy.",
    limit: "Za dużo prób dla tego kodu. Spróbuj ponownie za kilka minut.",
    noDatabase: "Baza danych jest teraz niedostępna. Spróbuj ponownie za chwilę.",
    loggedOut: "Wylogowano. Ponowne wejście wymaga nowego linku lub kodu od menedżera.",
    activeSession: "To urządzenie jest zalogowane na salę.",
    backToFloor: "Wróć na salę",
    errorRegion: "Błąd",
    noticeRegion: "Komunikat",
    // The one-time link page
    linkTitle: "Wejście na salę",
    linkWaiter: (name: string) => `Kelner: ${name}`,
    linkText:
      "Link działa jeden raz: po wejściu to urządzenie pracuje na sali tego wydarzenia do południa następnego dnia.",
    invalidLinkTitle: "Ten link nie działa",
    typeCode: "Mam kod — wpiszę go",
    // The floor page
    floorTitle: (event: string) => `Sala · ${event}`,
    floorWaiter: (name: string) => `Kelner na imprezę: ${name}`,
    floorUntil: (time: string) => `dostęp do ${time}`,
    logout: "Wyloguj",
    confirmLogout:
      "Wylogować? Ponowne wejście na salę wymaga nowego linku lub kodu od menedżera — ten przestanie działać.",
  },
  {
    heading: "Waiters for the event",
    intro:
      "A waiter without an account or password: enter a name and you get a one-time link and a short code to hand over. They work only on this event's floor, on the day of the event (from midnight) until noon the next day. The first entry uses up the link and the code together — after a logout or a lost device, revoke the access and add the waiter again.",
    nameLabel: "Waiter's name",
    addButton: "Add a waiter",
    closed:
      "This event is archived or its window is over (noon the day after the event) — no waiter can be added for it.",
    empty: "No waiters for this event yet.",
    listHeading: (count: number) => `Added waiters (${String(count)})`,
    status: {
      unused: "link and code not used yet",
      redeemed: "on the floor",
      expired: "access expired",
    } satisfies Record<EventWaiterStatus, string>,
    validUntil: (time: string) => `valid until ${time}`,
    revoke: "Revoke access",
    revokeFor: (name: string) => `Revoke access: ${name}`,
    confirmRevoke: (name: string) =>
      `Revoke the access of waiter "${name}"? Their link, code and open session stop working at once.`,
    issuedHeading: (name: string) => `Access for: ${name}`,
    issuedLinkLabel: "One-time link",
    issuedCodeLabel: (entry: string) => `or the code to type at ${entry}`,
    issuedValidUntil: (time: string) => `Works once, on the day of the event until ${time}.`,
    issuedOnlyNow: "The link and the code are shown only now — hand one of them over. Using either uses up both.",
    copyLink: "Copy link",
    copyCode: "Copy code",
    copied: "Copied.",
    copySelected: "Selected — copy it (Ctrl+C / ⌘C).",
    dismiss: "Close",
    nameEmpty: "Enter the waiter's name.",
    nameTooLong: (max: number) => `The waiter's name can have at most ${String(max)} characters.`,
    tooMany: (max: number) =>
      `This event already has ${String(max)} waiters. Revoke the access of someone who no longer needs it.`,
    entryTitle: "Waiter entry",
    entryHeading: "Waiter entry to the floor",
    entryIntro: "Type the code from the venue's manager, or open the link you got from them.",
    codeLabel: "Code",
    codeHint: "For example 57-K7MQ-X3PA. The code works once, only on the day of the event (until noon the next day).",
    enterButton: "Go to the floor",
    invalid:
      "This link or code does not work: it is wrong, already used, expired, or the event has not started yet. Ask the manager for a new one.",
    limit: "Too many tries for this code. Try again in a few minutes.",
    noDatabase: "The database is unavailable right now. Try again in a moment.",
    loggedOut: "Logged out. Getting back in needs a new link or code from the manager.",
    activeSession: "This device is logged in to the floor.",
    backToFloor: "Back to the floor",
    errorRegion: "Error",
    noticeRegion: "Notice",
    linkTitle: "Floor entry",
    linkWaiter: (name: string) => `Waiter: ${name}`,
    linkText: "The link works once: after entering, this device works this event's floor until noon the next day.",
    invalidLinkTitle: "This link does not work",
    typeCode: "I have a code — let me type it",
    floorTitle: (event: string) => `Floor · ${event}`,
    floorWaiter: (name: string) => `Waiter for the event: ${name}`,
    floorUntil: (time: string) => `access until ${time}`,
    logout: "Log out",
    confirmLogout:
      "Log out? Getting back to the floor needs a new link or code from the manager — this one stops working.",
  },
);

// The entry page's error text for its `?blad=` code, or null.
export function waiterErrorText(code: string | null, locale: Locale = "pl"): string | null {
  const t = eventWaiterMessages(locale);
  switch (code) {
    case "niewazny":
      return t.invalid;
    case "limit":
      return t.limit;
    case "baza":
      return t.noDatabase;
    default:
      return null;
  }
}
