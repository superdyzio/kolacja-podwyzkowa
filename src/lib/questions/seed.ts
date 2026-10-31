import type { QuestionCategory } from "@/types";

// The starter question base (S-07, PRD FR-014, Open Question 4): ~30 Polish conversation starters per category for a
// group of friends at the annual raise dinner — work, money (as hypotheticals), ambitions, life choices, light
// philosophy and fun "what ifs".
//
// Content bounds chosen by the user (shape-notes, "AI topics"): bold and debatable, but no party politics, no
// religion, no health topics and no personal jabs at anyone at the table (nobody is asked for their own salary).
// Questions are written in gender-neutral Polish where possible (present tense instead of "byś/zrobiłeś").
//
// The human-readable copy for review is context/foundation/question-seed.md; seed.test.ts checks that both list
// exactly the same questions, so change them together. Inserted when the event is created and on the organizer's
// "Wczytaj bazę startową" (only the questions missing from the base). Only a type import here: the file must stay
// loadable by `node --experimental-strip-types` (that is how the markdown copy is generated).

export const STARTER_QUESTIONS: Readonly<Record<QuestionCategory, readonly string[]>> = {
  kontrowersyjne: [
    "Czy jawne wynagrodzenia w firmach zrobiłyby więcej dobrego niż złego?",
    "Czy praca zdalna na stałe to przyszłość, czy wygoda, która powoli psuje zespoły?",
    "Czy lojalność wobec pracodawcy to dziś jeszcze cnota, czy już naiwność?",
    "Czy zmiana pracy co dwa, trzy lata tylko dla wyższej pensji to rozsądek, czy brak charakteru?",
    "Czy czterodniowy tydzień pracy przy tej samej pensji to realny plan, czy mrzonka?",
    "Czy o podwyżkę lepiej grzecznie poprosić, czy od razu położyć na biurku ofertę z innej firmy?",
    "Czy napiwek to obowiązek, czy wyłącznie nagroda za wyjątkową obsługę?",
    "Czy szczerość wobec szefa zawsze się opłaca?",
    "Czy po ślubie wszystkie pieniądze powinny być wspólne?",
    "Czy przyjaźń z szefem to dobry pomysł, czy proszenie się o kłopoty?",
    "Czy kredyt na mieszkanie na 30 lat to rozsądna decyzja, czy dobrowolna pułapka?",
    "Lepiej zarabiać dużo w pracy, której się nie lubi, czy mało w pracy, którą się kocha?",
    "Czy pożyczanie pieniędzy znajomym zawsze kończy się źle?",
    "Czy mówisz znajomemu wprost, że jego biznesplan jest słaby, gdy chce w niego włożyć wszystkie oszczędności?",
    "Czy media społecznościowe zrobiły przyjaźniom więcej dobrego, czy złego?",
    "Czy dyplom studiów ma dziś jeszcze znaczenie przy szukaniu pracy?",
    "Co bardziej liczy się w karierze: znajomości czy umiejętności?",
    "Czy praca po godzinach to dowód zaangażowania, czy złej organizacji?",
    "Czy gotówka w kopercie to dobry prezent, czy dowód braku pomysłu?",
    "Czy w porządku jest odmówić przyjścia na wesele z powodu kosztów?",
    "Czy dzielenie rachunku w restauracji po równo jest uczciwe, gdy ktoś zamówił dwa razy więcej?",
    "Czy kupowanie podróbek markowych rzeczy to coś złego?",
    "Czy influencer to prawdziwy zawód?",
    "Czy lekkie podkoloryzowanie CV jest w porządku, jeśli brakujące umiejętności szybko nadrobisz?",
    "Czy psy powinny mieć wstęp do restauracji i biur?",
    "Czy aplikacje randkowe zabiły romantyzm?",
    "Czy ananas na pizzy to zbrodnia kulinarna?",
    "Czy wygrana na loterii częściej pomaga, czy szkodzi?",
    "Czy sztuczna inteligencja zabierze więcej ciekawej pracy, niż stworzy?",
    "Czy dzieci powinny dostawać kieszonkowe za obowiązki domowe?",
  ],
  generyczne: [
    "Jaki był Twój pierwszy zarobiony pieniądz i na co poszedł?",
    "Jaka praca z wakacji albo studiów najbardziej zapadła Ci w pamięć?",
    "Gdyby od jutra można było wykonywać dowolny zawód, co wybierasz?",
    "Jaka jest najdziwniejsza praca, o jakiej wiesz?",
    "Gdyby jutro na koncie pojawił się milion złotych, co robisz najpierw?",
    "Jakie miejsce na świecie jest na szczycie Twojej listy podróży?",
    "Jaką umiejętność chcesz opanować w ciągu najbliższego roku?",
    "Jaki prezent z ostatnich lat najbardziej Cię ucieszył?",
    "Kawa czy herbata — i dlaczego to jedyna słuszna odpowiedź?",
    "Gdyby Twoje życie było filmem, jaki miałoby tytuł?",
    "Jaką supermoc bierzesz do codziennej pracy?",
    "Jak wygląda Twoja idealna wolna niedziela?",
    "Jakie hobby chcesz zacząć, ale ciągle je odkładasz?",
    "Jaka piosenka zawsze poprawia Ci humor?",
    "Z jaką postacią z książki albo filmu chcesz zjeść kolację?",
    "Jaki film możesz oglądać w kółko?",
    "Jaki był Twój wymarzony zawód w dzieciństwie?",
    "Jaki jest Twój najlepszy patent na oszczędzanie pieniędzy?",
    "Jaka rada zawodowa naprawdę Ci się przydała?",
    "Góry czy morze — i dlaczego?",
    "Gdyby można było przenieść się w czasie na jeden dzień, jaki rok wybierasz?",
    "Jaki wynalazek ostatnich lat najbardziej ułatwił Ci życie?",
    "Bez jakiej aplikacji w telefonie nie wyobrażasz sobie dnia?",
    "Jak najchętniej świętujesz sukces?",
    "Jaką książkę polecasz każdemu, kto pyta?",
    "Jakie danie wychodzi Ci najlepiej?",
    "Gdyby można było przez rok mieszkać w dowolnym mieście na świecie, które wybierasz?",
    "Jaki był najzabawniejszy moment w Twojej pracy?",
    "Jaką firmę zakładasz, jeśli pieniądze nie grają roli?",
    "Jaka rzecz za mniej niż 100 zł okazała się Twoim najlepszym zakupem?",
  ],
  refleksyjne: [
    "Jakie osiągnięcie z ostatniego roku daje Ci najwięcej satysfakcji?",
    "Jaka decyzja zawodowa najbardziej zmieniła Twoje życie?",
    "Co dziś robisz inaczej niż dziesięć lat temu i cieszysz się z tej zmiany?",
    "Czego nauczyła Cię największa porażka w pracy?",
    "Gdyby pieniądze nie były problemem, jak wyglądałby Twój zwykły wtorek?",
    "Jaką radę dajesz sobie sprzed dziesięciu lat?",
    "Co dla Ciebie znaczy „wystarczająco dużo” pieniędzy?",
    "Jaki sukces cieszył Cię krócej, niż powinien?",
    "Kto najbardziej wpłynął na Twoją drogę zawodową i czy ta osoba o tym wie?",
    "Za co w swojej pracy czujesz dziś wdzięczność?",
    "Co musiałoby się zmienić, żeby praca dawała Ci pełną satysfakcję?",
    "Jakie marzenie z dzieciństwa wciąż jest dla Ciebie aktualne?",
    "Co w ostatnich miesiącach wyciągnęło Cię ze strefy komfortu?",
    "Czym chcesz się zajmować za dziesięć lat?",
    "Jaką cechę najbardziej cenisz u ludzi, z którymi pracujesz?",
    "Co oznacza dla Ciebie sukces i czy ta definicja zmieniła się z czasem?",
    "Jaki kompromis między pracą a życiem prywatnym jest dla Ciebie najtrudniejszy?",
    "Z czego trzeba zrezygnować, żeby osiągnąć to, czego naprawdę chcesz?",
    "W jakich chwilach czujesz, że jesteś na właściwym miejscu?",
    "Jaką swoją umiejętność uważasz za niedocenianą?",
    "Co chcesz, żeby ludzie mówili o Twojej pracy, gdy nie ma Cię w pokoju?",
    "Czego o pieniądzach nauczył Cię dom rodzinny?",
    "Jakie ryzyko chcesz jeszcze kiedyś podjąć?",
    "Co jest dla Ciebie prawdziwym docenieniem w pracy: pieniądze, słowa czy coś innego?",
    "Jaka przyjaźń najbardziej zmieniła Twoje spojrzenie na świat?",
    "Czym chcesz się podzielić z kimś, kto dopiero zaczyna karierę?",
    "Gdyby ten rok był rozdziałem książki, jaki nosiłby tytuł?",
    "Jakie przekonanie o pracy zmieniło Ci się w ostatnich latach?",
    "Jaki cel na przyszły rok możesz dziś powiedzieć na głos po raz pierwszy?",
    "Co w dorosłym życiu jest łatwiejsze, niż wydawało się w szkole?",
  ],
};

// Every starter question as a row to insert: category by category, in list order.
export function starterQuestionRows(): { category: QuestionCategory; text: string }[] {
  return (Object.keys(STARTER_QUESTIONS) as QuestionCategory[]).flatMap((category) =>
    STARTER_QUESTIONS[category].map((text) => ({ category, text })),
  );
}
