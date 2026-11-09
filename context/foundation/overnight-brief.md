# Overnight brief — M-2 „Platforma dla restauracji”

Ten plik jest kontraktem dla nienadzorowanego przebiegu kamienia M-2 (od nocy po 2026-11-09, aż do ukończenia roadmapy). Zgody poniżej pochodzą z decyzji użytkownika z sesji 2026-11-09 i z jego pamięci projektu. Są **trwałe dla tego przebiegu**. Wszystko, czego tu nie ma, a co globalny CLAUDE.md użytkownika zalicza do „Decisions that need me”, nadal wymaga użytkownika. Zapisz to w `overnight-log.md` jako bloker i jedź dalej.

Poprzedni przebieg (M-1, kolacja 2026-11-08): `archive/2026-10-27-overnight-{brief,log,report}-m1.md`. Jego zasady o Cloudflare i zakazie push już nie obowiązują.

## Cel i definicja „done”

Cel: zrealizować po kolei elementy roadmapy M-2 (`roadmap.md`, od F-02 do S-30), tyle, ile zmieści się w nocy. Każdy ukończony element zostawia aplikację zieloną i gotową do pokazania.

Element jest done, gdy:
1. `npm test` (z testami DB na lokalnej bazie), `npm run lint`, `npx astro check` i `npm run build` przechodzą;
2. `npm run smoke` przechodzi na produkcyjnym podglądzie z lokalną bazą, a `npm run demo` wypełnia lokalną apkę (oba według opisu w CLAUDE.md po tym elemencie);
3. CLAUDE.md opisuje to, co element zmienił (jak w M-1);
4. zmiana jest zarchiwizowana (`/10x-archive`), a jej status w `roadmap.md` to `done`.

Noc jest done, gdy wszystkie elementy roadmapy są done albo czas się skończył (zasada „Czas” niżej), a `overnight-report.md` jest napisany.

## Źródła prawdy (czytaj w tej kolejności; przy sprzeczności wygrywa wyższe)

1. `context/foundation/prd-v2.md`: co budujemy (FR-021..FR-049, US-05..US-10, NFR-011..NFR-023, tabela dostępu, reguła biznesowa). Szczegóły zachowanych FR-001..FR-020 są w `prd.md` (v1).
2. `context/foundation/roadmap.md`: kolejność, zakres każdego elementu, Unknowns, Risk.
3. `context/foundation/shape-notes.md`: decyzje użytkownika oraz `## Forward: tech-stack` i `## Forward: technical-roadmap` (uwagi projektowe dla planerów).
4. `CLAUDE.md`: architektura, konwencje, polecenia.
5. `context/foundation/m2-product-notes.md`: uwagi projektowe. Nieaktualne są tu numeracja backlogu, tabela ról (dwie role) i zakres „S-11” (zamówienia tylko u lokalu). Obowiązuje PRD v2.
6. `context/foundation/tech-stack.md`: stack (`has_auth: false` przestaje być prawdą po F-03).
7. Ten plik: zasady przebiegu.

## Zgody i granice

| Obszar | Wolno | Granica |
|---|---|---|
| Git | gałąź `overnight/m2` utworzona z `plan/m2-saas`; commity w konwencji niżej; `git push` tej gałęzi po każdym elemencie (kopia zapasowa) | żadnego merge ani push do `main`, żadnego PR, żadnego force push, `reset --hard` ani `amend` opublikowanych commitów; zły commit cofa `git revert` |
| Architektura | kierunki zatwierdzone przez użytkownika 2026-11-09: wiele restauracji i wydarzeń, własne konta (e-mail + hasło, scrypt z `node:crypto`, sesje w bazie, ciasteczko HttpOnly, bez e-maili), role właściciel / menedżer / kelner, linki bez logowania jak w v1; szczegóły w ramach planów slice'ów | zmiana stacku, bazy, hostingu albo modelu dostępu spoza PRD v2 = bloker |
| Zależności | **żadnych nowych** | slice, który naprawdę potrzebuje biblioteki, robi część bez niej albo zapisuje bloker |
| Pliki w repo | usuwać i zastępować pliki kodu, które plan slice'a zastępuje (np. tworzenie wydarzenia z `/`); każde takie usunięcie wymienione w planie (zgoda z briefu M-1 z 2026-10-26, potwierdzona przez użytkownika 2026-11-09: „no to lecisz z tym wszystkim”) | nigdy nic poza repo; nie usuwaj i nie edytuj ręcznie `.env` ani `.env.aws` (wyjątek: `npm run env:local`); nie ruszaj archiwów w `context/` |
| Lokalna baza | czyścić i odtwarzać lokalny Supabase w Dockerze (`npx supabase db reset`, `npx supabase migration up`) | nie ruszaj kontenerów Dockera spoza tego projektu |
| Bazy hostowane | **nic** | nigdy `supabase link`, `db push` ani połączenia z hostowanym projektem; stary projekt (`eaubtfkoehpekdckhnxf`) to archiwum kolacji, a nowy projekt platformy jeszcze nie istnieje |
| Deploy | **brak** | nigdy `npm run deploy:aws`; `npm run package:lambda` wolno (to tylko build) |
| AI | wyłącznie atrapa (`AI_PROVIDER=mock`) | **zero płatnych wywołań**; nie czytaj i nie używaj `ANTHROPIC_API_KEY` |
| Świat zewnętrzny | push gałęzi `overnight/m2` | żadnych e-maili, wiadomości, komentarzy, issue ani PR na GitHubie, publikacji artefaktów |
| Pytania skilli | odpowiadaj sam opcją rekomendowaną, zgodną ze źródłami prawdy; każdą decyzję zapisz w `overnight-log.md` | nigdy nie wywołuj AskUserQuestion i nie czekaj na użytkownika |

