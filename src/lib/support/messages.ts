import { defineMessages } from "@/lib/i18n/locale";
import type { SupportArea, SupportReasonProblem } from "./rules";

// Texts of the platform admin's support access (admin-support-log, S-13), both languages (i18n): the platform card's
// „Wejdź jako wsparcie”, the banner of support mode, the read-only views and the owner's „Dziennik wejść
// administratora”. The log's rows use impersonal wording (no grammatical gender). Pure: islands import it directly.

export const supportMessages = defineMessages(
  {
    // Platform card
    enterSummary: "Wejdź jako wsparcie",
    enterIntro:
      "Otwiera dane tej restauracji tylko do podglądu na 60 minut. Wejście, każda otwarta strona i wyjście trafiają do dziennika, który widzi właściciel lokalu.",
    reasonLabel: "Powód wejścia",
    reasonHint: "Zobaczy go właściciel lokalu, np. „Prośba właściciela: nie widzi wydarzenia”. Od 3 do 300 znaków.",
    enterButton: "Wejdź jako wsparcie",
    enterLabel: (name: string) => `Wejdź jako wsparcie: ${name}`,
    activeUntil: (time: string) => `Wsparcie aktywne do ${time}`,
    open: "Otwórz",
    openLabel: (name: string) => `Otwórz w trybie wsparcia: ${name}`,
    end: "Zakończ wsparcie",
    endLabel: (name: string) => `Zakończ wsparcie: ${name}`,
    // Banner
    bannerHeading: "Tryb wsparcia — tylko podgląd",
    bannerText: (name: string, until: string) =>
      `Widzisz dane restauracji „${name}” tak jak jej właściciel, bez możliwości zmian, do ${until}. Każda otwarta strona trafia do dziennika właściciela.`,
    reasonPrefix: "Powód:",
    disabledNote: "Ta restauracja jest wyłączona: jej personel nie ma teraz dostępu do panelu lokalu.",
    ending: "Kończę…",
    endFailed: "Nie udało się zakończyć wsparcia. Spróbuj ponownie.",
    backToPlatform: "← Panel platformy",
    // Read-only views
    teamReadOnly: "Podgląd zespołu w trybie wsparcia (bez zmian).",
    emptyUpcoming: "Brak nadchodzących wydarzeń.",
    eventReadOnly: "Podgląd wydarzenia w trybie wsparcia (bez zmian).",
    eventLinksHidden:
      "Linki wydarzenia (dla klienta, TV i tabletu obsługi) widzi tylko personel lokalu: tryb wsparcia ich nie pokazuje.",
    // The owner's log
    logHeading: "Dziennik wejść administratora",
    logIntro:
      "Administrator platformy może w razie potrzeby wsparcia otworzyć dane tej restauracji: tylko do podglądu, najwyżej na 60 minut i po podaniu powodu. Każde wejście, każda otwarta strona i wyjście są tu zapisane — tak samo każdy jednorazowy link do konta właściciela (zaproszenie albo reset hasła), który wydał administrator. Wpisów nie da się zmienić ani usunąć.",
    logEmpty: "Administrator platformy nie wchodził w dane tej restauracji.",
    logTruncated: (count: number) => `Pokazano ${String(count)} najnowszych wpisów.`,
    logListLabel: "Wpisy dziennika, od najnowszego",
    entryEnter: (until: string) => `Wejście w tryb wsparcia (do ${until})`,
    entryAccess: (what: string) => `Otwarte: ${what}`,
    entryExit: "Zakończenie trybu wsparcia",
    entryUnlock: (module: string, event: string) => `Odblokowanie modułu płatnego „${module}” w wydarzeniu „${event}”`,
    entryLock: (module: string, event: string) => `Ponowna blokada modułu płatnego „${module}” w wydarzeniu „${event}”`,
    entryLinkInvite: (email: string, until: string) =>
      `Wydanie linku z zaproszeniem dla konta ${email} (ważny do ${until})`,
    entryLinkReset: (email: string, until: string) =>
      `Wydanie linku do resetu hasła konta ${email} (ważny do ${until}; kto go użyje, zaloguje się na to konto)`,
    entryReason: (reason: string) => `Powód: „${reason}”`,
    areaLabels: {
      restaurant: "strona restauracji",
      events: "lista wydarzeń",
      team: "zespół",
      log: "dziennik wejść",
      event: "wydarzenie",
      other: "panel restauracji",
    } satisfies Record<SupportArea, string>,
    eventArea: (name: string) => `wydarzenie „${name}”`,
    apiSuffix: " (API)",
    reasonProblems: {
      short: "Wpisz powód wejścia (co najmniej 3 znaki).",
      long: "Powód może mieć najwyżej 300 znaków.",
    } satisfies Record<SupportReasonProblem, string>,
  },
  {
    // Platform card
    enterSummary: "Enter as support",
    enterIntro:
      "Opens this restaurant's data for viewing only, for 60 minutes. The entry, every page opened and the exit go into a log the restaurant's owner sees.",
    reasonLabel: "Reason",
    reasonHint: "The restaurant's owner will see it, e.g. “Owner's request: an event is missing”. 3 to 300 characters.",
    enterButton: "Enter as support",
    enterLabel: (name: string) => `Enter as support: ${name}`,
    activeUntil: (time: string) => `Support active until ${time}`,
    open: "Open",
    openLabel: (name: string) => `Open in support mode: ${name}`,
    end: "End support",
    endLabel: (name: string) => `End support: ${name}`,
    // Banner
    bannerHeading: "Support mode — view only",
    bannerText: (name: string, until: string) =>
      `You see the data of “${name}” as its owner does, without making changes, until ${until}. Every page you open goes into the owner's log.`,
    reasonPrefix: "Reason:",
    disabledNote: "This restaurant is switched off: its staff have no access to the restaurant panel right now.",
    ending: "Ending…",
    endFailed: "Support could not be ended. Please try again.",
    backToPlatform: "← Platform panel",
    // Read-only views
    teamReadOnly: "Team in support mode (view only).",
    emptyUpcoming: "No upcoming events.",
    eventReadOnly: "Event in support mode (view only).",
    eventLinksHidden:
      "The event's links (for the client, the TV and the staff tablet) are for the restaurant's staff only: support mode does not show them.",
    // The owner's log
    logHeading: "Platform administrator access log",
    logIntro:
      "When support is needed, the platform administrator can open this restaurant's data: view only, for at most 60 minutes and with a reason. Every entry, every page opened and the exit are recorded here — and so is every one-time link to an owner's account (an invitation or a password reset) the administrator issued. Entries cannot be changed or deleted.",
    logEmpty: "The platform administrator has not opened this restaurant's data.",
    logTruncated: (count: number) => `Showing the ${String(count)} newest entries.`,
    logListLabel: "Log entries, newest first",
    entryEnter: (until: string) => `Entered support mode (until ${until})`,
    entryAccess: (what: string) => `Opened: ${what}`,
    entryExit: "Left support mode",
    entryUnlock: (module: string, event: string) => `Unlocked the paid module “${module}” for the event “${event}”`,
    entryLock: (module: string, event: string) => `Locked the paid module “${module}” again for the event “${event}”`,
    entryLinkInvite: (email: string, until: string) =>
      `Issued an invitation link for the account ${email} (valid until ${until})`,
    entryLinkReset: (email: string, until: string) =>
      `Issued a password reset link for the account ${email} (valid until ${until}; whoever uses it logs in to that account)`,
    entryReason: (reason: string) => `Reason: “${reason}”`,
    areaLabels: {
      restaurant: "restaurant page",
      events: "event lists",
      team: "team",
      log: "access log",
      event: "event",
      other: "restaurant panel",
    },
    eventArea: (name: string) => `event “${name}”`,
    apiSuffix: " (API)",
    reasonProblems: {
      short: "Enter a reason (at least 3 characters).",
      long: "The reason can have at most 300 characters.",
    },
  },
);
