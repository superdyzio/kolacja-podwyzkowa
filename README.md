# Kolacja podwyżkowa

Aplikacja webowa do prowadzenia corocznej kolacji podwyżkowej: rozsadzenie gości z rotacją, widok TV z planem sal, telefony gości (miejsce, pytania, strzały) i ranking strzałów dla organizatora. Widoki wydarzenia otwierają się wyłącznie przez link z niezgadywalnym kluczem; personel restauracji loguje się do panelu e-mailem i hasłem.

Dokumentacja produktu (PRD, roadmapa, stack) jest w `context/foundation/`.

## Stack

Astro 7 (SSR) + React 19 + TypeScript + Tailwind 4 + shadcn/ui, Supabase (Postgres), serwer Node (`@astrojs/node`) na AWS Lambda, Vitest.

## Uruchomienie lokalne

Wymagania: Node.js 22 (`.nvmrc`) i Docker.

```bash
npm install
npx supabase start -x gotrue,realtime,storage-api,imgproxy,studio,postgres-meta,mailpit,edge-runtime,logflare,vector,supavisor
npx supabase migration up
npm run env:local   # zapisuje SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY do .env
npm run dev
```

Załóż restaurację i wydarzenie: `npm run event:create -- --restaurant "Pod Lipą" --name "Kolacja firmowa"` (z bazą startową pytań). Skrypt wypisze link organizatora, adres TV i link restauracji — link organizatora od razu dodaj do zakładek. Kolejne wydarzenie tej samej restauracji: `--restaurant-id <id>`. Zwykle wydarzenia zakłada jednak właściciel albo menedżer w panelu lokalu (patrz „Wydarzenia lokalu”); strona `/` to strona produktu z „Zaloguj się” (panel) i szkicami regulaminu (`/regulamin`) i polityki prywatności (`/polityka-prywatnosci`) do przeglądu prawnika — linki do wydarzeń otwiera się bezpośrednio. Jeśli zgubisz link, `npm run links` wypisze linki wszystkich wydarzeń.

## Dostęp

| Widok       | Adres         | Uwagi                                                                                     |
| ----------- | ------------- | ----------------------------------------------------------------------------------------- |
| Organizator | `/o/<klucz>`  | praca klienta (goście, sala, rozsadzenie, zamówienia…); link do zakładek, nie udostępniać |
| TV          | `/tv/<klucz>` | tylko do odczytu, na urządzeniu przy telewizorze                                          |
| Gość        | `/g/<klucz>`  | osobisty link/QR (w kolejnych etapach)                                                    |
| Restauracja | `/r/<klucz>`  | tylko do odczytu: zamówienie i plan, bez cen                                              |
| Personel    | `/panel`      | logowanie e-mailem i hasłem na `/logowanie`                                               |
| Inne        | —             | strona „Brak dostępu” (HTTP 404), żadnych danych                                          |

## Konta personelu

Personel restauracji (właściciel, menedżer, kelner) i administrator platformy logują się na `/logowanie` e-mailem i hasłem; sesja trwa 30 dni na danym urządzeniu. Panel `/panel` pokazuje, kto jest zalogowany, jego restauracje z rolą, zmianę hasła (kończy sesje na innych urządzeniach) oraz „Wyloguj” i „Wyloguj wszędzie”. Po 10 nieudanych próbach w 15 minut logowanie na dany e-mail czeka do końca tych 15 minut (zalogowane urządzenia działają dalej).

Aplikacja nie wysyła e-maili. Konto zakłada się z jednorazowym linkiem `/haslo/<token>` (zaproszenie ważne 7 dni, reset hasła 24 godziny), który przekazujesz tej osobie sam; link działa raz, a nowy link unieważnia poprzednie.

Pierwszy administrator platformy (lokalnie):

```bash
npm run platform:admin -- ja@example.com --name "Imię Nazwisko"
```

Skrypt wypisuje host bazy i link do ustawienia hasła. Konto bez hasła dostaje zaproszenie, konto z hasłem — link do ustawienia nowego (tak administrator wraca po zgubieniu hasła). Na produkcji patrz „Pierwsze uruchomienie”. Resztę personelu zaprasza właściciel (i menedżer — kelnerów) w panelu lokalu, patrz „Zespół lokalu”; `npm run demo` przygotowuje stałą „Restaurację demo” ze stałymi kontami (`wlasciciel@`, `menedzer@`, `kelner@`, `admin@demo.stolik`, hasła w wydruku i w `docs/scenariusz-pokazu.md`).

### Panel platformy

Administrator platformy widzi na `/panel` kartę „Panel platformy” (`/panel/platforma`):

1. „Nowa restauracja”: nazwa restauracji i e-mail właściciela (imię opcjonalnie) → „Załóż restaurację”. Restauracja i konto właściciela powstają razem, a pod formularzem pojawia się jednorazowy link zaproszenia (ważny 7 dni) z przyciskiem „Kopiuj”. Link widać tylko teraz: przekaż go właścicielowi sam (aplikacja nie wysyła e-maili). Jeśli ten e-mail ma już konto z hasłem, linku nie ma — restauracja pojawi się tej osobie po zalogowaniu.
2. Właściciel otwiera link, ustawia hasło i trafia do `/panel`, gdzie jego restauracja prowadzi do panelu lokalu `/panel/restauracje/<id>` (nazwa, rola, wydarzenia i zespół).
3. Lista restauracji pokazuje liczniki (wydarzenia, zespół) i właścicieli ze stanem konta. „Nowy link” daje właścicielowi nowe zaproszenie (gdy nie ustawił jeszcze hasła) albo link resetu hasła (24 godziny); poprzedni nieużyty link przestaje działać. „Dodaj właściciela” dopisuje kolejnego właściciela (np. do „Restauracji domyślnej”, która startuje bez właściciela).
4. „Wyłącz” odcina personel wyłączonej restauracji od jej panelu od razu (w `/panel` widzi „Wyłączona”); linki jej wydarzeń (organizator, TV, goście, restauracja) działają dalej. „Włącz” przywraca dostęp.
5. „Wejdź jako wsparcie” (gdy restauracja prosi o pomoc): wpisz powód (3–300 znaków, zobaczy go właściciel) → przeglądarka przechodzi na stronę restauracji w trybie wsparcia. Widać ją tak jak u właściciela — wydarzenia, karty wydarzeń, zespół, dziennik — ale **tylko do podglądu** (żadnych zmian) i **bez linków wydarzeń** (klienta, TV, tabletu). Na górze jest żółty pasek z powodem i godziną końca. Tryb trwa najwyżej 60 minut i dotyczy tylko tego logowania (na innym urządzeniu go nie ma); kończy się przyciskiem „Zakończ wsparcie”, po 60 minutach albo po wylogowaniu. Działa też dla wyłączonej restauracji. Karta pokazuje „Wsparcie aktywne do …” z „Otwórz” i „Zakończ wsparcie”.

