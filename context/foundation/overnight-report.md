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

---

# Przebieg 2 — dzień i noc 2026-11-10/11

Ta sama gałąź `overnight/m2` (wypchnięta po każdym elemencie). `main` nietknięty, bez PR, bez `db push`, bez deployu, zero płatnych wywołań AI, żadnej nowej zależności. Stary projekt kolacji (`eaubtfkoehpekdckhnxf`) nietknięty. Kamienia milowego M-2 nie zamykałem (`/10x-roadmap` zostawiony Tobie).

**Ostatni zielony commit:** `a4aa6e7` (HEAD `overnight/m2`, wypchnięty; ostatni commit z kodem: `3b9c4e6`). Po każdym elemencie sam sprawdziłem testy, lint, astro check, build, smoke i demo na `AI_PROVIDER=mock`. **Wszystkie 10 elementów przebiegu 2 jest zrobionych; cała roadmapa M-2 ma status `done`.**

## Co zrobione (przebieg 2)

| Element | FR / US | Commity (fazy → archiwum) | Migracja |
| --- | --- | --- | --- |
| S-21b event-waiter-access (kelner „na imprezę”) | FR-023, FR-029, US-08 | 306a01e, e1a3ee9, fcf4988 → 90fb9b8 | `20261111020000_event_waiters.sql` |
| S-22 guest-map-search | FR-048, US-08 | 829534d, c86ecd3 → b6d6f4b | brak |
| S-23 guest-import-diets | FR-035, FR-036, US-07, NFR-021 | 972f17c, 645331b, c07fea3 → 21f5241 | `20261111030000_guest_diets.sql` |
| S-25 guest-rsvp-menu | FR-039, US-07 | 0b0e645, 8cd7f66, 9373537 → 356f2d2 | `20261111040000_guest_rsvp.sql` |
| S-26 privacy-retention | FR-040, US-09, NFR-019, NFR-021 | ea90138, ae5a3ff, 89851be → b6ceb0d | `20261111050000_privacy_retention.sql` |
| S-27 staff-offline-readout | FR-047, US-08, NFR-017 | 78c3127, 1c1304e, d0f8237 → fa3f216 | brak |
| S-28 pub-quiz | FR-049, NFR-014, NFR-021, NFR-023 | 27504c6, 4fbea9e, bb4cada, 2825d29 → d93f69f | `20261111060000_pub_quiz.sql` |
| S-24 room-prints | FR-038 | acbd401, 84c54a2, d4458af, 8098d82 → 211caba | brak |
| S-29 demo-restaurant | FR-042 | 98315a0, 0909b61, c2d079a, 9648a37 → d95667e | brak |
| S-30 landing-legal | FR-041 | 15183f8, 013a2ac, 1a51d9b, 3b9c4e6 → 005a9f1 | brak |

Stan po S-28: 142 pliki testów / 1487 testów zielonych, 6 pominiętych; smoke 858 PASS / 0 FAIL; demo OK. Stan po S-24: 144 / 1510, 6 pominiętych; smoke 871 PASS / 0 FAIL; demo OK. Stan po S-29: 145 / 1542, 6 pominiętych; smoke 871 PASS / 0 FAIL; demo OK (także ponowne uruchomienie). **Stan końcowy (po S-30): 146 plików / 1577 testów zielonych, 6 pominiętych; lint 0, astro check 0 błędów, build OK; smoke 875 PASS / 0 FAIL; demo OK.** Start przebiegu 2: 126 / 1267, smoke 776.

## Co warto wiedzieć (przebieg 2; pełna lista w `overnight-log.md` → `## Decyzje`, linie `2026-11-10 — S-…`)

