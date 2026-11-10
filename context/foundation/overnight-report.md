# Raport poranny — noc M-2 „Platforma dla restauracji” (2026-11-09/10)

Gałąź `overnight/m2` (wypchnięta). `main` nietknięty, bez PR, bez `db push`, bez deployu, zero płatnych wywołań AI. Stary projekt kolacji (`eaubtfkoehpekdckhnxf`) nietknięty.

**Ostatni zielony commit kodu:** `0e80a6f` (po nim tylko ten raport). Po każdym elemencie sam sprawdziłem testy, lint, astro check, build, smoke i demo na `AI_PROVIDER=mock`; po S-17 i S-18 także `db reset` od zera.

## Co zrobione

| Element | FR / US | Commity (fazy → archiwum) | Migracja |
| --- | --- | --- | --- |
| F-02 multi-tenant-events | FR-043..047, NFR-012, NFR-015, US-10 | 8babb24, 5868bae, d85a6cd → 0224e5d | `20261109120000_multi_tenant_events.sql` |
| F-03 staff-accounts | FR-022, US-05, NFR-013, NFR-020, NFR-022 | b2e305a, 4587602 → 48143f1 | `20261109140000_staff_accounts.sql` |
| S-10 platform-restaurants | FR-021, US-05 | 7696d7f, 23433dc, 875bcf8 → 68b9fee | `20261109160000_platform_restaurants.sql` |
| S-11 restaurant-events (north star) | FR-024, FR-025, US-06, US-09, US-10 | 4262d15, e020e1a → 5e18b80 | `20261110120000_restaurant_events.sql` |
| S-12 restaurant-team | FR-023, US-05 | 3ee7e0d, eb2cffd, 0c57e64 (poprawka bezpieczeństwa), bf893a2 → a5e49cd | `20261110140000_restaurant_team.sql` |
| S-13 admin-support-log | FR-021, US-05, US-10, NFR-012 | 1273eae, ae7284b → 3dda96d | `20261110160000_admin_support_log.sql` |
| S-14 client-restaurant-split | FR-026, FR-027, FR-028, US-07 | d59a17a, 52d42df, 656ad8c, b68a954, b5a6618 → c5c74ea | `20261110180000_client_restaurant_split.sql` |
| S-15 venue-templates | FR-030, US-06, US-09 | 23082f5, 9fc08d3, 225ac09 → 3be5505 | `20261110200000_venue_templates.sql` |
| S-16 menu-catalog-courses | FR-037, FR-027, US-07 | abbad9b, 0612a0e, 0812c27, 833ce1b → 830acf7 | `20261110220000_menu_catalog.sql` |
| S-17 event-modules | FR-031, US-07, NFR-023 | b45397a, 2646eb0, ffb9fb5, ac73552 → aeeaab3 | `20261110230000_event_modules.sql` |
| S-18 event-branding | FR-032 | 591c849, 301d55b, 5c3d30e → dc2b426 | `20261111000000_event_branding.sql` |
| S-19 scale-150 | FR-033, US-08, NFR-011, NFR-015 | f2c5e5e, e765c7d, c403fa7 → 799a8bf | `20261111010000_scale_150.sql` |
| S-20 tv-room-rotation | FR-034, US-08, NFR-018 | be12b65, e8691ce → 0e80a6f | brak |
| S-21 waiter-day-and-refills (częściowo) | FR-029, US-08 (FR-023 „na imprezę” — nie) | db3a5db, e3056fc → abdd925 | brak |

Zrobione: 14 elementów (F-02, F-03, S-10..S-21; S-21 bez kelnera „na imprezę”), 12 migracji. Stan na koniec: 126 plików testów / 1267 testów zielonych, 6 pominiętych (benchmarki losowania uruchamiane ręcznie); start nocy: 96 / 1029. Smoke 776 PASS / 0 FAIL, demo OK, lint i astro check bez błędów.

## Co warto wiedzieć (decyzje nocy, pełna lista w `overnight-log.md` → `## Decyzje`)

