---
project: kolacja-podwyzkowa
version: 2
status: draft
created: 2026-11-09
context_type: brownfield
product_type: web-app
target_scale:
  users: large
  qps: low-medium
  data_volume: small
timeline_budget:
  delivery_weeks: 2
  hard_deadline: null
  after_hours_only: false
---

# kolacja-podwyzkowa — PRD v2: platforma dla restauracji

Poprzednia wersja (v1, jedna kolacja 2026-11-08): `context/foundation/prd.md`. Źródło tej wersji: `context/foundation/shape-notes.md` (sesja 2026-11-09).

## Current System Overview

- **Cel:** aplikacja webowa, która prowadzi jedną kolację: jeden wspólny stan wieczoru i osobne widoki dla organizatora, TV, gości i obsługi restauracji.
- **Architektura:** jedna aplikacja renderowana na serwerze (Astro 7 SSR, standalone Node) z interaktywnymi wyspami React 19 i Tailwind 4. Działa jako jedna funkcja AWS Lambda za Function URL. Postgres (Supabase) jest dostępny wyłącznie z serwera. Claude przez Anthropic API, domyślnie atrapa.
- **Model danych dziś:** jedno wydarzenie na wdrożenie.
- **Dostęp:** wyłącznie niezgadywalne klucze w linkach, bez kont: organizator `/o/<klucz>`, TV `/tv/<klucz>`, gość `/g/<klucz>` (karteczka z QR), obsługa restauracji `/r/<klucz>`.
- **Użytkownicy dziś:** jeden organizator (użytkownik), ok. 36–40 gości z telefonami, jeden TV, obsługa restauracji z linkiem `/r/`. Wszystko sprawdzone na kolacji 2026-11-08 (36 gości, 4 stoły).
- **Funkcje:**
  - goście i grupy;
  - plan sali z rysunkiem stołów;
  - ręczne rozsadzanie i losowanie bez powtórek sąsiadów;
  - publikacja na TV i telefony w ≤ 5 s;
  - zamówienia z widokiem dla kuchni i obsługi i serwowaniem per miejsce, a goście oznaczają „Dotarło”;
  - napoje do rachunku;
  - gra w zgadywanie rachunku z rankingiem;
  - baza pytań i tematy AI z limitami;
  - „Pokaż na TV”;
  - odczyt bez sieci u organizatora;
  - reset danych;
  - PL/EN.

## Problem Statement & Motivation

Restauracja, w której odbyła się kolacja 2026-11-08, była zachwycona dwiema rzeczami:
- **zamówieniami i serwowaniem:** kuchnia i kelnerzy widzieli, kto co zamówił i gdzie siedzi;
- **rozsadzeniem na planie z TV.**

Lokal często robi duże imprezy: firmowe i wigilie oraz rodzinne (komunie, urodziny). Chce tego narzędzia do własnego użytku.

**Obecne obejście i jego koszt:** lokal ustala wszystko z klientem mailem i telefonem, a listy gości i plany stołów prowadzi w Excelu i Wordzie i drukuje.

**Luka:** aplikacja obsługuje jedną kolację na wdrożenie, nie ma kont, panelu lokalu ani zasobów lokalu do ponownego użycia, a treści są wpisane pod „kolację podwyżkową”. Zmiana robi z niej platformę dla wielu restauracji. Lokal zakłada wydarzenia, przekazuje klientowi link do rozsadzenia gości i prowadzi zamówienia i obsługę w dniu imprezy. Wszystko, co działało na kolacji, zostaje.

**Dlaczego teraz:** zachwyt restauracji po kolacji 2026-11-08 i demo z restauracją za ok. 2 tygodnie (data nieustalona).

**Przepływ zmiany (1–7),** który ma zadziałać na demo:
1. Administrator platformy zakłada restaurację i daje właścicielowi link zaproszenia.
2. Właściciel ustawia hasło i zaprasza menedżera i kelnera.
3. Menedżer raz wprowadza szablon sali (plan, sale, stoły).
4. Menedżer tworzy wydarzenie (np. „Wigilia firmy Y, 12.12, 80 osób”) z szablonu i kopiuje klientowi link organizatora.
5. Klient wkleja gości, rozsadza i publikuje (jak v1). Lokal widzi to w podglądzie.
6. Zamówienia są wpisane (przez klienta albo menedżera w trybie „lokal prowadzi”). W dniu imprezy TV pokazuje rozsadzenie, kelner na swoim koncie oznacza wydane, a kuchnia patrzy na tablet `/r/`.
7. Po imprezie wydarzenie idzie do archiwum, a następne powstaje z tego samego szablonu w minutę.

## User & Persona

**Primary: koordynator imprez lokalu.** Pracownik restauracji. Zakłada wydarzenia, uzgadnia je z klientem i prowadzi obsługę w dniu imprezy (zamówienia, serwowanie, TV). Dziś pracuje na mailach, telefonie, Excelu i wydrukach. Nowy użytkownik: w v1 restauracja miała tylko link tylko do odczytu.

### Secondary persona

