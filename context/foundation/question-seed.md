# Startowa baza pytań

Do przeglądu przed kolacją (PRD, Open Question 4): 90 pytań w trzech kategoriach. Apka wstawia je przy tworzeniu wydarzenia, a organizator może je potem edytować, usuwać i dodawać własne na stronie „Pytania do rozmowy” (`/o/<klucz>/pytania`). Przycisk „Wczytaj bazę startową” dodaje tylko te pytania z tej listy, których brakuje w bazie.

Granice treści (decyzja z shape-notes): odważne i dyskusyjne, ale bez polityki partyjnej, religii, tematów zdrowotnych i osobistych przytyków; nikt nie jest pytany o własną pensję.

Źródło prawdy: `src/lib/questions/seed.ts`. Ten plik jest jego czytelną kopią — test `src/lib/questions/seed.test.ts` sprawdza, że obie listy są identyczne, więc zmiany wprowadzaj w obu miejscach naraz (jedno pytanie w linii, numerowane).

## Kontrowersyjne (30)

_odważne, dzielą stół na pół_

1. Czy jawne wynagrodzenia w firmach zrobiłyby więcej dobrego niż złego?
2. Czy praca zdalna na stałe to przyszłość, czy wygoda, która powoli psuje zespoły?
3. Czy lojalność wobec pracodawcy to dziś jeszcze cnota, czy już naiwność?
4. Czy zmiana pracy co dwa, trzy lata tylko dla wyższej pensji to rozsądek, czy brak charakteru?
5. Czy czterodniowy tydzień pracy przy tej samej pensji to realny plan, czy mrzonka?
6. Czy o podwyżkę lepiej grzecznie poprosić, czy od razu położyć na biurku ofertę z innej firmy?
7. Czy napiwek to obowiązek, czy wyłącznie nagroda za wyjątkową obsługę?
8. Czy szczerość wobec szefa zawsze się opłaca?
9. Czy po ślubie wszystkie pieniądze powinny być wspólne?
10. Czy przyjaźń z szefem to dobry pomysł, czy proszenie się o kłopoty?
11. Czy kredyt na mieszkanie na 30 lat to rozsądna decyzja, czy dobrowolna pułapka?
12. Lepiej zarabiać dużo w pracy, której się nie lubi, czy mało w pracy, którą się kocha?
13. Czy pożyczanie pieniędzy znajomym zawsze kończy się źle?
14. Czy mówisz znajomemu wprost, że jego biznesplan jest słaby, gdy chce w niego włożyć wszystkie oszczędności?
15. Czy media społecznościowe zrobiły przyjaźniom więcej dobrego, czy złego?
16. Czy dyplom studiów ma dziś jeszcze znaczenie przy szukaniu pracy?
17. Co bardziej liczy się w karierze: znajomości czy umiejętności?
18. Czy praca po godzinach to dowód zaangażowania, czy złej organizacji?
19. Czy gotówka w kopercie to dobry prezent, czy dowód braku pomysłu?
20. Czy w porządku jest odmówić przyjścia na wesele z powodu kosztów?
21. Czy dzielenie rachunku w restauracji po równo jest uczciwe, gdy ktoś zamówił dwa razy więcej?
22. Czy kupowanie podróbek markowych rzeczy to coś złego?
23. Czy influencer to prawdziwy zawód?
24. Czy lekkie podkoloryzowanie CV jest w porządku, jeśli brakujące umiejętności szybko nadrobisz?
25. Czy psy powinny mieć wstęp do restauracji i biur?
26. Czy aplikacje randkowe zabiły romantyzm?
27. Czy ananas na pizzy to zbrodnia kulinarna?
28. Czy wygrana na loterii częściej pomaga, czy szkodzi?
29. Czy sztuczna inteligencja zabierze więcej ciekawej pracy, niż stworzy?
30. Czy dzieci powinny dostawać kieszonkowe za obowiązki domowe?

## Generyczne (30)

_lekkie, dla każdego_

