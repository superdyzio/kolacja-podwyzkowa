import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { INVITE_TTL_DAYS, RESET_TTL_HOURS, SESSION_DAYS } from "@/lib/auth/limits";
import { WAITER_COOKIE } from "@/lib/event-waiters/cookie";
import { DAY_ROLLOVER_HOUR } from "@/lib/events/dates";
import { defineMessages, LOCALE_COOKIE_MAX_AGE_SECONDS, localeCookieName } from "@/lib/i18n/locale";
import { PRODUCT_NAME } from "@/lib/i18n/product";
import { DEFAULT_GUEST_RETENTION_DAYS, MAX_GUEST_RETENTION_DAYS, MIN_GUEST_RETENTION_DAYS } from "@/lib/privacy/rules";
import { SUPPORT_MINUTES } from "@/lib/support/rules";
import type { LegalDocument } from "./types";

// The DRAFT privacy policy of the platform (landing-legal, S-30; FR-041, PRD v2 Open Question 6), both languages. The
// operator is the controller of the product page, the staff accounts, the per-event waiters and the admin's support
// log; for the guests' data it is the restaurant's processor (the restaurant is the controller — the same split as the
// guests' own notice /g/<key>/prywatnosc, S-26). It states what the app really stores, where and for how long — every
// number and cookie name comes from the code's constants — and leaves `[…]` placeholders for what only the operator
// and a lawyer decide. Never an operator name, address, tax number or e-mail address here. Pure.

const LANGUAGE_COOKIE = localeCookieName("/");
const TABLET_LANGUAGE_COOKIE = localeCookieName("/r/");
const languageDays = String(LOCALE_COOKIE_MAX_AGE_SECONDS / (24 * 60 * 60));
const noon = `${String(DAY_ROLLOVER_HOUR)}:00`;
const retentionRange = `${String(MIN_GUEST_RETENTION_DAYS)}–${String(MAX_GUEST_RETENTION_DAYS)}`;