- **Klient zamawiający imprezę** (firma, rodzina). Dostaje od lokalu link organizatora, wpisuje gości, tworzy grupy, rozsadza i prowadzi atrakcje wieczoru, tak jak organizator kolacji w v1. Istniejący użytkownik (organizator v1), którego zakres zależy teraz od tego, co udostępni lokal.
- **Właściciel lokalu.** Zarządza zespołem i całą restauracją.
- **Administrator platformy (użytkownik).** Zakłada restauracje i zaprasza ich właścicieli.
- **Goście imprezy:** bez zmian względem v1, w obrębie swojego wydarzenia.

## Success Criteria

### Primary
- Przepływ 1–7 przechodzi na żywo na demo wyłącznie w aplikacji, bez komend i ręcznych zmian w bazie (poza pierwszym kontem administratora platformy).
- Od „Nowe wydarzenie” z szablonu do skopiowanego linku dla klienta mijają mniej niż 3 minuty.
- Restauracja prowadzi w aplikacji swoją pierwszą prawdziwą imprezę, bez Excela w dniu imprezy.

### Secondary
- Po demo restauracja deklaruje użycie na kolejnych imprezach i gotowość do płacenia.
- Druga restauracja działa na platformie bez zmian w kodzie.
- W dniu imprezy kuchnia i kelnerzy nie używają wydrukowanej listy zamówień.
- Klient przygotowuje gości i rozsadzenie bez pomocy lokalu.

### Guardrails
- **Izolacja danych:** żadna osoba ani link nie zobaczy danych innej restauracji ani innego wydarzenia (wyjątek: wgląd administratora platformy).
- **v1 bez regresji:** prywatność strzałów, publikacja na TV i telefony w ≤ 5 s, odczyt bez sieci, karteczki QR i PL/EN działają jak na kolacji 2026-11-08.
- **Linki lokalu tylko do odczytu:** żadna zmiana po stronie lokalu bez zalogowania; dane gości nigdy nie trafiają do AI.
- **Utrata hasła nie blokuje lokalu:** zawsze jest droga odzyskania dostępu (link resetu od właściciela lub menedżera albo od administratora platformy), bez ręcznych zmian w bazie.

Koszt czasu: dostarczenie całego zakresu M-2 (wszystko must-have) w ok. 2 tygodnie wymaga stałego zaangażowania. Użytkownik przyjął to 2026-11-09.

## User Stories

US-01..US-04 z PRD v1 obowiązują dalej w obrębie jednego wydarzenia, z klientem w roli organizatora.

### US-05: Lokal wchodzi na platformę

- **Given** administrator platformy i restauracja, która chce korzystać z narzędzia
- **When** administrator zakłada restaurację i przekazuje właścicielowi link zaproszenia
- **Then** właściciel ustawia hasło, loguje się i zaprasza menedżera, a menedżer zaprasza kelnera (albo dodaje kelnera „na imprezę”)

Wcześniej (v1): nie było restauracji ani kont; wydarzenie zakładał każdy, kto pierwszy wszedł na stronę główną.

#### Acceptance Criteria
- Link zaproszenia działa tylko raz i wygasa.
- Właściciel widzi w dzienniku każde wejście administratora platformy w dane lokalu.
- Zapomniane hasło da się odzyskać linkiem resetu od właściciela lub menedżera (albo od administratora platformy dla właściciela), bez ręcznych zmian w bazie.

### US-06: Wydarzenie z szablonu dla klienta

- **Given** menedżer z zapisanym szablonem sali i katalogiem menu
- **When** tworzy wydarzenie (nazwa, data, liczba gości) z szablonu, ustala dostępne menu i moduły i kopiuje link klienta
- **Then** klient otwiera wydarzenie z gotową salą, dostępnym menu i dostępnymi modułami

Wcześniej (v1): jedno wydarzenie, salę organizator rysował sam.

#### Acceptance Criteria
- Od „Nowe wydarzenie” do skopiowanego linku klienta mijają mniej niż 3 minuty.
- Wymiana linku (klient, TV, tablet) wymaga potwierdzenia, które mówi, kogo odetnie.
- Zmiana szablonu nie zmienia istniejących wydarzeń; „zaktualizuj z szablonu” jest osobną akcją.

### US-07: Klient przygotowuje imprezę

- **Given** klient z linkiem organizatora
- **When** importuje gości z dietami, tworzy grupy, rozsadza, wybiera zamówienia z menu lokalu i włącza dostępne gry i zabawy
- **Then** lokal widzi to wszystko w podglądzie, a ceny pochodzą z cennika lokalu

Wcześniej (v1): organizator sam wpisywał dania i ceny, nie było diet ani modułów.

#### Acceptance Criteria
- Klient widzi ceny, ale ich nie zmienia.
- Gdy lokal włączy „lokal prowadzi”, klient tylko podgląda, a edytuje personel.
- Klient może zresetować próby (rozsadzenia i ich historię, strzały, quiz) bez gości, sali i zamówień; pełny reset ma tylko lokal.
- Płatne moduły są widoczne jako niedostępne, dopóki administrator platformy ich nie odblokuje.

### US-08: Dzień imprezy

