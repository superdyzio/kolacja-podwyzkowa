import { defineMessages } from "@/lib/i18n/locale";

// Texts of guest data retention, the event export and the guests' privacy notice (privacy-retention, S-26), both
// languages (i18n). Pure. The notice names the restaurant (the controller) and only „the system provider” (the
// processor): guests never see the platform's name (white-label).

export const privacyMessages = defineMessages(
  {
    // The restaurant page: „Prywatność danych gości”.
    retentionHeading: "Prywatność danych gości",
    retentionIntro:
      "Dane gości wydarzeń (imiona, diety i alergie, odpowiedzi na zaproszenie, miejsca, strzały, uwagi do zamówień) znikają automatycznie po tylu dniach od dnia wydarzenia. Zostaje rachunek lokalu — bez imion i uwag.",
    daysLabel: "Usuwaj dane gości po (dniach od wydarzenia)",
    daysUnit: "dni",
    save: "Zapisz",
    saving: "Zapisywanie…",
    saved: "Zapisano.",
    daysRange: (min: number, max: number) => `Podaj liczbę dni od ${String(min)} do ${String(max)}.`,
    current: (days: number) => `Teraz: ${String(days)} ${days === 1 ? "dzień" : "dni"} po wydarzeniu.`,
    readOnly: (days: number) =>
      `Dane gości są usuwane ${String(days)} ${days === 1 ? "dzień" : "dni"} po wydarzeniu. Zmienia to właściciel lokalu.`,
    // The event card: „Dane gości i eksport”.
    eventHeading: "Dane gości i eksport",
    deleteAfter: (date: string, days: number) =>
      `Dane gości zostaną usunięte po ${date} (${String(days)} ${days === 1 ? "dzień" : "dni"} po wydarzeniu).`,
    purged: (date: string) => `Dane gości usunięte ${date}.`,
    dateWouldPurge: (date: string, days: number) =>
      `Nie zmieniono daty: z tą datą dane gości tego wydarzenia zostałyby od razu i bezpowrotnie usunięte (lokal przechowuje je ${String(days)} ${days === 1 ? "dzień" : "dni"} po wydarzeniu, czyli tylko do ${date}). Sprawdź, czy data jest poprawna; dane, które chcesz zachować, pobierz najpierw w „Dane gości i eksport”.`,
    purgedHint: "Zostały sala, pytania i rachunek bez imion i uwag. Nowo dopisani goście też zostaną usunięci.",
    exportIntro:
      "Pobierz dane wydarzenia przed ich usunięciem. Plik zawiera dane o zdrowiu gości (diety i alergie) — przechowuj go bezpiecznie i usuń, gdy nie będzie potrzebny.",
    exportJson: "Wszystko (JSON)",
    exportGuestsCsv: "Goście (CSV)",
    exportOrdersCsv: "Zamówienia i rachunek (CSV)",
    exportFormatInvalid: "Nieznany format eksportu.",
  },
  {
    retentionHeading: "Guests' data privacy",
    retentionIntro:
      "The guests' data of events (names, diets and allergies, invitation answers, seats, guesses, order notes) disappears automatically this many days after the day of the event. The venue's bill stays — without names or notes.",
    daysLabel: "Delete guests' data after (days after the event)",
    daysUnit: "days",
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
    daysRange: (min: number, max: number) => `Enter a number of days from ${String(min)} to ${String(max)}.`,
    current: (days: number) => `Now: ${String(days)} ${days === 1 ? "day" : "days"} after the event.`,
    readOnly: (days: number) =>
      `Guests' data is deleted ${String(days)} ${days === 1 ? "day" : "days"} after the event. The venue's owner changes this.`,
    eventHeading: "Guests' data and export",
    deleteAfter: (date: string, days: number) =>
      `Guests' data will be deleted after ${date} (${String(days)} ${days === 1 ? "day" : "days"} after the event).`,
    purged: (date: string) => `Guests' data deleted on ${date}.`,
    dateWouldPurge: (date: string, days: number) =>
      `The date was not changed: with this date the guests' data of this event would be deleted at once and for good (the venue keeps it for ${String(days)} ${days === 1 ? "day" : "days"} after the event, i.e. only until ${date}). Check that the date is right; download the data you want to keep from “Guests' data and export” first.`,
    purgedHint:
      "The room, the questions and the bill without names or notes remain. Guests added later are deleted too.",
    exportIntro:
      "Download the event's data before it is deleted. The file holds the guests' health data (diets and allergies) — keep it safe and delete it when no longer needed.",
    exportJson: "Everything (JSON)",
    exportGuestsCsv: "Guests (CSV)",
    exportOrdersCsv: "Orders and bill (CSV)",
    exportFormatInvalid: "Unknown export format.",
  },
);