- **Kelner „na imprezę” (S-21b):** właściciel albo menedżer wpisuje imię na karcie wydarzenia i dostaje RAZ link `/kelner/<token>` i krótki kod (np. `135-X8AU-HQZF`). Bez konta i hasła. Pierwsze użycie linku albo kodu zużywa oba i otwiera salę tylko tego wydarzenia do południa po imprezie (ciasteczko `kp-waiter`, osobne od panelu). Nie ma „nowego linku”: po wylogowaniu lub zgubionym telefonie usuń kelnera i dodaj go jeszcze raz. Kod ma limit 10 prób na 15 min na kelnera (link nie ma limitu). Admin platformy nigdy nie widzi linków ani kodów. Ryzyka: wyciek wiersza z bazy pozwala złamać kod offline (ważny najwyżej ~36 h); ktoś może wyczerpać próby kodu kelnera (link działa dalej).
- **Szukanie gościa na mapie (S-22):** pole „szukaj” na telefonie gościa, tablecie `/r/`, stronie zamówień klienta, podglądzie w panelu i obu salach kelnera. Znaleziony gość świeci na fioletowo (własne krzesło gościa zostaje czerwone). Szuka tylko w opublikowanym rozsadzeniu, czyli w tym, co strona już pokazuje. Na TV i w `/rozsadzenie` nie ma pola.
- **Import gości i diety (S-23):** CSV lub wklejka z podglądem (UTF-8, a jeśli się nie da — Windows-1250 z polskiego Excela). 8 stałych tagów diet i alergii plus notatka do 120 znaków. **Diety to dane o zdrowiu:** widzą je tylko klient, lokal (tablet, sala, podglądy) i kelnerzy. Nigdy gość (nawet własnej), TV, AI ani logi. **Tryb wsparcia admina też widzi diety** (zapisane w logu; do decyzji razem z Otwartym pytaniem 6). Bez `.xlsx` (Otwarte pytanie 7).
- **Potwierdzenia i wybór dania (S-25):** klient ustawia termin i dania do wyboru (z dostępnego menu, max 12). Gość na telefonie: „Przyjdę / Nie przyjdę” i jedno danie. Po terminie odpowiedź jest tylko do odczytu, ale klient może poprawiać zawsze. „Nie przyjdę” = nieobecny na liście gości (jedno źródło prawdy). **Nie zrobione:** liczby na tablecie kuchni, „przenieś wybory do zamówień”, osobna część resetu.
- **Retencja i eksport (S-26):** właściciel ustawia, ile dni po imprezie trzymać dane gości (domyślnie 30, 1–365). Potem znikają goście, diety, rozsadzenia, odpowiedzi, notatki zamówień i kelnerzy „na imprezę”. Zostają wydarzenie, sala, menu i rachunek bez nazwisk. **Nie ma harmonogramu:** usuwanie dzieje się przy otwarciu przeterminowanego wydarzenia, przy wejściach na strony panelu (najwyżej raz na 10 min) i przez `npm run retention`. Zaplanowanie tej komendy to Twoja decyzja infrastrukturalna. Eksport JSON i dwa CSV na karcie wydarzenia (właściciel, menedżer; admin nie). Informacja o prywatności dla gościa `/g/<klucz>/prywatnosc` to **szkic „do przeglądu prawnika”**. **Uwaga przy pierwszym wdrożeniu:** każde wydarzenie starsze niż 30 dni straci dane gości przy pierwszym odczycie. Stary projekt kolacji nigdy nie dostaje tych migracji.
- **Odczyt bez sieci dla obsługi (S-27):** tablet kuchni, sala kelnera i sala kelnera „na imprezę” pamiętają na urządzeniu ostatni stan (rozsadzenie, przygotowanie, diety; bez cen i kluczy) i pokazują go bez sieci także po odświeżeniu (`…/odczyt`). Kopia wygasa w południe dnia po imprezie i znika po odmowie dostępu, po wylogowaniu i na `/kelner` bez sesji. Ryzyka: **tablet zapisuje w każdy dzień, w którym ktoś go otworzy** (otwarty kilka dni przed imprezą trzyma imiona i diety do jej końca; ograniczenie do dnia imprezy to mała zmiana, niezrobiona); urządzenie, które zostaje offline po „Wyloguj wszędzie”, trzyma kopię do wygaśnięcia; zwykły http w sieci lokalnej nie ma service workera (tylko otwarta strona trzyma stan).
- **Pub quiz (S-28):** płatny moduł (odblokowuje admin w wizycie wsparcia, potem włącza klient). Pytania 2–4 odpowiedzi, jedna poprawna, do 50, bez AI. Klient prowadzi: zapowiedź → pytanie → zamknięcie z poprawną odpowiedzią i liczbami → wyniki. Gość odpowiada na telefonie i może zmienić odpowiedź, dopóki pytanie jest otwarte. **Wyjątek od „ranking tylko u prowadzącego”:** na etapie „Wyniki” TV pokazuje miejsca 1–3 z imionami i punktami (do 10 imion). W trakcie pytania TV pokazuje tylko liczbę odpowiedzi. „Reset prób” ma część „Pub quiz”. Uwaga: TV wydarzenia demo otwiera się na wynikach quizu, które zasłaniają rozsadzenie; „Zakończ quiz” na `/o/<klucz>/quiz` je zdejmuje.
- **Wydruki dla sali (S-24):** klient (`/o/<klucz>/wydruki`) oraz właściciel i menedżer w panelu (karta wydarzenia, „Wydruki dla sali”) drukują cztery rzeczy: tablicę „Znajdź swój stolik” (A4 albo plakat A3), karty stołów, winietki (namiot albo płaskie, trzy rozmiary, arkusz A4 z liniami cięcia i zgięcia) i listę dla obsługi z dietami przy stołach. Listę z dietami otwierają też kelnerzy na sali (konto i „kelner na imprezę”). Dane pochodzą z ostatniego opublikowanego rozsadzenia; o nieopublikowanych zmianach ostrzega notka widoczna tylko na ekranie. Każdy wydruk ma markę lokalu i klienta, nie ma kluczy ani cen, a diety są tylko na liście dla obsługi. Bez migracji. Ryzyko: podział na strony jest szacowany po liczbie znaków (34 wiersze w kolumnie tablicy, 36 jednostek na stronę listy). Bardzo długie imiona albo uwagi mogą wyjść poza arkusz; wiersz wtedy rośnie, nic nie jest ucinane. Nie sprawdziłem tego na prawdziwej drukarce.
- **Restauracja demo (S-29):** `npm run demo` nie zakłada już za każdym razem nowej restauracji. Odświeża jedną stałą „Restaurację demo” ze stałymi lokalnymi loginami: `admin@`, `wlasciciel@`, `menedzer@` i `kelner@demo.stolik`. Przy każdym uruchomieniu usuwa wydarzenia tej restauracji i zakłada pięć od nowa z szablonu „Cały lokal (szablon demo)” (3 sale, 14 stolików, 98 miejsc). Główne to „Impreza firmowa Acme (demo)”: dziś, 80 fikcyjnych gości, w tym 50 z CSV z dietami. Linki wydarzeń zmieniają się więc przy każdym uruchomieniu, a wydarzenia założone podczas prób znikają. Szablon i menu lokalu zostają między uruchomieniami; `--plan`, `--venue`, `--menu` i `--reset` budują je od nowa. Tak wejdzie prawdziwy plan i menu (Otwarte pytanie 2): pliki `scripts/demo-data/sala.json` i `menu.csv` albo edycja w aplikacji. Scenariusz pokazu po polsku, kroki 1–7, jest w `docs/scenariusz-pokazu.md`. Na hostowanej platformie skrypt nie działa celowo, bo stałe hasła demo nie mogą tam istnieć; scenariusz opisuje ręczne przygotowanie. Uwaga: przy sprawdzaniu świeżej bazy wykonałem `npx supabase db reset` na **lokalnej** bazie, więc lokalne dane z wcześniejszych prób zniknęły.
- **Strona produktu i szkice prawne (S-30):** `/` to teraz strona produktu (nazwa robocza „Stolik” ze stałej `PRODUCT_NAME`) z przyciskiem „Zaloguj się” → `/logowanie`; nie czyta bazy. Dwa szkice: `/regulamin` i `/polityka-prywatnosci`, PL i EN. Każdy ma baner „Wersja robocza — do przeglądu prawnika”, a każdy nieznany fakt jest oznaczonym polem `[…]` (operator, adres, NIP/KRS, e-mail kontaktowy — żadnych wymyślonych danych). Opisują to, co aplikacja naprawdę robi: ciasteczka `kp-session`, `kp-waiter`, `kp-lang`, `kp-lang-r`, kopie w pamięci przeglądarki, termin danych gości, dziennik wejść admina, brak AI na danych gości. Obie strony idą z `noindex` i `no-store`. Linki do szkiców są tylko na `/`, `/logowanie`, `/haslo/<token>`, `/panel` i `/kelner`. Nigdy na stronach gościa, TV, tabletu, wydruków i klienta (white-label). **Umowa powierzenia (DPA) z lokalem nie jest napisana.**

