import { defineMessages } from "@/lib/i18n/locale";

// Texts of the floor — the waiter's day view (waiter-day-and-refills, S-21).
export const floorMessages = defineMessages(
  {
    title: (event: string) => `Obsługa sali · ${event}`,
    heading: "Obsługa sali",
    intro:
      "Plan z gośćmi, zamówienia z cenami i rachunek. Zaznaczaj wydane sztuki i dopisuj zamówienia na sali (dokładki, dodatkowe napoje) — ceny ustawia lokal.",
    back: "Wróć do restauracji",
    todayHeading: "Dziś na sali",
    todayIntro: "Wydarzenia trwające dziś (także po północy, do południa następnego dnia).",
    todayEmpty: "Dziś nie ma wydarzeń na sali.",
    openFloor: "Obsługa sali",
    openFloorFor: (event: string) => `Otwórz obsługę sali: ${event}`,
    drinksAddOnly: "Napoje dopisane na sali trafiają na rachunek; poprawia je lokal.",
  },
  {
    title: (event: string) => `Floor service · ${event}`,
    heading: "Floor service",
    intro:
      "The plan with guests, the orders with prices and the bill. Tick the pieces served and add orders on the floor (refills, extra drinks) — the venue sets the prices.",
    back: "Back to the restaurant",
    todayHeading: "On the floor today",
    todayIntro: "Events running today (also after midnight, until noon the next day).",
    todayEmpty: "No events on the floor today.",
    openFloor: "Floor service",
    openFloorFor: (event: string) => `Open floor service: ${event}`,
    drinksAddOnly: "Drinks added on the floor go on the bill; the venue corrects them.",
  },
);
