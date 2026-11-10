---
project: kolacja-podwyzkowa
version: 2
status: draft
created: 2026-10-27
updated: 2026-11-10
prd_version: 2
main_goal: speed
top_blocker: time
milestone_id: restaurant-platform
milestone_seq: 2
milestone_status: open
---

# Roadmap: kolacja-podwyzkowa

> Derived from `context/foundation/prd-v2.md` (v2) + `shape-notes.md` (`## Forward: technical-roadmap`) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded. Treść M-1 (F-01, S-01..S-09) jest w historii gita (commit sprzed 2026-11-09) i w `context/archive/`.
> Slices below are listed in dependency order. The "At a glance" table is the index.
> Numeracja ciągnie się od M-1 (F-02, F-03, S-10+), bo PRD v2 i shape-notes już tak je nazywają. Backlog w `m2-product-notes.md` jest nieaktualny w trzech punktach: numeracja, tabela ról (dwie role) i zakres rozdziału klient/lokal. Wygrywa PRD v2.
> Framing: `main_goal: speed`, gwiazda przewodnia S-11 (najmniejszy kompletny przepływ, który dowodzi tezy produktu; patrz „North star”) i `top_blocker: time` przyjęte z rekomendacji (sesja 2026-11-09 kontynuowana bez dodatkowych pytań; każdą linię można nadpisać).

## Milestone

**M-2: Platforma dla restauracji** — Status: open

- **Intent:** restauracja sama prowadzi w aplikacji swoje imprezy. Zakłada wydarzenia z szablonu sali i przekazuje klientowi link do przygotowania gości i rozsadzenia. W dniu imprezy prowadzi zamówienia, obsługę i TV. Wiele restauracji działa obok siebie, a ich dane są od siebie odizolowane.
- **Source materials:**
  - `context/foundation/prd-v2.md` (v2);
  - kolejność: `context/foundation/shape-notes.md` `## Forward: technical-roadmap`;
  - uwagi projektowe dla planerów: `context/foundation/m2-product-notes.md` (podrzędne wobec PRD v2).
- **Done when:** każdy F-NN i S-NN poniżej jest `done`, a przepływ 1–7 z PRD v2 przechodzi lokalnie w samej aplikacji, bez komend i bez ręcznych zmian w bazie (poza pierwszym kontem administratora platformy).
- **Scope anchors:**
  - FR-021..FR-042, FR-048, FR-049 (nowe i zmienione);
  - FR-001..FR-020, FR-043, FR-044, FR-045, FR-046, FR-047 (zachowane, w obrębie jednego wydarzenia);
  - US-05..US-10 (oraz US-01..US-04 z PRD v1 w obrębie wydarzenia);
  - NFR-011..NFR-023.

## Vision recap

Restauracja, która gościła kolację 2026-11-08, chce tego narzędzia do własnych dużych imprez: firmowych, wigilii, komunii i urodzin. Dziś uzgadnia je mailem i telefonem, a listy i plany stołów prowadzi w Excelu i Wordzie. Aplikacja staje się platformą dla wielu restauracji. Lokal zakłada wydarzenie z szablonu sali i udostępnia menu i moduły. Klient przygotowuje gości, rozsadzenie i zamówienia. W dniu imprezy TV, kelnerzy i kuchnia pracują na jednym stanie. Gość widzi markę lokalu i wydarzenia, bez nazwy platformy (tzw. white-label).

## North star

**S-11: Lokal zakłada wydarzenie w swoim panelu i kopiuje klientowi link do przygotowania imprezy** — to wydarzenie po raz pierwszy należy do restauracji, a nie do wdrożenia. Dowodzi to głównego kryterium „od «Nowe wydarzenie» do skopiowanego linku klienta < 3 minuty”. Przy `main_goal: speed` stawiamy je zaraz po fundamentach, a wszystko dalej to dodatki do tego przepływu.

> „Gwiazda przewodnia” to najmniejszy kompletny przepływ, którego działanie dowodzi głównej tezy produktu. Stawiamy go tak wcześnie, jak pozwalają zależności, bo reszta ma sens tylko wtedy, gdy on działa.

## At a glance

