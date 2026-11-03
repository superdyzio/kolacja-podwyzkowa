import { defineMessages } from "@/lib/i18n/locale";

// Texts of the public pages (home, 500) and the organizer shell (/o/<key>), both languages (i18n). The summary lines
// on the shell cards come from each domain's own format*Summary(…, locale).
export const shellMessages = defineMessages(
  {
    // The home page (index.astro) and POST /api/event.
    appName: "Kolacja podwyżkowa",
    noDatabase: "Baza danych nie jest skonfigurowana.",
    noDatabaseError: "Baza danych nie jest skonfigurowana",
    noEventYet: "Nie ma jeszcze wydarzenia. Utwórz je, a dostaniesz sekretny link organizatora i adres widoku TV.",
    bookmarkNow:
      "Od razu dodaj link organizatora do zakładek: to jedyne wejście do panelu. Wydarzenie można utworzyć tylko raz.",
    createEvent: "Utwórz wydarzenie",
    linkOnly: "Dostęp tylko przez link od organizatora.",
    // 500.astro.
    errorTitle: "Błąd",
    errorHeading: "Coś poszło nie tak",
    errorText: "Spróbuj odświeżyć stronę za chwilę.",
    // The organizer shell.
    pageTitle: (event: string) => `${event} — panel organizatora`,
    kicker: "Panel organizatora",
    linksHeading: "Twoje linki",
    organizerLink: "Link organizatora",
    organizerLinkHint: "Dodaj ten link do zakładek: to jedyne wejście do panelu. Nie udostępniaj go nikomu.",
    tvLink: "Adres TV",
    tvLinkHint: "Otwórz go na urządzeniu przy telewizorze. Pokazuje tylko rozsadzenie, bez strzałów i rankingu.",
    restaurantLink: "Link dla restauracji",
    restaurantLinkHint:
      "Lista dań do przygotowania i co gdzie podać, bez cen. Wymienisz go w „Zamówienia i restauracja”.",
    sectionsHeading: "Przygotowanie i wieczór",
    open: "Otwórz",
    guestsTitle: "Goście i grupy",
    guestsText: "Lista gości, nierozdzielne grupy i nieobecni.",
    venueTitle: "Sale i stoliki",
    venueText: "Plan lokalu, sale i stoliki z miejscami i typem.",
    seatingTitle: "Rozsadzenie",
    seatingText: "Losowanie bez powtórek sąsiadów, ręczne poprawki, publikacja na TV i powrót do poprzedniego.",
    linksTitle: "Linki gości i karteczki",
    linksText: "Osobiste linki, kody QR do druku i włącznik dostępu gości.",
    guessesTitle: "Strzały i ranking",
    guessesText: "Strzały gości, zamknięcie przyjmowania, prawidłowa kwota i ranking od końca.",
    questionsTitle: "Pytania do rozmowy",
    questionsText: "Baza pytań w trzech kategoriach, wklejanie wielu naraz i losowanie pytania.",
    aiTopicsTitle: "Tematy AI",
    aiTopicsText: (guestLimit: number, eventLimit: number) =>
      `Temat do rozmowy od AI w wybranej kategorii; gość ma ${guestLimit} na wieczór, wszyscy razem ${eventLimit}.`,
    ordersTitle: "Zamówienia i restauracja",
    ordersText:
      "Co kto zamówił, ceny i suma, odhaczanie wydanych dań oraz link dla restauracji: co przygotować i gdzie podać.",
    readoutTitle: "Odczyt bez sieci",
    readoutText:
      "Ostatni opublikowany rozkład i ranking strzałów zapisane na tym urządzeniu — działa także bez internetu.",
    resetHeading: "Reset danych",
    resetText:
      "Czyści wybrane dane jednym kliknięciem, np. po próbie generalnej: strzały, licznik tematów AI, rozsadzenie, gości, plan lokalu, pytania albo linki gości. Link organizatora i adres TV zostają bez zmian.",
  },
  {
    appName: "Raise dinner",
    noDatabase: "The database is not configured.",
    noDatabaseError: "The database is not configured",
    noEventYet: "There is no event yet. Create it to get the secret organizer link and the TV address.",
    bookmarkNow:
      "Bookmark the organizer link right away: it is the only way into the panel. The event can be created only once.",
    createEvent: "Create the event",
    linkOnly: "Access only through a link from the organizer.",
    errorTitle: "Error",
    errorHeading: "Something went wrong",
    errorText: "Try reloading the page in a moment.",
    pageTitle: (event: string) => `${event} — organizer panel`,
    kicker: "Organizer panel",
    linksHeading: "Your links",
    organizerLink: "Organizer link",
    organizerLinkHint: "Bookmark this link: it is the only way into the panel. Do not share it with anyone.",
    tvLink: "TV address",
    tvLinkHint: "Open it on the device by the TV. It shows only the seating, without guesses or the ranking.",
    restaurantLink: "Restaurant link",
    restaurantLinkHint:
      "The dishes to prepare and where to serve them, without prices. You can replace it in “Orders and restaurant”.",
    sectionsHeading: "Preparation and the evening",
    open: "Open",
    guestsTitle: "Guests and groups",
    guestsText: "The guest list, groups that sit together and who is absent.",
    venueTitle: "Rooms and tables",
    venueText: "The venue plan, rooms and tables with their seats and shape.",
    seatingTitle: "Seating",
    seatingText:
      "A draw without repeated neighbours, manual tweaks, publishing to the TV and going back to the previous one.",
    linksTitle: "Guest links and cards",
    linksText: "Personal links, QR codes to print and the guest access switch.",
    guessesTitle: "Guesses and ranking",
    guessesText:
      "The guests' guesses, closing the intake, the correct amount and the ranking read from the last place.",
    questionsTitle: "Conversation questions",
    questionsText: "A question base in three categories, pasting many at once and drawing a question.",
    aiTopicsTitle: "AI topics",
    aiTopicsText: (guestLimit: number, eventLimit: number) =>
      `A conversation topic from AI in the chosen category; each guest has ${guestLimit} for the evening, everyone together ${eventLimit}.`,
    ordersTitle: "Orders and restaurant",
    ordersText:
      "Who ordered what, prices and the total, ticking off served dishes and the restaurant link: what to prepare and where to serve it.",
    readoutTitle: "Offline readout",
    readoutText: "The last published seating and guess ranking saved on this device — works without the internet too.",
    resetHeading: "Reset data",
    resetText:
      "Clears the chosen data in one click, e.g. after the rehearsal: guesses, the AI topic counter, seating, guests, the venue plan, questions or guest links. The organizer link and the TV address stay the same.",
  },
);