// The CSV files of the export: headers and the words in cells (dish, guest and table names are DB content).
export const exportMessages = defineMessages(
  {
    guestsHeader: [
      "Gość",
      "Obecność",
      "Grupa",
      "Diety i alergie",
      "Uwagi dla kuchni",
      "Odpowiedź na zaproszenie",
      "Wybrane danie",
      "Odpowiedź wpisał",
      "Sala",
      "Stolik",
      "Miejsce",
      "Strzał (zł)",
      "Typ miejsca w rankingu",
    ],
    present: "obecny",
    absent: "nieobecny",
    coming: "przyjdzie",
    notComing: "nie przyjdzie",
    noAnswer: "brak odpowiedzi",
    byGuest: "gość",
    byOrganizer: "organizator",
    ordersHeader: [
      "Rodzaj",
      "Pozycja",
      "Kurs",
      "Uwagi",
      "Ilość",
      "Cena jednostkowa (zł)",
      "Wartość (zł)",
      "Wydane sztuki",
      "Dla",
    ],
    dish: "danie",
    drink: "napój do rachunku",
    tableMiddle: (table: string) => `środek stołu: ${table}`,
    dishesTotal: "Dania razem",
    drinksTotal: "Napoje razem",
    billTotal: "Rachunek razem",
  },
  {
    guestsHeader: [
      "Guest",
      "Attendance",
      "Group",
      "Diets and allergies",
      "Notes for the kitchen",
      "Invitation answer",
      "Chosen dish",
      "Answer entered by",
      "Room",
      "Table",
      "Seat",
      "Guess (PLN)",
      "Predicted ranking place",
    ],
    present: "present",
    absent: "absent",
    coming: "coming",
    notComing: "not coming",
    noAnswer: "no answer",
    byGuest: "guest",
    byOrganizer: "organizer",
    ordersHeader: [
      "Kind",
      "Item",
      "Course",
      "Notes",
      "Quantity",
      "Unit price (PLN)",
      "Amount (PLN)",
      "Pieces served",
      "For",
    ],
    dish: "dish",
    drink: "drink on the bill",
    tableMiddle: (table: string) => `middle of the table: ${table}`,
    dishesTotal: "Dishes total",
    drinksTotal: "Drinks total",
    billTotal: "Bill total",
  },
);

