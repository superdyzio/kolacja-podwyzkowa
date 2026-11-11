import { defineMessages } from "@/lib/i18n/locale";

// Texts of „Lokal prowadzi” (client-restaurant-split, S-14), both languages (i18n): the refusals of either side, the
// banners above read-only views and the switch on the panel's event card. Pure: islands import it directly.

export const leadMessages = defineMessages(
  {
    // 409 answers
    clientReadOnly:
      "Wydarzenie prowadzi teraz lokal, więc ten link ma tylko podgląd. Zmiany wprowadza personel lokalu.",
    staffPreviewOnly:
      "Wydarzenie prowadzi klient, więc personel ma tylko podgląd. Włącz „Lokal prowadzi” na karcie wydarzenia, aby edytować.",
    // Banners
    clientBannerHeading: "Wydarzenie prowadzi lokal",
    clientBannerText:
      "Personel lokalu wprowadza teraz zmiany za Ciebie, więc ta strona jest tylko do podglądu. Gdy lokal odda prowadzenie, odśwież stronę.",
    staffBannerHeading: "Wydarzenie prowadzi klient — masz podgląd",
    staffBannerText:
      "Klient edytuje swoje wydarzenie przez link organizatora. Aby edytować za niego, włącz „Lokal prowadzi” na karcie wydarzenia.",
    staffLeadsHeading: "Lokal prowadzi — edytujesz za klienta",
    staffLeadsText: "Klient ma teraz tylko podgląd. Gdy skończysz, możesz oddać mu prowadzenie na karcie wydarzenia.",
    supportBannerText: "Tryb wsparcia: praca klienta tylko do podglądu.",
    backToEvent: "Wróć do karty wydarzenia",
    readOnlyLabel: "Tylko do podglądu",
    readOnlyNote: "Formularze, przyciski i plan poniżej są wyłączone — nie da się tu niczego zmienić.",
    // Event card switch
    switchHeading: "Kto prowadzi wydarzenie",
    clientLeads: "Prowadzi klient: edytuje przez link organizatora, a personel ma podgląd.",
    venueLeads: "Lokal prowadzi: personel edytuje pracę klienta w panelu, a klient ma podgląd.",
    turnOn: "Włącz „Lokal prowadzi”",
    turnOff: "Oddaj prowadzenie klientowi",
    confirmOn:
      "Włączyć „Lokal prowadzi”? Klient straci możliwość zmian (gości, sali, rozsadzenia, zamówień, strzałów i pytań) — zostanie mu podgląd, a edytować będzie personel w panelu.",
    confirmOff:
      "Oddać prowadzenie klientowi? Personel wróci do podglądu, a klient znów będzie mógł edytować przez link organizatora.",
    switching: "Zapisuję…",
    stateOn: "Lokal prowadzi",
    stateOff: "Prowadzi klient",
  },
  {
    clientReadOnly:
      "The venue is running this event now, so this link is view-only. The venue's staff make the changes.",
    staffPreviewOnly:
      "The client is running this event, so the staff can only view it. Turn on „Venue leads” on the event card to edit.",
    clientBannerHeading: "The venue is running the event",
    clientBannerText:
      "The venue's staff are making the changes for you now, so this page is view-only. Reload it when the venue hands the event back.",
    staffBannerHeading: "The client is running the event — view only",
    staffBannerText:
      "The client edits their event through the organizer link. To edit for them, turn on „Venue leads” on the event card.",
    staffLeadsHeading: "Venue leads — you edit for the client",
    staffLeadsText: "The client can only view now. When you are done, hand the event back on the event card.",
    supportBannerText: "Support mode: the client's work is view-only.",
    backToEvent: "Back to the event card",
    readOnlyLabel: "View only",
    readOnlyNote: "The forms, buttons and plan below are switched off — nothing can be changed here.",
    switchHeading: "Who runs the event",
    clientLeads: "The client leads: they edit through the organizer link and the staff can view.",
    venueLeads: "Venue leads: the staff edit the client's work in the panel and the client can view.",
    turnOn: "Turn on „Venue leads”",
    turnOff: "Hand the event back to the client",
    confirmOn:
      "Turn on „Venue leads”? The client will no longer be able to change anything (guests, venue, seating, orders, guesses, questions) — they keep a view, and the staff edit in the panel.",
    confirmOff:
      "Hand the event back to the client? The staff go back to viewing, and the client can edit again through the organizer link.",
    switching: "Saving…",
    stateOn: "Venue leads",
    stateOff: "Client leads",
  },
);
