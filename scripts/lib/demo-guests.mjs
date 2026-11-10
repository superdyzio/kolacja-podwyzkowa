// The demo party's fictional guests (demo-restaurant, S-29): names, diets, groups, the absent and the pinned guest.
// Built in on purpose (not a file to replace): the demo's guesses, RSVP answers, quiz players and print checks name
// them. 80 guests = the PRD's example corporate party („Wigilia firmy Y, 12.12, 80 osób”).

// The first 40 come from the v1 demo; "Ania" is the only name containing "ania" (the offline readout and map search
// checks look for her).
const FIRST_NAMES = [
  "Ania",
  "Bartek",
  "Kasia",
  "Tomek",
  "Magda",
  "Piotrek",
  "Ola",
  "Kuba",
  "Ewa",
  "Marcin",
  "Zosia",
  "Michał",
  "Basia",
  "Grzesiek",
  "Agnieszka",
  "Paweł",
  "Joasia",
  "Krzysiek",
  "Monika",
  "Łukasz",
  "Dorota",
  "Wojtek",
  "Natalia",
  "Adam",
  "Iwona",
  "Rafał",
  "Marta",
  "Szymon",
  "Ela",
  "Darek",
  "Justyna",
  "Maciek",
  "Karolina",
  "Jacek",
  "Gosia Kowalska",
  "Gosia Wiśniewska",
  "Staszek „Szef”",
  "Pani Halinka",
  "Igor z IT",
  "Weronika",
];

// 40 more from the company's HR spreadsheet (imported from a CSV with their diets).
const FULL_NAMES = [
  "Adam Nowicki",
  "Beata Lis",
  "Cezary Wróbel",
  "Danuta Kaczmarek",
  "Edward Zając",
  "Filip Mazur",
  "Grażyna Kubiak",
  "Henryk Wilk",
  "Irena Szymańska",
  "Jan Kowalczyk",
  "Kamil Pawlak",
  "Lena Michalska",
  "Mateusz Król",
  "Nina Wieczorek",
  "Oskar Jabłoński",
  "Patrycja Dudek",
  "Robert Adamczyk",
  "Sylwia Górska",
  "Tadeusz Sikora",
  "Urszula Baran",
  "Wiktor Rutkowski",
  "Zuzanna Ostrowska",
  "Artur Malinowski",
  "Bożena Pietrzak",
  "Damian Walczak",
  "Elżbieta Stępień",
  "Franciszek Dąbrowski",
  "Hubert Czarnecki",
  "Izabela Sadowska",
  "Jakub Zieliński",
  "Klaudia Witkowska",
  "Leszek Kołodziej",
  "Marek Szulc",
  "Olga Borkowska",
  "Przemek Lewandowski",
  "Renata Kalinowska",
  "Sebastian Wójcik",
  "Teresa Głowacka",
  "Wojciech Jasiński",
  "Zbigniew Laskowski",
];

export const GUESTS = [...FIRST_NAMES, ...FULL_NAMES];
export const ABSENT = "Weronika";
export const PINNED = "Pani Halinka";

// guest-import-diets (S-23): [the diet column as typed, the notes, the tags it must become]. Bartek and Kasia get theirs
// per guest („Dieta”) after the import; the tablet's counts (present guests only, so not the absent Weronika) must match.
export const GUEST_DIETS = new Map([
  ["Justyna", ["wegetariańska", "", ["vegetarian"]]],
  ["Maciek", ["bez glutenu", "celiakia — osobna deska", ["gluten-free"]]],
  ["Karolina", ["wegańska, bez laktozy", "", ["vegan", "lactose-free"]]],
  ["Gosia Kowalska", ["alergia na orzechy", "także orzeszki ziemne", ["nut-allergy"]]],
  ["Staszek „Szef”", ["Halal", "", ["halal"]]],
  ["Pani Halinka", ["bez wieprzowiny", "", ["no-pork"]]],
  ["Igor z IT", ["", "bez cebuli", []]],
  ["Weronika", ["wege", "", ["vegetarian"]]],
  ["Beata Lis", ["wegetariańska", "", ["vegetarian"]]],
  ["Filip Mazur", ["bez glutenu", "", ["gluten-free"]]],
  ["Irena Szymańska", ["bez laktozy", "", ["lactose-free"]]],
  ["Nina Wieczorek", ["wegańska", "", ["vegan"]]],
  ["Tadeusz Sikora", ["bez wieprzowiny", "", ["no-pork"]]],
  ["Zuzanna Ostrowska", ["alergia na orzechy", "nawet śladowe ilości", ["nut-allergy"]]],
  ["Bartek", ["", "", ["seafood-allergy"]]],
  ["Kasia", ["", "bez mleka krowiego", ["lactose-free"]]],
]);
export const PATCHED_DIETS = ["Bartek", "Kasia"];

// Who comes from the CSV (named explicitly, so adding guests never changes it): the v1 demo's ten diet guests and the
// 40 full names; the other 30 are pasted as a plain list.
export const IMPORTED_GUESTS = [
  "Justyna",
  "Maciek",
  "Karolina",
  "Jacek",
  "Gosia Kowalska",
  "Gosia Wiśniewska",
  "Staszek „Szef”",
  "Pani Halinka",
  "Igor z IT",
  "Weronika",
  ...FULL_NAMES,
];
export const PASTED_GUESTS = GUESTS.filter((name) => !IMPORTED_GUESTS.includes(name));

// Inseparable groups (seated on consecutive seats of one table by seatGuests).
export const GROUPS = [
  { members: ["Magda", "Piotrek", "Zosia", "Grzesiek"] },
  { members: ["Kasia", "Tomek"] },
  { members: ["Gosia Kowalska", "Igor z IT"] },
  { members: ["Adam Nowicki", "Beata Lis", "Cezary Wróbel"] },
];

// The tags in the app's order with their Polish labels (src/lib/diets/messages.ts).
export const DIET_LABELS = {
  vegetarian: "wegetariańska",
  vegan: "wegańska",
  "gluten-free": "bez glutenu",
  "lactose-free": "bez laktozy",
  "nut-allergy": "alergia na orzechy",
  "seafood-allergy": "alergia na ryby i owoce morza",
  halal: "halal",
  "no-pork": "bez wieprzowiny",
};