// The guests' privacy notice (/g/<key>/prywatnosc): a DRAFT for legal review (PRD v2 Open Question 6 stays open).
export const privacyNoticeMessages = defineMessages(
  {
    pageTitle: "Informacja o prywatności",
    heading: "Informacja o prywatności",
    draft: "Wersja robocza — do przeglądu prawnika",
    draftText:
      "To nie jest jeszcze ostateczna informacja o przetwarzaniu danych. Podstawy prawne i dane kontaktowe uzupełni restauracja po przeglądzie prawnym.",
    eventLine: (event: string) => `Wydarzenie: ${event}`,
    controllerHeading: "Kto odpowiada za Twoje dane",
    controllerText: (restaurant: string) =>
      `Wydarzenie odbywa się w lokalu „${restaurant}”, który jest administratorem Twoich danych. W sprawach Twoich danych skontaktuj się z lokalem albo z osobą, która przekazała Ci ten link.`,
    processorHeading: "Kto przetwarza dane na zlecenie lokalu",
    processorText:
      "Dostawca systemu, z którego korzysta lokal, przechowuje te dane na jego zlecenie (podmiot przetwarzający) i nie wykorzystuje ich do własnych celów.",
    dataHeading: "Jakie dane",
    dataItems: [
      "Twoje imię (tak, jak wpisał je organizator) i to, czy będziesz obecny.",
      "Odpowiedź na zaproszenie i wybrane danie, jeśli organizator o nie pyta.",
      "Diety, alergie i uwagi dla kuchni — to dane o zdrowiu; widzą je tylko organizator, kuchnia i obsługa.",
      "Twoje miejsce przy stole, zamówione dania i to, co już do Ciebie dotarło.",
      "Twój strzał w zabawie przy stole, jeśli bierzesz w niej udział.",
    ],
    purposeHeading: "Po co",
    purposeText:
      "Żeby przygotować i obsłużyć to wydarzenie: rozsadzić gości, przygotować posiłki zgodnie z dietami, podać zamówienia i poprowadzić zabawy przy stole.",
    audienceHeading: "Kto je widzi",
    audienceText:
      "Organizator wydarzenia i obsługa lokalu. Inni goście i ekran na sali widzą tylko imiona przy stolikach z opublikowanego rozsadzenia — nigdy diet, alergii ani uwag.",
    aiHeading: "Sztuczna inteligencja",
    aiText:
      "Twoich danych nie przekazujemy żadnej sztucznej inteligencji. Tematy rozmów generowane przez AI powstają bez imion i danych gości.",
    retentionHeading: "Jak długo",
    retentionText: (days: number, date: string) =>
      `Dane gości tego wydarzenia są usuwane automatycznie ${String(days)} ${days === 1 ? "dzień" : "dni"} po wydarzeniu — po ${date}. Zostaje tylko rachunek lokalu bez imion i uwag.`,
    rightsHeading: "Twoje prawa",
    rightsText:
      "Możesz poprosić lokal o dostęp do swoich danych, ich poprawienie, usunięcie przed tym terminem lub ograniczenie przetwarzania. Możesz też wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych.",
    browserHeading: "W Twojej przeglądarce",
    browserText:
      "Ta strona zapamiętuje w przeglądarce wybrany język (plik cookie) oraz ostatnio wylosowane pytania i temat rozmowy. Nie ma w nich Twoich danych osobowych.",
    back: "Wróć do swojej strony",
    footerLink: "Informacja o prywatności",
  },
  {
    pageTitle: "Privacy notice",
    heading: "Privacy notice",
    draft: "Draft — for legal review",
    draftText:
      "This is not yet the final notice on how your data is processed. The venue will add the legal bases and contact details after a legal review.",
    eventLine: (event: string) => `Event: ${event}`,
    controllerHeading: "Who is responsible for your data",
    controllerText: (restaurant: string) =>
      `The event takes place at "${restaurant}", which is the controller of your data. For anything about your data, contact the venue or the person who gave you this link.`,
    processorHeading: "Who processes the data for the venue",
    processorText:
      "The provider of the system the venue uses stores this data on the venue's behalf (a processor) and does not use it for its own purposes.",
    dataHeading: "What data",
    dataItems: [
      "Your name (as the organizer entered it) and whether you will be there.",
      "Your answer to the invitation and the dish you chose, if the organizer asks for them.",
      "Diets, allergies and notes for the kitchen — this is health data; only the organizer, the kitchen and the staff see it.",
      "Your seat at the table, the dishes ordered for you and what has already reached you.",
      "Your guess in the table game, if you take part.",
    ],
    purposeHeading: "Why",
    purposeText:
      "To prepare and run this event: seat the guests, prepare meals that fit their diets, serve the orders and run the table games.",
    audienceHeading: "Who sees it",
    audienceText:
      "The event's organizer and the venue's staff. Other guests and the screen in the room see only the names at the tables of the published seating — never diets, allergies or notes.",
    aiHeading: "Artificial intelligence",
    aiText:
      "Your data is not passed to any artificial intelligence. Conversation topics generated by AI are made without any guest's name or data.",
    retentionHeading: "How long",
    retentionText: (days: number, date: string) =>
      `The guests' data of this event is deleted automatically ${String(days)} ${days === 1 ? "day" : "days"} after the event — after ${date}. Only the venue's bill remains, without names or notes.`,
    rightsHeading: "Your rights",
    rightsText:
      "You can ask the venue for access to your data, to correct it, to delete it before that date or to restrict its processing. You can also lodge a complaint with the data protection authority (in Poland: the President of the Personal Data Protection Office, UODO).",
    browserHeading: "In your browser",
    browserText:
      "This page remembers the language you chose (a cookie) and the questions and conversation topic you drew last in your browser. They hold no personal data of yours.",
    back: "Back to your page",
    footerLink: "Privacy notice",
  },
);
