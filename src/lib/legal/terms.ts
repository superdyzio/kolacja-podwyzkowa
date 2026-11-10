import {
  INVITE_TTL_DAYS,
  LOGIN_FAILURE_LIMIT,
  LOGIN_WINDOW_SECONDS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESET_TTL_HOURS,
  SESSION_DAYS,
} from "@/lib/auth/limits";
import { defineMessages, type Locale } from "@/lib/i18n/locale";
import { PRODUCT_NAME } from "@/lib/i18n/product";
import { modulesMessages } from "@/lib/modules/messages";
import { PAID_MODULES } from "@/lib/modules/rules";
import { DEFAULT_GUEST_RETENTION_DAYS, MAX_GUEST_RETENTION_DAYS, MIN_GUEST_RETENTION_DAYS } from "@/lib/privacy/rules";
import { SUPPORT_MINUTES } from "@/lib/support/rules";
import type { LegalDocument } from "./types";

// The DRAFT terms of service (landing-legal, S-30; FR-041, PRD v2 Open Question 6), both languages. It describes how
// the app works today — every number comes from the code's constants — and leaves `[…]` placeholders for what only the
// operator and a lawyer decide (identity, contract form, prices, liability, complaints, law and court). Never an
// operator name, address, tax number or e-mail address here. Pure.

const loginMinutes = String(LOGIN_WINDOW_SECONDS / 60);
const paidModules = (locale: Locale) => PAID_MODULES.map((module) => modulesMessages(locale).names[module]).join(", ");

