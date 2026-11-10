import { defineMessages } from "@/lib/i18n/locale";
import type { ModuleKey } from "./rules";

// Texts of the event modules (event-modules, S-17), both languages (i18n): module names and hints, the refusals, the
// client's „Moduły” card, the venue's and the administrator's controls on the panel's event card. Pure.

type ModuleTexts = Record<ModuleKey, string>;

const namesPl: ModuleTexts = {
  questions: "Pytania do rozmowy",
  aiTopics: "Tematy AI",
  guessing: "Gra w zgadywanie rachunku",
  seatingDraw: "Losowanie miejsc",
  tvSpotlight: "„Pokaż na TV”",
  pubQuiz: "Pub quiz",
};

const namesEn: ModuleTexts = {
  questions: "Conversation questions",
  aiTopics: "AI topics",
  guessing: "Bill-guessing game",
  seatingDraw: "Seating draw",
  tvSpotlight: "“Show on TV”",
  pubQuiz: "Pub quiz",
};

export const modulesMessages = defineMessages(
  {
    names: namesPl,
    hints: {
      questions: "Goście losują pytania na telefonach, a Ty prowadzisz bazę pytań.",
      aiTopics: "Goście i Ty generujecie tematy rozmowy z AI (z limitem na wieczór).",
      guessing: "Goście zgadują, ile wyniósł cały rachunek; Ty czytasz ranking.",
      seatingDraw: "„Wylosuj projekt” rozsadza gości z jak najmniejszą liczbą powtórzonych sąsiadów.",
      tvSpotlight: "Pytanie, temat albo wylosowana osoba na ekranie TV nad rozsadzeniem.",
      pubQuiz: "Quiz prowadzony na TV, odpowiedzi na telefonach (wkrótce).",
    } satisfies ModuleTexts,
    // Refusals (409)
    off: "Ten moduł jest wyłączony w tym wydarzeniu.",
    unavailable: "Lokal nie udostępnia tego modułu w tym wydarzeniu.",
    locked: "To moduł płatny — odblokowuje go administrator platformy.",
    notPaid: "Ten moduł jest bezpłatny — nie wymaga odblokowania.",
    // Client card
    heading: "Moduły",
    intro:
      "Włącz gry i zabawy, które chcesz mieć na imprezie. Wyłączony moduł znika z telefonów gości i z TV, ale jego dane zostają.",
    stateOn: "Włączony",
    stateOff: "Wyłączony",
    stateUnavailable: "Niedostępny w tym lokalu",
    stateLocked: "Płatny — do odblokowania przez administratora",
    stateUnlocked: "Płatny — odblokowany",
    turnOn: "Włącz",
    turnOff: "Wyłącz",
    confirmOff: (name: string) =>
      `Wyłączyć moduł „${name}”? Zniknie z telefonów gości i z TV przy ich następnym odświeżeniu. Dane modułu zostaną i wrócą po ponownym włączeniu.`,
    saving: "Zapisuję…",
    failed: "Nie udało się zapisać zmiany modułu.",
    // Panel (venue)
    venueHeading: "Moduły wydarzenia",
    venueIntro:
      "Zaznacz, które moduły lokal udostępnia w tym wydarzeniu (np. bez rzutnika — bez „Pokaż na TV”). Klient włącza je spośród dostępnych.",
    available: "Dostępny",
    notAvailable: "Niedostępny",
    offer: "Udostępnij",
    withdraw: "Wycofaj",
    confirmWithdraw: (name: string) =>
      `Wycofać moduł „${name}” z tego wydarzenia? Zniknie u klienta, gości i na TV; jego dane zostaną.`,
    clientState: "U klienta:",
    clientDecides: "Włącza i wyłącza klient przez swój link (personel — gdy „Lokal prowadzi”).",
    // Panel (platform administrator, support mode)
    adminHeading: "Administrator platformy: moduły płatne",
    adminIntro:
      "Odblokowanie modułu płatnego dla tego wydarzenia trafia do dziennika wejść administratora, który widzi właściciel lokalu.",
    unlock: "Odblokuj",
    lock: "Zablokuj ponownie",
    confirmUnlock: (name: string) =>
      `Odblokować moduł płatny „${name}” dla tego wydarzenia? Wpis trafi do dziennika właściciela.`,
    confirmLock: (name: string) =>
      `Zablokować ponownie moduł „${name}” w tym wydarzeniu? Wpis trafi do dziennika właściciela.`,
    // Pages
    pageOffHeading: "Moduł wyłączony",
    pageOffText: (name: string) =>
      `Moduł „${name}” jest wyłączony w tym wydarzeniu. Włączysz go w karcie „Moduły” na stronie wydarzenia; dane modułu czekają.`,
    backToEvent: "Wróć do wydarzenia",
    dismiss: "Zamknij",
  },
  {
    names: namesEn,
    hints: {
      questions: "Guests draw questions on their phones; you keep the question base.",
      aiTopics: "Guests and you generate conversation topics with AI (with an evening limit).",
      guessing: "Guests guess what the whole bill was; you read out the ranking.",
      seatingDraw: "“Draw a plan” seats guests with as few repeated neighbours as possible.",
      tvSpotlight: "A question, a topic or a drawn person on the TV over the seating.",
      pubQuiz: "A quiz run on the TV, answered on phones (coming soon).",
    } satisfies ModuleTexts,
    off: "This module is switched off for this event.",
    unavailable: "The venue does not offer this module for this event.",
    locked: "This is a paid module — the platform administrator unlocks it.",
    notPaid: "This module is free — it needs no unlock.",
    heading: "Modules",
    intro:
      "Switch on the games and extras you want at your party. A module that is off disappears from guests' phones and the TV, but its data stays.",
    stateOn: "On",
    stateOff: "Off",
    stateUnavailable: "Not offered by this venue",
    stateLocked: "Paid — to be unlocked by the administrator",
    stateUnlocked: "Paid — unlocked",
    turnOn: "Switch on",
    turnOff: "Switch off",
    confirmOff: (name: string) =>
      `Switch off the module “${name}”? It disappears from guests' phones and the TV on their next refresh. Its data stays and comes back when you switch it on again.`,
    saving: "Saving…",
    failed: "Could not save the module change.",
    venueHeading: "Event modules",
    venueIntro:
      "Mark which modules the venue offers for this event (e.g. no projector — no “Show on TV”). The client switches them on among the offered ones.",
    available: "Offered",
    notAvailable: "Not offered",
    offer: "Offer",
    withdraw: "Withdraw",
    confirmWithdraw: (name: string) =>
      `Withdraw the module “${name}” from this event? It disappears for the client, the guests and the TV; its data stays.`,
    clientState: "For the client:",
    clientDecides: "The client switches it through their link (staff — while “Venue leads” is on).",
    adminHeading: "Platform administrator: paid modules",
    adminIntro: "Unlocking a paid module for this event goes into the administrator access log the venue owner sees.",
    unlock: "Unlock",
    lock: "Lock again",
    confirmUnlock: (name: string) => `Unlock the paid module “${name}” for this event? The owner's log records it.`,
    confirmLock: (name: string) => `Lock the module “${name}” again for this event? The owner's log records it.`,
    pageOffHeading: "Module switched off",
    pageOffText: (name: string) =>
      `The module “${name}” is switched off for this event. Switch it on in the “Modules” card on the event page; its data is waiting.`,
    backToEvent: "Back to the event",
    dismiss: "Close",
  },
);
