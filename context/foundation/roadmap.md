---
project: kolacja-podwyzkowa
version: 1
status: draft
created: 2026-10-27
updated: 2026-10-27
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: full-evening-in-app
milestone_seq: 1
milestone_status: open
---

# Roadmap: kolacja-podwyzkowa

> Derived from `context/foundation/prd.md` (v1) + `shape-notes.md` (`## Forward: technical-roadmap`) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.
> Framing: `main_goal: speed` i gwiazda przewodnia US-02 wybrał użytkownik; `top_blocker: time` przyjęty z rekomendacji (użytkownik poszedł spać i polecił przyjmować rekomendowane odpowiedzi).

## Milestone

**M-1: Cały wieczór w apce** — Status: open

- **Intent:** organizator może przygotować i poprowadzić całą kolację 2026-11-08 (rozsadzenie, przelosowania, pytania, strzały, ranking) z jednej apki, gotowej do próby generalnej.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001..FR-020, US-01..US-04, NFR-001..NFR-010.

## Vision recap

Organizator co roku prowadzi kolację podwyżkową dla 35–40 przyjaciół i dziś trzyma rozsadzenie oraz przebieg wieczoru w arkuszach i na kartkach. Apka daje jeden wspólny stan wieczoru i trzy widoki: organizator (steruje), TV (pokazuje rozsadzenie na planie) i telefon gościa (miejsce, pytania, strzał). Wbudowane są reguły, których arkusz nie obsłuży: rotacja bez powtarzania sąsiadów z zachowaniem nierozdzielnych grup oraz ranking strzałów czytany od końca.

## North star

**S-04: Organizator przelosowuje rozkład z zachowaniem grup i bez powtórek sąsiadów, przegląda projekt i publikuje go na TV** — gwiazda przewodnia, czyli najmniejszy kompletny przepływ, którego działanie dowodzi, że produkt robi coś, czego arkusz nie umie; stawiamy go tak wcześnie, jak pozwalają zależności, bo to kluczowe ułatwienie organizatora i najtrudniejsza reguła domenowa.

## At a glance

| ID   | Change ID                   | Outcome (user can …)                                                                 | Prerequisites       | PRD refs                                             | Status   |
| ---- | --------------------------- | ------------------------------------------------------------------------------------ | ------------------- | ---------------------------------------------------- | -------- |
| F-01 | link-access-foundation      | (foundation) wydarzenie z sekretnym linkiem organizatora i adresem TV; reszta bez dostępu; testy działają | —                   | NFR-009, Access Control                              | done     |
| S-01 | guest-list-and-groups       | organizator wkleja i edytuje listę gości, tworzy grupy i oznacza nieobecnych          | F-01                | US-01, FR-001, FR-002, FR-003                        | done     |
| S-02 | rooms-and-tables-on-plan    | organizator wgrywa plan, nazywa sale i stawia pinezki stolików z miejscami i typem    | F-01                | US-01, FR-005, FR-006                                | done     |
| S-03 | manual-seating-on-tv        | organizator sadza gości ręcznie, przypina miejsca, publikuje, a TV pokazuje imiona na planie | S-01, S-02          | US-01, FR-004, FR-007, FR-008, NFR-003, NFR-006      | done     |
| S-04 | reshuffle-draft-and-publish | organizator losuje projekt rozkładu bez powtórek sąsiadów, poprawia go, publikuje i cofa | S-03                | US-02, FR-009, FR-010, NFR-007                       | done     |
| S-05 | guest-links-and-seat-view   | gość otwiera osobisty link/QR i widzi swój stolik i miejsce, odświeżane na żywo       | S-03                | US-03, FR-011, FR-012, FR-013, NFR-003, NFR-008, NFR-009 | done        |
| S-06 | guesses-and-ranking         | goście oddają strzały, organizator zamyka przyjmowanie i czyta ranking od końca       | S-05                | US-04, FR-017, FR-018, FR-019, FR-020, NFR-001       | done        |
| S-07 | question-base-and-draw      | organizator prowadzi bazę pytań, a każdy losuje pytanie z wybranej kategorii          | S-05                | US-03, FR-014, FR-015                                | done        |
| S-08 | ai-topics-with-limits       | organizator i goście generują tematy AI w kategorii, z limitami                       | S-07                | US-03, FR-016, NFR-005, NFR-010                      | planning |
| S-09 | organizer-offline-readout   | organizator bez sieci widzi ostatni rozkład i ranking zebranych strzałów              | S-04, S-06          | US-04, FR-020, NFR-004                               | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme             | Chain                                      | Note                                                                 |
| ------ | ----------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| A      | Rozsadzanie       | `F-01` → `S-01` → `S-02` → `S-03` → `S-04` | Ścieżka do gwiazdy przewodniej; S-01 i S-02 mogą iść równolegle.      |
| B      | Telefon gościa    | `S-05` → `S-06` → `S-09`                   | Dołącza do strumienia A w S-03 (S-09 także w S-04).                   |
| C      | Rozmowy           | `S-07` → `S-08`                            | Dołącza do strumienia B w S-05; najmniej krytyczne dla terminu.       |

