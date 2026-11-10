# Scenariusz pokazu dla restauracji

Pokaz przepływu 1–7 z PRD v2 („Przepływ zmiany”) na żywo, wyłącznie w aplikacji. Dane przygotowuje `npm run demo` (skrypt `scripts/demo.mjs`): jedna stała „Restauracja demo” z kontami właściciela, menedżera i kelnera, szablonem sali, menu i przykładową imprezą firmową „Impreza firmowa Acme (demo)” (80 fikcyjnych gości, dziś). Czas: ok. 30 minut na kroki 1–7, 10–15 minut na dodatki.

> **Dwie rzeczy wciąż czekają na decyzję (Otwarte pytania 2 i 3 w PRD v2):** prawdziwy plan sali i menu restauracji (sekcja „Prawdziwy plan i menu restauracji” niżej) oraz data pokazu.

## Przed pokazem

1. Lokalna baza (Docker): `npx supabase start -x gotrue,realtime,storage-api,imgproxy,studio,postgres-meta,mailpit,edge-runtime,logflare,vector,supavisor`, potem `npx supabase migration up` i `npm run env:local`.
2. Aplikacja: `AI_PROVIDER=mock npm run build`, potem `AI_PROVIDER=mock npm run preview -- --host` (`--host`: telefony i tablet w tej samej sieci Wi-Fi wchodzą na `http://<IP laptopa>:4321`; `AI_PROVIDER=mock`: tematy AI z atrapy, zero płatnych wywołań).
3. Dane: `BASE_URL=http://<IP laptopa>:4321 npm run demo` — wypisane linki mają wtedy adres z sieci lokalnej (bez `BASE_URL`: `http://localhost:4321`, dobre tylko dla laptopa). Skrypt kończy się blokiem „Restauracja demo gotowa”, kontami i linkami pogrupowanymi „Krok 1” … „Krok 7” i „Dodatki”. Zapisz go (np. `npm run demo > demo-linki.txt`): linki są sekretne, nie wklejaj ich publicznie.
4. Kiedy: impreza demo jest „dziś”, więc `npm run demo` uruchom rano w dniu pokazu (albo wieczorem dzień wcześniej, jeśli pokaz kończy się przed południem: sala kelnera i odczyt bez sieci działają do 12:00 następnego dnia). Każde uruchomienie tworzy wydarzenia od nowa — z NOWYMI linkami (stare przestają działać), więc po nim otwórz linki jeszcze raz na TV, tablecie i telefonach.
5. Przeglądarki: jedna przeglądarka trzyma jedną sesję panelu. Na laptopie przygotuj osobne profile (albo okna prywatne) dla administratora, właściciela i menedżera; kelner loguje się na telefonie.
6. Odczyt bez sieci (service worker) działa tylko na `https://` i `localhost`; na `http://<IP>` telefon i tablet trzymają stan tylko w otwartej karcie. Na pokaz to wystarczy.

## Urządzenia

| Urządzenie                 | Kto                                         | Co otwiera                                                                         |
| -------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Laptop (rzutnik)           | administrator, właściciel, menedżer, klient | panel `/logowanie`, link organizatora `/o/<klucz>`                                 |
| Telewizor albo drugi ekran | sala                                        | link TV `/tv/<klucz>` (cały lokal, sale na zmianę) albo TV jednej sali (`?sala=…`) |
| Tablet                     | kuchnia                                     | link tabletu `/r/<klucz>`                                                          |
| Telefon 1                  | gość                                        | link gościa `/g/<klucz>` (z `/o/<klucz>/linki`, po włączeniu „Dostęp gości”)       |
| Telefon 2                  | kelner                                      | panel (`kelner@demo.stolik`) → „Dziś na sali” albo link / kod kelnera na imprezę   |

## Konta demo

Logowanie: `/logowanie` (adres z wydruku `npm run demo`). Hasła są stałe i tylko lokalne.

