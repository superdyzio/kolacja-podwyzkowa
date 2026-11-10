# Review PR #4 (M-2, `overnight/m2` → `main`) — 2026-11-10

Sześciu recenzentów Fable 5.1 przejrzało PR równolegle, każdy pod innym kątem. Pracowali tylko do odczytu na commicie `163803b`, porównując go z `origin/main` (ok. 52 tys. dodanych linii w `src/`, `supabase/`, `scripts/` i 17 migracji). Każde zgłoszenie sprawdzili poprawiacze Opus 5.5 w kodzie przed zmianą. Pracowali w trzech paczkach, jedna po drugiej. Pełne raporty recenzentów (numery linii według `163803b`) są w `context/foundation/m2-review/review-<n>-*.md`.

Kąty: 1 dostęp i izolacja restauracji, 2 prywatność i dane, 3 migracje i funkcje bazy, 4 logika biznesowa względem PRD v2, 5 frontend, PL/EN i dostępność, 6 rzetelność testów, smoke, skryptów i CLAUDE.md.

**Wynik po poprawkach** (`e4edf76`, sprawdzone przeze mnie, `AI_PROVIDER=mock`): 148 plików / 1594 testy zielone, 6 pominiętych; lint 0, astro check 0 błędów; build OK; smoke 881 PASS / 0 FAIL; `npm run demo` dwa razy z rzędu OK. Doszła jedna migracja: `20261111070000_review_fixes.sql` (addytywna, przed kodem).

## Naprawione

| # | Waga | Kąt | Co | Commit |
| --- | --- | --- | --- | --- |
| 1 | wysoka | 6 | `npm run deploy:aws` drukował po wdrożeniu kroki z `delete from public.event;` w SQL Editorze. Na platformie z wieloma restauracjami usunęłoby to wszystkie wydarzenia ze wszystkim, co od nich zależy. Kroki są teraz w czystej funkcji `nextSteps` (test pilnuje, że nie ma w nich SQL ani smoke), a README „Pierwsze uruchomienie” robi sprawdzenie tylko w panelu. Stare `delete from public.restaurant` z README i tak by nie przeszło. | c63a49d, e4edf76 |
| 2 | wysoka | 4 | Pomyłka w dacie wydarzenia (cofnięcie poza termin danych gości) po cichu i nieodwracalnie kasowała dane gości przy następnym zapytaniu. Teraz `PATCH` daty takiego wydarzenia z danymi gości zwraca 409 `date-would-purge` z komunikatem PL/EN (ostatni dzień przechowywania, sugestia eksportu) i nic nie zapisuje. Tworzenie wydarzeń z dawną datą i ustawienie terminu działają bez zmian. | cfe263a |
| 3 | średnia | 1 | „Nowy link” administratora dla właściciela z hasłem pozwalał wejść jako właściciel bez wpisu w dzienniku. Teraz `issue_owner_link` w jednej transakcji tworzy token i wpis `link` (zaproszenie albo reset, e-mail, ważność), widoczny w „Dzienniku wejść administratora” każdej restauracji tego konta. Ograniczenie samej funkcji zostaje Twoją decyzją. | cfe263a |
| 4 | średnia | 1 | Przełącznik języka `?lang=` buduje teraz przekierowanie tylko na ścieżkę w tej samej domenie (`localeSwitchTarget`). Dziś Astro i tak scala `//`, więc to zabezpieczenie na przyszłość. | c466953 |
| 5 | średnia (częściowo) | 5 | Podglądy tylko do odczytu: etykieta i notka są teraz poza częścią `inert`, a `ModuleOff` z linkiem powrotu zastępuje ramkę w podglądzie panelu. | c63a49d |
| 6 | niska | 3 | Czyszczenie danych gości bierze teraz blokadę quizu `(3013, event)` w kolejności `reset_event`, co zamyka okno zakleszczenia z `quiz_run_action('results')`. | cfe263a |
| 7 | niska | 4 | Licznik pytań quizu na TV nie odświeżał się przy dodaniu lub usunięciu pytania w trakcie quizu. Trigger nadaje teraz nową rewizję, a format tokenu TV się nie zmienił. | cfe263a |
| 8 | niska | 4 | Wyścig „usuń pytanie” z „zadaj”: usuwanie przechodzi przez `delete_quiz_question` pod blokadą `(3013, event)`, z tymi samymi kodami odpowiedzi. | cfe263a |
| 9 | niska | 3 | Zmiana hasła kończy teraz wizyty wsparcia bieżącej sesji (wpis `exit`), zgodnie z CLAUDE.md. | cfe263a |
| 10 | niska | 3 | Jawne `grant execute … to service_role` na 45 funkcjach M-2 i `usage` na sekwencji quizu. Wcześniej działało tylko dzięki domyślnym uprawnieniom Supabase. | cfe263a |
| 11 | niska | 6 | `npm run retention` na bazie innej niż lokalna odmawia (exit 1, nic nie usuwa), gdy zegar laptopa różni się od nagłówka `Date` serwera o więcej niż 5 minut. Dotyczy też `--dry-run`. | c63a49d |
| 12 | niska | 6 | `load:local` sprawdza wynik sprzątania i wymienia, co zostało. | c63a49d |
| 13 | niska | 2 | Informacja o prywatności gościa (PL/EN) opisuje teraz grupy, quiz (odpowiedzi, punkty, miejsce), losowanie osoby na TV i podium quizu. Szkic polityki prywatności wymienia punkty i miejsca quizu. | c63a49d |
| 14 | niska | 5 | Sale kelnerów po odmowie dostępu (zamknięta sala, archiwum, cofnięty kelner, koniec sesji) pokazują alert z drogą powrotu zamiast aktywnej tablicy. | c63a49d |
| 15 | niska | 5 | Pola nazwy marki mają limit 80 znaków jak serwer (było 120). | c63a49d |
| 16 | niska | 5 | Region `aria-live` TV ogłasza każdą zmianę, nie tylko pierwszą. | c63a49d |
| 17 | niska | 4 | `floorWindowEnd` nie wywraca się już na wydarzeniu z datą 2100-12-31. Wcześniej strony tabletu i sal dawały wtedy 500. | c63a49d |