## Zablokowane / potrzebne od Ciebie (przebieg 2)

Twardych blokad w przebiegu 2 nie było (`## Blokery` w logu: brak). Żaden element nie został cofnięty.

Z części 1 nadal otwarte (bez zmian): menu wymuszane dla nowych wydarzeń (S-16); rotacja TV zmienia wygląd wydarzenia 1 (S-20); stała lista płatnych modułów (S-17, Otwarte pytanie 5); luka w odzyskiwaniu hasła menedżera/kelnera w kilku lokalach (S-12); opóźnienia przy kilku imprezach naraz i liczba zapytań wobec darmowego limitu Lambdy (S-19).

Nowe do decyzji:
- ryzyka kelnera „na imprezę” (S-21b, wyżej) — akceptujesz?
- tryb wsparcia admina widzi diety (S-23) — zostaje, czy ukryć?
- harmonogram `npm run retention` i świadomość czyszczenia przy pierwszym wdrożeniu (S-26);
- tablet zapisuje odczyt w każdy dzień (S-27) — ograniczyć do dnia imprezy?
- co z liczbami RSVP na tablecie, „przenieś wybory do zamówień” i resetem RSVP (S-25, poza zakresem);
- szkice prawne do przeglądu prawnika (S-26, S-30). Punkty dla prawnika (pełna lista w logu, linia `2026-11-10 — S-30 otwarte punkty dla prawnika`):
  - tożsamość operatora i kontakt;
  - forma umowy z lokalem i moment akceptacji regulaminu;
  - umowa powierzenia (DPA), której jeszcze nie ma;
  - podstawy prawne, w tym diety i alergie jako dane o zdrowiu (art. 9 RODO);
  - role administratora i podmiotu przetwarzającego dla personelu i kelnerów „na imprezę”;
  - kto jest administratorem danych gości, które wpisuje klient;
  - retencja kont personelu, logów technicznych i kopii zapasowych;
  - podwykonawcy, regiony i transfer poza EOG;
  - czy ciasteczka wymagają informacji albo zgody;
  - kopia offline u organizatora, która nie wygasa na urządzeniu;
  - odpowiedzialność, reklamacje, prawo właściwe i data wejścia w życie.
