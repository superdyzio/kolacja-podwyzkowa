import { defineMessages } from "@/lib/i18n/locale";
import type { StaffReadoutArea } from "./staff";

// Texts of the staff's offline readout (staff-offline-readout, S-27), both languages: the readout pages of the kitchen
// tablet and both floors, and the notes and links on their live pages. „Stan z …” comes from offlineMessages
// (formatSavedAt), the expiry from formatDateTime.
export const staffOfflineMessages = defineMessages(
  {
    pageTitle: (event: string) => `Odczyt bez sieci — ${event}`,
    heading: "Odczyt bez sieci",
    intro:
      "Ostatni stan zamówień (z wydanymi sztukami), rozsadzenia i diet zapisany na tym urządzeniu — tylko do odczytu. Gdy sieć w lokalu padnie, ta strona otworzy się także bez połączenia; zaznaczanie wydanych i dopisywanie działa po powrocie sieci.",
    backToLive: {
      tablet: "← Widok kuchni",
      floor: "← Obsługa sali",
      waiter: "← Sala",
    } satisfies Record<StaffReadoutArea, string>,
    loading: "Wczytuję zapisany stan…",
    noState:
      "Na tym urządzeniu nie ma zapisanego stanu tego wydarzenia. Otwórz widok przy działającej sieci w dniu wydarzenia — stan zapisze się sam.",
    gone: "Ten dostęp już nie działa — zapisany stan usunięto z tego urządzenia.",
    expires: (label: string) => `Zapis na tym urządzeniu znika: ${label}.`,
    // Live pages.
    readoutLink: "Odczyt bez sieci",
    liveOffline: "Brak połączenia z serwerem — widzisz ostatni odczytany stan. Zmiany zapiszą się po powrocie sieci.",
    liveSaved: (label: string) =>
      `${label} zapisany na tym urządzeniu; po odświeżeniu bez sieci otworzy się odczyt bez sieci.`,
    liveGone: "Ten dostęp przestał działać — zapisany stan usunięto z tego urządzenia. Odśwież stronę.",
  },
  {
    pageTitle: (event: string) => `Offline readout — ${event}`,
    heading: "Offline readout",
    intro:
      "The last state of the orders (with the pieces served), the seating and the diets saved on this device — read only. When the venue's network fails, this page opens without a connection too; ticking pieces and adding orders work once the network is back.",
    backToLive: {
      tablet: "← Kitchen view",
      floor: "← Floor service",
      waiter: "← Floor",
    },
    loading: "Loading the saved state…",
    noState:
      "This device has no saved state of this event. Open the view with a working network on the day of the event — the state saves itself.",
    gone: "This access no longer works — the saved state was removed from this device.",
    expires: (label: string) => `This device forgets it: ${label}.`,
    readoutLink: "Offline readout",
    liveOffline: "No connection to the server — you see the last state read. Changes save once the network is back.",
    liveSaved: (label: string) =>
      `${label} saved on this device; reloading without a network opens the offline readout.`,
    liveGone: "This access stopped working — the saved state was removed from this device. Reload the page.",
  },
);