## Baseline

What's already in place in the codebase as of `2026-10-27` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — per tech-stack.md: Astro 7 SSR + React 19 + Tailwind 4 + shadcn/ui (`astro.config.mjs`, `src/components/ui/`).
- **Backend / API:** present (szkielet) — trasy API Astro (`src/pages/api/auth/*`), middleware (`src/middleware.ts`).
- **Data:** partial — klient Supabase (`src/lib/supabase.ts`), `supabase/config.toml`; brak migracji i schematu.
- **Auth:** partial / nie pasuje — logowanie e-mail+hasło (strony `src/pages/auth/*`, `PROTECTED_ROUTES`); PRD wymaga dostępu przez klucze w linkach, bez kont.
- **Deploy / infra:** partial — `wrangler.jsonc` + adapter Cloudflare; CI w `.github/workflows/ci.yml` ustawione na gałąź `master` (repo używa `main`); brak frameworka testów.
- **Observability:** absent.

## Foundations

### F-01: Dostęp przez klucze w linkach

- **Outcome:** (foundation) istnieje jedno wydarzenie z sekretnym linkiem organizatora i osobnym adresem TV; wejście bez ważnego klucza pokazuje stronę braku dostępu; przykładowe logowanie e-mail startera jest usunięte; testy jednostkowe uruchamiają się jedną komendą, a CI działa na `main`.
- **Change ID:** link-access-foundation
- **PRD refs:** NFR-009, Access Control
- **Unlocks:** S-01, S-02 (widok organizatora za kluczem), S-03 (adres TV); ścieżka weryfikacji testami jednostkowymi dla S-04 (algorytm losowania).
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Model dostępu wpływa na każdą trasę; ustalony raz na początku zapobiega wyciekowi rankingu (guardrail). Nie buduje całej warstwy danych: tylko wydarzenie i klucze.
- **Status:** done

## Slices

### S-01: Lista gości, grupy, nieobecni

- **Outcome:** organizator wkleja listę gości (jedna osoba na linię), edytuje i usuwa gości z wyświetlaną nazwą, tworzy i rozwiązuje grupy 2–5 osób oraz oznacza nieobecnych.
- **Change ID:** guest-list-and-groups
- **PRD refs:** US-01, FR-001, FR-002, FR-003
- **Prerequisites:** F-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Prosty CRUD, ale walidacja grup (2–5, gość w jednej grupie) musi być twarda, bo losowanie na niej polega.
- **Status:** done

### S-02: Sale i stoliki na planie

- **Outcome:** organizator wgrywa zrzut planu, nazywa sale i stawia na planie pinezki stolików z nazwą, liczbą miejsc i typem (okrągły / prostokątny).
- **Change ID:** rooms-and-tables-on-plan
- **PRD refs:** US-01, FR-005, FR-006
- **Prerequisites:** F-01
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:**
  - Dokładny układ lokalu i zrzut planu (Open Question 1) — Owner: user. Block: no (apka elastyczna, do testów dane demo).