Poza trybem wsparcia administrator nie widzi wydarzeń, gości ani linków restauracji — tylko liczniki i właścicieli. Każde wejście w tryb wsparcia, każda otwarta w nim strona i wyjście trafiają do dziennika, który widzi właściciel lokalu (niżej). Na produkcji ta zmiana wymaga migracji bazy **przed** wdrożeniem kodu (strona restauracji czyta dziennik, a panel woła nowe funkcje bazy); migracja tylko dodaje tabele i funkcje.

### Dziennik wejść administratora

Właściciel widzi na dole strony restauracji `/panel/restauracje/<id>` sekcję „Dziennik wejść administratora”: od najnowszych, kiedy (czas polski), kto (imię i e-mail administratora) i co — wejście w tryb wsparcia z powodem i godziną końca, każda otwarta strona (np. „Otwarte: wydarzenie „Wigilia””) i wyjście. Wpisów nie da się zmienić ani usunąć (baza na to nie pozwala); znikają tylko razem z restauracją. Menedżer i kelner tej sekcji nie widzą. Strona pokazuje 100 najnowszych wpisów.

### Wydarzenia lokalu

Właściciel i menedżer prowadzą wydarzenia w panelu lokalu `/panel/restauracje/<id>`:

1. „Nowe wydarzenie”: nazwa, data i (opcjonalnie) przewidywana liczba gości → „Utwórz wydarzenie”. Przeglądarka przechodzi od razu na kartę wydarzenia `/panel/wydarzenia/<id>`: link dla klienta (organizatora) jest na górze — „Kopiuj” i wyślij go klientowi. Niżej link TV (na telewizor w sali) i link tabletu obsługi (kuchnia i kelnerzy). Każdy ma „Otwórz”.
2. Lista ma zakładki „Nadchodzące” (od dziś, najbliższe pierwsze), „Minione” i „Archiwum”. „Dziś” liczy się w czasie polskim, a wczorajsze wydarzenie jest jeszcze „dziś” do 12:00 (impreza po północy nie znika z listy).
3. „Wymień link” przy każdym z trzech linków daje nowy adres; stary przestaje działać od razu. Potwierdzenie mówi, kogo to odetnie (klienta i jego otwarte strony, ekran TV albo tablety obsługi) — nowy link trzeba im przekazać. Linki gości się nie zmieniają.
4. „Przenieś do archiwum” tylko przenosi wydarzenie do zakładki „Archiwum”; wszystkie linki działają dalej, a „Przywróć z archiwum” cofa to w każdej chwili.
5. „Usuń wydarzenie trwale” (tylko właściciel) usuwa wydarzenie ze wszystkimi danymi — gośćmi, salą, rozsadzeniem, zamówieniami, strzałami i pytaniami — i unieważnia wszystkie jego linki, także linki gości i karteczki QR. Tego nie da się cofnąć.

Kelner widzi na razie tylko notkę (dzisiejsze wydarzenia dla kelnerów przyjdą później); personel innej restauracji dostaje „Brak dostępu”, jak dla nieistniejącego wydarzenia. Na produkcji ta zmiana wymaga migracji bazy **przed** wdrożeniem kodu (panel czyta nowe kolumny daty, liczby gości i archiwum); migracja tylko dodaje kolumny, linki istniejących wydarzeń się nie zmieniają, a istniejące wydarzenia dostają datę swojego utworzenia.

### Zespół lokalu

Właściciel i menedżer widzą w panelu lokalu `/panel/restauracje/<id>` sekcję „Zespół”: listę osób z rolą i stanem konta.

1. „Zaproś do zespołu”: e-mail, imię (opcjonalnie) i rola → „Zaproś”. Właściciel zaprasza menedżerów i kelnerów, menedżer tylko kelnerów. Pod formularzem pojawia się jednorazowy link zaproszenia (ważny 7 dni) z „Kopiuj” — przekaż go tej osobie sam. Jeśli e-mail ma już konto z hasłem, linku nie ma: restauracja pojawi się tej osobie po zalogowaniu.
2. Rola: właściciel zmienia rolę każdej osoby (także na „Właściciel” — współwłaściciel ma pełną władzę nad restauracją — i swoją). Menedżer zarządza tylko kelnerami. Restauracja zawsze ma co najmniej jednego właściciela: jedynego właściciela nie da się zdegradować ani usunąć.
3. „Usuń z zespołu” odcina tę osobę od tej restauracji od razu (przy jej następnym kliknięciu); inne restauracje, w których pracuje, zostają. Nieużyte zaproszenie usuniętej osoby przestaje działać.
4. „Nowy link” przy osobie, która nie ustawiła hasła, daje nowe zaproszenie; przy osobie z hasłem — link do ustawienia nowego hasła (24 godziny; po jego użyciu inne urządzenia tej osoby są wylogowane). Poprzedni nieużyty link przestaje działać. Tak wraca ktoś, kto zgubił hasło.

Link ustawia hasło do całego konta, więc restauracja nie da go osobie, która pracuje też w innej restauracji (właścicielowi da go administrator platformy; menedżera albo kelnera trzeba najpierw usunąć z zespołu jednej z restauracji). Z tego samego powodu nieużyty link od zespołu przestaje działać, gdy konto dołączy do innej restauracji, a osoby, która ma już konto w innej restauracji, ale nie ustawiła hasła, nie da się zaprosić, dopóki go nie ustawi. Kelner „na jedną imprezę” i widok dnia dla kelnerów przyjdą później. Na produkcji ta zmiana wymaga migracji bazy **przed** wdrożeniem kodu (zapraszanie, zmiany ról, usuwanie i „Nowy link” wołają nowe funkcje bazy); migracja tylko dodaje funkcje.

### Kto prowadzi wydarzenie

Wydarzenie przygotowuje klient (organizator) przez swój link `/o/<klucz>`, a personel lokalu (właściciel i menedżer) widzi jego pracę w panelu: karta wydarzenia `/panel/wydarzenia/<id>` ma sekcję „Praca klienta” z kartami gości, sali, rozsadzenia, linków gości, strzałów, pytań i zamówień, a każda prowadzi do podglądu `/panel/wydarzenia/<id>/<sekcja>` — tych samych ekranów co u klienta.

