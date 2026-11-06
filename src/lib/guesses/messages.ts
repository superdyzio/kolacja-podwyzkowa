import { defineMessages } from "@/lib/i18n/locale";
import { pluralEn, pluralPl } from "@/lib/i18n/plural";

// Texts of the guesses and the ranking (S-06), both languages (i18n). Money stays „1 499,99 zł” in both: only the
// words around it change. Pure: shared by the server, the organizer's page, the guest's phone and the offline readout.

// Field messages of parseAmount and how far a guess was (describeDifference).
export const amountMessages = defineMessages(
  {
    empty: "Wpisz kwotę.",
    negative: "Kwota nie może być ujemna.",
    invalid: "Wpisz kwotę w złotych, np. 1500 albo 1499,99.",
    tooLarge: "Kwota może wynieść najwyżej 10 000 000 zł.",
    exact: "dokładnie!",
    tooLow: (amount: string) => `o ${amount} za mało`,
    tooHigh: (amount: string) => `o ${amount} za dużo`,
  },
  {
    empty: "Enter an amount.",
    negative: "The amount cannot be negative.",
    invalid: "Enter an amount in złoty, e.g. 1500 or 1499,99.",
    tooLarge: "The amount can be at most 10 000 000 zł.",
    exact: "spot on!",
    tooLow: (amount: string) => `${amount} too low`,
    tooHigh: (amount: string) => `${amount} too high`,
  },
);

// The field message of parsePredictedPlace (guess-place).
export const placeMessages = defineMessages(
  {
    range: (max: number) => (max === 1 ? "Miejsce może być tylko 1." : `Wpisz miejsce od 1 do ${max}.`),
  },
  {
    range: (max: number) => (max === 1 ? "The place can only be 1." : `Enter a place from 1 to ${max}.`),
  },
);

// Server answers and the organizer shell card.
export const guessMessages = defineMessages(
  {
    intakeClosed: "Przyjmowanie strzałów jest zamknięte.",
    guestNotFound: "Nie znaleziono gościa.",
    summaryOpen: "Przyjmowanie otwarte",
    summaryClosed: "Przyjmowanie zamknięte",
    summaryNoGuests: "brak gości",
    summaryCount: (guessed: number, all: number) => `strzały: ${guessed} z ${all}`,
    summaryRankingReady: "ranking gotowy",
  },
  {
    intakeClosed: "Guessing is closed.",
    guestNotFound: "Guest not found.",
    summaryOpen: "Guessing open",
    summaryClosed: "Guessing closed",
    summaryNoGuests: "no guests",
    summaryCount: (guessed: number, all: number) => `guesses: ${guessed} of ${all}`,
    summaryRankingReady: "ranking ready",
  },
);