- **Wyłączenie restauracji (S-10)** zamyka tylko panel personelu. Linki wydarzeń (`/o/`, `/tv/`, `/g/`, `/r/`) działają dalej, sesje nie są kończone.
- **Luka w odzyskiwaniu hasła (S-12):** menedżer albo kelner w KILKU restauracjach odzyska hasło tylko przez administratora, a panel platformy daje „Nowy link” tylko właścicielom. Do decyzji, czy dodać to adminowi.
- **Tryb wsparcia (S-13):** administrator widzi dane lokalu tylko do odczytu, na 60 minut, z powodem. Każde otwarcie strony to wpis w dzienniku, który właściciel widzi na stronie restauracji. Kluczy wydarzeń admin nie dostaje.
- **Lokal prowadzi (S-14):** przełącznik per wydarzenie. Włączony: personel edytuje w panelu, klient tylko patrzy (każda zmiana przez `/api/o/` dostaje 409 z jasnym komunikatem). Wyłączony: klient edytuje, lokal ma podgląd. Ceny ustawia tylko lokal („Cennik wydarzenia”), klient je widzi. Pełny reset i koszty AI są w panelu, klient ma „reset prób”. Link do tabletu `/r/` przeniósł się na kartę wydarzenia w panelu.
- **Wsparcie i dyspozytor (S-14):** prośba admina o linki gości przez dyspozytor dostaje tę samą odmowę 404, ale strażnik zdążył zapisać wpis `access` w dzienniku właściciela. Zaakceptowane.
- **Szablony sal (S-15)** to ukryte wiersze wydarzeń (`is_template`): żaden link ich nie otwiera, nie ma ich na listach, w licznikach ani w `npm run links`. „Zaktualizuj z szablonu” działa niezależnie od przełącznika „lokal prowadzi” (decyzja subagenta). TV zmienia się dopiero po „Opublikuj”.
- **Menu lokalu (S-16):** nowa pozycja zamówienia bierze najnowszą cenę tej nazwy w wydarzeniu, potem cenę z menu, potem 0. Zmiana ceny w menu nie rusza już zamówionych linii. Akcja „zastosuj nowe ceny menu do wydarzenia” pominięta dla czasu: przecenia się przez „Cennik wydarzenia”. Wydarzenia sprzed S-16 mają menu wyłączone (dalej wolny tekst). Nowe wydarzenia mają tryb „pełne menu”: dopóki lokal nie ma menu, działa wolny tekst, a gdy je wypełni, KAŻDE takie wydarzenie przechodzi na zamawianie tylko z menu (wolny tekst → 400, także dla personelu). Napoje do rachunku (`drink_item`) są bez zmian; menu tylko podpowiada nazwy i ceny.
- **Moduły (S-17):** nowe wydarzenia mają włączone pytania, losowanie miejsc i „Pokaż na TV”, a wyłączone tematy AI i grę w zgadywanie. Każde wydarzenie sprzed migracji, w tym kolacja z 2026-11-08, ma pięć modułów v1 włączonych i tematy AI odblokowane (pub quiz wyłączony). Płatne moduły to na razie stała w kodzie: tematy AI i pub quiz (Otwarte pytanie 5). Odblokowuje je administrator tylko w trakcie wizyty wsparcia w tym lokalu, a każde odblokowanie i zablokowanie trafia do dziennika właściciela. Wyłączony moduł: trasy organizatora → 409, trasy gościa → ta sama 404 co zły link; dane zostają. `npm run event:create` tworzy teraz wydarzenia z tematami AI i grą wyłączonymi.
- **Marka (S-18):** nazwę, kolor i logo lokalu zmienia tylko właściciel; nazwę i logo klienta ustawia klient (albo personel, gdy „lokal prowadzi”). Logo: tylko PNG, JPEG, WebP (sprawdzane po bajtach, SVG → 415), do 512 KiB. Marka czyta się przy ładowaniu strony, nie odświeża się na żywo. Wydarzenie bez marki klienta pokazuje teraz w nagłówku gościa, tabletu i klienta nazwę lokalu. Z tekstów aplikacji i promptu AI zniknęła „Kolacja podwyżkowa”; gra pyta o „cały rachunek”. Zostały celowo: nazwa repo i paczki, klucze localStorage `kolacja-podwyzkowa:*`, prefiks cache `kolacja-odczyt|`, nazwa funkcji Lambda, nazwa wydarzenia demo i jedno pytanie startowe o podwyżkę. Administrator nie ma (jeszcze) trasy do zmiany nazwy lokalu.
- **Skala (S-19):** 150 gości, stoliki 2–30 miejsc, 60 stolików. Pomiary lokalne (laptop): losowanie w pełnym rozmiarze 0–6 ms (najgorszy przypadek, gdy powtórek nie da się uniknąć, kończy się na budżecie 1,2 s); publikacja 12–27 ms; odpowiedź gościa 12,7 KB, TV 10,9 KB. Jedno wydarzenie, 200 telefonów + TV (~80 zapytań/s): p95 31–39 ms, każdy klient widzi publikację w ≤ 2,5 s. **Trzy wydarzenia publikujące w tej samej sekundzie na jednym lokalnym procesie: p95 4,2 s, max 6,3 s — cel NFR-015 („kilka imprez naraz”) to szacunek, nie dowód.** Na Lambdzie każde zapytanie ma własną instancję, więc to trzeba zmierzyć po wdrożeniu. Dwie poprawki na wolne odpowiedzi są opisane w CLAUDE.md („Scale”), niezrobione.
- **Koszt hostingu (S-19):** jeden pełny wieczór (200 telefonów otwartych przez ok. 3 godziny, odpytujących co 2,5 s) to ok. 870 tys. zapytań, a darmowy limit Lambdy to 1 mln na miesiąc. Do tego limit współbieżności konta AWS. Wpływa na Otwarte pytanie 4.
- **TV z rotacją sal (S-20):** TV układa cały lokal; jeśli najmniejsza czcionka imion byłaby poniżej 2,5% wysokości ekranu (`TV_READABLE_FRACTION`) i co najmniej 2 sale mają stoliki, TV przechodzi po salach co 12 s (z podpisem sali i wskaźnikiem). **Uwaga: sala demo (39 gości, 3 sale) już rotuje na 16:9, więc TV wydarzenia 1 też by rotował — to zmiana wyglądu v1.** Strojenie: `TV_READABLE_FRACTION` albo mediana zamiast najmniejszej czcionki. Przypięcie do sali: `/tv/<klucz>?sala=<nazwa sali>` (bez nowego sekretu); nieznana sala → zwykły TV. Linki TV dla każdej sali są u organizatora i na karcie wydarzenia w panelu. Przegląd planu S-20 zrobiony narzędziem doradcy zamiast `/10x-plan-review` (czas).
- **Kelner na sali (S-21):** właściciel, menedżer i kelner widzą „Dziś na sali” na stronie restauracji i stronę obsługi `/panel/obsluga/<id>` tylko dla wydarzeń trwających dziś (do południa następnego dnia, czas Warszawy) i niezarchiwizowanych: oznaczanie wydanych sztuk, dopisywanie dokładek i napojów (ceny z cennika/menu, kelner ich nie ustawia), bez edycji i usuwania linii. Działa niezależnie od „lokal prowadzi” i od modułów. Oznaczenie kelnera zapisuje się jak oznaczenie organizatora, więc gość go nie cofnie. Administrator platformy nie ma tu trybu wsparcia (zawsze 404). **Kelner „na imprezę” (jednorazowy link/kod bez hasła, FR-023) NIE powstał** — w roadmapie S-21 ma status `done` z notatką, że ta część jest otwarta; projekt opisany w CLAUDE.md („The floor”). Zostawiłem go na sesję z Tobą, bo to nowe wejście bez hasła.
- **Nowe wydarzenia nie są już tworzone przez `/`** (`POST /api/event` → 404). Tworzy je panel lokalu albo `npm run event:create`.
- **Smoke działa tylko na lokalnej bazie** (sam zakłada restauracje i konta). Wdrożoną instancję sprawdza się ręcznie (README „Pierwsze uruchomienie”).