| Rola                    | E-mail                   | Hasło               | Do czego                                                |
| ----------------------- | ------------------------ | ------------------- | ------------------------------------------------------- |
| administrator platformy | `admin@demo.stolik`      | `demo-admin-1`      | panel platformy: restauracje, właściciele, wsparcie     |
| właściciel              | `wlasciciel@demo.stolik` | `demo-wlasciciel-1` | zespół, marka, retencja danych gości, usuwanie wydarzeń |
| menedżer                | `menedzer@demo.stolik`   | `demo-menedzer-1`   | szablon sali, menu lokalu, wydarzenia, karta wydarzenia |
| kelner                  | `kelner@demo.stolik`     | `demo-kelner-1`     | „Dziś na sali” → „Obsługa sali”                         |

Ktoś zmienił hasło demo? Następne `npm run demo` ustawia je z powrotem przez aplikację („Nowy link” administratora albo właściciela). Dziesięć błędnych prób w 15 minut blokuje logowanie na to konto na kwadrans.

## Prawdziwy plan i menu restauracji

> **DO UZUPEŁNIENIA, gdy restauracja przyśle plan i menu (Otwarte pytanie 2).** Domyślnie demo ma wygenerowany plan z trzema salami (Sala Główna, Sala Kominkowa, Ogród zimowy; 14 stolików, 98 miejsc) i przykładowe menu (13 pozycji w 5 kursach).

Dwie drogi — obie przetrwają kolejne `npm run demo` (szablon i menu są zachowywane; wydarzenia powstają z nich od nowa):

- **W aplikacji (zalecane dla planu):** jako menedżer otwórz „Szablony sal” → „Cały lokal (szablon demo)”, wgraj zdjęcie planu („Plan lokalu”), przestaw i obróć stoliki na planie, popraw sale i kontury, sprawdź „Podgląd jak na TV”. Menu: strona restauracji → „Menu lokalu” → dodaj, popraw albo usuń pozycje. Potem `npm run demo` — impreza demo powstanie na prawdziwej sali i z prawdziwego menu.
- **Z plików:** `npm run demo -- --plan <zdjęcie planu> --venue <sala.json> --menu <menu.csv>` (ścieżki względem katalogu, z którego uruchamiasz polecenie; każda z tych opcji buduje szablon albo menu od nowa).
  - Plan: PNG, JPEG albo WebP, do 4 MB.
  - Sala: plik jak `scripts/demo-data/sala.json` — `rooms` (nazwa, opcjonalny `outline` = x, y, szerokość, wysokość jako ułamki planu 0–1) i `tables` (sala, nazwa, `shape` `round` albo `rectangular`, `seats` 2–30, `x`, `y` = środek stolika jako ułamki planu, opcjonalnie `rotation` w stopniach). Samo `--plan` zostawia stoliki z domyślnego pliku — przestaw je potem w edytorze szablonu.
  - Menu: plik jak `scripts/demo-data/menu.csv` (zapisany z arkusza jako CSV; UTF-8 albo polski Excel): `Nazwa;Kurs;Cena;W menu imprezy`, kurs po polsku albo angielsku (przystawka, zupa, danie główne, deser, napoje), cena jak „42,00”, ostatnia kolumna „tak” / „nie” (puste = tak) — pozycje „tak” trafiają do menu imprezy demo.
- Warunek: co najmniej 79 miejsc (80 gości, jedna osoba nieobecna) i stolik z 4 wolnymi miejscami obok siebie po jednej stronie dla czteroosobowej grupy. Za mała sala zatrzymuje demo z komunikatem, zanim cokolwiek zostanie usunięte.
- `npm run demo -- --name "<nazwa restauracji>"` zmienia nazwę restauracji demo (np. na nazwę lokalu, z którym rozmawiamy).

## Kroki 1–7