Testy regresji: smoke sekcje 25 i 33 (zakodowane ścieżki, przełącznik języka), 26 i 29 (wpisy `link`), 41 (409 `date-would-purge`); testy integracyjne retencji, quizu i platformy; testy jednostkowe `localeSwitchTarget`, `nextSteps`, sprawdzania zegara i `floorWindowEnd`.

## Nie potwierdzone

- **Obejście bramki modułów i stref personelu przez kodowanie procentowe ścieżki** (kąt 1, zgłoszone jako wysokie i niskie). Nie odtworzyło się na zbudowanej aplikacji. `/api/o/<klucz>/%67uesses`, `%61i-topics`, `%71uiz`, `/%70anel`, `/api/%61uth/login` dostały te same 409, 404, 303 i 403 co zwykłe ścieżki. Powód: Astro 7.3 dekoduje ścieżkę i scala `//`, zanim middleware ją dostanie (`fetch-state.js`). Recenzent śledził tylko router. Smoke sprawdza to teraz stale (sekcje 25 i 33), a CLAUDE.md zabrania ponownego dekodowania w middleware (c466953).

## Przyjęte bez zmian

- Podgląd szablonu porównuje nazwy przez JS `toLowerCase()`, a `apply_venue_template` przez Postgres `lower()` (kąt 4, niska). Różnice są możliwe tylko dla egzotycznych liter. Zostawione.
- Kąt 4 sprawdził też i uznał za zamierzone: cena 0 z wydarzenia wygrywa z katalogiem; każda odpowiedź gościa w quizie pobiera pełny ekran TV (obciążenie, nie błąd); odznaczenie nieobecności na liście zamienia „nie przyjdę” gościa na „przyjdzie (organizator)”; `seating/restore` i `history` nie podlegają modułowi losowania.

## Do Twojej decyzji (nie ruszałem)