1. Przełącznik „Lokal prowadzi” na karcie wydarzenia (potwierdzenie mówi, kto traci edycję) decyduje, kto zmienia dane. Wyłączony (domyślnie): klient edytuje, a personel ma podgląd tylko do odczytu z paskiem „Wydarzenie prowadzi klient — masz podgląd”. Włączony: personel edytuje w panelu („Lokal prowadzi — edytujesz za klienta”), a strony klienta są tylko do odczytu z paskiem „Wydarzenie prowadzi lokal” (każda próba zmiany kończy się odmową). „Oddaj prowadzenie klientowi” wraca do trybu domyślnego. Obie strony nigdy nie edytują naraz. Linki gości, TV i tabletu działają tak samo w obu trybach.
2. Ceny są zawsze lokalu: klient widzi ceny przy daniach i napojach, ale ich nie wpisuje. Nowa pozycja bierze cenę ostatniej pozycji o tej samej nazwie (bez względu na wielkość liter), inaczej cenę z menu lokalu (patrz „Menu lokalu”), inaczej 0 zł. Personel ustawia ceny w „Cenniku wydarzenia” na podglądzie zamówień w panelu: cena dania albo napoju zmienia się we wszystkich pozycjach o tej nazwie.
3. Pełny „Reset danych” i „Koszty AI” (zużycie tematów, dostawca, przyczyna ostatniego błędu i szacowany koszt) są tylko na karcie wydarzenia w panelu. Klient ma „Reset prób”: czyści strzały i rozsadzenie (z historią publikacji), a goście, sala, zamówienia, pytania i linki zostają — tak klient przygotowuje się do kolejnej próby.
4. Link tabletu obsługi (`/r/<klucz>`) jest tylko na karcie wydarzenia w panelu — klient go nie widzi i nie wymienia.

Administrator platformy w trybie wsparcia widzi „Pracę klienta” i podglądy tylko do odczytu, bez linków gości. Na produkcji ta zmiana wymaga migracji bazy **przed** wdrożeniem kodu (każda strona i zapytanie z linku klienta czyta nową kolumnę); migracja tylko dodaje kolumnę z wartością domyślną, więc istniejące wydarzenia zostają prowadzone przez klienta.

### Szablony sal

Właściciel i menedżer zapisują układ sali lokalu raz i tworzą z niego wydarzenia z gotową salą. Sekcja „Szablony sal” w panelu lokalu `/panel/restauracje/<id>` ma listę szablonów (sale, stoliki, miejsca) i „Nowy szablon sali”; każdy szablon otwiera się w tym samym edytorze sali co u klienta (`/panel/szablony/<id>`: plan, sale, stoliki, kontury, obrót, skala krzeseł, odczyt planu przez AI), z nazwą do zmiany i „Usuń szablon”.

1. „Zapisz jako szablon” na karcie wydarzenia kopiuje jego plan, sale, stoliki i rysunek (bez gości) do nowego szablonu.
2. „Nowe wydarzenie” ma pole „Sala z szablonu”: nowe wydarzenie dostaje kopię sali szablonu. Późniejsze zmiany szablonu nie zmieniają istniejących wydarzeń, a usunięcie szablonu nie usuwa ich sal.
3. „Zaktualizuj z szablonu” na karcie wydarzenia zastępuje salę wydarzenia salą szablonu. Sale i stoliki są dopasowywane po nazwie: goście przy stolikach, które zostają, zachowują miejsca. „Sprawdź zmiany” pokazuje najpierw, kto straci miejsce i które stoliki znikną, a potwierdzenie wymienia te osoby. TV i telefony gości zobaczą zmianę dopiero po „Opublikuj” w rozsadzeniu.

Szablon nie ma gości ani linków i nie pojawia się na liście wydarzeń ani w licznikach panelu platformy. Na produkcji ta zmiana wymaga migracji bazy **przed** wdrożeniem kodu (każde czytanie wydarzenia sprawdza nową kolumnę); migracja dodaje kolumnę z wartością domyślną i funkcje, więc istniejące wydarzenia się nie zmieniają.

### Menu lokalu

Właściciel i menedżer prowadzą katalog dań i napojów lokalu z ceną i kursem (przystawki, zupy, dania główne, desery, napoje): sekcja „Menu lokalu” w `/panel/restauracje/<id>` prowadzi do `/panel/restauracje/<id>/menu` (dodawanie, zmiana, usuwanie). Na karcie wydarzenia „Menu wydarzenia” ustala, co klient może zamówić: „Bez menu” (dowolne pozycje jak dotąd), „Pełne menu lokalu” albo „Okrojone menu” (zaznaczone pozycje).

1. Dopóki wydarzenie ma dostępne menu (pełne albo okrojone z co najmniej jedną pozycją), klient — i personel za klienta — wybiera danie z listy z cenami; dowolny tekst jest odrzucany. Wydarzenia sprzed tej zmiany mają „Bez menu”; nowe mają „Pełne menu”, które działa jak „Bez menu”, dopóki lokal nie ma katalogu.
2. Cena: nowa pozycja bierze cenę tej nazwy już zamówionej w wydarzeniu, a jeśli jej nie ma — cenę z menu. Zmiana ceny w menu lokalu nie zmienia pozycji już zamówionych ani ceny dania, które wydarzenie już ma; przecenić wydarzenie można tylko „Cennikiem wydarzenia”.
3. „Do przygotowania” u klienta i na tablecie `/r/<klucz>` jest pogrupowane po kursach; pozycje z dowolnym tekstem są na końcu jako „Bez kursu”. Napoje do rachunku zostają listą klienta (bez menu), ale podpowiadają napoje z menu i biorą ich cenę.

Na produkcji migracja `20261110220000_menu_catalog.sql` musi trafić do bazy **przed** kodem (zamówienia czytają nowe kolumny); jest addytywna, istniejące wydarzenia dostają „Bez menu”.

### Moduły wydarzenia

Gry i zabawy są modułami wydarzenia: pytania do rozmowy, tematy AI, gra w zgadywanie rachunku, losowanie miejsc, „Pokaż na TV” i pub quiz (wkrótce).