| ID   | Change ID               | Outcome (user can …)                                                                                                      | Prerequisites    | PRD refs                                                                                      | Status   |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------- | -------- |
| F-02 | multi-tenant-events     | (foundation) dane trzymają wiele restauracji i wydarzeń; każdy link i każda operacja działa tylko w swoim wydarzeniu      | —                | NFR-012, NFR-015, US-10, US-01..US-04, FR-001..FR-020, FR-043, FR-044, FR-045, FR-046, FR-047 | done     |
| F-03 | staff-accounts          | (foundation) zaproszona osoba ustawia hasło z jednorazowego linku, loguje się na 30 dni, wylogowuje się i zmienia hasło   | F-02             | FR-022, US-05, NFR-013, NFR-020, NFR-022                                                      | done     |
| S-10 | platform-restaurants    | administrator platformy zakłada restaurację z zaproszeniem właściciela, widzi listę, wyłącza i włącza restaurację         | F-03             | FR-021, US-05                                                                                 | done     |
| S-11 | restaurant-events       | lokal zakłada wydarzenie, przegląda nadchodzące, minione i archiwum, kopiuje i wymienia linki, archiwizuje i usuwa        | S-10             | FR-024, FR-025, US-06, US-09, US-10                                                           | done     |
| S-12 | restaurant-team         | właściciel i menedżer zapraszają zespół, zmieniają role, usuwają osoby i dają jednorazowy link resetu hasła               | S-10             | FR-023, US-05                                                                                 | done     |
| S-13 | admin-support-log       | administrator platformy wchodzi w dane lokalu w trybie wsparcia, a właściciel widzi każde wejście w dzienniku             | S-11             | FR-021, US-05, US-10, NFR-012                                                                 | done     |
| S-14 | client-restaurant-split | lokal przełącza „lokal prowadzi”; klient prowadzi zamówienia i robi reset prób; pełny reset i koszty AI tylko w panelu    | S-11             | FR-026, FR-027, FR-028, US-07                                                                 | done     |
| S-15 | venue-templates         | menedżer zapisuje salę jako szablon, tworzy z niego wydarzenia i aktualizuje wydarzenie z szablonu                        | S-11             | FR-030, US-06, US-09                                                                          | done     |
| S-16 | menu-catalog-courses    | menedżer prowadzi katalog menu z kursami i menu wydarzenia; klient zamawia z niego bez zmiany cen; kuchnia widzi kursy    | S-14             | FR-037, FR-027, US-07                                                                         | done     |
| S-17 | event-modules           | lokal oznacza dostępne moduły, klient je włącza, administrator odblokowuje płatne; wyłączony moduł znika wszędzie         | S-14             | FR-031, US-07, NFR-023                                                                        | done     |
| S-18 | event-branding          | właściciel ustawia markę lokalu, klient markę wydarzenia; gość, TV, karteczki i panel pokazują je bez nazwy platformy     | S-11             | FR-032                                                                                        | done     |
| S-19 | scale-150               | klient prowadzi wydarzenie do 150 gości, stołów do 30 miejsc i ok. 60 stolików w dotychczasowych czasach reakcji          | F-02             | FR-033, US-08, NFR-011, NFR-015                                                               | done     |
| S-20 | tv-room-rotation        | TV przy wejściu pokazuje cały lokal i sam przechodzi po salach, gdy imiona byłyby nieczytelne; TV da się przypiąć do sali | S-19             | FR-034, US-08, NFR-018                                                                        | done |
| S-21 | waiter-day-and-refills  | kelner (konto albo dostęp „na imprezę”) widzi dzisiejsze imprezy, oznacza wydane sztuki i dopisuje dokładki               | S-12, S-14       | FR-029, FR-023, US-08                                                                         | done |
| S-21b | event-waiter-access    | menedżer dodaje kelnera „na imprezę” (imię + jednorazowy link lub kod do końca okna, bez hasła), który pracuje tylko na sali tego wydarzenia | S-21             | FR-023, FR-029, US-08                                                                         | in-progress |
| S-22 | guest-map-search        | gość, klient, personel i tablet wyszukują gościa po imieniu, a mapa podświetla jego miejsce                               | S-21             | FR-048, US-08                                                                                 | proposed |
| S-23 | guest-import-diets      | klient importuje gości z CSV lub wklejki z dietami, a kuchnia i kelnerzy widzą diety przy miejscu i w zliczeniach         | S-14, S-21       | FR-035, FR-036, US-07, NFR-021                                                                | proposed |
| S-24 | room-prints             | klient i lokal drukują tablicę „znajdź swój stolik”, karty stołów, winietki w formacie i listę dla obsługi z dietami      | S-18, S-23       | FR-038                                                                                        | proposed |
| S-25 | guest-rsvp-menu         | gość potwierdza obecność i wybiera danie do terminu, klient wpisuje za gościa, a klient i lokal widzą zliczenia           | S-16             | FR-039, US-07                                                                                 | proposed |
| S-26 | privacy-retention       | dane gości znikają N dni po imprezie, menedżer eksportuje dane wydarzenia, a gość czyta informację o prywatności          | S-11             | FR-040, US-09, NFR-019                                                                        | proposed |
| S-27 | staff-offline-readout   | tablet obsługi i kelner bez sieci widzą ostatni stan zamówień i rozsadzenia, także po odświeżeniu                         | S-21             | FR-047, US-08, NFR-017                                                                        | proposed |
| S-28 | pub-quiz                | klient przygotowuje pub quiz i prowadzi go na TV, a goście odpowiadają na telefonach                                      | S-17             | FR-049                                                                                        | proposed |
| S-29 | demo-restaurant         | administrator platformy przygotowuje restaurację demo na prawdziwym planie i menu z przykładową imprezą firmową           | S-15, S-16, S-21 | FR-042, US-05, US-06, US-07, US-08, US-09                                                     | proposed |
| S-30 | landing-legal           | odwiedzający widzi publiczną stronę produktu z logowaniem oraz szkice regulaminu i polityki prywatności                   | S-29             | FR-041                                                                                        | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                            | Chain                                                        | Note                                                                                          |
| ------ | -------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| A      | Platforma i panel lokalu         | `F-02` → `F-03` → `S-10` → `S-11` → `S-12` → `S-13`          | Najkrótsza droga do gwiazdy przewodniej S-11; S-12 może iść obok S-11.                        |
| B      | Lokal udostępnia, klient wybiera | `S-14` → `S-15` → `S-16` → `S-17` → `S-18` → `S-25` → `S-28` | Dołącza do strumienia A w S-11; reguła biznesowa PRD v2 („lokal udostępnia, klient wybiera”). |
| C      | Dzień imprezy i skala            | `S-19` → `S-20` → `S-21` → `S-22` → `S-27`                   | S-19 wymaga tylko F-02; S-21 dołącza do A w S-12 i do B w S-14.                               |
| D      | Goście, wydruki, prywatność      | `S-23` → `S-24` → `S-26`                                     | Dołącza do B w S-14 i do C w S-21; S-24 także do B w S-18.                                    |
| E      | Demo i strona produktu           | `S-29` → `S-30`                                              | Zbiera strumienie A–C; strona produktu po demo (PRD v2 FR-041).                               |

## Baseline

Stan kodu na `2026-11-09` (auto-researched z `CLAUDE.md` i kodu; potwierdzony faktami z sesji shape 2026-11-09).
Fundamenty poniżej zakładają, że to istnieje, i NIE budują tego od nowa.

- **Frontend:** present. Astro 7 SSR, wyspy React 19, Tailwind 4 i shadcn/ui (`astro.config.mjs`, `src/components/`). Słowniki PL/EN są w `src/lib/i18n/`.
- **Backend / API:** present. Trasy API Astro mają osobny prefiks dla każdej roli (`src/pages/api/{o,tv,g,r}/[key]/…`). Strażnicy to `organizerApi`, `guestApi` i `restaurantApi` oraz `src/middleware.ts`.
- **Data:** present, ale dla jednego wydarzenia. Postgres (Supabase) ma 17 migracji (`supabase/migrations/`), klient service role działa tylko na serwerze, a typy są pisane ręcznie (`src/db/database.types.ts`). Luka, którą zamyka F-02:
  - CHECK `event_singleton` (`id = 1`);
  - `EVENT_ID` z `src/lib/event.ts`, użyty 45 razy w 10 plikach;
  - `default 1` na każdej kolumnie `event_id`;
  - funkcje DB bez parametru wydarzenia;
  - globalne blokady doradcze.
- **Auth:** absent, jeśli chodzi o konta. Jest tylko dostęp przez klucze w linkach (`src/lib/access/`, cztery role). Nie ma kont, haseł ani sesji. `tech-stack.md` (`has_auth: false`) przestanie być aktualny po F-03.
- **Deploy / infra:** present. Działa AWS Lambda za Function URL (`scripts/package-lambda.mjs`, `scripts/deploy-aws.mjs`), a CI w `.github/workflows/ci.yml` uruchamia smoke. Nie ma jeszcze nowego projektu bazy dla platformy (Otwarte pytanie 4). Stary projekt to nietykalne archiwum kolacji.
- **Observability:** absent. Są tylko logi konsoli, bez biblioteki logowania i śledzenia błędów.