- **Given** wydarzenie z opublikowanym rozsadzeniem i zamówieniami
- **When** goście przychodzą i impreza trwa
- **Then** TV przy wejściu pokazuje lokal (z rotacją sal, gdy imiona byłyby za małe), gość wyszukuje kogoś na mapie, kelner oznacza wydane i dopisuje dokładki, a kuchnia na tablecie `/r/` widzi kursy, diety i serwowanie tylko do odczytu

Wcześniej (v1): jeden TV z całym planem, wydane oznaczał organizator lub gość, tablet nie miał diet ani kursów.

#### Acceptance Criteria
- Publikacja rozkładu dociera na TV i do 150 telefonów w ≤ 5 s.
- Impreza trwająca po północy nadal jest na liście „dziś” kelnera.
- Link tabletu ani TV nie pozwala niczego zmienić.

### US-09: Po imprezie i następna

- **Given** zakończona impreza
- **When** menedżer archiwizuje ją i tworzy następne wydarzenie z tego samego szablonu
- **Then** nowe wydarzenie ma salę z szablonu i żadnych gości ani zamówień poprzedniego

#### Acceptance Criteria
- Dane gości znikają N dni po imprezie (domyślnie 30, ustawia właściciel).
- Menedżer może przed usunięciem wyeksportować dane wydarzenia.
- Właściciel może trwale usunąć wydarzenie wcześniej.

### US-10: Izolacja restauracji i wydarzeń

- **Given** dwie restauracje, każda z wydarzeniami, personelem i linkami
- **When** personel albo link jednej z nich próbuje otworzyć dane drugiej, także przez podmianę numeru wydarzenia w adresie
- **Then** dostaje tę samą odmowę bez żadnych danych

#### Acceptance Criteria
- Odmowa dla cudzego, nieznanego i usuniętego wydarzenia jest identyczna.
- Wyjątkiem jest tylko administrator platformy, a jego wejście trafia do dziennika.

## Scope of Change

Wszystkie pozycje `[new]` i `[modified]` mają priorytet must-have (decyzja użytkownika, zakres ok. 2 tygodnie). Numeracja FR ciągnie się od PRD v1.

### Zachowane z v1 (w obrębie jednego wydarzenia; klient w roli organizatora)
- [preserved] FR-001..FR-020: jak w PRD v1 (goście i grupy, nieobecni, przypięcia, plan i stoliki, ręczne sadzanie, TV, losowanie bez powtórek i publikacja, karteczki i linki gości, włącznik dostępu gości, widok miejsca gościa, pytania, tematy AI, strzały i ranking). Priority: must-have. Wyjątki są opisane w FR-027, FR-031 i FR-033.
  > Socrates: Preserved capability; no challenge (v1, sprawdzone na kolacji 2026-11-08).

### Platforma, konta i zespół
- [new] FR-021: Administrator platformy can założyć restaurację z jednorazowym linkiem zaproszenia dla właściciela, widzieć listę restauracji z licznikami, wyłączać i włączać restaurację oraz wejść w dane każdej restauracji (wsparcie); każde jego wejście w dane lokalu jest zapisane i widoczne dla właściciela lokalu. Priority: must-have
  > Socrates: Counter-argument considered: "Pełny wgląd czyni administratora platformy podmiotem przetwarzającym dane gości wszystkich lokali (RODO)." Resolution: wgląd zostaje, ale z dziennikiem wejść (kto, kiedy, co), który widzi właściciel lokalu.
- [new] FR-022: Zaproszona osoba can ustawić hasło i logować się e-mailem i hasłem; sesja trwa 30 dni na urządzeniu; can się wylogować i zmienić hasło, co zamyka jej inne sesje. Priority: must-have
  > Socrates: Counter-arguments considered: wspólny tablet kelnerów przy 30-dniowej sesji; administrator platformy jako wąskie gardło resetu haseł bez e-maili. Resolution: bez zastrzeżeń, FR zostaje.
- [new] FR-023: Właściciel can zapraszać menedżerów i kelnerów, a menedżer kelnerów; obaj w swoim zakresie can zmieniać role, usuwać osoby z zespołu i generować jednorazowy link resetu hasła; menedżer can też dodać kelnera „na imprezę” (imię + jednorazowy link lub kod logowania ważny do końca okna imprezy, bez hasła). Priority: must-have
  > Socrates: Counter-argument considered: "Kelnerzy są sezonowi; zaproszenie i hasło dla każdego przed każdą imprezą to tarcie." Resolution: dostęp kelnera „na imprezę” obok zwykłych kont stałego personelu.

### Wydarzenia lokalu
- [new] FR-024: Menedżer can utworzyć wydarzenie (nazwa, data, przewidywana liczba gości) od zera lub z szablonu sali, przeglądać wydarzenia nadchodzące, minione i archiwum oraz archiwizować i przywracać wydarzenia; właściciel can trwale usunąć wydarzenie. Priority: must-have
  > Socrates: Counter-arguments considered: domyślny widok „Dziś”; usunięcie na żądanie klienta pod nieobecność właściciela; kopia wydarzenia „jak w zeszłym roku”. Resolution: bez zastrzeżeń, FR zostaje.