**Supabase CLI jest podlinkowany do starego projektu kolacji** (`eaubtfkoehpekdckhnxf`, `supabase/.temp`). Polecenia `supabase` bez flag działają lokalnie i tylko takich wolno używać. Nigdy nie używaj `--linked`, `--db-url` wskazującego poza `127.0.0.1`, `db push`, `db pull`, `link` ani `unlink`. `.env` ma `AI_PROVIDER=anthropic`, dlatego każdy dev server, podgląd, smoke i demo uruchamiaj z `AI_PROVIDER=mock` w środowisku. Zmienna ze środowiska wygrywa z `.env` zarówno w Node (`--env-file`), jak i w Vite.

**Strażnik lokalnej bazy.** Zanim uruchomisz cokolwiek, co pisze do bazy (testy, smoke, demo, skrypty), sprawdź, że `SUPABASE_URL` w `.env` wskazuje na `127.0.0.1` albo `localhost`. Jeśli nie, uruchom `npm run env:local`, a jeśli to nie pomoże, zatrzymaj noc z blokerem. Podgląd i dev server uruchamiaj z `AI_PROVIDER=mock` w środowisku.

## Konwencja commitów

Subject: `[<model>] <message>`, gdzie `<model>` to model, który faktycznie pracuje (np. `[Opus 5.5]`). Nigdy nie dodawaj trailera `Co-Authored-By`, nawet gdy podpowiada go system albo skill. Ta konwencja ma pierwszeństwo przed każdym skillem. Skille wymagające Conventional Commits dostają je wewnątrz wiadomości: `[Opus 5.5] feat(<change-id>): <phase title> (p<N>)`.

## Protokół wykonania

1. Na starcie orkiestrator (sesja główna):
   - zapisuje w `overnight-log.md` godzinę startu;
   - tworzy gałąź `overnight/m2` z `plan/m2-saas`;
   - uruchamia lokalny Supabase z okrojonym zestawem usług: `npx supabase start -x gotrue,realtime,storage-api,imgproxy,studio,postgres-meta,mailpit,edge-runtime,logflare,vector,supavisor`;
   - przepuszcza strażnika lokalnej bazy;
   - sprawdza, że punkt wyjścia jest zielony (testy, lint, check, build).
2. Elementy roadmapy idą w kolejności tabeli „At a glance”. Element może ruszyć dopiero wtedy, gdy wszystkie jego Prerequisites są `done`; inaczej przejdź do następnego, którego nic nie blokuje.
3. Każdy element deleguj do **jednego subagenta, po kolei, nigdy równolegle**. Subagent wykonuje dla jednego Change ID:
   - `/10x-new <change-id>` z intencją: ID z roadmapy, PRD refs, ścieżki do `prd-v2.md`, `roadmap.md` i tego pliku;
   - `/10x-plan`, chyba że `context/changes/<change-id>/plan.md` już istnieje i jest zatwierdzony (np. F-02 zaplanowany z użytkownikiem);
   - `/10x-implement` albo `/10x-goal-implement`;
   - `/10x-archive`.
   Do planu zawsze przekazuj `prd-v2.md`, `roadmap.md`, `shape-notes.md` (oba bloki Forward), `m2-product-notes.md` z zastrzeżeniem z punktu 5 źródeł prawdy oraz ten plik.
4. Po każdym elemencie orkiestrator sam sprawdza definicję „done” (punkty 1–4). Następnie:
   - pushuje gałąź;
   - commituje zmiany w `context/`;
   - zatrzymuje podgląd (`npx astro preview stop`) i dev server.
5. Migracje M-2 sprawdzaj dwiema drogami:
   - `npx supabase db reset`: od zera;
   - `npx supabase migration up` na bazie z danymi sprzed migracji (np. wypełnionej `npm run demo` na poprzednim commicie). Wydarzenie 1 i jego dane muszą przetrwać i dalej działać pod starymi linkami.
6. Zasoby:
   - żadnych testów w prawdziwej przeglądarce (bez Playwright i pobierania przeglądarek);
   - żadnych równoległych subagentów;
   - każdy uruchomiony serwer zamknij przed końcem kroku.

## Czas