1. Lokal (właściciel, menedżer) zaznacza na karcie wydarzenia w „Moduły wydarzenia”, które moduły udostępnia (np. bez rzutnika — bez „Pokaż na TV”), niezależnie od „Lokal prowadzi”.
2. Klient włącza i wyłącza udostępnione moduły w karcie „Moduły” na stronie wydarzenia (gdy prowadzi lokal — robi to personel na karcie wydarzenia). Nowe wydarzenia mają tematy AI i grę w zgadywanie wyłączone; wydarzenia sprzed tej zmiany (także kolacja z 8 listopada) mają wszystko jak dotąd.
3. Moduły płatne (tematy AI, pub quiz) są widoczne jako niedostępne, dopóki administrator platformy ich nie odblokuje: wchodzi do restauracji jako wsparcie, otwiera kartę wydarzenia i klika „Odblokuj”; wpis trafia do dziennika wejść administratora u właściciela.
4. Wyłączony moduł znika u klienta, na telefonach gości i na TV przy ich następnym odświeżeniu (kilka sekund), a jego trasy odmawiają. Dane modułu zostają i wracają po ponownym włączeniu.

Na produkcji migracja `20261110230000_event_modules.sql` musi trafić do bazy **przed** kodem (każde otwarcie linku czyta nowe kolumny); jest addytywna.

## Języki

Cała aplikacja działa po polsku i po angielsku. Przełącznik **PL / EN** jest w prawym górnym rogu każdej strony (poza TV i karteczkami do druku); wybór zapamiętuje ciasteczko na rok. Domyślnie wszystko jest po polsku, a link restauracji po angielsku — restauracja ma własne ciasteczko, więc wybór organizatora nie zmienia jej tabletu i odwrotnie. Język da się też ustawić linkiem: dopisz `?lang=en` albo `?lang=pl` (np. dla TV: `/tv/<klucz>?lang=en`). Nie tłumaczą się treści z bazy: imiona, nazwy sal, stolików i dań, uwagi oraz pytania (także baza startowa). Tematy AI powstają w języku osoby, która je losuje.

## Reset danych

Pełny reset jest na karcie wydarzenia w panelu lokalu (`/panel/wydarzenia/<id>`, właściciel i menedżer) w sekcji „Reset danych”. „Resetuj…” otwiera okno z listą rzeczy do wyczyszczenia, każda z opisem i aktualną liczbą: strzały (z prawidłową kwotą), licznik tematów AI, rozsadzenie z historią publikacji, goście i grupy, plan z salami i stolikami, zamówienia z napojami do rachunku (link restauracji zostaje), pytania (wraca baza startowa) oraz linki gości (nowe linki, dostęp gości wyłączony — wydrukowane karteczki przestają działać). Goście pociągają za sobą strzały, licznik AI i rozsadzenie, a plan — rozsadzenie. Jedno kliknięcie „Resetuj zaznaczone” czyści wszystko naraz (jedna transakcja w bazie). Link organizatora i adres TV się nie zmieniają, więc np. po próbie generalnej wystarczy zresetować wszystko i od nowa wgrać dane (także `npm run demo`).

Klient ma na dole swojego panelu `/o/<klucz>` kartę „Reset prób” z tym samym oknem, ale tylko ze strzałami i rozsadzeniem (patrz „Kto prowadzi wydarzenie”).

## Tematy AI

Goście i organizator generują temat do rozmowy od AI w wybranej kategorii. Gość ma najwyżej 25 tematów na wieczór, wszyscy razem (z organizatorem) 1000; organizator nie ma osobnego limitu. Licznik zeruje „Reset danych” → „Licznik tematów AI” (nic innego nie znika). Nieudana próba (np. przekroczony czas 9 s) nie zmniejsza limitu. Tematy nie są nigdzie zapisywane: widzi je tylko osoba, która je wygenerowała.

Domyślnie działa atrapa AI (`AI_PROVIDER=mock` albo brak zmiennej): przykładowe polskie tematy, bez połączenia z siecią i bez kosztów. Tak działają dev, testy i `npm run smoke`.

Żeby używać Claude:

1. W konsoli Anthropic utwórz klucz API i ustaw limit wydatków.
2. Dopisz do `.env` (lokalnie; `npm run env:local` zostawia te linie):

   ```bash
   AI_PROVIDER=anthropic
   ANTHROPIC_API_KEY=<klucz>
   # AI_MODEL=claude-haiku-5-5   # opcjonalnie; inny model działa na swoich domyślnych ustawieniach
   ```

   Na AWS: te same zmienne w `.env.aws` (patrz „Wdrożenie na AWS”).

3. Uruchom ponownie podgląd (`npx astro preview stop`, potem `npm run preview`; build nie jest potrzebny, sekrety są czytane przy starcie serwera) i wygeneruj jeden temat na `/o/<klucz>/pytania`. Sekcja „Koszty AI” na karcie wydarzenia w panelu lokalu pokazuje aktywnego dostawcę, przy błędzie przyczynę (np. odrzucony klucz) i szacowany koszt; klient widzi tylko licznik tematów.

Bez klucza przy `AI_PROVIDER=anthropic` każda próba od razu się nie udaje, a „Koszty AI” w panelu lokalu mówią dlaczego. Klucz jest sekretem serwera i nigdy nie trafia do przeglądarki ani do repozytorium. Testy nigdy nie łączą się z API Anthropic, a `npm run smoke` wymaga atrapy.

## Plan sali

TV i telefony gości nie pokazują zdjęcia planu, tylko rysunek: kontury sal z nazwami, stoliki z krzesłami i imię każdego gościa przy jego krześle. Rysunek powstaje na `/o/<klucz>/sale` na podstawie wgranego zdjęcia (zdjęcie widać tam tylko jako półprzezroczyste tło):

1. Wgraj zdjęcie planu i dodaj sale.
2. „Zaproponuj układ ze zdjęcia (AI)”: AI (Claude Sonnet 5.5, do 30 s, kilka centów; na atrapie — siatka przykładowa) proponuje położenie i obrót stolików, nowe stoliki, kontury sal i skalę krzeseł. Każda zmiana ma swój ptaszek; odznacz, czego nie chcesz, i „Zastosuj zaznaczone”. Do AI idą tylko zdjęcie oraz nazwy sal i stolików — nigdy dane gości.
3. Popraw ręcznie: przeciągnij stolik, obróć go uchwytem (co 15°, z Shift dowolnie), strzałki przesuwają, `[` i `]` obracają wybrany stolik. „Kontur” przy sali rysuje jej prostokąt. „Skala krzeseł” zmienia rozmiar wszystkich stolików naraz. „Podgląd jak na TV” pokazuje rysunek z imionami.
4. Zmiany rysunku nie ruszają przypisań gości. TV i telefony pokażą nowy rysunek dopiero po „Opublikuj” na stronie rozsadzenia.