export const termsMessages = defineMessages<LegalDocument>(
  {
    pageTitle: `Regulamin — ${PRODUCT_NAME}`,
    heading: `Regulamin platformy ${PRODUCT_NAME}`,
    draft: "Wersja robocza — do przeglądu prawnika",
    draftText:
      "Ten szkic opisuje, jak aplikacja działa dziś. Nie jest wiążący, dopóki nie przejrzy go prawnik. Pola w nawiasach kwadratowych uzupełni operator.",
    asOf: (date: string) => `Stan na ${date}`,
    tocLabel: "Spis treści",
    otherDocument: "Polityka prywatności (wersja robocza)",
    backHome: "Strona główna",
    sections: [
      {
        id: "general",
        heading: "Postanowienia ogólne",
        paragraphs: [
          `Regulamin określa zasady korzystania z platformy ${PRODUCT_NAME} („Platforma”; nazwa robocza) do organizacji imprez w restauracjach.`,
          "Platformę udostępnia [nazwa operatora], [adres siedziby], NIP [NIP], [rejestr i numer] („Operator”). Kontakt: [e-mail kontaktowy].",
          "Platforma działa w przeglądarce internetowej i nie wymaga instalowania aplikacji.",
        ],
      },
      {
        id: "definitions",
        heading: "Pojęcia",
        paragraphs: [],
        items: [
          "Lokal — restauracja, która korzysta z Platformy na podstawie umowy z Operatorem [forma umowy — do ustalenia].",
          "Personel — osoby z kontem w Lokalu: właściciel, menedżer i kelner.",
          "Administrator platformy — osoba po stronie Operatora, która zakłada restauracje i udziela im wsparcia.",
          "Klient — osoba lub firma, która zamawia imprezę w Lokalu i przygotowuje ją przez link organizatora, bez konta.",
          "Gość — uczestnik imprezy, który może dostać osobisty link.",
          "Kelner na imprezę — osoba wpisana przez Lokal do jednego wydarzenia, z jednorazowym linkiem lub kodem, bez konta.",
          "Link — niezgadywalny adres, który otwiera jeden widok jednego wydarzenia: organizatora, ekranu TV, gościa albo tabletu obsługi.",
        ],
      },
      {
        id: "service",
        heading: "Zakres usługi",
        paragraphs: ["Platforma pozwala:"],
        items: [
          "prowadzić szablony sal, menu z cenami i kursami, wydarzenia i ich archiwum;",
          "wpisywać i importować gości z dietami, tworzyć grupy, rozsadzać gości i publikować rozsadzenie na ekranie TV i telefonach gości;",
          "zbierać od gości potwierdzenia przybycia i wybór dania;",
          "prowadzić zamówienia, rachunek i obsługę sali (tablet kuchni, widok kelnera);",
          "drukować tablicę stolików, karty stołów, winietki i listę dla obsługi;",
          "korzystać z modułów zabaw (pytania do rozmowy, gra w zgadywanie rachunku, pub quiz, tematy AI), które udostępnia Lokal.",
        ],
        closing: [
          "Platforma nie przyjmuje płatności online, nie wysyła e-maili ani wiadomości i nie łączy się z kasą, systemem rezerwacji ani księgowością Lokalu.",
        ],
      },
      {
        id: "accounts",
        heading: "Konta i logowanie",
        paragraphs: [],
        items: [
          "Nie ma samodzielnej rejestracji. Konto właściciela zakłada Administrator platformy; menedżerów i kelnerów zaprasza zespół Lokalu.",
          `Zaproszenie (ważne ${String(INVITE_TTL_DAYS)} dni) i reset hasła (ważny ${String(RESET_TTL_HOURS)} godz.) to jednorazowe linki, które przekazuje człowiek; Platforma ich nie wysyła.`,
          `Hasło ma od ${String(PASSWORD_MIN_LENGTH)} do ${String(PASSWORD_MAX_LENGTH)} znaków. Zalogowanie trwa ${String(SESSION_DAYS)} dni na urządzeniu; wylogowanie, „Wyloguj wszędzie” i zmiana hasła kończą sesje.`,
          `Po ${String(LOGIN_FAILURE_LIMIT)} nieudanych próbach logowania w ciągu ${loginMinutes} minut kolejne próby dla tego adresu e-mail są chwilowo wstrzymane.`,
          "Właściciel konta dba o poufność hasła i nie udostępnia konta innym osobom.",
          "Role: właściciel zarządza całym Lokalem, jego ustawieniami i zespołem; menedżer wydarzeniami, szablonami, menu i kelnerami; kelner widzi wydarzenia trwające dziś (zamówienia, rachunek, oznaczanie wydanych dań).",
        ],
      },
      {
        id: "links",
        heading: "Linki bez logowania",
        paragraphs: [],
        items: [
          "Klient, ekran TV, tablet obsługi i goście korzystają z linków bez logowania. Kto ma link, ma dostęp do tego, co on otwiera, dlatego linki należy przekazywać tylko właściwym osobom.",
          "Lokal może wymienić link organizatora, ekranu TV i tabletu, a Klient unieważnić link gościa; stary link przestaje działać od razu.",
          "Linki gości działają tylko wtedy, gdy Klient włączy dostęp gości.",
          "Gdy w wydarzeniu włączony jest tryb „Lokal prowadzi”, link Klienta służy tylko do podglądu, a zmiany wprowadza Personel.",
        ],
      },
      {
        id: "venue-duties",
        heading: "Obowiązki Lokalu",
        paragraphs: ["Lokal zobowiązuje się:"],
        items: [
          "wpisywać dane gości i personelu zgodnie z prawem i tylko w zakresie potrzebnym do imprezy;",
          "informować gości o przetwarzaniu ich danych — szkic informacji dla gości jest dostępny z linku gościa [zakres obowiązku informacyjnego — do potwierdzenia];",
          "mieć podstawę prawną do przetwarzania danych o zdrowiu (diety, alergie) [podstawa prawna — do wskazania przez prawnika];",
          "przekazywać linki i jednorazowe zaproszenia tylko właściwym osobom i wymieniać link, który trafił do niewłaściwej osoby;",
          "nie umieszczać w Platformie treści niezgodnych z prawem, także w nazwach, notatkach, logo i pytaniach.",
        ],
      },
      {
        id: "guest-data",
        heading: "Dane gości i powierzenie przetwarzania",
        paragraphs: [
          "Administratorem danych gości jest Lokal. Operator przetwarza je w imieniu Lokalu jako podmiot przetwarzający i nie wykorzystuje ich do własnych celów.",
          "Zasady powierzenia określa [umowa powierzenia przetwarzania danych — osobny dokument do przygotowania].",
          `Właściciel ustawia, po ilu dniach od imprezy dane gości są usuwane (od ${String(MIN_GUEST_RETENTION_DAYS)} do ${String(MAX_GUEST_RETENTION_DAYS)}, domyślnie ${String(DEFAULT_GUEST_RETENTION_DAYS)}). Po tym terminie Platforma usuwa gości razem z dietami, potwierdzeniami, miejscami i notatkami; zostaje rachunek bez imion i uwag.`,
          "Przed usunięciem właściciel albo menedżer może wyeksportować dane wydarzenia (JSON, CSV).",
          "Diety i alergie to dane o zdrowiu. Widzą je Klient i Personel Lokalu, a podczas zapisanej w dzienniku wizyty wsparcia także Administrator platformy; nigdy inni goście, ekran TV ani usługi sztucznej inteligencji.",
        ],
      },
      {
        id: "support",
        heading: "Wsparcie Administratora platformy",
        paragraphs: [
          `Administrator platformy może wejść w dane Lokalu wyłącznie w celu wsparcia: po podaniu powodu, tylko do odczytu, na ${String(SUPPORT_MINUTES)} minut i tylko w swojej bieżącej sesji.`,
          "Każde wejście, każdy odczyt i zakończenie wsparcia trafiają do dziennika, który właściciel widzi na stronie restauracji. W trybie wsparcia Administrator platformy nie widzi linków wydarzeń i nie eksportuje danych.",
          "Odblokowanie płatnego modułu wydarzenia odbywa się w trakcie takiej wizyty i też trafia do dziennika.",
        ],
      },
      {
        id: "modules",
        heading: "Moduły i opłaty",
        paragraphs: [
          `Lokal decyduje, które moduły zabaw są dostępne w wydarzeniu, a Klient je włącza. Moduły płatne (${paidModules("pl")}) odblokowuje ręcznie Administrator platformy.`,
          "Cennik, sposób rozliczeń i terminy płatności: [cennik i zasady rozliczeń — do ustalenia].",
          "Wyłączenie modułu nie usuwa jego danych; po ponownym włączeniu wracają.",
        ],
      },
      {
        id: "ai",
        heading: "Sztuczna inteligencja",
        paragraphs: [
          "Tematy rozmów od AI i propozycja układu sali ze zdjęcia planu korzystają z zewnętrznej usługi AI [dostawca usług AI — do potwierdzenia]. Ich wyniki mogą być nietrafne; propozycja układu niczego nie zmienia, dopóki ktoś jej nie zatwierdzi.",
          "Do usługi AI nie trafiają dane gości. Do propozycji układu trafia zdjęcie planu sali oraz nazwy sal i stolików, ich kształty, liczby miejsc i położenie.",
          "Tematy AI mają limit na gościa i na wydarzenie.",
        ],
      },
      {
        id: "availability",
        heading: "Dostępność i zmiany",
        paragraphs: [
          "Operator dba o ciągłą dostępność Platformy, ale nie gwarantuje jej umownie (brak SLA). [zasady przerw technicznych i powiadamiania o nich — do ustalenia].",
          "Tablet obsługi i widok kelnera pokazują ostatni zapisany stan także bez sieci (tylko do odczytu).",
          "Operator może zmieniać i rozwijać funkcje Platformy [zasady informowania o zmianach — do ustalenia].",
        ],
      },
      {
        id: "liability",
        heading: "Odpowiedzialność",
        paragraphs: ["[zakres odpowiedzialności Operatora i Lokalu — do uzupełnienia przez prawnika]."],
      },
      {
        id: "termination",
        heading: "Zakończenie korzystania",
        paragraphs: [],
        items: [
          "Administrator platformy może wyłączyć restaurację: panel Lokalu przestaje się otwierać, a linki wydarzeń (Klienta, ekranu TV, gości, tabletu) działają dalej.",
          "Właściciel może usunąć osobę z zespołu; jej dostęp do tej restauracji kończy się przy jej następnym działaniu w panelu.",
          "[zasady wypowiedzenia umowy, usunięcia kont i danych Lokalu oraz eksportu przed usunięciem — do ustalenia].",
        ],
      },
      {
        id: "complaints",
        heading: "Reklamacje",
        paragraphs: ["[tryb i terminy rozpatrywania reklamacji — do uzupełnienia]. Zgłoszenia: [e-mail kontaktowy]."],
      },
      {
        id: "final",
        heading: "Postanowienia końcowe",
        paragraphs: [
          "Prawo właściwe: [prawo właściwe]. Spory rozstrzyga [sąd właściwy].",
          "Zmiany regulaminu: [zasady i termin powiadamiania o zmianach].",
          "Regulamin obowiązuje od [data wejścia w życie].",
        ],
      },
    ],
  },
  {
    pageTitle: `Terms of service — ${PRODUCT_NAME}`,
    heading: `${PRODUCT_NAME} terms of service`,
    draft: "Draft — for legal review",
    draftText:
      "This draft describes how the app works today. It is not binding until a lawyer has reviewed it. The operator will fill in the fields in square brackets.",
    asOf: (date: string) => `As of ${date}`,
    tocLabel: "Contents",
    otherDocument: "Privacy policy (draft)",
    backHome: "Home page",
    sections: [
      {
        id: "general",
        heading: "General provisions",
        paragraphs: [
          `These terms set out how the ${PRODUCT_NAME} platform (the “Platform”; a working name) for organising events at restaurants may be used.`,
          "The Platform is provided by [operator name], [registered address], tax ID [tax ID (NIP)], [register and number] (the “Operator”). Contact: [contact e-mail].",
          "The Platform runs in a web browser and needs no app to be installed.",
        ],
      },
      {
        id: "definitions",
        heading: "Definitions",
        paragraphs: [],
        items: [
          "Venue — a restaurant that uses the Platform under an agreement with the Operator [form of agreement — to be decided].",
          "Staff — people with an account at a Venue: the owner, managers and waiters.",
          "Platform administrator — a person on the Operator's side who creates restaurants and supports them.",
          "Client — a person or company that orders an event at the Venue and prepares it through the organizer link, without an account.",
          "Guest — a participant of the event, who may get a personal link.",
          "Event waiter — a person the Venue adds to one event, with a one-time link or code, without an account.",
          "Link — an unguessable address that opens one view of one event: the organizer's, the TV screen's, a guest's or the staff tablet's.",
        ],
      },
      {
        id: "service",
        heading: "The service",
        paragraphs: ["The Platform lets you:"],
        items: [
          "keep room templates, a menu with prices and courses, events and their archive;",
          "enter and import guests with their diets, form groups, seat the guests and publish the seating on the TV screen and the guests' phones;",
          "collect the guests' attendance replies and dish choices;",
          "run the orders, the bill and the floor (the kitchen tablet, the waiter's view);",
          "print a table board, table cards, place cards and the staff list;",
          "use the game modules the Venue offers (conversation questions, the bill-guessing game, a pub quiz, AI topics).",
        ],
        closing: [
          "The Platform takes no online payments, sends no e-mails or messages and connects to no till, booking system or accounting of the Venue.",
        ],
      },
      {
        id: "accounts",
        heading: "Accounts and logging in",
        paragraphs: [],
        items: [
          "There is no self sign-up. The owner's account is created by the Platform administrator; managers and waiters are invited by the Venue's team.",
          `Invitations (valid for ${String(INVITE_TTL_DAYS)} days) and password resets (valid for ${String(RESET_TTL_HOURS)} hours) are one-time links handed over by a person; the Platform does not send them.`,
          `A password has ${String(PASSWORD_MIN_LENGTH)} to ${String(PASSWORD_MAX_LENGTH)} characters. A login lasts ${String(SESSION_DAYS)} days on the device; logging out, “Log out everywhere” and a password change end the sessions.`,
          `After ${String(LOGIN_FAILURE_LIMIT)} failed login attempts within ${loginMinutes} minutes, further attempts for that e-mail address are paused for a while.`,
          "The account holder keeps the password confidential and does not share the account.",
          "Roles: the owner manages the whole Venue, its settings and team; a manager the events, templates, menu and waiters; a waiter sees the events running today (orders, the bill, marking dishes served).",
        ],
      },
      {
        id: "links",
        heading: "Links without logging in",
        paragraphs: [],
        items: [
          "The Client, the TV screen, the staff tablet and the guests use links without logging in. Whoever has a link has the access it opens, so links must be given only to the right people.",
          "The Venue can replace the organizer's, the TV's and the tablet's link, and the Client can revoke a guest's link; the old link stops working at once.",
          "Guests' links work only while the Client has switched guest access on.",
          "While “Venue leads” is on for an event, the Client's link is view-only and the Staff make the changes.",
        ],
      },
      {
        id: "venue-duties",
        heading: "The Venue's duties",
        paragraphs: ["The Venue undertakes to:"],
        items: [
          "enter the data of guests and staff lawfully and only as far as the event needs it;",
          "inform the guests about the processing of their data — a draft notice for guests is available from the guest's link [extent of the duty to inform — to be confirmed];",
          "have a legal basis for processing health data (diets, allergies) [legal basis — to be named by a lawyer];",
          "give links and one-time invitations only to the right people and replace a link that reached the wrong person;",
          "not put unlawful content into the Platform, including names, notes, logos and questions.",
        ],
      },
      {
        id: "guest-data",
        heading: "Guests' data and data processing on the Venue's behalf",
        paragraphs: [
          "The Venue is the controller of the guests' data. The Operator processes it on the Venue's behalf as a processor and does not use it for its own purposes.",
          "The rules of that processing are set out in [data processing agreement — a separate document to be prepared].",
          `The owner sets after how many days from the event the guests' data is deleted (${String(MIN_GUEST_RETENTION_DAYS)} to ${String(MAX_GUEST_RETENTION_DAYS)}, by default ${String(DEFAULT_GUEST_RETENTION_DAYS)}). After that term the Platform deletes the guests with their diets, replies, seats and notes; the bill remains, without names or notes.`,
          "Before the deletion the owner or a manager can export the event's data (JSON, CSV).",
          "Diets and allergies are health data. They are seen by the Client and the Venue's Staff, and during a logged support visit by the Platform administrator; never by other guests, the TV screen or artificial intelligence services.",
        ],
      },
      {
        id: "support",
        heading: "Support by the Platform administrator",
        paragraphs: [
          `The Platform administrator may open a Venue's data only for support: after stating a reason, read-only, for ${String(SUPPORT_MINUTES)} minutes and only in their current session.`,
          "Every entry, every read and the end of the support go into a log the owner sees on the restaurant's page. In support mode the Platform administrator sees no event links and exports no data.",
          "Unlocking a paid module of an event happens during such a visit and is logged too.",
        ],
      },
      {
        id: "modules",
        heading: "Modules and fees",
        paragraphs: [
          `The Venue decides which game modules an event offers, and the Client switches them on. Paid modules (${paidModules("en")}) are unlocked manually by the Platform administrator.`,
          "Prices, invoicing and payment terms: [price list and billing rules — to be decided].",
          "Switching a module off deletes none of its data; it comes back when the module is switched on again.",
        ],
      },
      {
        id: "ai",
        heading: "Artificial intelligence",
        paragraphs: [
          "AI conversation topics and the room layout proposal from a photo of the plan use an external AI service [AI service provider — to be confirmed]. Their results may be inaccurate; a layout proposal changes nothing until someone applies it.",
          "No guest data goes to the AI service. A layout proposal sends the photo of the room plan and the names of the rooms and tables, their shapes, seat counts and positions.",
          "AI topics are limited per guest and per event.",
        ],
      },
      {
        id: "availability",
        heading: "Availability and changes",
        paragraphs: [
          "The Operator keeps the Platform available at all times but gives no contractual guarantee (no SLA). [rules on maintenance breaks and notice of them — to be decided].",
          "The staff tablet and the waiter's view show the last saved state even without a network (read-only).",
          "The Operator may change and extend the Platform's features [rules on announcing changes — to be decided].",
        ],
      },
      {
        id: "liability",
        heading: "Liability",
        paragraphs: ["[extent of the Operator's and the Venue's liability — to be completed by a lawyer]."],
      },
      {
        id: "termination",
        heading: "Ending the use",
        paragraphs: [],
        items: [
          "The Platform administrator can switch a restaurant off: the Venue's panel stops opening, while the event links (the Client's, the TV's, the guests', the tablet's) keep working.",
          "The owner can remove a person from the team; their access to that restaurant ends with their next action in the panel.",
          "[rules on ending the agreement, deleting the Venue's accounts and data and exporting before the deletion — to be decided].",
        ],
      },
      {
        id: "complaints",
        heading: "Complaints",
        paragraphs: ["[complaint procedure and response times — to be completed]. Complaints to: [contact e-mail]."],
      },
      {
        id: "final",
        heading: "Final provisions",
        paragraphs: [
          "Governing law: [governing law]. Disputes are settled by [competent court].",
          "Changes to these terms: [rules and notice period for changes].",
          "These terms apply from [effective date].",
        ],
      },
    ],
  },
);