Każdy krok: kto, gdzie, co kliknąć, co powiedzieć, czego się spodziewać. Kroki 1, 2 i 4 pokazujemy na żywo na świeżych danych, a dalej wracamy do przygotowanej restauracji demo, w której wszystko jest już wypełnione.

### Krok 1 — Administrator platformy zakłada restaurację i daje właścicielowi link

- **Kto / gdzie:** administrator (`admin@demo.stolik`), `/panel/platforma` (link „Krok 1” z wydruku).
- **Klik:** „Nowa restauracja” → nazwa (np. nazwa restauracji gościa) i e-mail właściciela (wymyślony, np. `pokaz@demo.stolik`) → „Załóż restaurację”.
- **Pokaż:** jednorazowy link zaproszenia (widoczny tylko raz, ważny 7 dni) i „Kopiuj”; karta „Restauracja demo” z licznikami wydarzeń i zespołu.
- **Powiedz:** aplikacja nie wysyła e-maili — link przekazujemy sami (SMS, komunikator). Administrator nie widzi wydarzeń ani gości lokalu; wchodzi tylko przez „Wejdź jako wsparcie” z powodem, a każde wejście widzi właściciel w dzienniku.
- **Efekt:** nowa restauracja na liście (zostaje w lokalnej bazie; usunąć ją może tylko `npx supabase db reset`, w aplikacji jest „Wyłącz”).

### Krok 2 — Właściciel ustawia hasło i zaprasza menedżera i kelnera

- **Kto / gdzie:** właściciel nowej restauracji, link z kroku 1 otwarty w oknie prywatnym.
- **Klik:** hasło (co najmniej 10 znaków) dwa razy → panel → restauracja → „Zespół” → „Zaproś do zespołu”: e-mail, rola „menedżer” → „Zaproś” (to samo dla kelnera).
- **Pokaż:** jednorazowy link dla menedżera; zakres ról (właściciel zarządza wszystkimi, menedżer tylko kelnerami, kelner nie ma zespołu).
- **Dalej:** zaloguj się jako `wlasciciel@demo.stolik` (link „Krok 2”): restauracja demo ma już menedżera i kelnera, kolor i logo marki, „Prywatność danych gości” (30 dni) i „Dziennik wejść administratora”.

### Krok 3 — Menedżer raz wprowadza szablon sali

- **Kto / gdzie:** menedżer (`menedzer@demo.stolik`), strona restauracji → „Szablony sal” → „Cały lokal (szablon demo)” (link „Krok 3”).
- **Pokaż:** plan lokalu pod rysunkiem, trzy sale z konturami, stoliki okrągłe i prostokątne; przeciągnij stolik, obróć go uchwytem, „Podgląd jak na TV”. Wróć i pokaż „Menu lokalu” (dania w kursach z cenami).
- **Powiedz:** salę wprowadza się raz; każde wydarzenie dostaje jej kopię, a zmiana szablonu nie psuje gotowych wydarzeń („Zaktualizuj z szablonu” na karcie wydarzenia pokazuje najpierw, kto straciłby miejsce).

### Krok 4 — Menedżer tworzy wydarzenie z szablonu i kopiuje klientowi link (cel: poniżej 3 minut)

- **Kto / gdzie:** menedżer, strona restauracji → „Nowe wydarzenie”.
- **Klik:** „Nazwa wydarzenia” np. „Wigilia firmy Y”, data 12.12, „Przewidywana liczba gości” 80, „Sala z szablonu (opcjonalnie)” = „Cały lokal (szablon demo)” → „Utwórz wydarzenie”.
- **Pokaż:** karta wydarzenia: „Link dla klienta (organizatora)” → „Kopiuj” (to idzie do klienta), link TV, link tabletu obsługi, „Menu wydarzenia”, „Moduły wydarzenia”, „Kelnerzy na imprezę”.
- **Powiedz:** klient nie zakłada konta — dostaje jeden link. Lokal zostawia mu pracę („prowadzi klient”) albo przejmuje ją („Lokal prowadzi”).
- **Efekt:** puste wydarzenie z salą z szablonu. Do kroku 5 na żywo użyj go z listą gości niżej („Lista gości do wklejenia”), a pełny przebieg pokaż na „Impreza firmowa Acme (demo)” (link „Krok 4”).