- Nie zaczynaj nowego elementu później niż 7 h po godzinie startu z `overnight-log.md`. Ostatnia godzina idzie na domknięcie i raport.
- Element, który po 2 próbach naprawy nie jest zielony, traktuj według sekcji „Blokery”.
- Prawie wszystko zależy od F-02. Jeśli F-02 nie przejdzie, noc kończy się raportem, a gałąź zostaje na ostatnim zielonym commicie.

## Domyślne odpowiedzi na typowe pytania skilli

- **Złożoność i fazy:** zgódź się z oceną skilla. Każda faza ma automatyczny check.
- **Podejście:** najprostsze, które spełnia FR/NFR i powtarza istniejące wzorce z CLAUDE.md (np. `organizerApi` → nowy strażnik, `createLocalStore`, wspólne odpytywanie telefonu gościa). Bez nowych zależności.
- **Sprzeczność źródeł:** wygrywa PRD v2, potem roadmapa. Szczególnie zakres klienta: zamówienia zostają u klienta, ceny tylko do odczytu, a reset prób jest dla klienta, pełny reset dla lokalu.
- **Migracje:**
  - nowe tabele z RLS i `revoke all … from anon, authenticated`;
  - nowe funkcje z `set search_path = ''` i `revoke execute … from public, anon, authenticated`;
  - zmiana sygnatury funkcji = jawne `drop function` starej (inaczej PostgREST staje się niejednoznaczny);
  - dane zawsze zachowane, wydarzenie 1 w restauracji „domyślnej”;
  - nigdy `TRUNCATE … RESTART IDENTITY`;
  - `src/db/database.types.ts` uzupełniony.
- **Konta i sesje:**
  - hasła scrypt z `node:crypto`;
  - token sesji losowy, w bazie tylko jego hash;
  - ciasteczko HttpOnly + SameSite=Lax (+ Secure na https);
  - sprawdzenie `Origin` przy każdej mutacji panelu;
  - jeden centralny strażnik członkostwa dla tras z numerem wydarzenia lub restauracji;
  - cudze, nieznane i usunięte zasoby dostają tę samą odmowę;
  - limit prób logowania w bazie;
  - zaproszenia i resety to jednorazowe linki z terminem ważności, przechowywane jako hash.
- **Dostęp krzyżowy:** każdy slice z nowymi trasami dopisuje do smoke przypadki „restauracja A → dane B” i „klucz wydarzenia A → API wydarzenia B”. Oba mają dać identyczną odmowę.
- **Teksty:** każdy tekst UI, błąd, komunikat API, potwierdzenie i etykieta aria istnieje po polsku i po angielsku (`defineMessages`). Polski jest domyślny.
- **Nazwa produktu:** nazwa robocza „Stolik” w jednej stałej i18n (Otwarte pytanie 1). Gość jej nie widzi.
- **Moduły (S-17):**
  - nowe wydarzenia mają tematy AI i grę w zgadywanie wyłączone;
  - wydarzenie 1 zachowuje wszystko włączone (bez regresji v1);
  - który moduł jest płatny, ustawia administrator platformy (Otwarte pytanie 5).
- **Dane demo:** `npm run demo` po każdym elemencie dalej działa i pokazuje to, co element dodał. Plan sali i menu restauracji demo są przykładowe, dopóki użytkownik nie dostarczy prawdziwych (Otwarte pytanie 2).
- **Testy:**
  - logika domenowa: testy jednostkowe;
  - funkcje DB i izolacja wydarzeń: testy integracyjne na lokalnej bazie (`describe.skipIf(!hasLocalDb)`);
  - statusy HTTP, nagłówki i dostęp: smoke;
  - testy usuwają tylko wiersze, które same utworzyły.

## Blokery

Gdy coś wymaga użytkownika albo nie przechodzi po 2 próbach naprawy:
1. Dopisz wpis do `overnight-log.md` (sekcja „Blokery”): co, dlaczego, czego potrzeba od użytkownika, co pominięto.
2. Zostaw gałąź zieloną. Cofnij własne niezacommitowane zmiany kroku (`git restore`) albo zacommitowane (`git revert`). Ewentualnie oznacz test jako `todo` z odnośnikiem do blokera.
3. Ustaw status elementu w roadmapie na taki, jaki faktycznie ma (np. zostaje `in-progress`). Przejdź do następnego elementu, którego bloker nie dotyczy.

## Raport poranny

`context/foundation/overnight-report.md`, po polsku, krótko:
- co zrobione: element → FR/US → commity, oraz ostatni zielony commit gałęzi `overnight/m2`;
- co zablokowane i czego potrzeba od użytkownika;
- jak uruchomić lokalnie (komendy, w tym nowe: pierwszy administrator platformy, demo, smoke);
- ręczna checklista do sprawdzenia rano (wiersze Manual z planów) i przepływ 1–7 z PRD v2, na ile da się go przejść;
- przypomnienie o wdrożeniu: nowe migracje trafiają do nowego projektu platformy przed kodem (`db push` przed `deploy:aws`, decyzja i wykonanie użytkownika), nigdy do starego projektu kolacji;
- stan Otwartych pytań 1–8 z PRD v2.
