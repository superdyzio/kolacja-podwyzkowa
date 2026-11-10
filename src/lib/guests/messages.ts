import { defineMessages } from "@/lib/i18n/locale";

// Texts of the guest list and groups (S-01), both languages (i18n): the pure rules' messages, the organizer API's
// answers and the organizer page /o/<key>/goscie. Pure: imported by the routes and directly by the islands.

export const guestsMessages = defineMessages(
  {
    // names.ts
    lineTooLong: (line: number, text: string, max: number) =>
      `Linia ${line}: „${text}” — za długa nazwa (najwyżej ${max} znaków).`,
    lineDuplicate: (line: number, text: string, firstLine: number) =>
      `Linia ${line}: „${text}” — powtarza linię ${firstLine}.`,
    nameEmpty: "Wpisz imię lub ksywkę.",
    nameTooLong: (max: number) => `Nazwa może mieć najwyżej ${max} znaków.`,
    quote: (name: string) => `„${name}”`,
    // summary.ts
    absentCount: (count: number) => `nieobecni: ${count}`,
    // API answers
    fixList: "Popraw listę — nic nie zostało dodane.",
    enterOneName: "Wpisz co najmniej jedno imię.",
    alreadyListed: (names: string) => `Już są na liście: ${names}. Nic nie zostało dodane.`,
    tooMany: (max: number, existing: number) =>
      `Lista może mieć najwyżej ${max} gości (jest już ${existing}). Nic nie zostało dodane.`,
    guestNotFound: "Nie znaleziono gościa.",
    duplicateName: "Gość o tej nazwie już jest na liście.",
    groupNotFound: "Nie znaleziono grupy.",
    groupSize: (min: number, max: number) => `Grupa musi mieć od ${min} do ${max} osób.`,
    alreadyGrouped: "Ktoś z zaznaczonych jest już w grupie.",
    // import.ts (guest-import-diets, S-23)
    importNameMissing: (line: number) => `Linia ${line}: brak imienia — dieta lub uwagi bez osoby.`,
    importOnList: (line: number, text: string) => `Linia ${line}: „${text}” — już jest na liście gości.`,
    importUnknownDiet: (line: number, text: string, words: string) =>
      `Linia ${line}: „${text}” — nieznana dieta: ${words}. Użyj diety z listy albo wpisz to w kolumnie uwag.`,
    importNoteTooLong: (line: number, text: string) =>
      `Linia ${line}: „${text}” — za długie uwagi (najwyżej 120 znaków).`,
    importTooMany: (max: number, existing: number, rows: number) =>
      `Za dużo gości: na liście jest ${existing}, import dodałby ${rows}, a limit to ${max}.`,
    importTooManyLines: (max: number) => `Plik ma więcej niż ${max} wierszy — podziel go na części.`,
    importEmpty: "Brak gości do dodania — sprawdź plik lub wklejkę.",
    importTooLarge: "Plik lub wklejka jest za duża.",
  },
  {
    lineTooLong: (line: number, text: string, max: number) =>
      `Line ${line}: “${text}” — name too long (at most ${max} characters).`,
    lineDuplicate: (line: number, text: string, firstLine: number) =>
      `Line ${line}: “${text}” — repeats line ${firstLine}.`,
    nameEmpty: "Enter a name or nickname.",
    nameTooLong: (max: number) => `A name can have at most ${max} characters.`,
    quote: (name: string) => `“${name}”`,
    absentCount: (count: number) => `absent: ${count}`,
    fixList: "Fix the list — nothing was added.",
    enterOneName: "Enter at least one name.",
    alreadyListed: (names: string) => `Already on the list: ${names}. Nothing was added.`,
    tooMany: (max: number, existing: number) =>
      `The list can have at most ${max} guests (it already has ${existing}). Nothing was added.`,
    guestNotFound: "Guest not found.",
    duplicateName: "A guest with this name is already on the list.",
    groupNotFound: "Group not found.",
    groupSize: (min: number, max: number) => `A group must have ${min} to ${max} people.`,
    alreadyGrouped: "Someone you selected is already in a group.",
    importNameMissing: (line: number) => `Line ${line}: no name — a diet or notes without a person.`,
    importOnList: (line: number, text: string) => `Line ${line}: “${text}” — already on the guest list.`,
    importUnknownDiet: (line: number, text: string, words: string) =>
      `Line ${line}: “${text}” — unknown diet: ${words}. Use a diet from the list or put it in the notes column.`,
    importNoteTooLong: (line: number, text: string) =>
      `Line ${line}: “${text}” — notes too long (at most 120 characters).`,
    importTooMany: (max: number, existing: number, rows: number) =>
      `Too many guests: the list has ${existing}, the import would add ${rows}, and the limit is ${max}.`,
    importTooManyLines: (max: number) => `The file has more than ${max} rows — split it into parts.`,
    importEmpty: "No guests to add — check the file or the paste.",
    importTooLarge: "The file or the paste is too large.",
  },
);