- **Risk:** Pinezki na obrazie to najcięższa część UI przygotowań; trzymać prosty model (pozycja jako procent szerokości/wysokości obrazu).
- **Status:** done

### S-03: Ręczne rozsadzenie i widok TV

- **Outcome:** organizator sadza gości na konkretnych miejscach, zamienia ich, przypina miejsca i publikuje rozkład, a widok TV pokazuje imiona przy stolikach na planie i sam się odświeża po publikacji.
- **Change ID:** manual-seating-on-tv
- **PRD refs:** US-01, FR-004, FR-007, FR-008, NFR-003, NFR-006
- **Prerequisites:** S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czytelność imion na planie na prawdziwym TV (Open Question 2) — Owner: user. Block: no (cel mierzalny NFR-006, weryfikacja na próbie).
- **Risk:** Wprowadza pojęcie opublikowanego rozkładu i historii, na którym stoją S-04 i S-05; czytelność 40 imion na planie to ryzyko UX.
- **Status:** done

### S-04: Przelosowanie: projekt, poprawki, publikacja, cofnięcie

- **Outcome:** organizator losuje projekt nowego rozkładu (grupy razem na kolejnych miejscach, przypięci na miejscach, nieobecni pominięci, jak najmniej powtórzonych sąsiadów), przegląda go, losuje ponownie lub poprawia ręcznie, publikuje na TV i telefony albo wraca do poprzedniego rozkładu.
- **Change ID:** reshuffle-draft-and-publish
- **PRD refs:** US-02, FR-009, FR-010, NFR-007
- **Prerequisites:** S-03
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Najtrudniejsza reguła domenowa (sąsiedzi zależni od typu stolika, grupy na kolejnych miejscach, przypadki niewykonalne); musi mieć gęste testy jednostkowe.
- **Status:** done

### S-05: Osobiste linki gości i widok miejsca

- **Outcome:** organizator drukuje karteczki z osobistymi kodami QR i kopiuje linki, włącza i wyłącza dostęp gości, unieważnia link; gość po otwarciu linku widzi swój stolik i miejsce, odświeżane na żywo.
- **Change ID:** guest-links-and-seat-view
- **PRD refs:** US-03, FR-011, FR-012, FR-013, NFR-003, NFR-008, NFR-009
- **Prerequisites:** S-03
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Pierwszy widok gościa; dostęp musi przestrzegać macierzy z Access Control (wyłączony dostęp, unieważniony link).
- **Status:** done

### S-06: Strzały i ranking

- **Outcome:** gość wpisuje i zmienia swój strzał do zamknięcia; organizator wpisuje strzały za gości, widzi kto nie oddał, zamyka i otwiera przyjmowanie, wpisuje prawidłową kwotę i czyta ranking od ostatniego miejsca z remisami.
- **Change ID:** guesses-and-ranking
- **PRD refs:** US-04, FR-017, FR-018, FR-019, FR-020, NFR-001
- **Prerequisites:** S-05
- **Parallel with:** S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Ranking ani cudze strzały nie mogą wyciec do gościa ani na TV (guardrail); testy dostępu obowiązkowe.
- **Status:** done

### S-07: Baza pytań i losowanie pytań

- **Outcome:** organizator dodaje, edytuje, usuwa i hurtowo wkleja pytania z kategorią (baza startowa ok. 30 na kategorię gotowa), a organizator i goście losują pytanie z wybranej kategorii lub ze wszystkich, widoczne tylko dla losującego.
- **Change ID:** question-base-and-draw
- **PRD refs:** US-03, FR-014, FR-015
- **Prerequisites:** S-05
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:**
  - Przegląd startowej bazy pytań (Open Question 4) — Owner: user. Block: no.
- **Risk:** Niskie; baza startowa to treść, którą użytkownik musi przejrzeć przed kolacją.
- **Status:** done

### S-08: Tematy AI z limitami