Na telefonie gość widzi najpierw swój stolik z imionami przy krzesłach. Przycisk „Pokaż plan sali ze wszystkimi” rozwija całą salę z imieniem każdego gościa przy jego krześle (to samo, co na TV); jego stolik i miejsce są na czerwono. Plan jest szerszy niż ekran: otwiera się w powiększeniu, w którym imiona da się przeczytać, przewinięty do stolika gościa. Przesuwa się go palcem, „−” i „+” zmieniają powiększenie, „Mój stolik” wraca do własnego stolika.

Na produkcji: przed `npx supabase db push` zrób kopię danych (`npx supabase db dump --data-only -f ~/kolacja-backup-<data>.sql`), potem `db push`, potem `npm run deploy:aws` (podnosi limit czasu Lambdy do 30 s). Do czasu przerysowania TV rysuje dotychczasowy układ z domyślnymi wartościami.

## Zamówienia i restauracja

Na `/o/<klucz>/zamowienia` organizator prowadzi zamówienie jedzenia: każda pozycja to danie (podpowiedzi z dań już wpisanych), ilość, opcjonalna uwaga dla kuchni i dla kogo — osoba (podanie na jej miejsce), stolik (na środek stołu) albo nieprzypisane. Widać sumę pozycji, łączną kwotę, listę „Do przygotowania” i każdą pozycję z ptaszkiem „Wydane”; wszystko da się poprawić albo usunąć. Cenę za sztukę klient tylko widzi — ustawia ją lokal w „Cenniku wydarzenia” (patrz „Kto prowadzi wydarzenie”).

Link dla restauracji (`/r/<klucz>`, na karcie wydarzenia w panelu lokalu i w `npm run links`) działa zawsze, domyślnie jest po angielsku i nie ma cen: lista dań do przygotowania (z uwagami i tym, co jeszcze do wydania), rysunek sali jak na TV oraz, stolik po stoliku, co podać na które miejsce i co na środek stołu. Wydane pozycje są przekreślone. Strona sama odświeża się co 15 s. Miejsca biorą się z **opublikowanego** rozsadzenia: osoba albo stolik spoza opublikowanego planu trafia do „Do ustalenia z organizatorem”. „Wymień link” na karcie wydarzenia w panelu lokalu od razu unieważnia stary link — przekaż obsłudze nowy.

Na obu stronach (u organizatora i w restauracji) obok list jest plan sali. Kliknięcie dania na liście „Do przygotowania” zapala na planie wszystkie miejsca, gdzie ma trafić — krzesła gości albo środek stołu, z numerami sztuk — i rozwija listę sztuk: każdą sztukę (np. „3 · Dąb · m. 7 · Darek”) można wybrać osobno, wtedy świeci tylko jej miejsce. Kliknięcie pojedynczej pozycji przy stoliku zapala jej miejsce. Nad planem jest podpis słowami („Rosół 3/9 → Stolik Dąb · miejsce 7 · Darek”), wydane sztuki są szare, a „Wyczyść” albo Esc gasi zaznaczenie. Na wąskim ekranie plan jest nad listami i przypina się u góry, dopóki coś jest zaznaczone.

Na produkcji ta zmiana wymaga migracji bazy **przed** wdrożeniem kodu: bez niej każda strona organizatora kończy się błędem 500 (panel czyta link restauracji). Kolejność: kopia danych (`npx supabase db dump --data-only -f ~/kolacja-backup-<data>.sql`), `npx supabase db push` (wgrywa też migrację planu sali, jeśli jeszcze jej nie było), potem `npm run deploy:aws`. Migracja tylko dodaje: istniejące linki organizatora, TV i gości się nie zmieniają.

## Co dotarło na stół

Gość widzi na swoim telefonie sekcję „Twoje zamówienie”: swoje dania i dania na środek swojego stolika (z opublikowanego rozsadzenia), bez cen. Każdą sztukę zaznacza osobno przyciskiem „Dotarło” (dzbanek × 2 to dwa przyciski) i może to cofnąć. Zaznaczenie organizatora może cofnąć tylko organizator. Przy każdej sztuce widać, kto ją zaznaczył: gość widzi „Ty”, „gość” albo „organizator”, organizator widzi imię gościa. U organizatora (`/o/<klucz>/zamowienia`) „Wydane” dalej zaznacza całą pozycję, a przy pozycjach z kilkoma sztukami są osobne przyciski sztuk („✓ 2 · Basia”); strona odświeża się sama co 5 s. Restauracja widzi „wydane 1 z 2”, a na planie wydane sztuki są szare.

Na produkcji ta zmiana wymaga migracji bazy **przed** wdrożeniem kodu (bez niej telefony gości przestają się odświeżać): kopia danych, `npx supabase db push`, potem `npm run deploy:aws`. Między `db push` a wdrożeniem nie odhaczaj „Wydane”. Migracja tylko dodaje tabelę i funkcje; już odhaczone pozycje zostają wydane (wszystkie sztuki, przez organizatora). Telefony otwarte przed wdrożeniem pokażą nową sekcję dopiero po odświeżeniu strony.

### Napoje do rachunku

Na dole `/o/<klucz>/zamowienia` jest sekcja „Napoje do rachunku” — tylko dla organizatora, do sprawdzenia rachunku przy rozliczeniu z restauracją. Każdy napój to nazwa (podpowiedzi z napojów już wpisanych) i ilość (do 999) — cenę za sztukę ustawia lokal w „Cenniku wydarzenia”, bez przypisania do osób; da się go poprawić albo usunąć. Goście, TV i restauracja napojów nie widzą. Karta z sumą na górze strony pokazuje „Rachunek razem” (dania + napoje) oraz osobno „Dania” i „Napoje”. Reset „Zamówienia i napoje” usuwa też napoje.

Na produkcji ta zmiana wymaga migracji bazy **przed** wdrożeniem kodu (bez niej strona zamówień kończy się błędem 500): kopia danych, `npx supabase db push`, potem `npm run deploy:aws`. Migracja tylko dodaje tabelę i podmienia dwie funkcje resetu; nic z istniejących danych się nie zmienia.

## Typ miejsca w konkursie strzałów

Obok kwoty gość może (nie musi) wpisać, które miejsce zajmie w rankingu: od 1 do liczby gości. Zapisuje się razem z kwotą i można go zmieniać (albo wyczyścić) do zamknięcia przyjmowania. Telefon ze starą wersją strony (otwartą przed wdrożeniem) wysyła samą kwotę — wtedy zapisany typ zostaje. Ranking nadal liczy się tylko z kwoty. Organizator może wpisać albo poprawić typ za gościa („Popraw” przy gościu na `/o/<klucz>/strzaly`).