### Krok 5 — Klient wkleja gości, rozsadza i publikuje; lokal widzi podgląd

- **Kto / gdzie:** klient — link organizatora (link „Krok 5”); na żywo nowe wydarzenie z kroku 4.
- **Klik (nowe wydarzenie):** „Goście” → „Import gości z dietami” → wklej blok z listą gości → „Sprawdź” (podgląd: wiersze, diety, problemy) → „Dodaj 80 gości”. „Rozsadzenie” → „Wylosuj projekt” → „Opublikuj na TV”.
- **Pokaż (impreza demo):** 80 gości, diety i alergie przy imionach, grupy (4, 3, 2, 2 osoby siedzą obok siebie), nieobecna Weronika bez miejsca, przypięta Pani Halinka; TV (link „Krok 6”) z imionami przy krzesłach — sale zmieniają się co 12 s.
- **Lokal:** karta wydarzenia → „Praca klienta” → podgląd rozsadzenia (link „podgląd lokalu”): tylko do odczytu, z banerem „prowadzi klient”.
- **Powiedz:** klient pracuje jak w v1, a lokal widzi wszystko na bieżąco bez dzwonienia.

### Krok 6 — Zamówienia, a w dniu imprezy TV, kelner i kuchnia

- **Zamówienia klienta:** „Zamówienia” (link „Krok 6”) — dania tylko z menu imprezy, cena i kurs z menu lokalu (klient ceny nie wpisuje), „na środek stołu” dla stolika.
- **Lokal prowadzi:** karta „Wigilia firmowa (demo)” — włączone „Lokal prowadzi”: menedżer dopisuje gości i zamówienia w panelu, a link klienta jest tylko do odczytu.
- **TV:** cały lokal z rotacją sal; drugi telewizor na jedną salę (link „jednej sali”).
- **Kelner (telefon 2):** `kelner@demo.stolik` → „Dziś na sali” → „Obsługa sali”: plan z wyszukiwarką gości, „Wydane” przy pozycji albo każda sztuka osobno, dokładka (cena z menu). Kelner sezonowy bez konta: „Kelnerzy na imprezę” na karcie wydarzenia → „Dodaj kelnera” → jednorazowy link albo kod na `/kelner` (demo wypisuje gotowy dla „Kuba (na imprezę)”).
- **Kuchnia (tablet):** link tabletu — „Do przygotowania” po kursach, „Diety i alergie” z liczbami, plan z zaznaczeniem, gdzie zanieść danie; wydane sztuki szare.
- **Gość (telefon 1):** na stronie „Linki gości i karteczki” włącz „Dostęp gości”, otwórz link gościa (albo zeskanuj QR z karteczki): jego stolik i sąsiedzi, cały plan z imionami, „Dotarło” przy jego daniach.

### Krok 7 — Po imprezie archiwum, a następne wydarzenie z tego samego szablonu w minutę

- **Klik:** karta wydarzenia z kroku 4 → „Przenieś do archiwum”; strona restauracji → zakładka „Archiwum” (link „Krok 7”): „Komunia Zosi (demo)” sprzed 60 dni ma „Dane gości usunięte” (termin lokalu: 30 dni po imprezie).
- **Klik:** „Nowe wydarzenie” jeszcze raz z „Cały lokal (szablon demo)” — gotowe w minutę; przykład: „Rocznica firmy (demo)” za 20 dni.
- **Powiedz:** archiwum nie wyłącza linków; dane gości znikają same po terminie lokalu, a przed tym menedżer może pobrać eksport (karta wydarzenia → „Dane gości i eksport”).