- [modified] FR-025: Menedżer can skopiować linki wydarzenia (klient, TV, tablet obsługi) i wymienić każdy z nich na nowy, po potwierdzeniu, które mówi, kogo wymiana odetnie. Priority: must-have. Było (v1): wymiana tylko linku restauracji.
  > Socrates: Counter-argument considered: "Wymiana linku klienta w trakcie przygotowań odcina go bez ostrzeżenia." Resolution: wymiana wymaga potwierdzenia z informacją, kogo dotknie.
- [new] FR-026: Menedżer can włączyć w wydarzeniu przełącznik „lokal prowadzi”, który daje personelowi edycję wszystkiego, co robi klient, a klientowi zostawia podgląd; bez przełącznika edytuje klient, a personel ma podgląd. Priority: must-have
  > Socrates: Counter-argument considered: "Klient i lokal edytujący naraz nadpisują sobie zmiany." Resolution (użytkownik): „jak lokal prowadzi, to klient nie edytuje”.
- [modified] FR-027: Klient can przygotować i poprowadzić swoje wydarzenie jak organizator v1, łącznie z zamówieniami (pozycje z menu udostępnionego przez lokal), napojami i rachunkiem; widzi ceny, ale ich nie zmienia; korzysta z gier i zabaw włączonych w wydarzeniu. Priority: must-have. Było (v1): organizator wpisywał dowolne dania i ceny, wszystkie funkcje zawsze włączone.
  > Socrates: Counter-arguments considered: klient zmieniający ceny lokalu; zmiany zamówień po terminie kuchni. Resolution (użytkownik): „klient widzi ceny, ale nie zmienia ich”.
- [modified] FR-028: Menedżer can w trybie „lokal prowadzi” prowadzić zamówienia, napoje i rachunek za klienta; pełny reset danych wydarzenia i koszty AI są dostępne tylko w panelu lokalu; klient can zresetować próby (rozsadzenia i ich historię, strzały, quiz) bez gości, sali i zamówień. Priority: must-have. Było (v1): wszystko, w tym pełny reset, robił organizator.
  > Socrates: Counter-argument considered: "Przed imprezą klient chce sam wyczyścić próbne rozsadzenia i strzały." Resolution: częściowy reset prób dla klienta; pełny reset tylko lokal.
- [new] FR-029: Kelner can zobaczyć wydarzenia trwające dziś (okno imprezy obejmuje czas po północy, do południa dnia następnego), z planem z gośćmi, zamówieniami z cenami i rachunkiem, oznaczać wydane sztuki i dopisywać zamówienia na sali (dokładki, dodatkowe napoje). Priority: must-have
  > Socrates: Counter-arguments considered: impreza po północy znika z „dziś”; kelner nie może dopisać dokładki. Resolution: oba przyjęte, czyli okno po północy i dopisywanie przez kelnera.

### Zasoby, wygląd i skala
- [new] FR-030: Menedżer can zapisać układ sali (plan, sale, stoliki, rysunek) jako szablon lokalu, także z istniejącego wydarzenia, edytować szablon i tworzyć z niego wydarzenia; zmiana szablonu nie zmienia istniejących wydarzeń, ale menedżer can zaktualizować układ wydarzenia z szablonu. Priority: must-have
  > Socrates: Counter-argument considered: "Stół dostawiony na stałe nie dociera do zaplanowanych wydarzeń." Resolution: akcja „zaktualizuj z szablonu” dla wydarzenia.
- [new] FR-031: Gry i zabawy are opcjonalnymi modułami per wydarzenie: pytania, tematy AI (domyślnie wyłączone), gra w zgadywanie rachunku (domyślnie wyłączona), losowanie miejsc, „Pokaż na TV”, pub quiz. Lokal oznacza, które moduły mogą być dostępne (np. zależnie od sprzętu, jak rzutnik), klient włącza je i wyłącza z dostępnych, a moduły płatne odblokowuje dla wydarzenia administrator platformy (ręcznie, np. po przelewie). Wyłączony moduł znika u klienta, gości i na TV. Priority: must-have
  > Socrates: Counter-argument considered: kto włącza moduły. Resolution (użytkownik): „lokal oznacza, które mogą być dostępne (np. mogą mieć rzutnik albo nie), ale klient (który normalnie używa apki darmowo) może zapłacić mi za dodatkowe gry i zabawy”; w M-2 odblokowanie ręczne, płatności online później.
- [new] [modified] FR-032: Właściciel can ustawić nazwę, logo i kolor lokalu, a klient can dodać nazwę i logo swojej firmy lub wydarzenia; widać je na telefonach gości, TV, karteczkach i w panelu. Gość nie widzi nazwy platformy; „Kolacja podwyżkowa” znika z produktu. Priority: must-have. Było (v1): nazwa „Kolacja podwyżkowa” wszędzie.
  > Socrates: Counter-arguments considered: firma-klient chce swojego logo na imprezie; nazwa platformy jest zbędna u gościa. Resolution: oba przyjęte, czyli branding wydarzenia obok brandingu lokalu i white-label u gościa.