W rankingu organizatora podium jest na złoto, srebrno i brązowo (z medalem), a na zielono każdy, kto trafił swoje miejsce. Pod rankingiem jest lista „Trafione miejsca” — do nagrody pocieszenia. Remis zajmuje wszystkie swoje miejsca: gdy dwie osoby dzielą 2. miejsce, trafiają, typując 2 albo 3. „Czytaj od końca” i odczyt bez sieci pokazują typ i trafienie przy każdej osobie. Gość widzi tylko swój typ, nigdy cudzych i nie wie, czy trafił.

Na produkcji ta zmiana wymaga migracji bazy **przed** wdrożeniem kodu (bez niej strona gościa i `/strzaly` kończą się błędem): kopia danych (`npx supabase db dump --data-only -f ~/kolacja-backup-<data>.sql`), `npx supabase db push`, potem `npm run deploy:aws`. Migracja tylko dodaje kolumnę i funkcję; istniejące strzały, linki i klucze zostają bez zmian.

## Skrypty

- `npm run dev`, `npm run build`, `npm run preview`: serwer deweloperski, build produkcyjny, podgląd buildu.
- `npm test`: testy jednostkowe i integracyjne. Integracyjne działają tylko z lokalnym Supabase (`SUPABASE_URL` na `127.0.0.1`), inaczej są pomijane.
- `npm run lint`, `npx astro check`: lint i sprawdzanie typów.
- `npm run env:local`: zapisuje dane lokalnego Supabase do `.env` (jedyny plik ze zmiennymi; stary `.dev.vars` z czasów Cloudflare nie jest już używany).
- `npm run event:create`: zakłada wydarzenie (z nową restauracją albo w istniejącej: `--restaurant-id`) z bazą startową pytań w bazie z `.env` i wypisuje jego linki; najpierw podaje, do jakiej bazy pisze.
- `npm run links`: wypisuje wszystkie wydarzenia (restauracja · nazwa, id) z linkiem organizatora, adresem TV i linkiem restauracji.
- `npm run platform:admin -- <email> [--name "<imię>"] [--remote]`: zakłada (albo znajduje) konto administratora platformy i wypisuje jednorazowy link do ustawienia hasła; najpierw podaje host bazy, a baza inna niż lokalna wymaga `--remote`. Link jest sekretny.
- `npm run smoke`: test HTTP macierzy dostępu na działającym serwerze (`BASE_URL`, domyślnie `http://localhost:4321`). Działa tylko z lokalnym Supabase w `.env` (tym samym co serwer): przy każdym uruchomieniu zakłada w nim własne dwie restauracje z wydarzeniami (A do wszystkich sprawdzeń, B do sprawdzenia, że linki A nie sięgają do B) i własne konta personelu (logowanie, limit prób, sesje, panel, panel platformy z trzecią restauracją, wydarzenia lokalu z menedżerem, zespół lokalu, tryb wsparcia administratora z dziennikiem) i nie rusza innych wydarzeń ani kont, więc można go puszczać wielokrotnie na tej samej bazie. `npm run preview` czyta `.env` przy starcie, więc po zmianie `.env` uruchom podgląd ponownie.
- `npm run package:lambda`: build do `dist-lambda/build` (nie rusza `dist/` podglądu) i paczka `dist-lambda/function.zip` dla AWS Lambda, ze sprawdzeniem (bez plików env i sekretów, bez modułów natywnych, zip < 50 MB, rozpakowany zip startuje poza repozytorium).
- `npm run deploy:aws`: wdrożenie na AWS Lambda (patrz niżej); `-- --dry-run` tylko wypisuje plan.
- `npm run demo -- [--name "<nazwa>"] [--plan <obraz>] [--venue <json>] [--menu <csv>] [--reset]`: przygotowuje w LOKALNEJ bazie restaurację demo do pokazu przepływu 1–7 (scenariusz: `docs/scenariusz-pokazu.md`) przez API działającego serwera (`BASE_URL`; uruchom najpierw `AI_PROVIDER=mock npm run preview`). Jedna stała „Restauracja demo” (znajdowana po właścicielu `wlasciciel@demo.stolik`) przygotowana jak w aplikacji: administrator platformy (`admin@demo.stolik` / `demo-admin-1` — jedyne konto zakładane w bazie) zakłada ją z zaproszeniem właściciela (`demo-wlasciciel-1`), właściciel zaprasza menedżera (`menedzer@demo.stolik` / `demo-menedzer-1`) i kelnera (`kelner@demo.stolik` / `demo-kelner-1`) i ustawia markę i retencję, menedżer wprowadza menu lokalu i szablon sali „Cały lokal (szablon demo)” (domyślnie z `scripts/demo-data/menu.csv`, `scripts/demo-data/sala.json` i wygenerowanego planu: 3 sale, 14 stolików, 98 miejsc) i tworzy z niego pięć wydarzeń: „Impreza firmowa Acme (demo)” dziś (80 gości: 30 wklejonych, 50 z CSV z dietami, grupy, nieobecna, przypięta, opublikowany rozkład, strzały, zamówienia z menu, potwierdzenia z wyborem dania, dokładka kelnera, kelner na imprezę, pub quiz, marka klienta), „Wigilia firmowa (demo)” (lokal prowadzi), „Rocznica firmy (demo)”, „Urodziny Ani (demo)” (minione) i „Komunia Zosi (demo)” (archiwum, dane gości usunięte po terminie); płatne moduły odblokowuje administrator w zalogowanej wizycie wsparcia. Każde uruchomienie odświeża wydarzenia (nowe linki); szablon i menu zostają, gdy istnieją (prawdziwy plan i menu poprawione w aplikacji przetrwają), a `--plan`, `--venue`, `--menu` i `--reset` budują je od nowa z plików; `--name` zmienia nazwę restauracji. Konto ze zmienionym hasłem wraca przez „Nowy link” w aplikacji. Wypisuje konta i linki pogrupowane według kroków 1–7. Na hostowanej platformie nie działa (stałe hasła demo) — tam restaurację demo przygotowuje się ręcznie według scenariusza.
- `npm run load:local -- [--phones 200] [--events 1] [--seconds 25] [--keep]`: lokalny pomiar obciążenia przy pełnej skali (150 gości, 60 stolików, cztery po 30 miejsc). Zakłada własne wydarzenie(a), odpytuje je jak 200 telefonów i TV, publikuje zmieniony rozkład i wypisuje czasy odpowiedzi, rozmiary, czas dotarcia publikacji (cel ≤ 5 s) i szacunek instancji Lambdy. Działa tylko z lokalnym serwerem i lokalnym Supabase (uruchom `AI_PROVIDER=mock npm run preview`); `--keep` zostawia duże wydarzenie do obejrzenia i wypisuje jego linki.

