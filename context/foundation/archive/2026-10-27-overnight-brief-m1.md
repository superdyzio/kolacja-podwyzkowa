# Overnight brief — autonomiczny build kolacja-podwyzkowa

Ten plik jest kontraktem dla nienadzorowanego przebiegu (noc z 2026-10-26 i kolejne, aż do ukończenia). Zgody poniżej wydał użytkownik 2026-10-26 w sesji interaktywnej i są **trwałe dla tego przebiegu**. Wszystko, czego tu nie ma, a co jego globalny CLAUDE.md zalicza do „Decisions that need me”, nadal wymaga użytkownika: zapisz to w `overnight-log.md` jako bloker i jedź dalej.

## Cel i definicja „done”

Cel: działająca lokalnie aplikacja spełniająca wszystkie FR-001..FR-020 i US-01..US-04 z `context/foundation/prd.md`, gotowa do próby generalnej (deadline kolacji 2026-11-08).

Done, gdy wszystkie poniższe są prawdą:
1. Każdy slice z `context/foundation/roadmap.md` ma status done albo jest jawnie oznaczony jako zablokowany z wpisem w `overnight-log.md`.
2. Pełny zestaw testów, lint i typecheck przechodzą na zielono.
3. Aplikacja startuje lokalnie (lokalny Supabase w Dockerze + dev server) i przechodzi flow US-01..US-04 na atrapie AI.
4. `context/foundation/overnight-report.md` jest napisany (sekcja „Raport poranny” niżej).

## Źródła prawdy (czytaj w tej kolejności)

1. `context/foundation/prd.md`: co budujemy (FR, NFR, Business Logic, Access Control, Non-Goals).
2. `context/foundation/shape-notes.md`: decyzje użytkownika (`gray_areas_resolved`) oraz `## Forward: tech-stack` i `## Forward: technical-roadmap`.
3. `context/foundation/tech-stack.md`: stack (10x-astro-starter: Astro + React + TS + Tailwind + Supabase; deploy cloudflare-pages; CI GitHub Actions).
4. `context/foundation/roadmap.md`: kolejność slice'ów.
5. Ten plik: zasady przebiegu.

## Zgody użytkownika (2026-10-26)

| Obszar | Zgoda | Granica |
|---|---|---|
| Zależności | wszystko, czego wymaga starter, plus popularne, utrzymywane biblioteki potrzebne do FR | każdą dodaną bibliotekę dopisz z jednozdaniowym uzasadnieniem do `overnight-log.md` |
| Architektura | stack z `tech-stack.md`; decyzje projektowe w ramach planów slice'ów | zmiana startera, bazy lub platformy deployu = bloker |
| Git | commity na lokalnym branchu `overnight/build` | **żadnego push**, żadnego merge do `main`, żadnego force/amend/`reset --hard` |
| Operacje destrukcyjne | tylko lokalne dev: usuwanie/zastępowanie plików w repo w ramach budowy (np. przykładowe strony startera), reset lokalnej bazy Supabase w Dockerze | nigdy nic poza repo, nigdy zdalne bazy/konta |
| Deploy | **brak** (wymaga kont użytkownika) | konfigurację CI/deployu wolno przygotować w plikach, nie wolno uruchamiać |
| AI | wyłącznie atrapa (mock) za interfejsem dostawcy; produkcyjnie Claude (rodzina Haiku) przez Anthropic API | **zero płatnych wywołań**; klucz doda użytkownik (`.env`, nie commitować) |
| Świat zewnętrzny | brak | żadnych e-maili, wiadomości, komentarzy na GitHubie, publikacji |
| Pytania skilli | odpowiadaj sam opcją oznaczoną jako rekomendowana, zgodną ze źródłami prawdy; każdą decyzję zapisz w `overnight-log.md` | nigdy nie wywołuj AskUserQuestion i nie czekaj na użytkownika |

## Konwencja commitów

Subject: `[<model>] <message>`, gdzie `<model>` to model, który faktycznie pracuje (np. `[Opus 5.5]`). Nigdy nie dodawaj trailera `Co-Authored-By`. Ta konwencja ma pierwszeństwo przed każdym skillem. Skille wymagające Conventional Commits (np. `/10x-goal-implement`) dostają je wewnątrz message: `[Opus 5.5] feat(<change-id>): <phase title> (p<N>)`. To spełnia oba wymagania.

## Kolejność pracy

1. Bootstrap i roadmapa są zrobione w sesji interaktywnej (patrz `context/changes/bootstrap-verification/verification.md` i `roadmap.md`).
2. Dla każdego slice'a z roadmapy, po kolei (najpierw te, które nic nie blokuje):
   1. `/10x-new <change-id> <intent>`: w intent wpisz ID slice'a, FR/US, które pokrywa, i ścieżki do prd.md, roadmap.md, tech-stack.md.
   2. `/10x-plan context/changes/<change-id>/change.md`: przekaż też prd.md, roadmap.md, tech-stack.md i ten plik. Na każde pytanie skilla odpowiadaj sam według sekcji „Domyślne odpowiedzi” i zapisuj odpowiedzi w `overnight-log.md`.
   3. `/10x-goal-implement <change-id>`: fazy, testy, commity w konwencji wyżej.
   4. Commit zmian w `context/` (roadmap status, change.md).