1. Jaki był Twój pierwszy zarobiony pieniądz i na co poszedł?
2. Jaka praca z wakacji albo studiów najbardziej zapadła Ci w pamięć?
3. Gdyby od jutra można było wykonywać dowolny zawód, co wybierasz?
4. Jaka jest najdziwniejsza praca, o jakiej wiesz?
5. Gdyby jutro na koncie pojawił się milion złotych, co robisz najpierw?
6. Jakie miejsce na świecie jest na szczycie Twojej listy podróży?
7. Jaką umiejętność chcesz opanować w ciągu najbliższego roku?
8. Jaki prezent z ostatnich lat najbardziej Cię ucieszył?
9. Kawa czy herbata — i dlaczego to jedyna słuszna odpowiedź?
10. Gdyby Twoje życie było filmem, jaki miałoby tytuł?
11. Jaką supermoc bierzesz do codziennej pracy?
12. Jak wygląda Twoja idealna wolna niedziela?
13. Jakie hobby chcesz zacząć, ale ciągle je odkładasz?
14. Jaka piosenka zawsze poprawia Ci humor?
15. Z jaką postacią z książki albo filmu chcesz zjeść kolację?
16. Jaki film możesz oglądać w kółko?
17. Jaki był Twój wymarzony zawód w dzieciństwie?
18. Jaki jest Twój najlepszy patent na oszczędzanie pieniędzy?
19. Jaka rada zawodowa naprawdę Ci się przydała?
20. Góry czy morze — i dlaczego?
21. Gdyby można było przenieść się w czasie na jeden dzień, jaki rok wybierasz?
22. Jaki wynalazek ostatnich lat najbardziej ułatwił Ci życie?
23. Bez jakiej aplikacji w telefonie nie wyobrażasz sobie dnia?
24. Jak najchętniej świętujesz sukces?
25. Jaką książkę polecasz każdemu, kto pyta?
26. Jakie danie wychodzi Ci najlepiej?
27. Gdyby można było przez rok mieszkać w dowolnym mieście na świecie, które wybierasz?
28. Jaki był najzabawniejszy moment w Twojej pracy?
29. Jaką firmę zakładasz, jeśli pieniądze nie grają roli?
30. Jaka rzecz za mniej niż 100 zł okazała się Twoim najlepszym zakupem?

## Refleksyjne (30)

_głębsze, o sobie_

1. Jakie osiągnięcie z ostatniego roku daje Ci najwięcej satysfakcji?
2. Jaka decyzja zawodowa najbardziej zmieniła Twoje życie?
3. Co dziś robisz inaczej niż dziesięć lat temu i cieszysz się z tej zmiany?
4. Czego nauczyła Cię największa porażka w pracy?
5. Gdyby pieniądze nie były problemem, jak wyglądałby Twój zwykły wtorek?
6. Jaką radę dajesz sobie sprzed dziesięciu lat?
7. Co dla Ciebie znaczy „wystarczająco dużo” pieniędzy?
8. Jaki sukces cieszył Cię krócej, niż powinien?
9. Kto najbardziej wpłynął na Twoją drogę zawodową i czy ta osoba o tym wie?
10. Za co w swojej pracy czujesz dziś wdzięczność?
11. Co musiałoby się zmienić, żeby praca dawała Ci pełną satysfakcję?
12. Jakie marzenie z dzieciństwa wciąż jest dla Ciebie aktualne?
13. Co w ostatnich miesiącach wyciągnęło Cię ze strefy komfortu?
14. Czym chcesz się zajmować za dziesięć lat?
15. Jaką cechę najbardziej cenisz u ludzi, z którymi pracujesz?
16. Co oznacza dla Ciebie sukces i czy ta definicja zmieniła się z czasem?
17. Jaki kompromis między pracą a życiem prywatnym jest dla Ciebie najtrudniejszy?
18. Z czego trzeba zrezygnować, żeby osiągnąć to, czego naprawdę chcesz?
19. W jakich chwilach czujesz, że jesteś na właściwym miejscu?
20. Jaką swoją umiejętność uważasz za niedocenianą?
21. Co chcesz, żeby ludzie mówili o Twojej pracy, gdy nie ma Cię w pokoju?
22. Czego o pieniądzach nauczył Cię dom rodzinny?
23. Jakie ryzyko chcesz jeszcze kiedyś podjąć?
24. Co jest dla Ciebie prawdziwym docenieniem w pracy: pieniądze, słowa czy coś innego?
25. Jaka przyjaźń najbardziej zmieniła Twoje spojrzenie na świat?
26. Czym chcesz się podzielić z kimś, kto dopiero zaczyna karierę?
27. Gdyby ten rok był rozdziałem książki, jaki nosiłby tytuł?
28. Jakie przekonanie o pracy zmieniło Ci się w ostatnich latach?
29. Jaki cel na przyszły rok możesz dziś powiedzieć na głos po raz pierwszy?
30. Co w dorosłym życiu jest łatwiejsze, niż wydawało się w szkole?