## Lista gości do wklejenia

Do kroku 5 na żywo (i do przygotowania demo na platformie): wklej w „Import gości z dietami” → „Sprawdź” → „Dodaj 80 gości”. Grupy, nieobecność i przypięcie ustawia się potem ręcznie.

```text
Imię;Dieta;Uwagi
Ania;;
Bartek;alergia na ryby i owoce morza;
Kasia;bez laktozy;bez mleka krowiego
Tomek;;
Magda;;
Piotrek;;
Ola;;
Kuba;;
Ewa;;
Marcin;;
Zosia;;
Michał;;
Basia;;
Grzesiek;;
Agnieszka;;
Paweł;;
Joasia;;
Krzysiek;;
Monika;;
Łukasz;;
Dorota;;
Wojtek;;
Natalia;;
Adam;;
Iwona;;
Rafał;;
Marta;;
Szymon;;
Ela;;
Darek;;
Justyna;wegetariańska;
Maciek;bez glutenu;celiakia — osobna deska
Karolina;wegańska, bez laktozy;
Jacek;;
Gosia Kowalska;alergia na orzechy;także orzeszki ziemne
Gosia Wiśniewska;;
Staszek „Szef”;Halal;
Pani Halinka;bez wieprzowiny;
Igor z IT;;bez cebuli
Weronika;wege;
Adam Nowicki;;
Beata Lis;wegetariańska;
Cezary Wróbel;;
Danuta Kaczmarek;;
Edward Zając;;
Filip Mazur;bez glutenu;
Grażyna Kubiak;;
Henryk Wilk;;
Irena Szymańska;bez laktozy;
Jan Kowalczyk;;
Kamil Pawlak;;
Lena Michalska;;
Mateusz Król;;
Nina Wieczorek;wegańska;
Oskar Jabłoński;;
Patrycja Dudek;;
Robert Adamczyk;;
Sylwia Górska;;
Tadeusz Sikora;bez wieprzowiny;
Urszula Baran;;
Wiktor Rutkowski;;
Zuzanna Ostrowska;alergia na orzechy;nawet śladowe ilości
Artur Malinowski;;
Bożena Pietrzak;;
Damian Walczak;;
Elżbieta Stępień;;
Franciszek Dąbrowski;;
Hubert Czarnecki;;
Izabela Sadowska;;
Jakub Zieliński;;
Klaudia Witkowska;;
Leszek Kołodziej;;
Marek Szulc;;
Olga Borkowska;;
Przemek Lewandowski;;
Renata Kalinowska;;
Sebastian Wójcik;;
Teresa Głowacka;;
Wojciech Jasiński;;
Zbigniew Laskowski;;
```

Grupy w imprezie demo: Magda, Piotrek, Zosia, Grzesiek · Adam Nowicki, Beata Lis, Cezary Wróbel · Kasia, Tomek · Gosia Kowalska, Igor z IT. Nieobecna: Weronika. Przypięta: Pani Halinka.

## Dodatki (jeśli jest czas)

Wszystkie na „Impreza firmowa Acme (demo)”; linki w bloku „Dodatki” wydruku.