// The organizer's guesses page and the components shared with the offline readout (AmountForm, RankingTable,
// RankingReadout).
export const guessUiMessages = defineMessages(
  {
    pageTitle: (event: string) => `Strzały i ranking — ${event}`,
    backToPanel: "← Panel organizatora",
    heading: "Strzały i ranking",
    intro:
      "Goście zgadują na swoich telefonach, ile kosztowała cała kolacja, i widzą tylko własny strzał. Zamknij przyjmowanie, wpisz prawidłową kwotę z rachunku razem z napiwkiem i czytaj ranking od ostatniego miejsca.",
    close: "Zamknij",
    cancel: "Anuluj",
    save: "Zapisz",
    absent: "nieobecny",
    // AmountForm
    amountPlaceholder: "np. 1500 albo 1499,99",
    placeFieldLabel: "Typ miejsca (opcjonalnie)",
    placePlaceholder: (max: number) => `1–${max}`,
    // Intake
    intakeHeading: "Przyjmowanie strzałów",
    intakeOpen: "Otwarte",
    intakeClosed: "Zamknięte",
    intakeOpenText: "Goście wpisują i zmieniają strzały na swoich telefonach.",
    intakeClosedText: "Goście widzą tylko swój strzał. Ty nadal możesz wpisywać i poprawiać strzały za gości.",
    guessCount: (guessed: number, all: number) => `Strzały: ${guessed} z ${all}`,
    closeIntake: "Zamknij przyjmowanie",
    reopenIntake: "Otwórz ponownie",
    // Correct amount
    correctHeading: "Prawidłowa kwota",
    correctLabel: "Ile kosztowała cała kolacja (z napiwkiem)?",
    saveCorrect: "Zapisz prawidłową kwotę",
    change: "Zmień",
    remove: "Usuń",
    stillOpenNote:
      "Goście nadal mogą zmieniać strzały — ranking może się zmienić. Zamknij przyjmowanie przed odczytem.",
    // Ranking
    rankingHeading: "Ranking",
    rankingAfterCorrect: "Ranking pojawi się po wpisaniu prawidłowej kwoty.",
    rankingEmpty: "Brak strzałów do rankingu.",
    readFromLast: "Czytaj od końca",
    rankingLegend:
      "Podium na złoto, srebrno i brązowo. Na zielono: kto trafił swoje miejsce. Remis zajmuje wszystkie swoje miejsca: dwie osoby na 2. miejscu trafiają, typując 2 albo 3.",
    hittersHeading: (count: number) => `Trafione miejsca (${count})`,
    hittersNone: "Nikt nie trafił swojego miejsca.",
    // Missing
    missingHeading: (count: number) => `Brakuje strzałów (${count})`,
    noGuestsYet: "Nie ma jeszcze gości.",
    addGuests: "Dodaj gości",
    noGuestsAfter: ", a pojawią się tutaj.",
    allGuessed: "Wszyscy goście oddali strzał.",
    absentSuffix: " · nieobecny",
    missingNote:
      "Jeśli jesteś na liście gości, Ty nie strzelasz — zostaniesz tutaj. Strzał gościa bez telefonu wpisz poniżej.",
    allGuestsHeading: (count: number) => `Wszyscy goście (${count})`,
    deleteConfirm: (name: string, amount: string) =>
      `Usunąć strzał „${name}”${amount}? Gość będzie mógł oddać nowy, dopóki przyjmowanie jest otwarte.`,
    // GuessGuestRow
    enteredByOrganizer: "wpisany przez organizatora",
    noGuess: "brak strzału",
    guessFor: (name: string) => `Strzał dla: ${name}`,
    correctGuessLabel: (name: string) => `Popraw strzał: ${name}`,
    enterGuessLabel: (name: string) => `Wpisz strzał: ${name}`,
    correctGuess: "Popraw",
    enterGuess: "Wpisz",
    deleteGuessLabel: (name: string) => `Usuń strzał: ${name}`,
    deleteGuess: "Usuń strzał",
    // RankingTable
    rankingCaption: "Ranking strzałów, od najbliższego prawidłowej kwocie",
    place: "Miejsce",
    guest: "Gość",
    guess: "Strzał",
    tie: "remis",
    medal: { gold: "złoto", silver: "srebro", bronze: "brąz" },
    predictedPlace: (place: number) => `typ miejsca: ${place}`,
    placeHit: "trafione miejsce",
    // RankingReadout
    winners: "Zwycięzcy!",
    winner: "Zwycięzca!",
    placeTitle: (place: number) => `Miejsce ${place}`,
    step: (index: number, count: number) => `Krok ${index} z ${count}`,
    correctAmount: "Prawidłowa kwota:",
    tiePeople: (count: number) => `remis: ${count} ${pluralPl(count, "osoba", "osoby", "osób")}`,
    guessLabel: "strzał:",
    predictedLabel: "typ miejsca:",
    placeHitReadout: "trafione miejsce!",
    back: "Wstecz",
    next: "Dalej",
    finish: "Zakończ",
  },
  {
    pageTitle: (event: string) => `Guesses and ranking — ${event}`,
    backToPanel: "← Organizer panel",
    heading: "Guesses and ranking",
    intro:
      "Guests guess on their phones how much the whole dinner cost, and see only their own guess. Close guessing, enter the correct amount from the bill including the tip, and read the ranking from the last place.",
    close: "Close",
    cancel: "Cancel",
    save: "Save",
    absent: "absent",
    amountPlaceholder: "e.g. 1500 or 1499,99",
    placeFieldLabel: "Predicted place (optional)",
    placePlaceholder: (max: number) => `1–${max}`,
    intakeHeading: "Taking guesses",
    intakeOpen: "Open",
    intakeClosed: "Closed",
    intakeOpenText: "Guests enter and change their guesses on their phones.",
    intakeClosedText: "Guests see only their own guess. You can still enter and correct guesses for them.",
    guessCount: (guessed: number, all: number) => `Guesses: ${guessed} of ${all}`,
    closeIntake: "Close guessing",
    reopenIntake: "Reopen",
    correctHeading: "Correct amount",
    correctLabel: "How much did the whole dinner cost (tip included)?",
    saveCorrect: "Save the correct amount",
    change: "Change",
    remove: "Remove",
    stillOpenNote: "Guests can still change their guesses — the ranking may change. Close guessing before the readout.",
    rankingHeading: "Ranking",
    rankingAfterCorrect: "The ranking appears once you enter the correct amount.",
    rankingEmpty: "No guesses to rank.",
    readFromLast: "Read from the last place",
    rankingLegend:
      "The podium in gold, silver and bronze. Green: whoever hit their own place. A tie covers all its places: two people sharing place 2 hit with a prediction of 2 or 3.",
    hittersHeading: (count: number) => `Hit their place (${count})`,
    hittersNone: "Nobody hit their own place.",
    missingHeading: (count: number) => `Missing guesses (${count})`,
    noGuestsYet: "No guests yet.",
    addGuests: "Add guests",
    noGuestsAfter: " and they will show up here.",
    allGuessed: "Every guest has made a guess.",
    absentSuffix: " · absent",
    missingNote:
      "If you are on the guest list, you do not guess — you will stay here. Enter the guess of a guest without a phone below.",
    allGuestsHeading: (count: number) => `All guests (${count})`,
    deleteConfirm: (name: string, amount: string) =>
      `Delete the guess of “${name}”${amount}? The guest can make a new one while guessing is open.`,
    enteredByOrganizer: "entered by the organizer",
    noGuess: "no guess",
    guessFor: (name: string) => `Guess for: ${name}`,
    correctGuessLabel: (name: string) => `Correct the guess: ${name}`,
    enterGuessLabel: (name: string) => `Enter a guess: ${name}`,
    correctGuess: "Correct",
    enterGuess: "Enter",
    deleteGuessLabel: (name: string) => `Delete the guess: ${name}`,
    deleteGuess: "Delete guess",
    rankingCaption: "Ranking of the guesses, closest to the correct amount first",
    place: "Place",
    guest: "Guest",
    guess: "Guess",
    tie: "tie",
    medal: { gold: "gold", silver: "silver", bronze: "bronze" },
    predictedPlace: (place: number) => `predicted place: ${place}`,
    placeHit: "place hit",
    winners: "The winners!",
    winner: "The winner!",
    placeTitle: (place: number) => `Place ${place}`,
    step: (index: number, count: number) => `Step ${index} of ${count}`,
    correctAmount: "Correct amount:",
    tiePeople: (count: number) => `tie: ${count} ${pluralEn(count, "person", "people")}`,
    guessLabel: "guess:",
    predictedLabel: "predicted place:",
    placeHitReadout: "place hit!",
    back: "Back",
    next: "Next",
    finish: "Finish",
  },
);