## Zablokowane / potrzebne od Ciebie

Blokerów technicznych w nocy nie było (`## Blokery` w `overnight-log.md` puste). Żadnej nowej zależności.

Nie zaczęte (zostają na kolejne sesje): kelner „na imprezę” (reszta S-21), S-22 wyszukiwanie gościa na mapie, S-23 import gości i diety, S-24 wydruki, S-25 potwierdzenie obecności i wybór dania, S-26 prywatność i retencja, S-27 odczyt bez sieci dla obsługi, S-28 pub quiz, S-29 restauracja demo, S-30 strona produktu i szkice dokumentów.

Od Ciebie potrzebne:
- przejrzenie decyzji podjętych w nocy bez pytania (sekcja wyżej i `## Decyzje` w logu), zwłaszcza: menu wymuszane dla nowych wydarzeń (S-16), moduły i stała lista płatnych (S-17), aktualizacja z szablonu niezależna od „lokal prowadzi” (S-15), wyłączenie lokalu bez kończenia sesji i linków (S-10);
- decyzja o luce w odzyskiwaniu hasła dla menedżera/kelnera w kilku lokalach (S-12);
- zgoda na kelnera „na imprezę” (jednorazowy link lub kod bez hasła, ważny do południa po imprezie) jako osobną zmianę — projekt jest w CLAUDE.md;
- ręczna checklista poniżej (przeglądarka, PL/EN);
- nowy projekt Supabase i decyzja o wdrożeniu (Otwarte pytanie 4) — nic nie zostało wdrożone;
- przegląd i scalenie gałęzi `overnight/m2` do `main` (tylko Ty).

