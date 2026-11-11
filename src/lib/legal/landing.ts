import { defineMessages } from "@/lib/i18n/locale";
import { PRODUCT_NAME } from "@/lib/i18n/product";
import { DEFAULT_GUEST_RETENTION_DAYS } from "@/lib/privacy/rules";

// Texts of the public product page `/` (landing-legal, S-30; FR-041), both languages. Only what the app really does
// today (PRD v2 flow 1–7); no prices (Open Question 5), no contact (no address exists yet), the product's working name
// only through PRODUCT_NAME (Open Question 1). Pure.

export interface LandingCard {
  readonly title: string;
  readonly text: string;
}

export const landingMessages = defineMessages(
  {
    pageTitle: `${PRODUCT_NAME} — imprezy w restauracji`,
    login: "Zaloguj się",
    loginHint: "Dla personelu lokali i administratora platformy.",
    howLink: "Jak to działa",
    heroTitle: "Imprezy w restauracji — od listy gości po ostatnie danie",
    heroText:
      "Lokal zakłada wydarzenie z gotowego szablonu sali, klient wpisuje gości i rozsadza ich na planie, a w dniu imprezy telewizor pokazuje, kto gdzie siedzi, goście widzą swoje miejsce na telefonie, a kuchnia i kelnerzy wiedzą, co komu podać.",
    audienceHeading: "Dla kogo",
    audience: [
      {
        title: "Lokal",
        text: "Właściciel, menedżer i kelnerzy pracują na swoich kontach: szablony sal, menu z cenami, wydarzenia, zespół, marka lokalu i obsługa sali w dniu imprezy.",
      },
      {
        title: "Klient zamawiający imprezę",
        text: "Dostaje od lokalu link do swojego wydarzenia — bez konta i hasła. Wpisuje gości z dietami, rozsadza ich, zbiera potwierdzenia i zamawia dania z menu lokalu.",
      },
      {
        title: "Goście",
        text: "Osobisty link albo kod QR na stole — bez aplikacji i logowania: swoje miejsce na planie sali, potwierdzenie przybycia z wyborem dania i zabawy przy stole.",
      },
    ] satisfies readonly LandingCard[],
    featuresHeading: "Co potrafi",
    features: [
      {
        title: "Szablony sal",
        text: "Plan lokalu, sale i stoliki wprowadzone raz; kolejne wydarzenie powstaje z szablonu w minutę.",
      },
      {
        title: "Goście, diety i alergie",
        text: "Wklejona lista albo import CSV z arkusza, grupy, które siedzą razem, diety widoczne dla kuchni i obsługi.",
      },
      {
        title: "Rozsadzenie",
        text: "Losowanie bez powtórek sąsiadów, ręczne poprawki i publikacja jednym przyciskiem.",
      },
      {
        title: "Ekran TV",
        text: "Opublikowane rozsadzenie czytelne z daleka; w dużym lokalu sale pokazywane po kolei.",
      },
      {
        title: "Telefony gości",
        text: "Miejsce na planie, wyszukiwanie osób, potwierdzenie przybycia i wybór dania do ustalonego terminu.",
      },
      {
        title: "Zamówienia i kuchnia",
        text: "Menu lokalu z kursami, lista do przygotowania na tablecie, serwowanie per miejsce i rachunek.",
      },
      {
        title: "Kelnerzy na sali",
        text: "Widok dnia dla zespołu i jednorazowy dostęp „na imprezę”; ostatni stan zostaje na urządzeniu także bez sieci.",
      },
      {
        title: "Wydruki",
        text: "Tablica „znajdź swój stolik”, karty stołów, winietki i lista dla obsługi z dietami.",
      },
      {
        title: "Zabawy przy stole",
        text: "Pytania do rozmowy, gra w zgadywanie rachunku, pub quiz na TV i tematy od AI — lokal decyduje, co jest dostępne.",
      },
      {
        title: "Marka lokalu i klienta",
        text: "Logo i kolor lokalu oraz logo firmy klienta; goście widzą lokal, nie platformę.",
      },
    ] satisfies readonly LandingCard[],
    stepsHeading: "Jak to działa",
    steps: [
      "Administrator platformy zakłada restaurację i przekazuje właścicielowi jednorazowy link zaproszenia.",
      "Właściciel ustawia hasło i zaprasza menedżerów i kelnerów.",
      "Menedżer raz wprowadza szablon sali i menu lokalu.",
      "Menedżer tworzy wydarzenie z szablonu i przekazuje klientowi link organizatora.",
      "Klient wpisuje gości, rozsadza ich i publikuje rozsadzenie; lokal widzi wszystko w podglądzie.",
      "W dniu imprezy TV pokazuje rozsadzenie, kuchnia patrzy na tablet, a kelnerzy oznaczają wydane dania.",
      "Po imprezie wydarzenie trafia do archiwum, a dane gości znikają po terminie ustawionym przez lokal.",
    ],
    privacyHeading: "Prywatność i bezpieczeństwo",
    privacy: [
      "Każdy link otwiera tylko jedno wydarzenie i można go wymienić — stary przestaje działać od razu.",
      `Dane gości są usuwane po terminie ustawionym przez lokal (domyślnie ${String(DEFAULT_GUEST_RETENTION_DAYS)} dni po imprezie); wcześniej lokal może je wyeksportować.`,
      "Diety i alergie widzą klient i personel lokalu — nigdy inni goście, ekran TV ani sztuczna inteligencja.",
      "Administrator platformy zagląda w dane lokalu tylko do odczytu i z podanym powodem, a każde jego wejście trafia do dziennika widocznego dla właściciela.",
      "Bez analityki, reklam i e-maili: zaproszenia i reset hasła przekazuje człowiek.",
    ],
    accessHeading: "Jak zacząć",
    accessVenue:
      "Konta lokali zakłada administrator platformy — nie ma samodzielnej rejestracji. Właściciel dostaje jednorazowy link zaproszenia i sam zaprasza swój zespół.",
    accessLinkHolder:
      "Masz link od organizatora albo lokalu? Otwórz go bezpośrednio — ta strona nie pokazuje żadnego wydarzenia.",
    footerNote: `${PRODUCT_NAME} to robocza nazwa produktu.`,
  },
  {
    pageTitle: `${PRODUCT_NAME} — events at restaurants`,
    login: "Log in",
    loginHint: "For venue staff and the platform administrator.",
    howLink: "How it works",
    heroTitle: "Events at restaurants — from the guest list to the last course",
    heroText:
      "The venue creates an event from a ready room template, the client enters the guests and seats them on the plan, and on the day the TV shows who sits where, guests see their seat on their phones, and the kitchen and waiters know what goes to whom.",
    audienceHeading: "Who it is for",
    audience: [
      {
        title: "The venue",
        text: "The owner, managers and waiters work with their own accounts: room templates, a priced menu, events, the team, the venue's brand and the floor on the day.",
      },
      {
        title: "The client ordering the event",
        text: "Gets a link to their event from the venue — no account or password. Enters the guests with their diets, seats them, collects replies and orders dishes from the venue's menu.",
      },
      {
        title: "Guests",
        text: "A personal link or a QR code on the table — no app and no login: their seat on the room plan, replying with a dish choice and games at the table.",
      },
    ] satisfies readonly LandingCard[],
    featuresHeading: "What it does",
    features: [
      {
        title: "Room templates",
        text: "The venue's plan, rooms and tables entered once; the next event is made from the template in a minute.",
      },
      {
        title: "Guests, diets and allergies",
        text: "A pasted list or a CSV import from a spreadsheet, groups that sit together, diets visible to the kitchen and the staff.",
      },
      {
        title: "Seating",
        text: "A draw without repeated neighbours, manual changes and publishing with one button.",
      },
      {
        title: "TV screen",
        text: "The published seating, readable from afar; in a large venue the rooms are shown in turn.",
      },
      {
        title: "Guests' phones",
        text: "Their seat on the plan, finding people, confirming attendance and choosing a dish until a set deadline.",
      },
      {
        title: "Orders and the kitchen",
        text: "The venue's menu by course, the prep list on a tablet, serving seat by seat and the bill.",
      },
      {
        title: "Waiters on the floor",
        text: "A day view for the team and one-time access for a single event; the last state stays on the device even without a network.",
      },
      {
        title: "Prints",
        text: "A “find your table” board, table cards, place cards and the staff list with diets.",
      },
      {
        title: "Games at the table",
        text: "Conversation questions, the bill-guessing game, a pub quiz on the TV and AI topics — the venue decides what is offered.",
      },
      {
        title: "The venue's and the client's brand",
        text: "The venue's logo and colour and the client company's logo; guests see the venue, not the platform.",
      },
    ] satisfies readonly LandingCard[],
    stepsHeading: "How it works",
    steps: [
      "The platform administrator creates the restaurant and hands the owner a one-time invitation link.",
      "The owner sets a password and invites managers and waiters.",
      "A manager enters the room template and the venue's menu once.",
      "A manager creates an event from the template and hands the client the organizer link.",
      "The client enters the guests, seats them and publishes the seating; the venue sees everything in a preview.",
      "On the day the TV shows the seating, the kitchen watches the tablet and the waiters mark the dishes served.",
      "After the event it goes to the archive, and the guests' data disappears after the term the venue set.",
    ],
    privacyHeading: "Privacy and safety",
    privacy: [
      "Every link opens one event only and can be replaced — the old one stops working at once.",
      `Guests' data is deleted after the term the venue sets (by default ${String(DEFAULT_GUEST_RETENTION_DAYS)} days after the event); before that the venue can export it.`,
      "Diets and allergies are seen by the client and the venue's staff — never by other guests, the TV screen or artificial intelligence.",
      "The platform administrator looks into a venue's data read-only and with a stated reason, and every visit goes into a log the owner sees.",
      "No analytics, ads or e-mails: invitations and password resets are handed over by a person.",
    ],
    accessHeading: "Getting started",
    accessVenue:
      "Venue accounts are created by the platform administrator — there is no self sign-up. The owner gets a one-time invitation link and invites their own team.",
    accessLinkHolder: "Have a link from the organizer or the venue? Open it directly — this page shows no event.",
    footerNote: `${PRODUCT_NAME} is the product's working name.`,
  },
);

// The footer links to both DRAFT documents (landing-legal, S-30): the product page and the staff doors only — never a
// guest, TV, tablet or print page (white-label).
export const legalLinksMessages = defineMessages(
  {
    label: "Dokumenty",
    terms: "Regulamin",
    privacy: "Polityka prywatności",
    draft: "wersja robocza",
  },
  {
    label: "Documents",
    terms: "Terms of service",
    privacy: "Privacy policy",
    draft: "draft",
  },
);