3. Nie planuj slice'a, zanim poprzednie, od których zależy, nie są zbudowane. Plan ma się opierać na istniejącym kodzie.
4. Po ostatnim slice'ie: pełny suite, lint, typecheck, ręczne przejście US-01..US-04 na lokalnym dev (na ile to możliwe z CLI/testów e2e), raport poranny.

## Protokół wykonania (ustalony 2026-10-27)

- Sesja główna (orkiestrator) deleguje każdy element roadmapy (F-01, S-01…S-09) do jednego subagenta, **po kolei, nigdy równolegle** (polecenie użytkownika: „uważaj na wykorzystanie zasobów na maszynie”). Subagent: `/10x-new` → `/10x-plan` → `/10x-implement` → `/10x-archive` dla jednego Change ID, z odpowiedziami według tego pliku.
- Po każdym elemencie orkiestrator sprawdza: `npm test`, `npm run lint`, `npx astro check`, `npm run build`, historię commitów i status w roadmapie.
- Lokalny Supabase działa tylko z bazą, REST i gatewayem. Jeśli trzeba go zrestartować: `npx supabase start -x gotrue,realtime,storage-api,imgproxy,studio,postgres-meta,mailpit,edge-runtime,logflare,vector,supavisor`. Nie włączaj pozostałych usług.
- Zasoby: żadnych testów w prawdziwej przeglądarce w nocy (bez Playwright i pobierania przeglądarek); każdy uruchomiony dev server zamknij przed końcem kroku; nie ruszaj kontenerów Dockera spoza tego projektu.

## Decyzje architektoniczne wspólne dla slice'ów

- Cały dostęp do bazy idzie przez serwer Astro (strony SSR i trasy API) kluczem service role ze zmiennej środowiskowej po stronie serwera; RLS włączone na każdej tabeli, bez polityk dla `anon`/`authenticated`, więc przeglądarka nie czyta bazy bezpośrednio.
- Logowanie e-mail ze startera jest usuwane; tożsamość to klucz w ścieżce URL (np. `/o/<klucz>`, `/tv/<klucz>`, `/g/<klucz>`), sprawdzany na każdej stronie i trasie API zgodnie z macierzą Access Control.
- Odświeżanie na żywo: odpytywanie lekkiego endpointu wersji stanu co 2–3 s. Supabase Realtime nie jest używany.
- Obraz planu sal jest przechowywany w bazie, bez Supabase Storage.
- Testy: Vitest (jednostkowe + integracyjne przeciw lokalnej bazie).

## Domyślne odpowiedzi na typowe pytania skilli

- Złożoność planu: zgódź się z oceną skilla.
- Wybór podejścia: najprostsze, które spełnia FR/NFR i pasuje do startera; w razie remisu mniej zależności.
- Podział na fazy: zaakceptuj, jeśli każda faza ma automatyczny check; inaczej popraw sam.
- Testy: logika domenowa (losowanie, sąsiedzi, grupy, przypięcia, nieobecni, ranking z remisami 1-2-2-4, limity AI) testami jednostkowymi; flow US-01..US-04 testami e2e w przeglądarce, jeśli starter ma Playwright; inaczej testy integracyjne tras API.
- Odświeżanie na żywo (NFR-003 ≤ 5 s): najprostsze niezawodne rozwiązanie (odpytywanie co 2–3 s jest OK; Supabase Realtime tylko jeśli nie komplikuje).
- Odczyt bez sieci u organizatora (NFR-004): ostatni stan rozkładu i ranking w pamięci przeglądarki organizatora, pokazywany przy braku sieci.
- Klucze linków: losowe ≥ 128 bitów, osobne dla organizatora, TV i każdego gościa; walidacja na każdej trasie API zgodnie z macierzą w Access Control.
- Teksty UI: po polsku.

## Dane startowe

- Baza pytań: przygotuj po polsku ok. 30 pytań na kategorię (kontrowersyjne / generyczne / refleksyjne) zgodnie z granicami treści z `shape-notes.md` (odważne, bez polityki partyjnej, religii, zdrowia i osobistych przytyków). Zapisz je jako seed bazy i jako czytelną kopię `context/foundation/question-seed.md` do przeglądu przez użytkownika (Open Question 4).
- Dane demo do lokalnych testów: 40 fikcyjnych gości, 3 sale, 7 stolików (mieszane typy), 2 grupy po 2 i 1 grupa po 4, 1 przypięcie, 1 nieobecny.

## Blokery

Gdy coś wymaga użytkownika albo nie przechodzi po 2 próbach naprawy:
1. Dopisz wpis do `context/foundation/overnight-log.md` (sekcja „Blokery”): co, dlaczego, czego potrzeba od użytkownika, co zostało pominięte.
2. Zostaw kod w stanie zielonym (cofnij tylko własne niezacommitowane zmiany tego kroku albo oznacz test jako `todo` z odnośnikiem do blokera).
3. Przejdź do następnego slice'a, który od blokera nie zależy.

## Raport poranny

`context/foundation/overnight-report.md`, po polsku, krótko:
- co zrobione (slice → FR/US → commity);
- co zablokowane i czego potrzeba od użytkownika;
- jak uruchomić lokalnie (komendy);
- ręczna checklista do sprawdzenia rano (wiersze Manual z planów);
- lista dodanych zależności;
- co zostało do Open Questions 1–6 z PRD.