- **Outcome:** organizator i goście generują temat do rozmowy w wybranej kategorii; gość ma limit 5 na wieczór, łącznie 300; przy braku odpowiedzi widać komunikat, a nieudana próba nie zjada limitu.
- **Change ID:** ai-topics-with-limits
- **PRD refs:** US-03, FR-016, NFR-005, NFR-010
- **Prerequisites:** S-07
- **Parallel with:** S-06
- **Blockers:**
  - Klucz do usługi AI i limit wydatków (Open Question 5) — do tego czasu atrapa.
- **Unknowns:** —
- **Risk:** Płatna usługa zewnętrzna; w nocy wyłącznie atrapa, prawdziwe wywołanie dopiero po dodaniu klucza przez użytkownika.
- **Status:** planning

### S-09: Odczyt bez sieci u organizatora

- **Outcome:** organizator bez sieci widzi ostatni opublikowany rozkład i ranking strzałów zebranych przed awarią, także po odświeżeniu strony.
- **Change ID:** organizer-offline-readout
- **PRD refs:** US-04, FR-020, NFR-004
- **Prerequisites:** S-04, S-06
- **Parallel with:** S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Odczyt po odświeżeniu bez sieci wymaga, żeby strona organizatora w ogóle się załadowała offline; zakres zawężony do odczytu.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                   | Suggested issue title                                   | Ready for `/10x-plan` | Notes                                  |
| ---------- | --------------------------- | ------------------------------------------------------- | --------------------- | -------------------------------------- |
| F-01       | link-access-foundation      | Dostęp przez klucze w linkach + testy + CI na main      | yes                   | Run `/10x-plan link-access-foundation` |
| S-01       | guest-list-and-groups       | Lista gości, grupy 2–5, nieobecni                       | no                    | po F-01                                |
| S-02       | rooms-and-tables-on-plan    | Plan sal, sale, stoliki z pinezkami                     | no                    | po F-01                                |
| S-03       | manual-seating-on-tv        | Ręczne rozsadzenie, publikacja, widok TV                | no                    | po S-01, S-02                          |
| S-04       | reshuffle-draft-and-publish | Przelosowanie bez powtórek sąsiadów (gwiazda przewodnia) | no                    | po S-03                                |
| S-05       | guest-links-and-seat-view   | Osobiste linki/QR i widok miejsca gościa                | no                    | po S-03                                |
| S-06       | guesses-and-ranking         | Strzały, zamknięcie, ranking od końca                   | no                    | po S-05                                |
| S-07       | question-base-and-draw      | Baza pytań i losowanie pytań                            | no                    | po S-05                                |
| S-08       | ai-topics-with-limits       | Tematy AI z limitami (na atrapie)                       | no                    | po S-07; klucz AI od użytkownika       |
| S-09       | organizer-offline-readout   | Odczyt rozkładu i rankingu bez sieci                    | no                    | po S-04, S-06                          |

## Open Roadmap Questions