- [modified] FR-033: Klient can prowadzić wydarzenie do 150 gości, ze stołami do 30 miejsc i ok. 60 stolikami. Priority: must-have. Było (v1): 100 gości, 20 miejsc, 40 stolików.
  > Socrates: Counter-arguments considered: 150 to za mało dla dużej firmy; 30 imion przy długim stole może być nieczytelne. Resolution: bez zastrzeżeń, FR zostaje.
- [new] FR-034: TV przy wejściu can pokazać cały lokal i, gdy imiona byłyby nieczytelne, samo przechodzić po salach co kilka sekund; klient i lokal can też przypiąć TV do jednej sali. Priority: must-have
  > Socrates: Counter-argument considered: "Jeden TV przy wejściu z całym lokalem jest ważniejszy niż TV per sala." Resolution: oba tryby, czyli rotacja sal na TV przy wejściu oraz przypięcie TV do sali.
- [new] FR-048: Każdy, kto widzi pełną mapę sali na urządzeniu z klawiaturą (gość na telefonie, klient, personel, tablet obsługi), can wyszukać gościa po imieniu, a mapa podświetla jego miejsce; TV tego nie ma. Priority: must-have
  > Socrates: Counter-argument considered: "Na TV nie ma klawiatury." Resolution: wyszukiwanie wszędzie poza TV.

### Funkcje restauracyjne
- [new] FR-035: Klient (albo lokal w trybie „lokal prowadzi”) can zaimportować gości z pliku CSV lub wklejki z arkusza (nazwa, dieta, uwagi) z podglądem przed zapisem; grupy tworzy się po imporcie na liście. Priority: must-have
  > Socrates: Counter-argument considered: "Kolumna grupa myli klientów." Resolution: import bez kolumny grupy; grupowanie na liście po imporcie.
- [new] FR-036: Klient can oznaczyć dietę lub alergię gościa, a kuchnia i kelnerzy can widzieć ją przy miejscu gościa i w zliczeniach. Priority: must-have
  > Socrates: Counter-arguments considered: alergia to dana o zdrowiu (RODO art. 9); dieta mogłaby wynikać z wybranego dania. Resolution: bez zastrzeżeń, FR zostaje.
- [new] FR-037: Menedżer can prowadzić katalog dań i napojów lokalu z cenami i kursem (przystawka, zupa, danie główne, deser, napoje) i ustalić per wydarzenie, czy dostępne jest pełne menu, czy okrojone; klient wybiera pozycje zamówień z tego, co dostępne; lista dla kuchni jest pogrupowana po kursach. Priority: must-have
  > Socrates: Counter-argument considered: imprezy sprzedawane jako pakiety. Resolution (użytkownik): „ma być dostępne pełne menu albo jakoś okrojone, to ustala restauracja, klient potem wybiera z tego, co jest dostępne”.
- [new] FR-038: Klient i lokal can wydrukować tablicę „znajdź swój stolik”, karty stołów, winietki (z wyborem formatu) i listę dla obsługi przy stole (z dietami). Priority: must-have
  > Socrates: Counter-argument considered: "Winietki drukuje się na kartonikach konkretnego formatu." Resolution: wybór formatu i rozmiaru winietek.
- [new] FR-039: Gość can przed imprezą potwierdzić obecność i wybrać danie z opcji ustawionych dla wydarzenia, do terminu; klient can wpisać wybór za gościa; klient i lokal can widzieć zliczenia. Priority: must-have
  > Socrates: Counter-arguments considered: goście dostają linki dopiero na stole; kuchnia woli wybory zebrane przez klienta. Resolution: oba tory, czyli gość wybiera z linku, jeśli go dostał, a klient może wpisać za gościa.
- [new] FR-040: Właściciel can ustawić, po ilu dniach od imprezy dane gości są usuwane (domyślnie 30); menedżer can wyeksportować dane wydarzenia; gość can przeczytać informację o prywatności. Priority: must-have
  > Socrates: Counter-arguments considered: firmy wracające co roku tracą „jak w zeszłym roku”; eksport wynosi dane poza platformę. Resolution: bez zastrzeżeń, FR zostaje.
- [new] FR-049: Klient can przygotować pub quiz (np. o jubilacie) i poprowadzić go na TV, a goście odpowiadają na telefonach. Priority: must-have
  > Socrates: Counter-arguments considered: ranking na TV jako wyjątek od zasady v1; rozmiar modułu; drużyny przy stołach. Resolution: bez zastrzeżeń, FR zostaje.

### Produkt
- [new] FR-041: Odwiedzający can zobaczyć publiczną stronę produktu z logowaniem oraz szkice regulaminu i polityki prywatności. Priority: must-have
  > Socrates: Counter-argument considered: "Zbędna przed demo, bo demo prowadzi użytkownik." Resolution: zostaje w M-2, ale na końcu kolejki, po demo.
- [new] FR-042: Administrator platformy can przygotować restaurację demo na prawdziwym planie sali i menu tej restauracji, z kontem, szablonem sali i przykładową imprezą firmową (fikcyjni goście, rozsadzenie, zamówienia). Priority: must-have
  > Socrates: Counter-argument considered: "Demo na ich prawdziwej sali przekona bardziej niż fikcja." Resolution: demo na ich planie i menu (użytkownik je dostarczy); goście fikcyjni.