## Foundations

### F-02: Restauracje i wiele wydarzeń

- **Outcome:** (foundation) Dane trzymają wiele restauracji i wiele wydarzeń, a każde wydarzenie należy do jednej restauracji. Istniejące wydarzenie 1 trafia do restauracji „domyślnej” bez utraty danych. Każdy link i każda operacja (rozsadzanie, publikacja, strzały, zamówienia, reset) działa tylko w obrębie swojego wydarzenia. Strona główna przestaje zakładać wydarzenia. Wszystko z v1 działa jak na kolacji, w obrębie jednego wydarzenia.
- **Change ID:** multi-tenant-events
- **PRD refs:** NFR-012, NFR-015, US-10, US-01..US-04, FR-001..FR-020, FR-043, FR-044, FR-045, FR-046, FR-047
- **Unlocks:** F-03, S-10 i każdy dalszy slice (wydarzenie należy do restauracji); S-19 (skala per wydarzenie). Daje też ścieżkę weryfikacji izolacji: testy, w których klucz i dane wydarzenia A nie dotykają wydarzenia B.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Jak smoke i `npm run demo` zakładają wydarzenie, gdy `/` przestaje to robić, zanim powstanie panel (S-11). — Owner: planer F-02. Block: no.
- **Risk:** Przeróbka szeroka, ale mechaniczna. Dotyka każdej migracji, funkcji DB i serwisu. Uwagi dla planera są w `shape-notes.md` (`## Forward: technical-roadmap`) i w `m2-product-notes.md` (punkt 1). Migracje muszą zachować dane wydarzenia 1 i nigdy nie trafiają do starego projektu (archiwum kolacji). Aktualizacja CLAUDE.md jest częścią slice'a.
- **Status:** done

### F-03: Konta personelu i sesje

- **Outcome:** (foundation) Zaproszona osoba otwiera jednorazowy link, ustawia hasło i loguje się e-mailem i hasłem na 30 dni na urządzeniu. Może się wylogować i zmienić hasło, co zamyka jej inne sesje. Masowe zgadywanie haseł jest odrzucane. Pierwszy administrator platformy powstaje z wiersza poleceń. Wejście do panelu bez zalogowania prowadzi do logowania. Aplikacja nie wysyła e-maili.
- **Change ID:** staff-accounts
- **PRD refs:** FR-022, US-05, NFR-013, NFR-020, NFR-022
- **Unlocks:** S-10, S-11, S-12, S-13 (każdy wymaga zalogowanego personelu). Daje ścieżkę weryfikacji dostępu krzyżowego w smoke: personel lokalu A pytający o wydarzenie B dostaje odmowę.
- **Prerequisites:** F-02
- **Parallel with:** S-19
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Ciasteczko sesji wprowadza zagrożenia, których model kluczy w linkach nie miał. Wymagania bezpieczeństwa dla planera są w `shape-notes.md` (`## Forward: tech-stack` i `## Forward: technical-roadmap`). Bez nowych zależności. Fundament ma tylko logowanie, sesje i zaproszenia, bez paneli.
- **Status:** done

## Slices

### S-10: Panel platformy: restauracje i zaproszenie właściciela

- **Outcome:** Administrator platformy zakłada restaurację i dostaje jednorazowy link zaproszenia dla właściciela. Widzi listę restauracji z licznikami (wydarzenia, zespół). Wyłącza i włącza restaurację. Daje właścicielowi link resetu hasła, gdy ten zgubi dostęp. Właściciel po przyjęciu zaproszenia widzi swój pusty panel lokalu.
- **Change ID:** platform-restaurants
- **PRD refs:** FR-021, US-05
- **Prerequisites:** F-03
- **Parallel with:** S-19
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wgląd administratora w dane lokalu (FR-021) celowo przechodzi do S-13 razem z dziennikiem wejść. Do tego czasu administrator nie widzi danych gości, co jest bezpiecznym stanem pośrednim.
- **Status:** done

### S-11: Wydarzenia lokalu i linki dla klienta

- **Outcome:** Lokal (właściciel, a po S-12 także menedżer) zakłada wydarzenie z nazwą, datą i przewidywaną liczbą gości. Przegląda wydarzenia nadchodzące, minione i archiwum. Na karcie wydarzenia kopiuje linki klienta, TV i tabletu obsługi. Wymienia każdy z nich po potwierdzeniu, które mówi, kogo wymiana odetnie. Archiwizuje i przywraca wydarzenia, a właściciel trwale je usuwa. Personel innej restauracji dostaje dla tego wydarzenia tę samą odmowę co dla nieznanego.
- **Change ID:** restaurant-events
- **PRD refs:** FR-024, FR-025, US-06, US-09, US-10
- **Prerequisites:** S-10
- **Parallel with:** S-12, S-19
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To gwiazda przewodnia. Jeśli lokal nie umie sam założyć wydarzenia i przekazać linku w < 3 minuty, reszta M-2 traci sens. Tworzenie z szablonu sali dochodzi w S-15.
- **Status:** done

### S-12: Zespół lokalu

- **Outcome:** Właściciel zaprasza menedżerów i kelnerów, a menedżer zaprasza kelnerów, jednorazowymi linkami. W swoim zakresie zmieniają role, usuwają osoby z zespołu i generują jednorazowy link resetu hasła. Menedżer ma uprawnienia z tabeli dostępu PRD v2, bez zarządzania menedżerami i bez ustawień lokalu.
- **Change ID:** restaurant-team
- **PRD refs:** FR-023, US-05
- **Prerequisites:** S-10
- **Parallel with:** S-11, S-19
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Granice ról (właściciel, menedżer, kelner) muszą być sprawdzane po stronie serwera dla każdej akcji. Kelner „na imprezę” (część FR-023) jest w S-21 razem z widokiem kelnera.
- **Status:** done

### S-13: Wgląd administratora platformy z dziennikiem wejść

