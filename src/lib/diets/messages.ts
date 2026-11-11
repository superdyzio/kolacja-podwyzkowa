import { defineMessages } from "@/lib/i18n/locale";
import type { DietTag } from "./rules";

// Texts of the guests' diets and allergies (guest-import-diets, S-23), both languages (i18n): tag labels, the diet
// editor on the guest list, the „Diety i alergie” section of the order pages and the tablet. Pure.

type DietTexts = Record<DietTag, string>;

const labelsPl: DietTexts = {
  vegetarian: "wegetariańska",
  vegan: "wegańska",
  "gluten-free": "bez glutenu",
  "lactose-free": "bez laktozy",
  "nut-allergy": "alergia na orzechy",
  "seafood-allergy": "alergia na ryby i owoce morza",
  halal: "halal",
  "no-pork": "bez wieprzowiny",
};

const labelsEn: DietTexts = {
  vegetarian: "vegetarian",
  vegan: "vegan",
  "gluten-free": "gluten-free",
  "lactose-free": "lactose-free",
  "nut-allergy": "nut allergy",
  "seafood-allergy": "fish and seafood allergy",
  halal: "halal",
  "no-pork": "no pork",
};

export const dietMessages = defineMessages(
  {
    labels: labelsPl,
    // The diet editor on the guest list (GuestRow).
    editButton: "Dieta",
    editLabel: (name: string) => `Dieta i alergie: ${name}`,
    tagsLegend: "Dieta i alergie",
    noteLabel: "Uwagi dla kuchni i obsługi",
    notePlaceholder: "np. alergia na seler, bez cebuli",
    noteCounter: (length: number, max: number) => `${length} / ${max}`,
    save: "Zapisz",
    cancel: "Anuluj",
    noteTooLong: (max: number) => `Uwaga może mieć najwyżej ${max} znaków.`,
    unknownTag: "Nieznana dieta.",
    noteBadge: "uwaga",
    // The „Diety i alergie” section (order pages, floors, the tablet).
    heading: (count: number) => `Diety i alergie (${count})`,
    intro: "Tylko dla kuchni i obsługi — goście i TV ich nie widzą. Liczymy obecnych gości.",
    countsLabel: "Zliczenia",
    count: (label: string, count: number) => `${label}: ${count}`,
    seat: (seat: number, name: string) => `Miejsce ${seat} · ${name}`,
    unplacedHeading: "Bez miejsca na planie",
    unplacedText: "Ci goście nie mają jeszcze opublikowanego miejsca.",
    notPublished: "Rozsadzenie nie jest jeszcze opublikowane — diety pojawią się przy miejscach po publikacji.",
  },
  {
    labels: labelsEn,
    editButton: "Diet",
    editLabel: (name: string) => `Diet and allergies: ${name}`,
    tagsLegend: "Diet and allergies",
    noteLabel: "Notes for the kitchen and staff",
    notePlaceholder: "e.g. celery allergy, no onion",
    noteCounter: (length: number, max: number) => `${length} / ${max}`,
    save: "Save",
    cancel: "Cancel",
    noteTooLong: (max: number) => `A note can have at most ${max} characters.`,
    unknownTag: "Unknown diet.",
    noteBadge: "note",
    heading: (count: number) => `Diets and allergies (${count})`,
    intro: "For the kitchen and staff only — guests and the TV never see them. Present guests are counted.",
    countsLabel: "Counts",
    count: (label: string, count: number) => `${label}: ${count}`,
    seat: (seat: number, name: string) => `Seat ${seat} · ${name}`,
    unplacedHeading: "No seat on the plan",
    unplacedText: "These guests have no published seat yet.",
    notPublished: "The seating is not published yet — diets show at the seats after publishing.",
  },
);