### Zachowane po v1 (funkcje dodane po PRD v1)
- [preserved] FR-043: Kuchnia i obsługa can widzieć na tablecie (`/r/`) plan z opublikowanym rozsadzeniem, listę do przygotowania i serwowanie per miejsce, tylko do odczytu. Priority: must-have
  > Socrates: Preserved capability; no challenge (zachowana z v1/po v1).
- [preserved] FR-044: Gość can oznaczać „Dotarło” przy swoich daniach i daniach na środek stołu. Priority: must-have
  > Socrates: Preserved capability; no challenge (zachowana z v1/po v1).
- [preserved] FR-045: Klient can pokazać na TV pytanie, temat AI albo wylosowaną osobę. Priority: must-have
  > Socrates: Preserved capability; no challenge (zachowana z v1/po v1).
- [preserved] FR-046: TV i telefon gościa can pokazać rysunek sali z imionami przy krzesłach, a klient can ułożyć ten rysunek w edytorze (także z propozycji AI ze zdjęcia planu). Priority: must-have
  > Socrates: Preserved capability; no challenge (zachowana z v1/po v1).
- [preserved] FR-047: Klient can bez sieci zobaczyć ostatni opublikowany rozkład i ranking strzałów. Priority: must-have
  > Socrates: Preserved capability; no challenge (zachowana z v1/po v1).

### Removed
- [removed] Zakładanie wydarzenia przez każdego, kto pierwszy wejdzie na stronę główną. Wydarzenia zakłada teraz personel lokalu (FR-024).
- [removed] Napis „Kolacja podwyżkowa” w produkcie (FR-032).

## Constraints & Compatibility

- **Zgodność adresów i linków.** Formaty `/o/<klucz>`, `/tv/<klucz>`, `/g/<klucz>`, `/r/<klucz>` i postać kluczy zostają. Linki gości i karteczki z QR działają jak w v1, w obrębie swojego wydarzenia.
- **Dane.** Platforma startuje w nowym, osobnym środowisku danych. Dane kolacji 2026-11-08 zostają nietkniętym archiwum (żadnych zmian M-2 na nich). Zmiany struktury danych muszą jednak zachować dane istniejącego wydarzenia w środowiskach lokalnych i testowych: wydarzenie 1 trafia do restauracji „domyślnej”.
- **Integracje.** Dostawca AI (tematy, odczyt planu ze zdjęcia) dostaje wyłącznie dane sali i kategorie, nigdy dane gości. Testy działają na atrapie, bez płatnych wywołań.
- **Środowisko uruchomieniowe.** Ograniczenia obecnego hostingu: ok. 6 MB na żądanie i odpowiedź, do 30 s na żądanie, brak zapisu na dysk w trakcie działania, jedno żądanie na instancję. Kształtują np. limit obrazu planu i logo.
- **Zachowane zachowania v1** (Guardrails):
  - prywatność strzałów (ranking tylko u prowadzącego);
  - publikacja ≤ 5 s;
  - odczyt bez sieci u klienta;
  - karteczki QR;
  - PL/EN;
  - reset (teraz: pełny dla lokalu, prób dla klienta);
  - losowanie z twardymi regułami.
- **Wdrożenia** robi wyłącznie użytkownik. Zmiany struktury danych zawsze trafiają do środowiska przed kodem, który ich potrzebuje.

### Wymagania jakościowe (NFR)

Zachowane z v1 (każde w obrębie wydarzenia): NFR-001, NFR-003, NFR-004, NFR-008, NFR-009, a także NFR-010 w wersji PL/EN wprowadzonej po v1. Zmienione: NFR-002, NFR-005, NFR-006 i NFR-007, opisane niżej.

- NFR-011: 95% akcji gościa jest potwierdzonych w ≤ 1 s; publikacja rozkładu dociera na TV i otwarte telefony w ≤ 5 s; projekt losowania jest gotowy w ≤ 3 s. Dotyczy wydarzeń do 150 gości i do 200 telefonów naraz (zastępuje cele 60 gości z NFR-002 i NFR-007).
- NFR-012: Żadna osoba ani link nie widzi danych innej restauracji ani innego wydarzenia. Odmowa dla cudzego, nieznanego i usuniętego zasobu jest identyczna. Jedynym wyjątkiem jest administrator platformy, a jego wejścia trafiają do dziennika widocznego dla lokalu.
- NFR-013: Kilka pomyłek w haśle z rzędu nie blokuje pracownika, a masowe zgadywanie haseł zostaje odrzucone, zanim cokolwiek ujawni.
- NFR-014: Każdy tekst nowych widoków (panel lokalu, panel platformy, logowanie, wydruki, quiz, import, komunikaty błędów) istnieje po polsku i po angielsku.
- NFR-015: Kilka imprez jednego lokalu tego samego dnia i imprezy wielu lokali naraz nie spowalniają się nawzajem poniżej celów NFR-011.
- NFR-016: Platforma jest dostępna cały czas, bez usypiania po okresie bezczynności. Nie ma formalnego SLA.
- NFR-017: Bez sieci tablet obsługi i kelner widzą ostatni stan zamówień i rozsadzenia swojego wydarzenia, także po odświeżeniu strony (tylko odczyt). Rozszerza NFR-004 na lokal.
- NFR-018: TV pokazuje imiona czytelnie według celu NFR-006 (≥ 2,5% wysokości ekranu). Gdy cały lokal nie mieści się czytelnie, TV przechodzi po salach (zastępuje warunek „cały plan bez przewijania”).
- NFR-019: Dane gości wydarzenia znikają z platformy po upływie ustawionej liczby dni od imprezy (domyślnie 30).
- NFR-020: Platforma nie wysyła e-maili ani wiadomości. Zaproszenia i reset hasła przekazuje człowiek.
- NFR-021: Dane gości (imiona, diety, uwagi) nigdy nie trafiają do usług AI.
- NFR-022: Zalogowanie trwa 30 dni na urządzeniu; wylogowanie i zmiana hasła kończą sesje tej osoby.
- NFR-023: Gry i zabawy z AI (tematy) zachowują limity z NFR-005 per wydarzenie i są domyślnie wyłączone (zmienia NFR-005).