- **Outcome:** Administrator platformy otwiera dane dowolnej restauracji w trybie wsparcia. Każde takie wejście (kto, kiedy, co) trafia do dziennika, który właściciel lokalu widzi w swoim panelu. Poza tym trybem odmowa dla cudzej restauracji jest identyczna jak dla nieznanej.
- **Change ID:** admin-support-log
- **PRD refs:** FR-021, US-05, US-10, NFR-012
- **Prerequisites:** S-11
- **Parallel with:** S-12, S-14, S-15
- **Blockers:** —
- **Unknowns:**
  - Treść umowy powierzenia i informacji o dzienniku dla lokalu (Otwarte pytanie 6). — Owner: user + prawnik. Block: no.
- **Risk:** Jedyny wyjątek od izolacji danych. Musi być niemożliwy bez wpisu w dzienniku.
- **Status:** done

### S-14: Rozdział klient / lokal i „lokal prowadzi”

- **Outcome:** Personel lokalu podgląda w panelu pracę klienta nad wydarzeniem: gości, grupy, rozsadzenie i zamówienia. Po włączeniu przełącznika „lokal prowadzi” personel edytuje wszystko, co robi klient, a klient ma tylko podgląd. Klient nadal prowadzi zamówienia, napoje i rachunek jak w v1, ale nie zmienia cen. Może zresetować próby (rozsadzenia i ich historię, strzały, quiz) bez gości, sali i zamówień. Pełny reset i koszty AI są tylko w panelu lokalu, a ich trasy z linku klienta dają odmowę.
- **Change ID:** client-restaurant-split
- **PRD refs:** FR-026, FR-027, FR-028, US-07
- **Prerequisites:** S-11
- **Parallel with:** S-12, S-13, S-15
- **Blockers:** —
- **Unknowns:**
  - Kto ustala ceny pozycji, zanim powstanie katalog menu (S-16): klient wpisuje jak w v1 czy już tylko personel. Docelowo ceny są z cennika lokalu. — Owner: planer S-14. Block: no.
- **Risk:** `m2-product-notes.md` (S-11) opisuje nieaktualny zakres („zamówienia tylko u lokalu”). Obowiązuje PRD v2 (FR-027, FR-028 i tabela dostępu): zamówienia zostają u klienta. Dwie strony edytujące naraz wyklucza przełącznik.
- **Status:** done

### S-15: Szablony sal lokalu

- **Outcome:** Menedżer zapisuje układ sali jako szablon lokalu: plan, sale, stoliki, rysunek. Robi to od zera albo z istniejącego wydarzenia. Edytuje szablon i tworzy z niego nowe wydarzenia z gotową salą. Zmiana szablonu nie rusza istniejących wydarzeń, a osobna akcja „zaktualizuj z szablonu” przenosi zmiany do wybranego wydarzenia.
- **Change ID:** venue-templates
- **PRD refs:** FR-030, US-06, US-09
- **Prerequisites:** S-11
- **Parallel with:** S-13, S-14
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Szablon nie może się otworzyć żadnym linkiem ani pojawić na listach, w retencji, resecie i licznikach (uwaga w `shape-notes.md` `## Forward: technical-roadmap` i w `m2-product-notes.md`, punkt 5). „Zaktualizuj z szablonu” może zabrać miejsca przy usuniętych stolikach, więc ostrzega przed tym jak edytor sal w v1.
- **Status:** done

### S-16: Katalog menu z kursami

- **Outcome:** Menedżer prowadzi katalog dań i napojów lokalu z cenami i kursem (przystawka, zupa, danie główne, deser, napoje). Dla każdego wydarzenia ustala, czy dostępne jest pełne menu, czy okrojone. Klient wybiera pozycje zamówień z dostępnego menu i widzi ceny, ale ich nie zmienia. Lista dla kuchni na tablecie jest pogrupowana po kursach.
- **Change ID:** menu-catalog-courses
- **PRD refs:** FR-037, FR-027, US-07
- **Prerequisites:** S-14
- **Parallel with:** S-15, S-17, S-18
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Istniejące zamówienia z dowolnym tekstem (v1 i demo) muszą dalej działać. Zmiana ceny w katalogu nie może zmienić rachunku już zamówionych pozycji bez decyzji lokalu.
- **Status:** done

### S-17: Moduły wydarzenia

- **Outcome:** Lokal oznacza, które moduły mogą być dostępne: pytania, tematy AI, gra w zgadywanie rachunku, losowanie miejsc, „Pokaż na TV”, pub quiz. Klient włącza i wyłącza moduły spośród dostępnych. Tematy AI i gra w zgadywanie są domyślnie wyłączone. Moduły płatne są widoczne jako niedostępne, dopóki administrator platformy ręcznie nie odblokuje ich dla wydarzenia. Wyłączony moduł znika u klienta, gości i na TV, a jego trasy dają odmowę.
- **Change ID:** event-modules
- **PRD refs:** FR-031, US-07, NFR-023
- **Prerequisites:** S-14
- **Parallel with:** S-15, S-16, S-18
- **Blockers:** —
- **Unknowns:**
  - Które moduły są płatne i ile kosztują (Otwarte pytanie 5). — Owner: user. Block: no (odblokowanie ręczne działa niezależnie od cennika).
- **Risk:** Wyłączenie modułu nie może zepsuć istniejących danych ani wspólnego odpytywania telefonu gościa. Moduł znika, a jego dane zostają.
- **Status:** done

### S-18: Marka lokalu i wydarzenia

- **Outcome:** Właściciel ustawia nazwę, logo i kolor lokalu. Klient dodaje nazwę i logo swojej firmy lub wydarzenia. Widać je na telefonach gości, TV, karteczkach z QR i w panelu. Gość nie widzi nazwy platformy, a „Kolacja podwyżkowa” znika z produktu, także z promptu AI.
- **Change ID:** event-branding
- **PRD refs:** FR-032
- **Prerequisites:** S-11
- **Parallel with:** S-15, S-16, S-17
- **Blockers:** —
- **Unknowns:**
  - Nazwa produktu (Otwarte pytanie 1). — Owner: user. Block: no (nazwa robocza w jednej stałej, łatwa do zmiany).
- **Risk:** Logo to obraz od użytkownika, więc tylko bezpieczne formaty i mały rozmiar (limity ładunku hostingu). Treści v1 pisane pod jedną kolację, np. pytanie gry o koszt kolacji, trzeba przejrzeć.
- **Status:** done

### S-19: Skala do 150 gości