1. **Usunięcie gościa nie usuwa jego imienia z opublikowanych rozsadzeń** ani z wpisu „osoba na TV” (kąt 2, średnia). TV, tablet, wydruki i telefony współbiesiadników pokazują imię do następnej publikacji, a stare migawki do czyszczenia po terminie, czyli do 365 dni. Migawki są celowo niezmienne (tokeny, odciski). Naprawa to trigger czyszczący `guest_name` (np. na pusty) i wpis TV przy usunięciu gościa. Ważne przy żądaniu usunięcia danych (art. 17 RODO).
2. **Tryb wsparcia admina a diety** (kąt 2): podgląd i wydruk „lista dla obsługi” z dietami są dla admina dostępne, a eksport celowo nie. Do rozstrzygnięcia razem z już otwartym punktem „tryb wsparcia widzi diety”. Jedna reguła dla podglądu, wydruku i eksportu.
3. **Usuwanie po terminie jest leniwe** (kąt 2, bez harmonogramu): uśpiony lokal trzyma dane gości w bazie bez końca, a informacja o prywatności obiecuje usunięcie „po terminie”. Rozwiązaniem jest harmonogram `npm run retention`, albo ostrożniejszy tekst.
4. **Uwagi do zamówień „na środek stołu”** (dowolny tekst, np. wskazówki dietetyczne) widzą telefony wszystkich przy stole (kąt 2). To zachowanie sprzed M-2.
5. **Cofnięcie daty bez furtki** (kąt 4, nasza poprawka #2): właściciel nie może z panelu celowo cofnąć daty wydarzenia z danymi gości poza termin. Możliwa furtka: flaga `confirmPurge` z potwierdzeniem w karcie.
6. **Skrócenie terminu przechowywania** natychmiast usuwa dane starszych wydarzeń bez ostrzeżenia. To zalogowana decyzja S-26; można dodać ostrzeżenie z liczbą wydarzeń.
7. **„Nowy link” administratora**: po poprawce #3 jest widoczny w dzienniku. Dalsze ograniczenie, np. reset tylko w trakcie wizyty wsparcia albo tylko zaproszenia, jest Twoją decyzją. Decyzje S-10, S-12 i S-13 w `overnight-log.md` o „Nowym linku” są przez to częściowo nieaktualne.
8. **`inert` w podglądach**: czytnik ekranu nie odczyta treści podglądu tylko do odczytu (podgląd personelu, tryb wsparcia, strony klienta przy „Lokal prowadzi”). Naprawione tylko etykiety i link powrotu. Pełne rozwiązanie wymaga innego mechanizmu niż `inert`.

## Co recenzenci sprawdzili i uznali za poprawne (skrót; szczegóły w raportach)

- **Dostęp (1):** każde id przechodzi przez centralne strażniki. Listy ról zgadzają się z tabelą PRD (menedżer nie zmienia ustawień lokalu i nie usuwa wydarzeń). `is_template` jest filtrowane przy każdym otwarciu wydarzenia, a wyłączone restauracje są zamknięte w każdym strażniku. Tryb wsparcia jest tylko do odczytu, daje jeden wpis na odczyt i nigdy nie pokazuje kluczy. Jednorazowe linki i kody są odporne na wyścig. Ciasteczka `kp-session` i `kp-waiter` są rozdzielone. Origin jest sprawdzany przed każdym odczytem bazy przy zmianach. Identyfikatory drugiego poziomu są zawężone do restauracji i wydarzenia.
- **Prywatność (2):** czyszczenie po terminie obejmuje każdą tabelę z imionami, notatkami i dietami i pomija szablony. DTO gościa, TV i tabletu nie mają kluczy, id ani cen poza wyjątkami PRD. Diety są tylko u klienta, lokalu i kelnerów. W promptach AI nie ma danych gości. Wydruki klienta nie mają kluczy. Kopie offline personelu wygasają z oknem sali. Eksport nie zawiera id ani kluczy.
- **Baza (3):** wszystkie 17 migracji zachowuje dane wydarzenia 1 (klucze, wiersze). Wszędzie jest RLS z `revoke` i `search_path = ''`. Wszystkie 13 starych sygnatur jest jawnie usuniętych, bez `security definer`. Blokady są brane w spójnej kolejności, kaskady nie sięgają za daleko, a `database.types.ts` zgadza się z SQL. Kolejność wdrożenia opisana w CLAUDE.md się zgadza.
- **Logika (4):** strefa Europe/Warsaw i reguła południa są spójne w TS i SQL, także przy zmianie czasu. Granice terminu retencji są takie same w aplikacji i bazie. RSVP, quiz, menu z cenami w groszach, moduły, reguła „kto prowadzi”, szablony i import CSV działają zgodnie z PRD. Tokeny odpytywania budują ścieżki 204 i 200 z tych samych odczytów.
- **Frontend (5):** hooki odpytywania sprzątają timery i anulują zapytania. Akcje nie dają się kliknąć dwa razy. Nie ma tekstów tylko w jednym języku. Strony robią jedno wywołanie strażnika. White-label jest zachowany. Nie ma rozjazdów hydracji. CSS wydruków jest poprawny.
- **Rzetelność (6):** smoke (634 sprawdzenia w 45 sekcjach) nie ma sprawdzeń, które nie mogą się wywrócić. Testy nie mają `.skip` ani `.only`, a `skipIf` są uzasadnione. Każdy skrypt ma strażnika lokalnej bazy albo jawne `--remote`, i nic nie może dosięgnąć wydarzenia 1. Paczka Lambdy sprawdza sekrety, nie ma nowych zależności. 12 sprawdzonych twierdzeń z CLAUDE.md zgadza się z kodem.