- Nazwa produktu, domena i indeksowanie strony (Otwarte pytania 1 i 4) oraz ceny (Otwarte pytanie 5).

## Ręczna checklista (przebieg 2; wiersze Manual z planów)

- S-21b: 1.4 karta wydarzenia „Kelnerzy na imprezę” dodaje kelnera i pokazuje link i kod raz (PL/EN); 2.3 na telefonie: link → „Wejdź na salę”, oznacz sztukę, dopisz dokładkę; potem kod w innej przeglądarce; 3.3 link i kod z demo otwierają salę raz, usunięcie kelnera wylogowuje telefon.
- S-22: 1.5 na `/r/<klucz>` i `/o/<klucz>/zamowienia` wpisanie imienia świeci krzesło na fioletowo (inaczej niż czerwone danie); Escape czyści tylko szukanie; Tab/Enter bez myszy; 2.5 telefon gościa: wybór trafienia otwiera plan i przewija do stolika; własne krzesło czerwone, trafienie fioletowe; czytnik ekranu ogłasza wyniki.
- S-23: 1.5 prawdziwy eksport z polskiego Excela (`;`, Windows-1250 lub UTF-8 z BOM) i wklejka z Arkuszy Google; 2.5 import na `/o/<klucz>/goscie` (plik, wklejka, podgląd z problemami, zapis, edytor diety; PL/EN); 2.6 diety czytelne na tablecie, w zamówieniach, na obu salach i w edytorze rozsadzenia; 3.4 linki demo pokazują diety przy miejscach.
- S-25: 2.3 telefon: Przyjdę → danie → zapisane; po „Zamknij teraz” sekcja na dole tylko do odczytu; 2.4 strona klienta i podgląd w panelu (termin, dania, liczby, poprawki per gość; ramka tylko do odczytu, gdy lokal prowadzi); 3.4 demo `/o/<klucz>/potwierdzenia` i karta w panelu.
- S-26: 1.5 lista usuwanych tabel funkcji czyszczenia wobec `src/db/database.types.ts` (nic z nazwiskiem albo zdrowiem nie zostaje); 2.2 strona restauracji (właściciel: formularz, menedżer: odczyt) i „Dane gości i eksport” w PL/EN; 2.3 CSV gości otwiera się w arkuszu z polskimi znakami; 2.4 strona prywatności gościa na telefonie (PL/EN), wyraźnie szkic; 3.5 „Komunia Zosi (demo)” pokazuje „Dane gości usunięte”; 3.6 `npm run retention -- --dry-run` jest zrozumiały.
- S-27: 1.5 projekcja bez id, cen, kluczy i oznaczeń (`staffReadoutFromBoard`); 2.5 tablet, sala, sala kelnera „na imprezę”: strona na żywo, potem `…/odczyt` z „Stan z …”; 2.6 DevTools „Offline” + odświeżenie każdej strony na żywo pokazuje kopię (lokalny podgląd); 2.7 wylogowanie, potem `/logowanie`: slot sali i worker `/panel/obsluga/*` znikają; 3.4 prawdziwy tablet/telefon po https bez Wi-Fi pokazuje ostatni stan, po południu następnego dnia nic; 3.5 zwykły http w LAN: tylko otwarta strona trzyma stan.
- S-28: 1.x funkcje migracji i uprawnienia (`\df public.quiz*`, brak execute dla anon/authenticated); 2.5 strona klienta PL/EN: przygotowanie, cały quiz, ranking; 2.6 telefon: odpowiedź, zmiana, dobrze/źle, miejsce, nic cudzego; 2.7 TV: zapowiedź, pytanie, odsłona z liczbami, wyniki; czytelne na 16:9; 3.4 quiz z demo na prawdziwym TV i telefonie; 3.5 punkt CLAUDE.md o quizie.
- S-24: 1.5 nowe typy wydruków w `src/types.ts` bez id, kluczy i cen; 2.5 podgląd wydruku w Chrome dla czterech wydruków (A4 bez nagłówka z adresem, linie cięcia i zgięcia, pasek marki, tablica jako A3); 2.6 złożone winietki i karty stołów czytelne po obu stronach; 3.5 linki „Wydruki” z demo otwierają się i drukują.
- S-29: 1.4 i 2.7–2.8 z planu (dane demo, rotacja sal na TV, wyliczona, ale niesprawdzona na ekranie); 3.5 przejście kroków 1–7 ze scenariusza; 3.6 prawdziwy plan i menu (Otwarte pytanie 2). Data pokazu (Otwarte pytanie 3) decyduje, kiedy uruchomić demo, bo impreza jest „dziś”.
- S-30: 1.5 i 1.6 czy szkice dobrze się czyta (baner, pola `[…]`, spis treści); 2.6 `/` na telefonie i laptopie w PL i EN; 2.7 linki w stopkach stron personelu; 3.2 trzy linki z wydruku demo i zgodność CLAUDE.md ze stronami.

**Przepływ 1–7 z PRD v2:** teraz w całości, także z kelnerem „na imprezę” (S-21b).

## Wdrożenie — przypomnienie (przebieg 2)

- Jak w części 1: wszystkie migracje tylko do **NOWEGO** projektu platformy, w kolejności nazw, `db push` przed `deploy:aws`; nigdy do `eaubtfkoehpekdckhnxf`.
- Migracje przebiegu 2 w kolejności: `20261111020000_event_waiters`, `20261111030000_guest_diets`, `20261111040000_guest_rsvp`, `20261111050000_privacy_retention`, `20261111060000_pub_quiz`. S-24, S-29 i S-30 nie mają migracji. Po review PR #4 doszła `20261111070000_review_fixes` (addytywna, przed kodem; szczegóły w `context/foundation/m2-review.md`).
- Pub quiz: kod zaraz po migracji (stary kod nie przyjmuje nowych liczników resetu, więc podgląd resetu do czasu deployu nie działa).
- Retencja: przed pierwszym wdrożeniem wyeksportuj, co ma zostać — wydarzenia starsze niż termin tracą dane gości przy pierwszym odczycie.