- **Outcome:** Klient prowadzi wydarzenie do 150 gości, ze stołami do 30 miejsc i ok. 60 stolikami. Projekt losowania jest gotowy w ≤ 3 s, a publikacja dociera na TV i do 200 otwartych telefonów w ≤ 5 s. Kilka imprez naraz nie spowalnia się poniżej tych celów.
- **Change ID:** scale-150
- **PRD refs:** FR-033, US-08, NFR-011, NFR-015
- **Prerequisites:** F-02
- **Parallel with:** F-03, S-10, S-11, S-12
- **Blockers:** —
- **Unknowns:**
  - Rzeczywiste obciążenie odpytywania przez 200 telefonów na wybranym hostingu (Otwarte pytanie 4). — Owner: planer S-19 (szacunek) + user (pomiar po wdrożeniu). Block: no.
- **Risk:** Limity siedzą w bazie, snapshotach, losowaniu i rysunku sali naraz. Losowanie z twardymi regułami musi zostać tak samo poprawne przy 150 osobach.
- **Status:** done

### S-20: TV z rotacją sal i przypięciem do sali

- **Outcome:** TV przy wejściu pokazuje cały lokal. Gdy imiona byłyby mniejsze niż cel czytelności, sam przechodzi po salach co kilka sekund. Klient i lokal mogą przypiąć TV do jednej sali.
- **Change ID:** tv-room-rotation
- **PRD refs:** FR-034, US-08, NFR-018
- **Prerequisites:** S-19
- **Parallel with:** S-21, S-22
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Rotacja nie może przeszkadzać „Pokaż na TV” ani odświeżaniu po publikacji. Cel czytelności z v1 (≥ 2,5% wysokości ekranu) zostaje.
- **Status:** done

### S-21: Kelner w dniu imprezy i dokładki

- **Outcome:** Kelner ze swoim kontem widzi wydarzenia trwające dziś. Okno obejmuje czas po północy, do południa dnia następnego. Widzi plan z gośćmi, zamówienia z cenami i rachunek, oznacza wydane sztuki i dopisuje zamówienia na sali (dokładki, dodatkowe napoje). Menedżer dodaje kelnera „na imprezę”: imię i jednorazowy link lub kod ważny do końca okna imprezy, bez hasła.
- **Change ID:** waiter-day-and-refills
- **PRD refs:** FR-029, FR-023, US-08
- **Prerequisites:** S-12, S-14
- **Parallel with:** S-20
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Drugi sposób wejścia personelu, bez hasła, musi mieć ten sam zakres co konto kelnera, wygasać sam i nie otwierać niczego poza dzisiejszymi wydarzeniami lokalu.
- **Note:** kelner „na imprezę” (część FR-023: imię + jednorazowy link lub kod do końca okna, bez hasła) wycięty 2026-11-10 z waiter-day-and-refills (czas) — otwarty, do osobnej zmiany; projekt w CLAUDE.md („The floor”) i `overnight-log.md` („Decyzje”).
- **Status:** done

### S-21b: Kelner „na imprezę”

- **Outcome:** Menedżer (albo właściciel) dodaje kelnera „na imprezę”: imię i jednorazowy link lub krótki kod, ważne do końca okna imprezy (południe dnia następnego), bez hasła i bez konta. Kelner otwiera link albo wpisuje kod i pracuje tylko na sali tego jednego wydarzenia (to samo co kelner z kontem na `/panel/obsluga/<id>`), nigdy w panelu lokalu. Cofnięcie dostępu działa od razu.
- **Change ID:** event-waiter-access
- **PRD refs:** FR-023, FR-029, US-08
- **Prerequisites:** S-21
- **Parallel with:** S-22
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Drugi sposób wejścia personelu, bez hasła. Projekt w CLAUDE.md („The floor”): osobna tabela (nigdy `restaurant_member`), link i kod tylko jako hash z `created_by`, wygasanie samo, ciasteczko tylko dla sali jednego wydarzenia, kod z limitem prób jak logowanie.
- **Note:** wydzielony 2026-11-10 z S-21 (waiter-day-and-refills), które zostaje zarchiwizowane.
- **Status:** in-progress

### S-22: Wyszukiwanie gościa na mapie sali

- **Outcome:** Każdy, kto widzi pełną mapę sali na urządzeniu z klawiaturą (gość na telefonie, klient, personel, tablet obsługi), wyszukuje gościa po imieniu, a mapa podświetla jego miejsce. TV tego nie ma.
- **Change ID:** guest-map-search
- **PRD refs:** FR-048, US-08
- **Prerequisites:** S-21
- **Parallel with:** S-20, S-23
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Gość wyszukuje tylko w opublikowanym rozsadzeniu, które już widzi. Wyszukiwanie nie może ujawnić niczego ponad snapshot.
- **Status:** proposed

### S-23: Import gości i diety

- **Outcome:** Klient (albo lokal w trybie „lokal prowadzi”) importuje gości z pliku CSV lub wklejki z arkusza (nazwa, dieta, uwagi) i ogląda podgląd przed zapisem. Grupy tworzy po imporcie na liście. Oznacza dietę lub alergię gościa, a kuchnia na tablecie i kelnerzy widzą ją przy miejscu gościa i w zliczeniach. Dane gości nigdy nie trafiają do AI.
- **Change ID:** guest-import-diets
- **PRD refs:** FR-035, FR-036, US-07, NFR-021
- **Prerequisites:** S-14, S-21
- **Parallel with:** S-22, S-25
- **Blockers:** —
- **Unknowns:**
  - Czy po demo potrzebny będzie natywny import `.xlsx` (Otwarte pytanie 7). — Owner: user. Block: no.
- **Risk:** Alergia to dana o zdrowiu, więc pokazujemy ją tylko obsłudze tego wydarzenia, nigdy innym gościom ani na TV. Bez nowych zależności.
- **Status:** proposed

### S-24: Wydruki dla sali

- **Outcome:** Klient i lokal drukują tablicę „znajdź swój stolik”, karty stołów, winietki (z wyborem formatu i rozmiaru) i listę dla obsługi przy każdym stole (z dietami). Wydruki mają markę lokalu i wydarzenia.
- **Change ID:** room-prints
- **PRD refs:** FR-038
- **Prerequisites:** S-18, S-23
- **Parallel with:** S-25, S-26
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Druk w przeglądarce różni się między przeglądarkami. Trzymamy wzorzec karteczek z QR z v1 (strona A4 bez nagłówków przeglądarki).
- **Status:** proposed

### S-25: Potwierdzenie obecności i wybór dania

- **Outcome:** Gość przed imprezą potwierdza obecność i wybiera danie z opcji ustawionych dla wydarzenia, do terminu. Klient wpisuje wybór za gościa. Klient i lokal widzą zliczenia.
- **Change ID:** guest-rsvp-menu
- **PRD refs:** FR-039, US-07
- **Prerequisites:** S-16
- **Parallel with:** S-23, S-24, S-26
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Termin wyboru i nieobecność z RSVP muszą się zgadzać z oznaczaniem nieobecnych w v1, które pomija ich w losowaniu.
- **Status:** proposed