## Business Logic Changes

**Reguła dziś (v1), zostaje bez zmian** w obrębie jednego wydarzenia: losowanie rozsadza obecnych gości tak, by jak najmniej osób siedziało obok sąsiadów z poprzednich rozkładów, z twardymi grupami, przypięciami i pominięciem nieobecnych; ranking strzałów liczy odległość od prawidłowej kwoty, z remisami 1, 2, 2, 4. Moduły, w tym losowanie miejsc i gra w zgadywanie, mogą być teraz w wydarzeniu wyłączone.

**Nowa reguła:** każde wydarzenie należy do jednej restauracji: lokal określa, co jest dostępne (sala z szablonu, menu, moduły), klient wybiera i przygotowuje imprezę z tego, co dostępne, a goście i obsługa dostają tylko swoją część.

**Co lokal udostępnia:**
- salę z szablonu (aktualizowaną na żądanie);
- pełne albo okrojone menu z cenami lokalu;
- zestaw modułów możliwych w lokalu (np. zależnie od sprzętu). Moduły płatne odblokowuje dla wydarzenia administrator platformy.

**Co wybiera klient:**
- gości (także z importu) i ich diety;
- grupy i rozsadzenie;
- pozycje zamówień z dostępnego menu (ceny tylko do odczytu);
- które z dostępnych modułów włączyć.

**Kto prowadzi wydarzenie** (przełącznik „lokal prowadzi”): klient albo lokal. Prowadzący edytuje, druga strona ma podgląd.

**Kto co dostaje:**
- gość: tylko swoje dane i opublikowane rozsadzenie;
- obsługa (tablet, kelner): rozsadzenie, zamówienia, diety i serwowanie;
- TV: tylko odczyt.

## Access Control Changes

**Obecny model (v1):** bez kont. Każdy widok otwiera się wyłącznie przez niezgadywalny klucz w linku: organizator `/o/`, TV `/tv/`, gość `/g/` (osobisty, z włącznikiem dostępu gości i unieważnianiem), obsługa restauracji `/r/` (tylko odczyt). Nieważny klucz daje tę samą odmowę bez danych.

**Zmiana:** dochodzą konta personelu i administratora platformy. Linki zostają dla klienta, TV, gości i tabletu obsługi, każdy w obrębie jednego wydarzenia.

| Rola | Jak wchodzi | Może | Nie może |
|---|---|---|---|
| Administrator platformy | konto | zakładać restauracje, zapraszać właścicieli, wyłączać restauracje, odblokowywać płatne moduły wydarzenia; pełny wgląd w dane każdej restauracji (wsparcie), a każde wejście trafia do dziennika widocznego dla właściciela lokalu | — |
| Właściciel lokalu | konto (zaproszenie od administratora platformy) | wszystko w swojej restauracji: wydarzenia, szablony sal, menu i ceny, dostępne moduły, linki, archiwum, pełny reset, koszty AI, przełącznik „lokal prowadzi”; zespół (menedżerowie i kelnerzy); ustawienia lokalu (branding, czas przechowywania danych gości); trwałe usuwanie | widzieć inne restauracje |
| Menedżer | konto (zaproszenie od właściciela) | wydarzenia, szablony sal, menu i ceny, dostępne moduły, linki, archiwum, eksport, pełny reset, koszty AI, przełącznik „lokal prowadzi”; w trybie „lokal prowadzi” to samo, co klient; zaprasza i usuwa kelnerów, dodaje kelnerów „na imprezę” | zarządzać menedżerami i właścicielem, zmieniać ustawienia lokalu, trwale usuwać wydarzenia i restaurację |
| Kelner | konto (zaproszenie od właściciela lub menedżera) albo dostęp „na imprezę” (jednorazowy link lub kod ważny do końca okna imprezy) | wydarzenia trwające dziś (także po północy): plan z gośćmi, zamówienia z cenami i rachunkiem, oznaczanie wydanych, dopisywanie zamówień na sali | widzieć i wydawać linki, zmieniać wydarzenia, zespół, ustawienia |
| Klient (organizator) | link `/o/` od lokalu, bez logowania | jak organizator w v1 w obrębie swojego wydarzenia: goście (także import), diety, grupy, sale i stoliki, rozsadzenie, linki gości, karteczki i wydruki, zamówienia z dostępnego menu, napoje, rachunek, włączanie dostępnych gier i zabaw, „Pokaż na TV”, branding swojego wydarzenia, reset prób; w trybie „lokal prowadzi” tylko podgląd | zmieniać ceny, robić pełny reset, usuwać wydarzenie, widzieć koszty AI |
| TV | link `/tv/`, bez logowania | tylko odczyt, jak w v1 | cokolwiek zmieniać |
| Tablet obsługi | link `/r/`, bez logowania | tylko odczyt, jak w v1 (plan, zamówienia do wydania) | cokolwiek zmieniać; oznaczanie wydanych wymaga konta kelnera |
| Gość | osobisty link `/g/`, bez logowania | jak w v1, tylko własne dane: miejsce, strzał, „Dotarło”, pytania, tematy AI | widzieć dane innych poza opublikowanym rozsadzeniem |