## CI

GitHub Actions (`.github/workflows/ci.yml`) na gałęzi `main`:

- `ci`: lint, `astro check`, `npm test` (bez testów bazy) i build.
- `smoke`: lokalny Supabase, `npm test` z testami bazy, build, podgląd produkcyjny i `npm run smoke`.

CI niczego nie wdraża i nie ma dostępu do AWS: wdrożenie uruchamiasz sam (`npm run deploy:aws`).

## Wdrożenie na AWS

Aplikacja działa jako jedna funkcja AWS Lambda (arm64, Node.js 24, 1024 MB, 30 s) pod stałym adresem Function URL (`https://<id>.lambda-url.<region>.on.aws/`, bez logowania — dostęp dają klucze w linkach). Warstwa AWS Lambda Web Adapter (v1.1.0, wersja warstwy 30) przekazuje żądania do serwera Node z paczki. Baza to hostowany projekt Supabase (plan Free). Tylko darmowe usługi: bez API Gateway, CloudFront, S3, ECR i VPC. Klucz service role omija RLS, więc nigdy nie trafia do przeglądarki ani do repozytorium.

### Przygotowanie (raz)

1. AWS CLI v2 (aktualne — skrypt używa `--invoked-via-function-url`) i logowanie: `aws login --profile mikusia` (inny profil: zmienna `AWS_PROFILE`).
2. Projekt Supabase (Free) w **tym samym regionie**, w którym ma działać Lambda (np. Frankfurt = `eu-central-1`); inny region to wolniejsze zapytania przy każdym odświeżeniu telefonów.
3. Schemat bazy (sam, ze swojego komputera): `npx supabase login`, `npx supabase link --project-ref <ref projektu>`, `npx supabase db push`.
4. Plik `.env.aws` w katalogu projektu (jest w `.gitignore`; dane z panelu Supabase → Project Settings → API):

   ```bash
   SUPABASE_URL=https://<ref projektu>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<klucz service_role>
   AI_PROVIDER=mock
   # ANTHROPIC_API_KEY=<klucz>          # wymagany przy AI_PROVIDER=anthropic
   # AI_MODEL=claude-haiku-5-5          # opcjonalnie
   RETENTION_TOKEN=<wynik: openssl rand -hex 32>   # codzienne usuwanie danych gości po terminie (zalecane)
   ```

   Skrypt przyjmuje tylko te nazwy i odmawia lokalnego albo nie-https `SUPABASE_URL` oraz `RETENTION_TOKEN` krótszego niż 32 znaki. Token wygeneruj raz (`openssl rand -hex 32`) i trzymaj tylko w `.env.aws`.

### Wdrożenie

```bash
AWS_REGION=eu-central-1 npm run deploy:aws -- --dry-run   # sam plan komend aws, nic nie wywołuje
AWS_REGION=eu-central-1 npm run deploy:aws
```

`AWS_REGION` jest wymagany (bez wartości domyślnej). Skrypt buduje paczkę (`npm run package:lambda`), a potem tworzy brakujące albo aktualizuje istniejące: rolę IAM `kolacja-podwyzkowa-lambda` (tylko logi), funkcję `kolacja-podwyzkowa`, Function URL z publicznym dostępem i grupę logów `/aws/lambda/kolacja-podwyzkowa` (7 dni), a gdy w `.env.aws` jest `RETENTION_TOKEN` — także rolę `kolacja-podwyzkowa-scheduler` i harmonogram `kolacja-podwyzkowa-retention` (niżej, „Codzienne usuwanie danych gości”). Niczego nie usuwa, więc adres się nie zmienia i wydrukowane karteczki QR działają po każdym kolejnym wdrożeniu. Sekrety idą do AWS przez plik tymczasowy (0600, usuwany) i nie są wypisywane. Na końcu skrypt podaje adres i sprawdza, czy odpowiada.

### Pierwsze uruchomienie

Baza produkcyjna trzyma wszystkie restauracje platformy: nie usuwaj w niej niczego poleceniami SQL (SQL Editor) — `public.event` to wydarzenia wszystkich restauracji, a z wydarzeniem kaskadowo znikają jego goście, linki i reszta danych. Wydarzenie usuwa się w panelu; dane gości po terminie usuwa codzienny harmonogram (niżej), a ręcznie `npm run retention -- --remote`. `npm run smoke`, `npm run demo` i `npm run load:local` odmawiają nielokalnej bazy.

1. Pierwsze wdrożenie na `AI_PROVIDER=mock` (pusta baza po `npx supabase db push`).
2. Pierwszy administrator platformy: `BASE_URL=https://<id>.lambda-url.<region>.on.aws SUPABASE_URL=<z .env.aws> SUPABASE_SERVICE_ROLE_KEY=<z .env.aws> npm run platform:admin -- <twój e-mail> --remote` (zmienne z wiersza poleceń mają pierwszeństwo przed `.env`). Skrypt wypisuje host bazy (sprawdź, że to projekt platformy, nie archiwum kolacji) i link `https://…/haslo/<token>`; otwórz go, ustaw hasło i zaloguj się na `/logowanie`. Link jest sekretny i działa raz.
3. Sprawdzenie ręczne (smoke działa tylko lokalnie): w `/panel/platforma` „Nowa restauracja” z Twoim e-mailem jako właściciela (restauracja testowa; konto z hasłem nie dostaje zaproszenia, restauracja jest od razu w `/panel`). Na jej stronie „Nowe wydarzenie”, na karcie wydarzenia otwórz linki klienta, TV i tabletu; po dodaniu gościa i włączeniu linków gości na `/o/<klucz>/linki` także jego link (linki i karteczki są `https://`). Potem „Usuń trwale” na karcie wydarzenia (znika z danymi gości i linkami) i „Wyłącz” restaurację testową na liście platformy (restauracji nie da się usunąć).
4. AI: w `.env.aws` ustaw `AI_PROVIDER=anthropic` i `ANTHROPIC_API_KEY` (z limitem wydatków w konsoli Anthropic) i wdroż ponownie tą samą komendą.
5. Restauracje: „Nowa restauracja” w `/panel/platforma` z e-mailem właściciela; jednorazowy link zaproszenia przekazujesz mu sam (aplikacja nie wysyła e-maili). Właściciel zakłada wydarzenia w swoim panelu („Nowe wydarzenie”) i zaprasza zespół; linki gości i karteczki drukuje się z adresu produkcyjnego.