## Jak uruchomić lokalnie

```bash
npx supabase start -x gotrue,realtime,storage-api,imgproxy,studio,postgres-meta,mailpit,edge-runtime,logflare,vector,supavisor
npx supabase migration up          # tylko lokalnie, bez flag
npm run env:local
npm run build && AI_PROVIDER=mock npm run preview
AI_PROVIDER=mock npm run demo      # drukuje linki i loginy
AI_PROVIDER=mock npm run smoke
npx astro preview stop
```

- `.env` ma `AI_PROVIDER=anthropic`, więc demo i smoke uruchamiaj z `AI_PROVIDER=mock` (inaczej tematy AI pójdą do płatnego API).
- Pierwszy administrator platformy: `npm run platform:admin -- <email> [--name "Imię"]` → link `/haslo/<token>`. Na nie-lokalnej bazie wymaga `--remote`.
- Nowe komendy: `npm run event:create -- [--restaurant "<nazwa>" | --restaurant-id <id>] [--name "<nazwa>"]` (wydarzenie bez panelu), `npm run load:local [-- --events 3 --keep]` (obciążenie 200 telefonów, tylko lokalny podgląd; `--keep` zostawia wydarzenie w pełnym rozmiarze).
- Demo drukuje też: „Praca klienta” (wydarzenie prowadzone przez klienta i przez lokal), szablon sali, menu lokalu, „Obsługa sali” (kelner) i TV jednej sali (`?sala=`).
- Loginy demo: admin `admin@demo.stolik` / `demo-admin-1`; właściciel `wlasciciel-<id>@demo.stolik` / `demo-wlasciciel-1`; menedżer `menedzer-<id>@demo.stolik` / `demo-menedzer-1`; kelner `kelner-<id>@demo.stolik` / `demo-kelner-1` (id drukuje demo).

## Ręczna checklista na rano (wiersze Manual z planów)

- F-02: 1.8 strony organizatora wydarzenia 1 wyglądają jak przed migracją; 3.6 strony organizatora, TV, gościa i restauracji wydarzenia demo wyglądają jak przed F-02.
- F-03: 2.6 link z CLI ustawia hasło i prowadzi do `/panel`; wyloguj, zaloguj, zmień hasło; PL i EN. 3.6 login demo pokazuje „Restauracja demo” z rolą „Właściciel”.
- S-10: 2.6 admin zakłada restaurację → link zaproszenia w oknie prywatnym → hasło → panel; wyłącz → „Wyłączona” + brak dostępu; włącz; PL/EN. 3.6 `/panel/platforma` jako admin demo.
- S-11: 2.3 utworzenie → karta → kopiuj link klienta → widok organizatora w < 3 min; 2.4 wymiana każdego linku (stary martwy, nowy działa); 2.5 archiwum/przywrócenie, usuwanie tylko u właściciela, PL/EN; 3.4 trzy zakładki demo; 4.2 przegląd CLAUDE.md.
- S-12: 2.3 zaproszenie → link → hasło → restauracja; menedżer zaprasza kelnera; zmiana roli, usunięcie, „Nowy link”; PL/EN; 3.4 loginy menedżera i kelnera demo pokazują swój zakres; 4.2 przegląd CLAUDE.md.
- S-13: 2.6 tryb wsparcia jako admin demo (wejście, baner, strony tylko do odczytu, koniec, PL/EN); 3.4 właściciel demo widzi dziennik wejść; 4.3 przegląd CLAUDE.md.
- S-14: 2.3 przełącznik przenosi edycję między panelem a klientem; 3.3 reset prób a pełny reset; 4.2 cena z panelu widoczna w linii klienta; 5.4 podglądy i strony klienta w PL/EN.
- S-15: 3.4 szablon od zera → rysunek → wydarzenie z szablonu → zmiana szablonu → „Zaktualizuj z szablonu” na karcie wydarzenia (ostrzeżenie, kto traci miejsce); PL/EN.
- S-16: 2.3 formularz zamówienia klienta z listą z menu, tablet kuchni pogrupowany po kursach; PL/EN.
- S-17: 2.2 przełączniki modułów klienta, lokalu i administratora w PL/EN; wyłączony moduł znika z telefonu gościa i z TV przy następnym odpytaniu.
- S-18: 2.2 marka na telefonie gościa, TV, podglądzie wydruku karteczek i w panelu; PL/EN.
- S-19: 1.5 stoliki 30-osobowe na `/o/<klucz>/sale` i na TV (`npm run load:local -- --keep` zostawia wydarzenie w pełnym rozmiarze); 2.5 pomiar po wdrożeniu (niżej).
- S-20: 1.3 gęsta sala rotuje na prawdziwym TV; 2.4 linki TV dla każdej sali (organizator i karta wydarzenia w panelu) kopiują się i otwierają.
- S-21: 1.3 na telefonie kelner oznacza sztuki i dopisuje dokładkę na `/panel/obsluga/<id>`; 2.2 „Dziś na sali” pokazuje wydarzenie także po północy, do południa.