// The organizer's guest page (/o/<key>/goscie) and its island.
export const guestManagerMessages = defineMessages(
  {
    pageTitle: (event: string) => `Goście i grupy — ${event}`,
    backToPanel: "← Panel organizatora",
    heading: "Goście i grupy",
    intro:
      "Wyświetlana nazwa to imię lub ksywka, którą zobaczą wszyscy na TV i karteczkach. Pary i grupy zawsze siedzą razem; nieobecni nie dostaną miejsca.",
    close: "Zamknij",
    // GuestManager
    selectAtLeast: (min: number) => `Zaznacz co najmniej ${min} osoby`,
    groupAtMost: (max: number) => `Grupa ma najwyżej ${max} osób`,
    createPair: "Utwórz parę",
    createGroup: (count: number) => `Utwórz grupę (${count})`,
    deleteQuestion: (name: string) => `Usunąć „${name}” z listy gości?`,
    pairDissolved: (partner: string) => `Para z „${partner}” zostanie rozwiązana.`,
    listHeading: "Lista gości",
    listEmpty: "Lista jest pusta. Dodaj gości powyżej.",
    selected: "Zaznaczono:",
    groupSizeHint: (min: number, max: number) => `Grupa ma od ${min} do ${max} osób`,
    clearSelection: "Wyczyść",
    // GuestAddForms
    addHeading: "Dodaj gości",
    nameLabel: "Imię lub ksywka",
    namePlaceholder: "np. Kasia M.",
    add: "Dodaj",
    pasteLabel: "Wklej listę — jedna osoba na linię",
    pastePlaceholder: "Ania\nKuba\nKasia M.",
    pasteHint:
      "Puste linie są pomijane. Jeśli coś się nie zgadza (powtórzone imię, za długa linia), nic nie zostanie dodane, a lista zostanie w polu do poprawienia.",
    addFromList: "Dodaj gości z listy",
    cancel: "Anuluj",
    pasteList: "Wklej listę gości",
    // GuestGroups
    groupsHeading: "Nierozdzielne grupy",
    noGroups: (min: number, max: number) =>
      `Brak grup. Zaznacz na liście od ${min} do ${max} osób i utwórz parę albo grupę — będą zawsze siedzieć razem.`,
    pair: "Para",
    group: (count: number) => `Grupa (${count})`,
    dissolve: "Rozwiąż",
    dissolveLabel: (names: string) => `Rozwiąż: ${names}`,
    // GuestRow
    alreadyInGroup: "Ta osoba jest już w grupie",
    selectForGroup: "Zaznacz do grupy",
    selectForGroupLabel: (name: string) => `Zaznacz do grupy: ${name}`,
    newNameFor: (name: string) => `Nowa nazwa dla: ${name}`,
    save: "Zapisz",
    absentBadge: "nieobecny",
    pairWith: "Para z: ",
    groupWith: "Grupa z: ",
    presentAfterAll: "Jednak obecny",
    absent: "Nieobecny",
    rename: "Zmień nazwę",
    remove: "Usuń",
  },
  {
    pageTitle: (event: string) => `Guests and groups — ${event}`,
    backToPanel: "← Organizer panel",
    heading: "Guests and groups",
    intro:
      "The display name is the name or nickname everyone will see on the TV and on the cards. Pairs and groups always sit together; absent guests get no seat.",
    close: "Close",
    selectAtLeast: (min: number) => `Select at least ${min} people`,
    groupAtMost: (max: number) => `A group has at most ${max} people`,
    createPair: "Make a pair",
    createGroup: (count: number) => `Make a group (${count})`,
    deleteQuestion: (name: string) => `Remove “${name}” from the guest list?`,
    pairDissolved: (partner: string) => `The pair with “${partner}” will be dissolved.`,
    listHeading: "Guest list",
    listEmpty: "The list is empty. Add guests above.",
    selected: "Selected:",
    groupSizeHint: (min: number, max: number) => `A group has ${min} to ${max} people`,
    clearSelection: "Clear",
    addHeading: "Add guests",
    nameLabel: "Name or nickname",
    namePlaceholder: "e.g. Kate M.",
    add: "Add",
    pasteLabel: "Paste a list — one person per line",
    pastePlaceholder: "Anna\nJake\nKate M.",
    pasteHint:
      "Blank lines are skipped. If something is wrong (a repeated name, a line too long), nothing is added and the list stays in the field for you to fix.",
    addFromList: "Add guests from the list",
    cancel: "Cancel",
    pasteList: "Paste a guest list",
    groupsHeading: "Inseparable groups",
    noGroups: (min: number, max: number) =>
      `No groups yet. Select ${min} to ${max} people on the list and make a pair or a group — they will always sit together.`,
    pair: "Pair",
    group: (count: number) => `Group (${count})`,
    dissolve: "Dissolve",
    dissolveLabel: (names: string) => `Dissolve: ${names}`,
    alreadyInGroup: "This person is already in a group",
    selectForGroup: "Select for a group",
    selectForGroupLabel: (name: string) => `Select for a group: ${name}`,
    newNameFor: (name: string) => `New name for: ${name}`,
    save: "Save",
    absentBadge: "absent",
    pairWith: "Pair with: ",
    groupWith: "Group with: ",
    presentAfterAll: "Present after all",
    absent: "Absent",
    rename: "Rename",
    remove: "Remove",
  },
);