### Codzienne usuwanie danych gości

Restauracja ustawia, ile dni po wydarzeniu przechowywać dane gości (domyślnie 30). Po tym terminie aplikacja usuwa je przed każdym otwarciem wydarzenia, ale wydarzenia, których nikt już nie otwiera, czyści dopiero codzienne zadanie: harmonogram EventBridge Scheduler `kolacja-podwyzkowa-retention` uruchamia funkcję codziennie o 4:15 czasu polskiego (`cron(15 4 * * ? *)`, strefa `Europe/Warsaw`, bez okna elastycznego). Wysyła jej `{"job":"guest-data-retention","token":"<RETENTION_TOKEN>"}`; Lambda Web Adapter przekazuje takie zdarzenie jako `POST` z treścią JSON na ścieżkę z `AWS_LWA_PASS_THROUGH_PATH` (`npm run deploy:aws` ustawia ją na `/api/jobs/retention`), a aplikacja usuwa dane gości wszystkich wydarzeń po terminie (do 20 s na przebieg; resztę bierze kolejna noc) i odpowiada samymi liczbami. Function URL jest publiczny, więc bez właściwego tokenu ta ścieżka odpowiada 404 jak każdy zły link. Harmonogram jest bezpłatny (darmowy próg EventBridge Scheduler to 14 mln wywołań miesięcznie, tu jedno dziennie); rola `kolacja-podwyzkowa-scheduler` może tylko wywołać tę jedną funkcję. Token jest zapisany w funkcji i w celu harmonogramu (widzą go osoby z dostępem do konta AWS); nowy token = zmiana w `.env.aws` i ponowne wdrożenie (podmienia oba naraz).

Po pierwszym wdrożeniu z tokenem (i po każdej zmianie tokenu) sprawdź raz ręcznie (profil i region jak przy wdrożeniu; `npm run deploy:aws` wypisuje te komendy na końcu):

```bash
# 1. Harmonogram istnieje i jest włączony:
aws scheduler get-schedule --name kolacja-podwyzkowa-retention --profile mikusia --region eu-central-1 \
  --query '{State:State,Expression:ScheduleExpression,TimeZone:ScheduleExpressionTimezone}'
# 2. Jedno wywołanie z wejściem samego harmonogramu (token trafia tylko do prywatnego katalogu tymczasowego):
d="$(mktemp -d)"
aws scheduler get-schedule --name kolacja-podwyzkowa-retention --query Target.Input --output text --profile mikusia --region eu-central-1 > "$d/input.json"
aws lambda invoke --function-name kolacja-podwyzkowa --payload "fileb://$d/input.json" --profile mikusia --region eu-central-1 "$d/output.json"
cat "$d/output.json"; rm -r "$d"
# 3. Linia w logach:
aws logs tail /aws/lambda/kolacja-podwyzkowa --since 15m --filter-pattern Retencja --profile mikusia --region eu-central-1
```

- Poprawnie: `get-schedule` pokazuje `ENABLED`, `cron(15 4 * * ? *)`, `Europe/Warsaw`; odpowiedź funkcji to liczby, np. `{"events":0,"guests":0,…,"skipped":0,"complete":true}` (bez imion i identyfikatorów); w logach jest linia „Retencja danych gości (codzienne sprzątanie): wydarzenia …”. Kolejne noce: ta sama linia w logach około 4:15.
- `{"error":"Brak dostępu"}`: funkcja nie ma tego samego tokenu co harmonogram (albo token jest za krótki) — sprawdź `RETENTION_TOKEN` w `.env.aws` i wdroż ponownie.
- `Cross-site POST form submissions are forbidden`: adapter wysłał zdarzenie bez nagłówka `Content-Type: application/json` (założenie z dokumentacji Lambda Web Adapter, którego nie dało się sprawdzić bez AWS) — wtedy harmonogram nie działa i potrzebna jest zmiana w kodzie; dane gości dalej usuwa otwarcie wydarzenia, panel i `npm run retention -- --remote`.
- Bez `RETENTION_TOKEN` wdrożenie pomija harmonogram (i wypisuje, jak wygenerować token); harmonogram z wcześniejszego wdrożenia zostaje, ale aplikacja mu odmawia.

### Koszty i limity

- Darmowy próg Lambdy (1 mln żądań i 400 000 GB-s miesięcznie) z zapasem wystarcza na wieczór: 40 telefonów odpytujących co 2,5 s to ok. 16 żądań/s, czyli ok. 60 tys. na godzinę. Przy pełnej skali (150 gości, 200 telefonów i TV) to ok. 80 żądań/s, czyli ok. 290 tys. na godzinę i ok. 870 tys. za trzygodzinny wieczór — prawie cały miesięczny darmowy próg (telefony z wygaszonym ekranem nie odpytują, więc w praktyce mniej). Szczegóły pomiaru i co sprawdzić po wdrożeniu: CLAUDE.md, sekcja „Scale”. Mimo to ustaw alert budżetu: Billing → Budgets → „Zero spend budget” (albo 1 USD).
- Współbieżność: każda instancja Lambdy obsługuje jedno żądanie naraz. Sprawdź limit konta: `aws lambda get-account-settings --profile mikusia --region <region>` (`AccountLimit.ConcurrentExecutions`). Nowe konta mają czasem tylko 10 — wtedy przed imprezą poproś o więcej w Service Quotas.
- Plan sali: najwyżej 4 MB (Function URL koduje plik w base64 w ładunku ≤ 6 MB). Odczyt układu przez AI wysyła zdjęcie zmniejszone w przeglądarce (≤ 1,5 MB) i trwa do 25 s; Lambda ma limit 30 s.
- Po dłuższej przerwie pierwsze żądanie startuje funkcję (ok. 1 s). Otwórz TV i panel organizatora przed przyjściem gości.
- Supabase Free usypia projekt po tygodniu bez ruchu — kilka dni przed imprezą otwórz aplikację (albo wznów projekt w panelu).
- Logi: CloudWatch, grupa `/aws/lambda/kolacja-podwyzkowa`. Wersja warstwy Lambda Web Adapter jest przypięta w `scripts/lib/aws-deploy.mjs`.