### S-26: Prywatność i retencja danych gości

- **Outcome:** Właściciel ustawia, po ilu dniach od imprezy dane gości są usuwane (domyślnie 30), a dane faktycznie znikają po tym terminie. Menedżer eksportuje dane wydarzenia przed usunięciem. Gość czyta informację o prywatności z linku na swoim telefonie.
- **Change ID:** privacy-retention
- **PRD refs:** FR-040, US-09, NFR-019
- **Prerequisites:** S-11
- **Parallel with:** S-24, S-25
- **Blockers:** —
- **Unknowns:**
  - Treść informacji o prywatności i umowy powierzenia (Otwarte pytanie 6). — Owner: user + prawnik. Block: no (szkic oznaczony „do przeglądu prawnika”).
- **Risk:** Usuwanie bez harmonogramu zadań (brak zadań w tle na hostingu) musi być pewne i nie może dotknąć szablonów ani wydarzeń w trakcie.
- **Status:** proposed

### S-27: Odczyt bez sieci dla obsługi

- **Outcome:** Bez sieci tablet obsługi i kelner widzą ostatni stan zamówień i rozsadzenia swojego wydarzenia, także po odświeżeniu strony (tylko odczyt).
- **Change ID:** staff-offline-readout
- **PRD refs:** FR-047, US-08, NFR-017
- **Prerequisites:** S-21
- **Parallel with:** S-22, S-23
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wzorzec z v1 (odczyt bez sieci u organizatora) przenosi się na nowe widoki. Zapisany stan nie może się pokazać pod innym linkiem ani innemu wydarzeniu.
- **Status:** proposed

### S-28: Pub quiz

- **Outcome:** Klient przygotowuje pub quiz (np. o jubilacie) i prowadzi go na TV, a goście odpowiadają na telefonach.
- **Change ID:** pub-quiz
- **PRD refs:** FR-049
- **Prerequisites:** S-17
- **Parallel with:** S-23, S-24, S-25, S-26, S-27
- **Blockers:** —
- **Unknowns:**
  - Wynik quizu na TV jako wyjątek od zasady v1 „ranking tylko u prowadzącego” (PRD v2, Poza zakresem: „szczegóły należą do planu modułu”). — Owner: planer S-28. Block: no.
- **Risk:** Największy nowy moduł gry. Wspólne odpytywanie telefonu gościa ma pomieścić quiz bez drugiego kanału.
- **Status:** proposed

### S-29: Restauracja demo

- **Outcome:** Administrator platformy przygotowuje restaurację demo na prawdziwym planie sali i menu tej restauracji. Ma ona konto właściciela, zespół, szablon sali i przykładową imprezę firmową z fikcyjnymi gośćmi, rozsadzeniem i zamówieniami. Przepływ 1–7 z PRD v2 da się na niej przejść na żywo.
- **Change ID:** demo-restaurant
- **PRD refs:** FR-042, US-05, US-06, US-07, US-08, US-09
- **Prerequisites:** S-15, S-16, S-21
- **Parallel with:** —
- **Blockers:**
  - Plan sali i menu restauracji od użytkownika (Otwarte pytanie 2); do tego czasu demo działa na wygenerowanym planie i przykładowym menu.
- **Unknowns:**
  - Data demo z restauracją (Otwarte pytanie 3). — Owner: user. Block: no.
- **Risk:** Każdy wcześniejszy slice utrzymuje działające `npm run demo`. Ten slice tylko przenosi je na restaurację demo i dopisuje scenariusz pokazu.
- **Status:** proposed

### S-30: Strona produktu i szkice dokumentów

- **Outcome:** Odwiedzający widzi publiczną stronę produktu z logowaniem oraz szkice regulaminu i polityki prywatności oznaczone „do przeglądu prawnika”.
- **Change ID:** landing-legal
- **PRD refs:** FR-041
- **Prerequisites:** S-29
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Nazwa produktu (Otwarte pytanie 1) i treść dokumentów prawnych (Otwarte pytanie 6). — Owner: user. Block: no.
- **Risk:** PRD v2 świadomie stawia ten slice na końcu, po demo, bo demo prowadzi użytkownik.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID               | Suggested issue title                                            | Ready for `/10x-plan` | Notes                                           |
| ---------- | ----------------------- | ---------------------------------------------------------------- | --------------------- | ----------------------------------------------- |
| F-02       | multi-tenant-events     | Restauracje i wiele wydarzeń (izolacja per wydarzenie)           | yes                   | Run `/10x-plan multi-tenant-events`             |
| F-03       | staff-accounts          | Konta personelu, logowanie i sesje bez e-maili                   | no                    | po F-02                                         |
| S-10       | platform-restaurants    | Panel platformy: restauracje i zaproszenie właściciela           | no                    | po F-03                                         |
| S-11       | restaurant-events       | Wydarzenia lokalu i linki dla klienta (gwiazda przewodnia)       | no                    | po S-10                                         |
| S-12       | restaurant-team         | Zespół lokalu: zaproszenia, role, reset hasła                    | no                    | po S-10                                         |
| S-13       | admin-support-log       | Wgląd administratora platformy z dziennikiem wejść               | no                    | po S-11                                         |
| S-14       | client-restaurant-split | Rozdział klient / lokal, „lokal prowadzi”, reset prób            | no                    | po S-11                                         |
| S-15       | venue-templates         | Szablony sal i „zaktualizuj z szablonu”                          | no                    | po S-11                                         |
| S-16       | menu-catalog-courses    | Katalog menu z kursami i menu wydarzenia                         | no                    | po S-14                                         |
| S-17       | event-modules           | Moduły wydarzenia: dostępność, włączanie, odblokowanie płatnych  | no                    | po S-14                                         |
| S-18       | event-branding          | Marka lokalu i wydarzenia, white-label u gościa                  | no                    | po S-11                                         |
| S-19       | scale-150               | Skala do 150 gości, 30 miejsc, 60 stolików                       | no                    | po F-02                                         |
| S-20       | tv-room-rotation        | TV z rotacją sal i przypięciem do sali                           | no                    | po S-19                                         |
| S-21       | waiter-day-and-refills  | Kelner w dniu imprezy, kelner „na imprezę”, dokładki             | no                    | po S-12, S-14                                   |
| S-21b      | event-waiter-access     | Kelner „na imprezę”: jednorazowy link lub kod bez hasła          | no                    | po S-21                                         |
| S-22       | guest-map-search        | Wyszukiwanie gościa na mapie sali                                | no                    | po S-21                                         |
| S-23       | guest-import-diets      | Import gości z CSV/wklejki i diety                               | no                    | po S-14, S-21                                   |
| S-24       | room-prints             | Wydruki dla sali: tablica, karty stołów, winietki, lista obsługi | no                    | po S-18, S-23                                   |
| S-25       | guest-rsvp-menu         | Potwierdzenie obecności i wybór dania                            | no                    | po S-16                                         |
| S-26       | privacy-retention       | Retencja danych gości, eksport, informacja o prywatności         | no                    | po S-11                                         |
| S-27       | staff-offline-readout   | Odczyt bez sieci dla tabletu i kelnera                           | no                    | po S-21                                         |
| S-28       | pub-quiz                | Pub quiz na TV z odpowiedziami na telefonach                     | no                    | po S-17                                         |
| S-29       | demo-restaurant         | Restauracja demo na planie i menu restauracji                    | no                    | po S-15, S-16, S-21; plan i menu od użytkownika |
| S-30       | landing-legal           | Strona produktu i szkice regulaminu i polityki prywatności       | no                    | po S-29                                         |

