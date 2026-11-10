import { pluralEn, pluralPl } from "@/lib/i18n/plural";
import { defineMessages } from "@/lib/i18n/locale";
import type { EventMenuMode, MenuCourse } from "@/types";

// Texts of the menu catalog (menu-catalog-courses, S-16; FR-037): the catalog page and the restaurant page's section,
// the event card's „Menu wydarzenia”, the course headings of the prep lists, the order form's menu and the API
// messages, both languages (i18n). Dish names are DB content and never translated. Pure.

const COURSES_PL: Record<MenuCourse, string> = {
  starter: "Przystawki",
  soup: "Zupy",
  main: "Dania główne",
  dessert: "Desery",
  drinks: "Napoje",
};

const COURSES_EN: Record<MenuCourse, string> = {
  starter: "Starters",
  soup: "Soups",
  main: "Mains",
  dessert: "Desserts",
  drinks: "Drinks",
};

const COURSE_ONE_PL: Record<MenuCourse, string> = {
  starter: "przystawka",
  soup: "zupa",
  main: "danie główne",
  dessert: "deser",
  drinks: "napoje",
};

const COURSE_ONE_EN: Record<MenuCourse, string> = {
  starter: "starter",
  soup: "soup",
  main: "main",
  dessert: "dessert",
  drinks: "drinks",
};

const MODES_PL: Record<EventMenuMode, string> = {
  off: "Bez menu — dowolne pozycje (jak dotąd)",
  full: "Pełne menu lokalu",
  reduced: "Okrojone menu (wybrane pozycje)",
};

const MODES_EN: Record<EventMenuMode, string> = {
  off: "No menu — any items (as before)",
  full: "The restaurant's full menu",
  reduced: "Reduced menu (chosen items)",
};

export const menuMessages = defineMessages(
  {
    courses: COURSES_PL,
    courseOne: COURSE_ONE_PL,
    otherCourse: "Bez kursu",
    // Restaurant page section and the catalog page
    heading: "Menu lokalu",
    intro:
      "Dania i napoje lokalu z cenami i kursem. Każde wydarzenie dostaje pełne albo okrojone menu; klient zamawia z niego i widzi ceny, ale ich nie zmienia. Zmiana ceny tutaj nie zmienia pozycji już zamówionych.",
    sectionCounts: (count: number) =>
      count === 0 ? "Menu jest puste." : `${String(count)} ${pluralPl(count, "pozycja", "pozycje", "pozycji")} w menu`,
    openCatalog: "Otwórz menu lokalu",
    pageTitle: (restaurant: string) => `Menu lokalu — ${restaurant}`,
    backTo: (restaurant: string) => `← ${restaurant}`,
    empty: "Menu jest puste. Dodaj pierwszą pozycję.",
    addHeading: "Nowa pozycja menu",
    name: "Nazwa",
    course: "Kurs",
    price: "Cena (zł)",
    add: "Dodaj do menu",
    adding: "Dodawanie…",
    edit: "Zmień",
    editLabel: (name: string) => `Zmień pozycję ${name}`,
    save: "Zapisz",
    cancel: "Anuluj",
    remove: "Usuń",
    removeLabel: (name: string) => `Usuń z menu ${name}`,
    confirmRemove: (name: string) =>
      `Usunąć „${name}” z menu lokalu? Zniknie z menu każdego wydarzenia; pozycje już zamówione zostają z nazwą i ceną.`,
    readOnly: "Tryb wsparcia: tylko podgląd.",
    // Event card
    eventHeading: "Menu wydarzenia",
    eventIntro:
      "Co klient może zamówić. Bez menu klient wpisuje dowolne pozycje (cenę ustala lokal w „Cenniku wydarzenia”). Z menu klient wybiera z listy, a cena pochodzi z menu.",
    modes: MODES_PL,
    modeLegend: "Dostępne menu",
    catalogEmpty: "Menu lokalu jest puste — dopóki go nie uzupełnisz, klient wpisuje dowolne pozycje.",
    editCatalog: "Edytuj menu lokalu",
    chooseItems: "Pozycje dostępne w tym wydarzeniu",
    saveMenu: "Zapisz menu wydarzenia",
    saving: "Zapisywanie…",
    saved: "Zapisano menu wydarzenia.",
    availableCount: (count: number, total: number) => `Dostępne: ${String(count)} z ${String(total)}`,
    inactiveNote: "Żadna pozycja nie jest dostępna — klient wpisuje dowolne pozycje.",
    // Order form
    fromMenu: "Danie z menu",
    chooseDish: "Wybierz z menu…",
    menuNote: "Pozycje z menu lokalu; ceny ustala lokal.",
    // API
    notOnMenu: "Tej pozycji nie ma w menu wydarzenia. Wybierz z listy.",
    duplicate: (name: string) => `„${name}” jest już w menu lokalu.`,
    tooMany: (max: number) => `Menu lokalu może mieć najwyżej ${String(max)} pozycji.`,
    invalidCourse: "Wybierz kurs.",
    networkError: "Brak połączenia. Spróbuj ponownie.",
  },
  {
    courses: COURSES_EN,
    courseOne: COURSE_ONE_EN,
    otherCourse: "No course",
    heading: "Restaurant menu",
    intro:
      "The restaurant's dishes and drinks with prices and a course. Each event gets the full or a reduced menu; the client orders from it and sees the prices but cannot change them. Changing a price here does not change lines already ordered.",
    sectionCounts: (count: number) =>
      count === 0 ? "The menu is empty." : `${String(count)} ${pluralEn(count, "item", "items")} on the menu`,
    openCatalog: "Open the restaurant menu",
    pageTitle: (restaurant: string) => `Restaurant menu — ${restaurant}`,
    backTo: (restaurant: string) => `← ${restaurant}`,
    empty: "The menu is empty. Add the first item.",
    addHeading: "New menu item",
    name: "Name",
    course: "Course",
    price: "Price (zł)",
    add: "Add to the menu",
    adding: "Adding…",
    edit: "Edit",
    editLabel: (name: string) => `Edit item ${name}`,
    save: "Save",
    cancel: "Cancel",
    remove: "Remove",
    removeLabel: (name: string) => `Remove ${name} from the menu`,
    confirmRemove: (name: string) =>
      `Remove „${name}” from the restaurant menu? It disappears from every event's menu; lines already ordered keep their name and price.`,
    readOnly: "Support mode: view only.",
    eventHeading: "Event menu",
    eventIntro:
      "What the client can order. Without a menu the client types any item (the venue sets its price in „Event prices”). With a menu the client picks from the list and the price comes from the menu.",
    modes: MODES_EN,
    modeLegend: "Available menu",
    catalogEmpty: "The restaurant menu is empty — until you fill it, the client types any items.",
    editCatalog: "Edit the restaurant menu",
    chooseItems: "Items available at this event",
    saveMenu: "Save the event menu",
    saving: "Saving…",
    saved: "The event menu is saved.",
    availableCount: (count: number, total: number) => `Available: ${String(count)} of ${String(total)}`,
    inactiveNote: "No item is available — the client types any items.",
    fromMenu: "Dish from the menu",
    chooseDish: "Choose from the menu…",
    menuNote: "Items from the restaurant's menu; the venue sets the prices.",
    notOnMenu: "This item is not on the event's menu. Choose from the list.",
    duplicate: (name: string) => `„${name}” is already on the restaurant menu.`,
    tooMany: (max: number) => `The restaurant menu can have at most ${String(max)} items.`,
    invalidCourse: "Choose a course.",
    networkError: "No connection. Try again.",
  },
);