1. **Dokładny układ lokalu na 2026-11-08 (liczba sal, stolików, miejsc, typy stolików) i zrzut planu.** — Owner: user. Block: — (S-02 działa na danych demo). By: 2026-11-05.
2. **Czytelność imion na planie na TV (NFR-006) przy realnym telewizorze i układzie.** — Owner: user. Block: — (weryfikacja S-03 na próbie). By: 2026-11-06.
3. **Próba generalna całego flow z prawdziwymi telefonami, urządzeniem przy TV i siecią lokalu (oraz hotspotem jako zapasem).** — Owner: user. Block: roadmap-wide (akceptacja milestone'u). By: 2026-11-06.
4. **Przegląd startowej bazy pytań przygotowanej przez asystenta.** — Owner: user. Block: — (S-07). By: 2026-11-05.
5. **Klucz do usługi AI i limit wydatków po stronie dostawcy; do tego czasu apka działa na atrapie AI.** — Owner: user. Block: — (S-08 na atrapie). By: 2026-11-05.
6. **Publiczny adres apki (hosting, konto) na kolację.** — Owner: user + asystent. Block: roadmap-wide (wieczór na żywo). By: 2026-11-04.

## Parked

- **Konta i logowanie** — Why parked: PRD §Non-Goals (dostęp wyłącznie przez linki).
- **Pokazywanie cudzych strzałów i rankingu gościom lub na TV** — Why parked: PRD §Non-Goals.
- **Wiele wydarzeń i archiwum edycji** — Why parked: PRD §Non-Goals.
- **Rysowanie planu sal w apce** — Why parked: PRD §Non-Goals (wgrany zrzut + pinezki).
- **Wysyłanie linków przez apkę** — Why parked: PRD §Non-Goals.
- **Wspólny QR na TV i wybór siebie z listy** — Why parked: PRD §Non-Goals.
- **Pełna praca offline z synchronizacją** — Why parked: PRD §Non-Goals (tylko odczyt, S-09).
- **Strzały w procentach lub innej walucie** — Why parked: PRD §Non-Goals.
- **Moderacja pytań organizatora** — Why parked: PRD §Non-Goals.
- **Monitoring i obserwowalność produkcyjna** — Why parked: baseline absent, a `main_goal: speed` i jednorazowy wieczór nie uzasadniają inwestycji.

## Milestone History

## Done

- **F-01: (foundation) istnieje jedno wydarzenie z sekretnym linkiem organizatora i osobnym adresem TV; wejście bez ważnego klucza pokazuje stronę braku dostępu; przykładowe logowanie e-mail startera jest usunięte; testy jednostkowe uruchamiają się jedną komendą, a CI działa na `main`.** — Archived 2026-10-27 → `context/archive/2026-10-27-link-access-foundation/`. Lesson: —.
- **S-01: organizator wkleja listę gości (jedna osoba na linię), edytuje i usuwa gości z wyświetlaną nazwą, tworzy i rozwiązuje grupy 2–5 osób oraz oznacza nieobecnych.** — Archived 2026-10-27 → `context/archive/2026-10-27-guest-list-and-groups/`. Lesson: —.
- **S-02: organizator wgrywa zrzut planu, nazywa sale i stawia na planie pinezki stolików z nazwą, liczbą miejsc i typem (okrągły / prostokątny).** — Archived 2026-10-27 → `context/archive/2026-10-27-rooms-and-tables-on-plan/`. Lesson: —.
- **S-03: organizator sadza gości na konkretnych miejscach, zamienia ich, przypina miejsca i publikuje rozkład, a widok TV pokazuje imiona przy stolikach na planie i sam się odświeża po publikacji.** — Archived 2026-10-27 → `context/archive/2026-10-27-manual-seating-on-tv/`. Lesson: —.
- **S-04: organizator losuje projekt nowego rozkładu (grupy razem na kolejnych miejscach, przypięci na miejscach, nieobecni pominięci, jak najmniej powtórzonych sąsiadów), przegląda go, losuje ponownie lub poprawia ręcznie, publikuje na TV i telefony albo wraca do poprzedniego rozkładu.** — Archived 2026-10-27 → `context/archive/2026-10-27-reshuffle-draft-and-publish/`. Lesson: —.
- **S-05: organizator drukuje karteczki z osobistymi kodami QR i kopiuje linki, włącza i wyłącza dostęp gości, unieważnia link; gość po otwarciu linku widzi swój stolik i miejsce, odświeżane na żywo.** — Archived 2026-10-27 → `context/archive/2026-10-27-guest-links-and-seat-view/`. Lesson: —.
- **S-06: gość wpisuje i zmienia swój strzał do zamknięcia; organizator wpisuje strzały za gości, widzi kto nie oddał, zamyka i otwiera przyjmowanie, wpisuje prawidłową kwotę i czyta ranking od ostatniego miejsca z remisami.** — Archived 2026-10-27 → `context/archive/2026-10-27-guesses-and-ranking/`. Lesson: —.
- **S-07: organizator dodaje, edytuje, usuwa i hurtowo wkleja pytania z kategorią (baza startowa ok. 30 na kategorię gotowa), a organizator i goście losują pytanie z wybranej kategorii lub ze wszystkich, widoczne tylko dla losującego.** — Archived 2026-10-27 → `context/archive/2026-10-27-question-base-and-draw/`. Lesson: —.