export const privacyPolicyMessages = defineMessages<LegalDocument>(
  {
    pageTitle: `Polityka prywatności — ${PRODUCT_NAME}`,
    heading: `Polityka prywatności platformy ${PRODUCT_NAME}`,
    draft: "Wersja robocza — do przeglądu prawnika",
    draftText:
      "Ten szkic opisuje dane, które aplikacja przetwarza dziś. Nie jest ostateczny, dopóki nie przejrzy go prawnik. Pola w nawiasach kwadratowych uzupełni operator.",
    asOf: (date: string) => `Stan na ${date}`,
    tocLabel: "Spis treści",
    otherDocument: "Regulamin (wersja robocza)",
    backHome: "Strona główna",
    sections: [
      {
        id: "controller",
        heading: "Administrator danych",
        paragraphs: [
          `Administratorem danych opisanych w tej polityce jest [nazwa operatora], [adres siedziby], NIP [NIP] („Operator”), który udostępnia platformę ${PRODUCT_NAME}. Kontakt w sprawach danych: [e-mail kontaktowy].`,
          "Inspektor ochrony danych: [dane inspektora — jeśli zostanie wyznaczony].",
        ],
      },
      {
        id: "scope",
        heading: "Czego dotyczy polityka",
        paragraphs: [
          "Polityka dotyczy strony produktu, kont personelu restauracji i administratorów platformy, kelnerów „na imprezę” oraz dziennika wejść administratora.",
          "Dane gości imprez Operator przetwarza w imieniu restauracji, która jest ich administratorem. Gość znajdzie informację o prywatności na swoim osobistym linku.",
          "[rola Operatora wobec danych personelu restauracji i kelnerów „na imprezę” — administrator czy podmiot przetwarzający — do potwierdzenia przez prawnika].",
        ],
      },
      {
        id: "visitors",
        heading: "Odwiedzający stronę produktu",
        paragraphs: [
          "Strona produktu i te dokumenty niczego nie zapisują ani nie odczytują z bazy danych. Nie używają analityki, reklam, zewnętrznych czcionek ani skryptów.",
          `Jeśli wybierzesz język, przeglądarka zapamięta go w pliku cookie ${LANGUAGE_COOKIE} (patrz „Pliki cookie”).`,
          "Dostawca hostingu może prowadzić techniczne logi żądań [zakres i okres przechowywania logów technicznych — do potwierdzenia]. Sama aplikacja nie zapisuje adresów IP.",
        ],
      },
      {
        id: "accounts",
        heading: "Konta personelu",
        paragraphs: ["Dla kont personelu restauracji i administratorów platformy przechowujemy:"],
        items: [
          "adres e-mail (login) i opcjonalnie wyświetlaną nazwę;",
          "skrót hasła (scrypt) — nigdy samego hasła;",
          `sesje logowania: tylko skrót tokenu i datę wygaśnięcia (${String(SESSION_DAYS)} dni);`,
          `jednorazowe linki zaproszenia i resetu hasła: tylko skrót, termin ważności (${String(INVITE_TTL_DAYS)} dni albo ${String(RESET_TTL_HOURS)} godz.) i kto je wystawił;`,
          "próby logowania: skrót wpisanego adresu e-mail i czas próby, usuwane najpóźniej po dobie — wyłącznie do ochrony przed zgadywaniem haseł;",
          "przynależność do restauracji z rolą (właściciel, menedżer, kelner) oraz znacznik administratora platformy.",
        ],
        closing: [
          "Cel: logowanie i kontrola dostępu do panelu. Podstawa prawna: [podstawa prawna].",
          "Usunięcie z zespołu kończy dostęp do restauracji, ale nie usuwa konta. Okres przechowywania kont: [okres przechowywania i zasady usuwania kont — do ustalenia].",
        ],
      },
      {
        id: "event-waiters",
        heading: "Kelnerzy „na imprezę”",
        paragraphs: [
          `Restauracja wpisuje imię kelnera do jednego wydarzenia. Przechowujemy to imię, skróty jednorazowego linku, kodu i sesji, kto go dodał i do kiedy dostęp jest ważny (do ${noon} czasu polskiego dnia po imprezie).`,
          "Wpis znika razem z wydarzeniem albo z danymi gości po terminie ustawionym przez restaurację; restauracja może go też usunąć wcześniej.",
        ],
      },
      {
        id: "support-log",
        heading: "Dziennik wejść administratora",
        paragraphs: [
          `Gdy administrator platformy wchodzi w dane restauracji w ramach wsparcia (tylko do odczytu, do ${String(SUPPORT_MINUTES)} minut), zapisujemy jego adres e-mail i nazwę, podany powód, czas wejścia i wyjścia, każdy otwarty adres panelu (metodę, ścieżkę i nazwę wydarzenia) oraz odblokowanie lub zablokowanie płatnych modułów.`,
          "Dziennik widzą właściciele tej restauracji. Wpisów nie da się zmienić ani usunąć; znikają tylko razem z restauracją.",
          "Cel: przejrzystość wobec restauracji i rozliczalność wsparcia. Podstawa prawna: [podstawa prawna].",
        ],
      },
      {
        id: "guest-data",
        heading: "Dane gości (w imieniu restauracji)",
        paragraphs: ["Na zlecenie restauracji przechowujemy:"],
        items: [
          "imiona gości, obecność, grupy i miejsca przy stołach (także w opublikowanych rozsadzeniach);",
          "odpowiedzi na zaproszenie i wybrane danie;",
          "diety, alergie i uwagi dla kuchni — dane o zdrowiu (szczególna kategoria danych, art. 9 RODO);",
          "zamówienia przypisane do miejsc, oznaczenia „Dotarło”, strzały w grze oraz odpowiedzi, punkty i miejsca w pub quizie;",
          "osobiste linki gości.",
        ],
        closing: [
          "Diety i alergie widzą klient i personel restauracji, a podczas zapisanej w dzienniku wizyty wsparcia także administrator platformy. Nigdy nie trafiają do innych gości, na ekran TV ani do usług AI.",
          `Restauracja ustawia termin usunięcia danych gości: ${retentionRange} dni po imprezie, domyślnie ${String(DEFAULT_GUEST_RETENTION_DAYS)}. Po terminie usuwamy gości z ich dietami, odpowiedziami, miejscami, strzałami i linkami, grupy, opublikowane rozsadzenia, imiona pokazane na ekranie TV, kelnerów „na imprezę” i notatki zamówień; zostaje rachunek bez imion i uwag.`,
          "Usuwanie odbywa się przy najbliższym otwarciu wydarzenia lub panelu restauracji albo przez zadanie uruchamiane przez Operatora [harmonogram automatycznego usuwania — do ustalenia]. Kopie zapasowe bazy: [okres przechowywania kopii zapasowych — do potwierdzenia].",
          "Przed usunięciem właściciel albo menedżer może wyeksportować dane wydarzenia; eksport nie zawiera linków ani kluczy.",
        ],
      },
      {
        id: "ai",
        heading: "Sztuczna inteligencja",
        paragraphs: [
          "Tematy rozmów od AI powstają bez imion i danych gości: do usługi AI trafia tylko kategoria, język i temat przewodni. Treści tematu nie przechowujemy, chyba że organizator pokaże go na ekranie TV; zapisujemy tylko próby (kategorię, wynik i zużycie).",
          "Propozycja układu sali ze zdjęcia wysyła do usługi AI zdjęcie planu oraz nazwy sal i stolików, ich kształty, liczby miejsc i położenie — nigdy gości. Wynik nie jest zapisywany, dopóki ktoś go nie zatwierdzi.",
          "Te funkcje działają tylko wtedy, gdy Operator włączy dostawcę AI [dostawca usług AI — do potwierdzenia].",
        ],
      },
      {
        id: "recipients",
        heading: "Komu przekazujemy dane",
        paragraphs: [
          "Dane przetwarzają w imieniu Operatora dostawcy infrastruktury [lista podmiotów przetwarzających — do potwierdzenia przy wdrożeniu]. Obecna architektura korzysta z:",
        ],
        items: [
          "hostingu aplikacji w chmurze Amazon Web Services (AWS Lambda) [region];",
          "bazy danych PostgreSQL w usłudze Supabase [region];",
          "usługi AI Anthropic (Claude API) — tylko gdy funkcje AI są włączone [region].",
        ],
        closing: [
          "[przekazywanie danych poza Europejski Obszar Gospodarczy — do ustalenia po wyborze regionów].",
          "Nie sprzedajemy danych i nie przekazujemy ich do celów marketingowych.",
        ],
      },
      {
        id: "cookies",
        heading: "Pliki cookie",
        paragraphs: [
          "Platforma używa wyłącznie niezbędnych plików cookie, bez analityki, reklam i plików cookie podmiotów trzecich. Żadnego z nich nie odczytują skrypty strony (HttpOnly):",
        ],
        items: [
          `${SESSION_COOKIE} — sesja personelu po zalogowaniu, ${String(SESSION_DAYS)} dni;`,
          `${WAITER_COOKIE} — sesja kelnera „na imprezę”, do ${noon} czasu polskiego dnia po imprezie;`,
          `${LANGUAGE_COOKIE} — wybrany język, ${languageDays} dni;`,
          `${TABLET_LANGUAGE_COOKIE} — wybrany język na tablecie obsługi, ${languageDays} dni.`,
        ],
        closing: [
          "[ocena, czy potrzebna jest informacja lub zgoda na pliki cookie — do potwierdzenia przez prawnika].",
        ],
      },
      {
        id: "storage",
        heading: "Pamięć przeglądarki",
        paragraphs: ["Niektóre widoki zapisują dane w pamięci przeglądarki (localStorage) na urządzeniu użytkownika:"],
        items: [
          "wylosowane pytania do rozmowy i ostatni temat od AI (gość i organizator) — bez danych osobowych;",
          "kopia do odczytu bez sieci u organizatora: ostatnie opublikowane rozsadzenie z imionami i ranking strzałów; zostaje na urządzeniu do następnego odczytu z tego linku albo do wyczyszczenia danych przeglądarki;",
          `kopia do odczytu bez sieci na tablecie obsługi i u kelnerów: opublikowane rozsadzenie z imionami, zamówienia bez cen i diety gości; ignorowana i usuwana najpóźniej o ${noon} czasu polskiego dnia po imprezie, a wcześniej po wylogowaniu lub utracie dostępu;`,
          "pamięć podręczna strony odczytu bez sieci (service worker): sama strona i jej skrypty, bez danych.",
        ],
      },
      {
        id: "security",
        heading: "Bezpieczeństwo",
        paragraphs: [
          "Linki są długimi losowymi kluczami i każdy otwiera tylko jedno wydarzenie. Hasła, tokeny sesji i jednorazowe linki przechowujemy wyłącznie jako skróty. Przeglądarka nigdy nie łączy się z bazą danych bezpośrednio — robi to tylko serwer aplikacji.",
          "[pozostałe środki techniczne i organizacyjne — do opisania].",
        ],
      },
      {
        id: "rights",
        heading: "Twoje prawa",
        paragraphs: [
          "[prawa osób, których dane dotyczą, i sposób ich realizacji — do uzupełnienia przez prawnika]. W sprawach danych gości właściwa jest restauracja, w której odbyła się impreza.",
          "Skarga do organu nadzorczego: [organ nadzorczy].",
        ],
      },
      {
        id: "changes",
        heading: "Zmiany polityki",
        paragraphs: ["[zasady zmiany polityki i powiadamiania o zmianach — do ustalenia]."],
      },
    ],
  },
  {
    pageTitle: `Privacy policy — ${PRODUCT_NAME}`,
    heading: `${PRODUCT_NAME} privacy policy`,
    draft: "Draft — for legal review",
    draftText:
      "This draft describes the data the app processes today. It is not final until a lawyer has reviewed it. The operator will fill in the fields in square brackets.",
    asOf: (date: string) => `As of ${date}`,
    tocLabel: "Contents",
    otherDocument: "Terms of service (draft)",
    backHome: "Home page",
    sections: [
      {
        id: "controller",
        heading: "Data controller",
        paragraphs: [
          `The controller of the data described in this policy is [operator name], [registered address], tax ID [tax ID (NIP)] (the “Operator”), who provides the ${PRODUCT_NAME} platform. Contact about data: [contact e-mail].`,
          "Data protection officer: [officer's details — if one is appointed].",
        ],
      },
      {
        id: "scope",
        heading: "What this policy covers",
        paragraphs: [
          "This policy covers the product page, the accounts of restaurant staff and platform administrators, event waiters and the administrator's support log.",
          "The Operator processes event guests' data on behalf of the restaurant, which is its controller. A guest finds the privacy notice on their personal link.",
          "[the Operator's role for the data of restaurant staff and event waiters — controller or processor — to be confirmed by a lawyer].",
        ],
      },
      {
        id: "visitors",
        heading: "Visitors of the product page",
        paragraphs: [
          "The product page and these documents store nothing and read nothing from the database. They use no analytics, ads, external fonts or scripts.",
          `If you choose a language, your browser keeps it in the ${LANGUAGE_COOKIE} cookie (see “Cookies”).`,
          "The hosting provider may keep technical request logs [extent and retention of technical logs — to be confirmed]. The app itself stores no IP addresses.",
        ],
      },
      {
        id: "accounts",
        heading: "Staff accounts",
        paragraphs: ["For the accounts of restaurant staff and platform administrators we keep:"],
        items: [
          "the e-mail address (the login) and, optionally, a display name;",
          "a hash of the password (scrypt) — never the password itself;",
          `login sessions: only a hash of the token and the expiry (${String(SESSION_DAYS)} days);`,
          `one-time invitation and password-reset links: only a hash, the expiry (${String(INVITE_TTL_DAYS)} days or ${String(RESET_TTL_HOURS)} hours) and who issued them;`,
          "login attempts: a hash of the typed e-mail address and the time, deleted after a day at the latest — only to stop password guessing;",
          "restaurant memberships with their role (owner, manager, waiter) and the platform-administrator flag.",
        ],
        closing: [
          "Purpose: logging in and controlling access to the panel. Legal basis: [legal basis].",
          "Removal from a team ends the access to that restaurant but does not delete the account. Account retention: [retention period and account deletion rules — to be decided].",
        ],
      },
      {
        id: "event-waiters",
        heading: "Event waiters",
        paragraphs: [
          `A restaurant enters a waiter's name for one event. We keep that name, hashes of the one-time link, code and session, who added it and until when the access is valid (${noon} Polish time on the day after the event).`,
          "The entry is deleted with the event or with the guests' data after the term the restaurant set; the restaurant can also delete it earlier.",
        ],
      },
      {
        id: "support-log",
        heading: "The administrator's support log",
        paragraphs: [
          `When a platform administrator opens a restaurant's data for support (read-only, for up to ${String(SUPPORT_MINUTES)} minutes), we record their e-mail address and name, the stated reason, the time of entry and exit, every panel address opened (the method, the path and the event's name) and any unlocking or locking of paid modules.`,
          "The restaurant's owners see the log. Its entries cannot be changed or deleted; they go only with the restaurant itself.",
          "Purpose: transparency towards the restaurant and accountability of the support. Legal basis: [legal basis].",
        ],
      },
      {
        id: "guest-data",
        heading: "Guests' data (on the restaurant's behalf)",
        paragraphs: ["On the restaurant's instructions we keep:"],
        items: [
          "guests' names, attendance, groups and seats (also in the published seatings);",
          "replies to the invitation and the chosen dish;",
          "diets, allergies and notes for the kitchen — health data (a special category of data, GDPR Article 9);",
          "orders assigned to seats, “Arrived” marks, guesses in the game, and pub quiz answers, points and places;",
          "the guests' personal links.",
        ],
        closing: [
          "Diets and allergies are seen by the client and the restaurant's staff, and during a logged support visit by the platform administrator. They never reach other guests, the TV screen or AI services.",
          `The restaurant sets the term after which guests' data is deleted: ${retentionRange} days after the event, by default ${String(DEFAULT_GUEST_RETENTION_DAYS)}. After the term we delete the guests with their diets, replies, seats, guesses and links, the groups, the published seatings, names shown on the TV screen, event waiters and the notes on orders; the bill remains, without names or notes.`,
          "The deletion happens the next time the event or the restaurant's panel is opened, or through a job the Operator runs [schedule of the automatic deletion — to be decided]. Database backups: [backup retention period — to be confirmed].",
          "Before the deletion the owner or a manager can export the event's data; the export contains no links or keys.",
        ],
      },
      {
        id: "ai",
        heading: "Artificial intelligence",
        paragraphs: [
          "AI conversation topics are made without guests' names or data: only the category, the language and a theme go to the AI service. We do not keep the topic's text unless the organizer shows it on the TV screen; we record only the attempts (category, outcome and usage).",
          "The room layout proposal from a photo sends the AI service the photo of the plan and the names of the rooms and tables, their shapes, seat counts and positions — never guests. The result is not saved until someone applies it.",
          "These features work only while the Operator has switched an AI provider on [AI service provider — to be confirmed].",
        ],
      },
      {
        id: "recipients",
        heading: "Who receives the data",
        paragraphs: [
          "The data is processed on the Operator's behalf by infrastructure providers [list of processors — to be confirmed at deployment]. The current architecture uses:",
        ],
        items: [
          "application hosting in the Amazon Web Services cloud (AWS Lambda) [region];",
          "a PostgreSQL database in the Supabase service [region];",
          "the Anthropic AI service (Claude API) — only while AI features are on [region].",
        ],
        closing: [
          "[transfers of data outside the European Economic Area — to be decided once the regions are chosen].",
          "We do not sell data and do not pass it on for marketing.",
        ],
      },
      {
        id: "cookies",
        heading: "Cookies",
        paragraphs: [
          "The Platform uses strictly necessary cookies only — no analytics, ads or third-party cookies. None of them can be read by the page's scripts (HttpOnly):",
        ],
        items: [
          `${SESSION_COOKIE} — the staff session after logging in, ${String(SESSION_DAYS)} days;`,
          `${WAITER_COOKIE} — the event waiter's session, until ${noon} Polish time on the day after the event;`,
          `${LANGUAGE_COOKIE} — the chosen language, ${languageDays} days;`,
          `${TABLET_LANGUAGE_COOKIE} — the chosen language on the staff tablet, ${languageDays} days.`,
        ],
        closing: ["[whether a cookie notice or consent is needed — to be confirmed by a lawyer]."],
      },
      {
        id: "storage",
        heading: "Browser storage",
        paragraphs: ["Some views keep data in the browser's storage (localStorage) on the user's device:"],
        items: [
          "the conversation questions drawn and the last AI topic (guest and organizer) — no personal data;",
          "the organizer's offline copy: the last published seating with names and the ranking of guesses; it stays on the device until the next read through that link or until the browser's data is cleared;",
          `the offline copy on the staff tablet and the waiters' devices: the published seating with names, orders without prices and the guests' diets; ignored and deleted at ${noon} Polish time on the day after the event at the latest, and earlier after logging out or losing access;`,
          "the cache of the offline readout page (service worker): only the page and its scripts, no data.",
        ],
      },
      {
        id: "security",
        heading: "Security",
        paragraphs: [
          "Links are long random keys and each opens one event only. Passwords, session tokens and one-time links are stored only as hashes. The browser never connects to the database directly — only the application server does.",
          "[other technical and organisational measures — to be described].",
        ],
      },
      {
        id: "rights",
        heading: "Your rights",
        paragraphs: [
          "[data subjects' rights and how to exercise them — to be completed by a lawyer]. For guests' data, the restaurant where the event took place is responsible.",
          "Complaints to the supervisory authority: [supervisory authority].",
        ],
      },
      {
        id: "changes",
        heading: "Changes to this policy",
        paragraphs: ["[rules for changing this policy and announcing changes — to be decided]."],
      },
    ],
  },
);
