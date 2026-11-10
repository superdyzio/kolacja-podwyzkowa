import { defineMessages } from "@/lib/i18n/locale";

// Texts of the client's work in the restaurant panel (client-restaurant-split, S-14), both languages (i18n). The
// sections' titles and descriptions are the client shell's (shellMessages). Pure.

export const clientWorkMessages = defineMessages(
  {
    heading: "Praca klienta",
    intro:
      "Co klient przygotował przez link organizatora: goście, sala, rozsadzenie, linki gości, strzały, pytania i zamówienia.",
    open: "Otwórz",
    pageTitle: (section: string, event: string) => `${section} — ${event}`,
    kicker: (event: string) => `Praca klienta · ${event}`,
    aiHeading: "Koszty AI",
    aiIntro: "Tematy AI tego wydarzenia (goście i organizator). Koszt widzi tylko lokal.",
    resetHeading: "Reset danych",
    resetText:
      "Pełny reset wydarzenia: strzały, licznik tematów AI, rozsadzenie, goście, plan lokalu, zamówienia z napojami, pytania albo linki gości. Linki wydarzenia zostają bez zmian. Klient ma tylko „Reset prób”.",
  },
  {
    heading: "The client's work",
    intro:
      "What the client prepared through the organizer link: guests, venue, seating, guest links, guesses, questions and orders.",
    open: "Open",
    pageTitle: (section: string, event: string) => `${section} — ${event}`,
    kicker: (event: string) => `The client's work · ${event}`,
    aiHeading: "AI costs",
    aiIntro: "AI topics of this event (guests and organizer). Only the venue sees the cost.",
    resetHeading: "Reset data",
    resetText:
      "A full reset of the event: guesses, the AI topic counter, seating, guests, the venue plan, orders with drinks, questions or guest links. The event's links stay the same. The client only has „Reset trials”.",
  },
);