**Przepływ 1–7 z PRD v2:** da się go przejść w całości w aplikacji (z kontem kelnera; wariant „kelner na imprezę” jeszcze nie).
1. Administrator zakłada restaurację i daje link zaproszenia — tak (S-10).
2. Właściciel ustawia hasło, zaprasza menedżera i kelnera — tak (F-03, S-12); kelnera „na imprezę” jeszcze nie.
3. Menedżer wprowadza szablon sali — tak (S-15).
4. Wydarzenie z szablonu, kopiowanie linku klienta — tak (S-11, S-15).
5. Klient wkleja gości, rozsadza, publikuje; lokal ma podgląd — tak (v1, S-14).
6. Zamówienia (klient albo menedżer w trybie „lokal prowadzi”), TV, tablet `/r/` — tak (S-14, S-16). Kelner na własnym koncie oznacza wydane i dopisuje dokładki — tak (S-21).
7. Archiwum i następne wydarzenie z tego samego szablonu — tak (S-11, S-15).

## Wdrożenie — przypomnienie

- Wszystkie nowe migracje M-2 idą do **NOWEGO** projektu platformy, **nigdy** do starego projektu kolacji `eaubtfkoehpekdckhnxf`. CLI Supabase w repo jest dziś połączone ze starym projektem (`supabase/.temp`): przed `db push` trzeba je przełączyć na nowy projekt i sprawdzić ref.
- Kolejność: `db push` (nowy projekt) → dopiero potem `deploy:aws`. Prawie każda migracja nocy musi być w bazie przed kodem, inaczej panel albo strony `/o/` dają 500.
- Migracje nocy w kolejności (nowy projekt dostaje WSZYSTKIE migracje z `supabase/migrations/`, także te z v1):
  `20261109120000_multi_tenant_events`, `20261109140000_staff_accounts`, `20261109160000_platform_restaurants`, `20261110120000_restaurant_events`, `20261110140000_restaurant_team`, `20261110160000_admin_support_log`, `20261110180000_client_restaurant_split`, `20261110200000_venue_templates`, `20261110220000_menu_catalog`, `20261110230000_event_modules`, `20261111000000_event_branding`, `20261111010000_scale_150` (S-20 i S-21 bez migracji).
- Na pustej nowej bazie nie powstaje „Restauracja domyślna” (tworzy się tylko, gdy są wydarzenia). Dane kolacji z 2026-11-08 zostają w starym projekcie jako archiwum; przeniesienie ich to osobna decyzja.
- Pomiar po wdrożeniu (S-19, wiersz 2.5): w czasie publikacji z prawdziwymi telefonami CloudWatch `ConcurrentExecutions`, `Duration` p50/p95 i `Throttles`; podział odpowiedzi 200/204 na `/api/g/*/state`; w Supabase liczba zapytań i błędy 5xx/429; stoper na 3–5 telefonach (cel ≤ 5 s od „Opublikuj”).
- Pierwszy admin na nowej bazie: `npm run platform:admin -- <email> --remote` z `SUPABASE_*` nowego projektu.
- Decyzja i wykonanie należą do Ciebie.

## Otwarte pytania PRD v2 (1–8)

1. Nazwa produktu — otwarte; w kodzie robocza „Stolik” w jednej stałej (`src/lib/i18n/product.ts`), widoczna tylko w panelu i na stronie głównej, nigdy u gościa (S-18).
2. Plan sali i menu do demo — otwarte; demo używa przykładowych.
3. Data demo — otwarte.
4. Hosting platformy (nowy projekt, „zawsze dostępna”, domena) — otwarte, decyzja kosztowa Twoja.
5. Cennik modułów — otwarte; płatne są na razie w stałej w kodzie (tematy AI, pub quiz), odblokowanie ręczne przez admina działa (S-17).
6. Regulamin, polityka prywatności, umowa powierzenia — otwarte (dziennik wejść admina już istnieje i jest widoczny dla właściciela).
7. Natywny `.xlsx` — otwarte (import gości S-23 jeszcze nie powstał).
8. Koszt AI na platformie — otwarte; koszty AI wydarzenia widzi teraz lokal w panelu (S-14).