- **Diety i import:** strona „Goście” — import z podglądem; kuchnia widzi „Diety i alergie” na tablecie, kelner przy miejscach; gość nigdy nie widzi diet (to dane o zdrowiu).
- **Potwierdzenia i wybór dania:** „Potwierdzenia” — termin do jutra 12:00, dania główne z menu imprezy, zliczenia (13 przyjdzie, 1 nie, reszta bez odpowiedzi); gość odpowiada na swoim telefonie nad miejscem przy stoliku.
- **Pub quiz:** „Pub quiz” — wyniki dwóch pytań na TV (1. Ania i Bartek, 3. Kasia); trzecie pytanie czeka: „Zadaj pytanie 3”, gość odpowiada na telefonie, „Zamknij i pokaż odpowiedź”, „Pokaż wyniki na TV”, na końcu „Zakończ quiz”. Moduł płatny: odblokował go administrator w trybie wsparcia (widać to w dzienniku właściciela).
- **Strzały i ranking:** „Strzały” — wpisz prawidłową kwotę 1500: podium, remis, trafione miejsca, „Czytaj od końca”.
- **Wydruki dla sali:** tablica „Znajdź swój stolik” (A4 / A3), karty stołów, winietki, lista dla obsługi z dietami.
- **Odczyt bez sieci:** tablet i kelner trzymają ostatni stan; strona odczytu z linku „odczyt bez sieci”.
- **Wsparcie administratora:** administrator → „Wejdź jako wsparcie” z powodem → widok tylko do odczytu; właściciel widzi wpisy w „Dziennik wejść administratora”.
- **Retencja i eksport:** „Prywatność danych gości” (właściciel ustawia termin), karta wydarzenia → „Dane gości i eksport” (JSON i dwa CSV); informacja o prywatności dla gościa (szkic do przeglądu prawnika).
- **Marka:** kolor i logo lokalu oraz nazwa i logo firmy klienta na telefonach gości, TV, tablecie i karteczkach — bez nazwy platformy.
- **Wyszukiwanie na mapie:** pole „Znajdź gościa na planie” na tablecie, u kelnera i na telefonie gościa.

## Między próbami

- `npm run demo` — odświeża restaurację demo: usuwa wszystkie jej wydarzenia (także utworzone na próbie) i inne szablony, tworzy pięć wydarzeń od nowa z szablonu; szablon, menu, zespół i marka zostają. Wszystkie linki wydarzeń są nowe.
- `npm run demo -- --reset` — dodatkowo buduje od nowa szablon i menu z plików (zmiany zrobione w aplikacji przepadają).
- `npx supabase db reset` — czyści całą LOKALNĄ bazę (wszystkie restauracje, także z prób i ze smoke); potem `npm run demo` od zera. Nigdy z `--linked`.
- Restauracje założone w kroku 1 zostają w bazie do `db reset`; nie przeszkadzają demo.

## Na platformie (później, krok użytkownika)

Na hostowanej platformie `npm run demo` NIE działa i nie powinien: odmawia każdej bazy poza lokalną, a stałe hasła demo nie mogą istnieć publicznie. Restaurację demo przygotowuje się tam ręcznie, przepływem 1–7:

1. Pierwsze konto administratora platformy: `npm run platform:admin -- <e-mail> --remote` (README, „Pierwsze uruchomienie”; tylko ten krok dotyka bazy).
2. Administrator zakłada restaurację demo z prawdziwym e-mailem właściciela; właściciel ustawia własne hasło i zaprasza menedżera i kelnera.
3. Menedżer wprowadza szablon sali (prawdziwy plan) i „Menu lokalu” (pozycje z `scripts/demo-data/menu.csv` albo prawdziwe menu).
4. Menedżer tworzy imprezę z szablonu; klient (albo menedżer w trybie „Lokal prowadzi”) wkleja listę gości z sekcji „Lista gości do wklejenia”, ustawia grupy, rozsadza i publikuje.
5. Płatne moduły (tematy AI, pub quiz) odblokowuje administrator w trybie wsparcia; koszt AI na platformie to Otwarte pytanie 8.

## Otwarte

- Data pokazu (Otwarte pytanie 3) — od niej zależy, kiedy uruchomić `npm run demo` (impreza demo jest „dziś”).
- Prawdziwy plan sali i menu restauracji (Otwarte pytanie 2) — sekcja „Prawdziwy plan i menu restauracji”.
- Nazwa produktu (Otwarte pytanie 1) — w panelu na razie nazwa robocza „Stolik”; goście, TV i tablet nie widzą żadnej nazwy platformy.