## Open Roadmap Questions

1. **Nazwa produktu (white-label u gościa, ale w panelu i na stronie produktu potrzebna).** — Owner: user. Block: — (S-18, S-30 na nazwie roboczej w jednej stałej).
2. **Plan sali i menu restauracji do demo (FR-042).** — Owner: user, przed demo. Block: S-29 (Blocker; do tego czasu dane przykładowe).
3. **Data demo z restauracją.** — Owner: user. Block: —.
4. **Hosting platformy:** nowe środowisko danych; „zawsze dostępna” (NFR-016) oznacza płatny plan albo inny sposób na brak usypiania; własna domena, bo adres trafia na karteczki z QR. Decyzja kosztowa należy do użytkownika. — Owner: user. Block: roadmap-wide dla wdrożenia (nie dla budowy; slice'y działają lokalnie).
5. **Cennik:** za które gry i zabawy płaci klient i ile; czy lokal płaci abonament. — Owner: user (po demo). Block: — (S-17: odblokowanie ręczne).
6. **Regulamin, polityka prywatności, umowa powierzenia z lokalem (dziennik wejść administratora, alergie jako dane o zdrowiu).** — Owner: user + prawnik. Block: — (S-13, S-26, S-30 na szkicach).
7. **Natywny import `.xlsx` (FR-035):** w M-2 jest CSV i wklejka z arkusza; czy `.xlsx` będzie potrzebny po demo. — Owner: user. Block: —.
8. **Koszt AI na platformie:** kto płaci za tematy AI i odczyt planu ze zdjęcia, czy jest miesięczny limit per lokal. — Owner: user. Block: — (S-17: tematy AI domyślnie wyłączone; limity per wydarzenie jak w v1).

## Parked

- **Płatności online** — Why parked: PRD v2 §Poza zakresem (płatne moduły odblokowuje ręcznie administrator platformy).
- **Samodzielna rejestracja lokali i wysyłanie e-maili** — Why parked: PRD v2 §Poza zakresem, NFR-020.
- **Integracje z kasą (POS), systemem rezerwacji i księgowością** — Why parked: PRD v2 §Poza zakresem.
- **Aplikacja do instalacji ze sklepu** — Why parked: PRD v2 §Poza zakresem.
- **Ekran kuchni z kolejnością i czasami kursów (KDS)** — Why parked: PRD v2 §Poza zakresem (kuchnia ma listę po kursach, S-16).
- **Kalendarz rezerwacji, CRM i statystyki lokalu** — Why parked: PRD v2 §Poza zakresem.
- **Nowe kształty stołów (podkowa, owal, stół prezydialny)** — Why parked: PRD v2 §Poza zakresem.
- **Języki inne niż PL/EN i logowanie dwuskładnikowe** — Why parked: PRD v2 §Poza zakresem.
- **Formalne SLA** — Why parked: PRD v2 §Poza zakresem (NFR-016 bez gwarancji umownej).
- **Cudze strzały i ranking gry w zgadywanie u gości lub na TV** — Why parked: PRD v2 §Poza zakresem (z v1; wyjątek quizu rozstrzyga S-28).
- **Własna domena, płatny plan bazy, monitoring, alarmy i śledzenie błędów** — Why parked: decyzja kosztowa użytkownika (Otwarte pytanie 4); baseline observability absent, a nocna budowa niczego nie wdraża.
- **Budżet AI per restauracja i własny klucz AI restauracji** — Why parked: Otwarte pytanie 8; `m2-product-notes.md` §Zaparkowane.
- **Dziennik działań personelu (poza dziennikiem wejść administratora)** — Why parked: `m2-product-notes.md` §Zaparkowane.
- **Agenda wieczoru i pokaz slajdów na TV** — Why parked: `m2-product-notes.md` §Zaparkowane.

## Milestone History

- **M-1: Cały wieczór w apce** (`full-evening-in-app`) — closed 2026-11-09. Kolacja 2026-11-08 przeszła w całości w apce (36 gości, 4 stoły): F-01 i S-01..S-09 done, plus dodatki po M-1 (venue-drawing, restaurant-orders, guest-delivered, guess-place, guest-venue-names, draw-neighbour, bill-drinks).

## Done

- **F-02: (foundation) Dane trzymają wiele restauracji i wiele wydarzeń, a każde wydarzenie należy do jednej restauracji. Istniejące wydarzenie 1 trafia do restauracji „domyślnej” bez utraty danych. Każdy link i każda operacja (rozsadzanie, publikacja, strzały, zamówienia, reset) działa tylko w obrębie swojego wydarzenia. Strona główna przestaje zakładać wydarzenia. Wszystko z v1 działa jak na kolacji, w obrębie jednego wydarzenia.** — Archived 2026-11-09 → `context/archive/2026-11-09-multi-tenant-events/`. Lesson: —.
- **F-03: (foundation) Zaproszona osoba otwiera jednorazowy link, ustawia hasło i loguje się e-mailem i hasłem na 30 dni na urządzeniu. Może się wylogować i zmienić hasło, co zamyka jej inne sesje. Masowe zgadywanie haseł jest odrzucane. Pierwszy administrator platformy powstaje z wiersza poleceń. Wejście do panelu bez zalogowania prowadzi do logowania. Aplikacja nie wysyła e-maili.** — Archived 2026-11-09 → `context/archive/2026-11-09-staff-accounts/`. Lesson: —.
- **S-10: Administrator platformy zakłada restaurację i dostaje jednorazowy link zaproszenia dla właściciela. Widzi listę restauracji z licznikami (wydarzenia, zespół). Wyłącza i włącza restaurację. Daje właścicielowi link resetu hasła, gdy ten zgubi dostęp. Właściciel po przyjęciu zaproszenia widzi swój pusty panel lokalu.** — Archived 2026-11-09 → `context/archive/2026-11-09-platform-restaurants/`. Lesson: —.
- **S-11: Lokal (właściciel, a po S-12 także menedżer) zakłada wydarzenie z nazwą, datą i przewidywaną liczbą gości. Przegląda wydarzenia nadchodzące, minione i archiwum. Na karcie wydarzenia kopiuje linki klienta, TV i tabletu obsługi. Wymienia każdy z nich po potwierdzeniu, które mówi, kogo wymiana odetnie. Archiwizuje i przywraca wydarzenia, a właściciel trwale je usuwa. Personel innej restauracji dostaje dla tego wydarzenia tę samą odmowę co dla nieznanego.** — Archived 2026-11-09 → `context/archive/2026-11-10-restaurant-events/`. Lesson: —.
- **S-12: Właściciel zaprasza menedżerów i kelnerów, a menedżer zaprasza kelnerów, jednorazowymi linkami. W swoim zakresie zmieniają role, usuwają osoby z zespołu i generują jednorazowy link resetu hasła. Menedżer ma uprawnienia z tabeli dostępu PRD v2, bez zarządzania menedżerami i bez ustawień lokalu.** — Archived 2026-11-10 → `context/archive/2026-11-10-restaurant-team/`. Lesson: —.
- **S-13: Administrator platformy otwiera dane dowolnej restauracji w trybie wsparcia. Każde takie wejście (kto, kiedy, co) trafia do dziennika, który właściciel lokalu widzi w swoim panelu. Poza tym trybem odmowa dla cudzej restauracji jest identyczna jak dla nieznanej.** — Archived 2026-11-10 → `context/archive/2026-11-10-admin-support-log/`. Lesson: —.
- **S-14: Personel lokalu podgląda w panelu pracę klienta nad wydarzeniem: gości, grupy, rozsadzenie i zamówienia. Po włączeniu przełącznika „lokal prowadzi” personel edytuje wszystko, co robi klient, a klient ma tylko podgląd. Klient nadal prowadzi zamówienia, napoje i rachunek jak w v1, ale nie zmienia cen. Może zresetować próby (rozsadzenia i ich historię, strzały, quiz) bez gości, sali i zamówień. Pełny reset i koszty AI są tylko w panelu lokalu, a ich trasy z linku klienta dają odmowę.** — Archived 2026-11-10 → `context/archive/2026-11-10-client-restaurant-split/`. Lesson: —.
- **S-15: Menedżer zapisuje układ sali jako szablon lokalu: plan, sale, stoliki, rysunek. Robi to od zera albo z istniejącego wydarzenia. Edytuje szablon i tworzy z niego nowe wydarzenia z gotową salą. Zmiana szablonu nie rusza istniejących wydarzeń, a osobna akcja „zaktualizuj z szablonu” przenosi zmiany do wybranego wydarzenia.** — Archived 2026-11-10 → `context/archive/2026-11-10-venue-templates/`. Lesson: —.
- **S-16: Menedżer prowadzi katalog dań i napojów lokalu z cenami i kursem (przystawka, zupa, danie główne, deser, napoje). Dla każdego wydarzenia ustala, czy dostępne jest pełne menu, czy okrojone. Klient wybiera pozycje zamówień z dostępnego menu i widzi ceny, ale ich nie zmienia. Lista dla kuchni na tablecie jest pogrupowana po kursach.** — Archived 2026-11-10 → `context/archive/2026-11-10-menu-catalog-courses/`. Lesson: —.
- **S-17: Lokal oznacza, które moduły mogą być dostępne: pytania, tematy AI, gra w zgadywanie rachunku, losowanie miejsc, „Pokaż na TV”, pub quiz. Klient włącza i wyłącza moduły spośród dostępnych. Tematy AI i gra w zgadywanie są domyślnie wyłączone. Moduły płatne są widoczne jako niedostępne, dopóki administrator platformy ręcznie nie odblokuje ich dla wydarzenia. Wyłączony moduł znika u klienta, gości i na TV, a jego trasy dają odmowę.** — Archived 2026-11-10 → `context/archive/2026-11-10-event-modules/`. Lesson: —.
- **S-18: Właściciel ustawia nazwę, logo i kolor lokalu. Klient dodaje nazwę i logo swojej firmy lub wydarzenia. Widać je na telefonach gości, TV, karteczkach z QR i w panelu. Gość nie widzi nazwy platformy, a „Kolacja podwyżkowa” znika z produktu, także z promptu AI.** — Archived 2026-11-10 → `context/archive/2026-11-10-event-branding/`. Lesson: —.
- **S-19: Klient prowadzi wydarzenie do 150 gości, ze stołami do 30 miejsc i ok. 60 stolikami. Projekt losowania jest gotowy w ≤ 3 s, a publikacja dociera na TV i do 200 otwartych telefonów w ≤ 5 s. Kilka imprez naraz nie spowalnia się poniżej tych celów.** — Archived 2026-11-10 → `context/archive/2026-11-10-scale-150/`. Lesson: —.
- **S-21: Kelner ze swoim kontem widzi wydarzenia trwające dziś. Okno obejmuje czas po północy, do południa dnia następnego. Widzi plan z gośćmi, zamówienia z cenami i rachunek, oznacza wydane sztuki i dopisuje zamówienia na sali (dokładki, dodatkowe napoje). Menedżer dodaje kelnera „na imprezę”: imię i jednorazowy link lub kod ważny do końca okna imprezy, bez hasła.** — Archived 2026-11-10 → `context/archive/2026-11-10-waiter-day-and-refills/`. Kelner „na imprezę” wycięty (otwarty, patrz Note w S-21). Lesson: —.
- **S-20: TV przy wejściu pokazuje cały lokal. Gdy imiona byłyby mniejsze niż cel czytelności, sam przechodzi po salach co kilka sekund. Klient i lokal mogą przypiąć TV do jednej sali.** — Archived 2026-11-10 → `context/archive/2026-11-10-tv-room-rotation/`. Lesson: —.