Zasady:
- **Linki lokalu są tylko do odczytu.** Każda zmiana po stronie lokalu (`/r/`, TV) wymaga zalogowania. Link klienta i linki gości zachowują swoje akcje z v1.
- **Personel a praca klienta.** Domyślnie personel lokalu tylko podgląda to, co robi klient (goście, grupy, rozsadzenie, zamówienia). Przełącznik „lokal prowadzi” w wydarzeniu daje personelowi edycję za klienta, na przykład gdy klient przysyła listę mailem albo prosi o przesadzenie przez telefon; klient ma wtedy tylko podgląd.
- **Sesja** trwa 30 dni na urządzeniu. Wylogowanie i zmiana hasła ją zamykają.
- **Konta bez e-maili.** Zaproszenia i reset hasła to jednorazowe linki z terminem ważności, które przekazuje zapraszający.
- **Odmowa.** Wejście do panelu bez zalogowania prowadzi do logowania. Cudze lub nieznane wydarzenie albo restauracja daje tę samą odmowę bez danych, jak dziś dla kluczy.

## Non-Goals

- **Płatności online:** płatne moduły odblokowuje ręcznie administrator platformy; operator płatności przyjdzie później.
- **Samodzielna rejestracja lokali i wysyłanie e-maili:** lokale zakłada administrator platformy, a zaproszenia i reset hasła to linki przekazywane przez człowieka.
- **Integracje z kasą (POS), systemem rezerwacji i księgowością lokalu:** platforma działa samodzielnie.
- **Aplikacja do instalacji ze sklepu:** wszystko działa w przeglądarce.
- **Ekran kuchni z kolejnością i czasami wydawania kursów (KDS):** kuchnia ma listę po kursach i serwowanie per miejsce.
- **Kalendarz rezerwacji, CRM (kontakty klientów) i statystyki lokalu.**
- **Nowe kształty stołów:** zostają okrągłe i prostokątne, bez podkowy, owalu i stołu prezydialnego.
- **Języki inne niż PL/EN i logowanie dwuskładnikowe.**
- **(Niefunkcjonalne) Formalne SLA:** platforma jest stale dostępna, ale bez gwarancji umownej i dyżuru.
- **(Z v1, nadal) Pokazywanie cudzych strzałów i rankingu gry w zgadywanie gościom albo na TV.** Wyjątkiem może być pub quiz (FR-049); szczegóły należą do planu modułu.
- **(Bez zmian w istniejącym systemie)**:
  - reguły losowania i rankingu zostają takie, jak w v1;
  - linki klienta i gości zachowują swoje akcje bez logowania;
  - dane kolacji 2026-11-08 nie są przenoszone ani zmieniane.

## Open Questions

1. **Nazwa produktu (white-label u gościa, ale w panelu i na stronie produktu potrzebna).** Owner: user. Do tego czasu nazwa robocza w jednym miejscu.
2. **Plan sali i menu restauracji do demo (FR-042).** Owner: user, przed demo.
3. **Data demo z restauracją.** Owner: user.
4. **Hosting platformy:** nowe środowisko danych; „zawsze dostępna” (NFR-016) oznacza płatny plan albo inny sposób na brak usypiania; własna domena, bo adres trafia na karteczki z QR. Decyzja kosztowa należy do użytkownika.
5. **Cennik:** za które gry i zabawy płaci klient i ile; czy lokal płaci abonament. Owner: user (po demo).
6. **Regulamin, polityka prywatności, umowa powierzenia z lokalem (dziennik wejść administratora, alergie jako dane o zdrowiu).** Owner: user + prawnik.
7. **Natywny import `.xlsx` (FR-035):** w M-2 jest CSV i wklejka z arkusza; czy `.xlsx` będzie potrzebny po demo. Owner: user.
8. **Koszt AI na platformie:** kto płaci za tematy AI i odczyt planu ze zdjęcia, czy jest miesięczny limit per lokal. Owner: user.
