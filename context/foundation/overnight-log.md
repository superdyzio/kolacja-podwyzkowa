# Overnight log — M-2

Dziennik decyzji, zależności i blokerów nocnego przebiegu M-2 (zasady: `overnight-brief.md`). Dziennik M-1: `archive/2026-10-27-overnight-log-m1.md`.

## Start

- Start: 2026-11-09 21:28 CET (polecenie użytkownika: „no to lecisz z tym wszystkim”). Ostatni nowy element może ruszyć do 2026-11-10 04:28.
- Gałąź: `overnight/m2` z `plan/m2-saas`.
- Środowisko: lokalny Supabase działa (baza, REST, gateway); `.env` → `127.0.0.1`; CLI podlinkowany do starego projektu (tylko polecenia lokalne); `.env` ma `AI_PROVIDER=anthropic`, więc serwery idą z `AI_PROVIDER=mock`.

## Decyzje

- 2026-11-09 — użytkownik potwierdził start nocy i zgodę z briefu na usuwanie plików kodu zastępowanych przez plan („no to lecisz z tym wszystkim”). F-02 planuje noc (subagent), bez sesji interaktywnej.

- 2026-11-09 (sesja interaktywna) — roadmapa M-2: `main_goal: speed`, gwiazda przewodnia S-11 `restaurant-events`, `top_blocker: time` przyjęte z rekomendacji (sesja kontynuowana bez dodatkowych pytań; użytkownik może nadpisać).
- 2026-11-09 (sesja interaktywna) — numeracja M-2 ciągnie się od M-1 (F-02, F-03, S-10..S-30). `restaurant-panel` z `m2-product-notes.md` podzielony na `platform-restaurants`, `restaurant-events`, `restaurant-team` i `admin-support-log`; `event-modules-branding` na `event-modules` i `event-branding`; z `scale-150` wydzielony `tv-room-rotation`.
- 2026-11-09 (sesja interaktywna) — przy sprzeczności `m2-product-notes.md` z PRD v2 wygrywa PRD v2 (role właściciel / menedżer / kelner; zamówienia zostają u klienta z cenami tylko do odczytu).
- 2026-11-09 — F-02 /10x-plan: złożoność HIGH, pytania skilla rozstrzygnięte opcją rekomendowaną (bez AskUserQuestion); jedna duża faza rdzenia (migracja + wszystkie serwisy + testy), bo nic mniejszego nie jest zielone.
- 2026-11-09 — F-02 Unknown z roadmapy (jak smoke, demo i testy zakładają wydarzenie przed panelem S-11): bez żadnej trasy HTTP; bezzależnościowy `scripts/lib/platform.mjs` zakłada restaurację i wydarzenie przez PostgREST kluczem service-role (smoke i demo tylko na 127.0.0.1/localhost), plus CLI `npm run event:create`; testy integracyjne używają `createRestaurant`/`createEvent` z `src/lib/event.ts` i usuwają swoje wydarzenia.
- 2026-11-09 — F-02: klucze organizatora i TV generuje baza (domyślne kolumn jak `restaurant_key`), więc założenie wydarzenia to jeden insert; baza startowa pytań: smoke/demo przez istniejące `POST …/questions/starter`, CLI przez `seed.ts` z `--experimental-strip-types`.
- 2026-11-09 — F-02: serwisy biorą `eventId` jako drugi parametr; funkcje DB dostają `p_event_id` (stare sygnatury jawnie `drop function`), blokady `(3003, event_id)` i `(3008, event_id)`; złożone FK `(event_id, …)` na odwołaniach między wierszami, oprócz `guess.guest_id` (osadzenie PostgREST guest → guess jeden-do-jednego).
- 2026-11-09 — F-02: restauracja „Restauracja domyślna” powstaje w migracji tylko, gdy istnieją wydarzenia; `event.id` integer identity; domyślna nazwa wydarzenia „Kolacja podwyżkowa” zdjęta z kolumny; data/status wydarzenia zostają dla S-11.
- 2026-11-09 — F-02 /10x-plan-review: werdykt SOUND po poprawkach; F1 (złożone FK zachowują nazwy starych FK, bo `venue/service.ts` rozpoznaje „brak sali” po `venue_table_room_id_fkey`) i F2 (kontrola linków po nowym buildzie) naprawione w planie; F3 (brak strażnika DB dla guess ↔ gość) zaakceptowane — pokrywa kontrola w serwisie i test izolacji.
- 2026-11-09 — F-02: dane sprzed migracji przygotowane na commicie bazowym 16f27e0 (`db reset`, build, preview z atrapą AI, `npm run demo` + dostęp gości, próba AI, spotlight, napój przez stare API) do sprawdzenia `migration up`.
- 2026-11-09 — F-02 p1: jedna reguła bez wyjątków — `eventId` jest drugim parametrem każdej funkcji serwisu, także `generateTopic`, `proposeVenueLayout` i `planImageResponse` (przed dostawcą/locale); trasy TV czytają `access.event.id` z `accessFor`; każdy plik testów integracyjnych zakłada własną restaurację i wydarzenie (`createTestEvent`/`releaseTestEvent`), więc strażniki „tylko na wydarzeniu utworzonym przez test” zniknęły, a `published-seating.test.ts` publikuje własne rozsadzenie zamiast czytać cudze.
- 2026-11-09 — F-02 p1, dowód dla ręcznego 1.8 (lokalna baza zostanie zresetowana w fazie 3, więc wydarzenia 1 nie da się już obejrzeć rano): na danych sprzed migracji (commit 16f27e0 + `npm run demo`, potem `npx supabase migration up`) liczności wszystkich tabel identyczne przed i po migracji, klucze wydarzenia 1 bez zmian; nowy build + preview: 13 adresów wydarzenia 1 (`/`, `/o/…` z podstronami rozsadzenie/zamówienia/pytania, `/tv/…`, `/r/…`, `/g/…`, API stanu gościa, TV, restauracji, gości organizatora i tematów AI) → 200, `POST /api/event` → 404, stan gościa `seated`, stolik „Lipa”, miejsce 1, strzał 150 000 gr. Zrzut danych i liczności: scratchpad sesji (`pre-migration-public-data.dump`, `pre-migration-counts.txt`, `post-migration-counts.txt`, `pre-migration-keys.txt`).
- 2026-11-09 — F-02 p2: `npm run event:create` domyślnie zakłada NOWĄ restaurację („Restauracja”) z wydarzeniem („Wydarzenie”); `--restaurant-id` dokłada wydarzenie do istniejącej; skrypty mówią najpierw, na jaką bazę piszą; smoke i demo (faza 3) wołają `readDbEnv({ requireLocal: true })`.
- 2026-11-09 — F-02 p3: smoke tworzy co przebieg dwie restauracje i dwa wydarzenia z tagiem (A — wszystkie dotychczasowe sekcje, baza startowa przez `POST …/questions/starter`; B — sekcja 23d izolacji) i nie dotyka innych wydarzeń, więc działa wielokrotnie na tej samej bazie; „odmowa jak dla nieznanego id” porównuje status i całe ciało z wywołaniem z id 2 000 000 000; po pełnym resecie A sprawdza, że B czyta się bajt w bajt tak samo. Demo za każdym razem zakłada nową „Restauracja demo” / „Kolacja podwyżkowa (demo)”, logika „odmów, gdy są dane” usunięta. Celowe zepsucie (`deleteDrinkItem` bez filtra wydarzenia) wywraca 3 sprawdzenia smoke.
- 2026-11-09 — F-02 p4: skoro smoke zakłada wydarzenia wprost w LOKALNEJ bazie (`requireLocal`), nie da się go już puścić na adres produkcyjny — README „Pierwsze uruchomienie” mówi teraz: sprawdzenie ręczne na wydarzeniu testowym, a wydarzenie produkcyjne przez `npm run event:create` ze zmiennymi `.env.aws` w wierszu poleceń; CLAUDE.md: migracja F-02 i kod muszą wejść razem (zmienione sygnatury wszystkich funkcji DB).
- 2026-11-09 — F-02 zarchiwizowane (`context/archive/2026-11-09-multi-tenant-events/`), roadmapa F-02 → done. Bez /10x-impl-review (nie było go w zleconym łańcuchu). Czekają dwa ręczne sprawdzenia dla użytkownika: 1.8 (strony wydarzenia 1 jak przed migracją — dowód z nocy wyżej, bo lokalna baza została potem zresetowana) i 3.6 (wydarzenie demo: organizator, TV, gość, restauracja jak przed F-02; `npm run demo` zakłada nowe).

## Dodane zależności

(slice → pakiet → uzasadnienie; w M-2 domyślnie żadnych)

## Blokery

(brak)
