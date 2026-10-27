# Guesses of the raise amount, intake control and the ranking read from the last place Implementation Plan

## Overview

Roadmap S-06 (`guesses-and-ranking`, PRD US-04, FR-017, FR-018, FR-019, FR-020, NFR-001). A guest types their guess of the final raise amount (PLN with grosze, ≥ 0) on the phone page `/g/<key>` and can change it until the organizer closes intake; the guest only ever sees their own guess. The organizer gets `/o/<key>/strzaly`: enter or correct any guest's guess (proxy), see who has not guessed yet, close and reopen intake, enter the correct amount, see the ranking by absolute distance (competition ranking 1, 2, 2, 4 with ties marked), and read it from the LAST place in a big-font step-by-step "czytanie od końca" mode on a phone. Guesses of others and the ranking never reach guest or TV responses.

## Current State Analysis

- Guest access (S-05): middleware resolves `/g/<key>` and `/api/g/<key>/…` to `GuestAccess { event, guest: { id, displayName } }` in one query (`src/lib/access/resolve.ts:74-92`); guest routes start with `guestApi(locals)` (`src/lib/guest-api.ts`) and identify the guest only by `access.guest.id`.
- Live guest state: `GET /api/g/<key>/state?since=` (`src/pages/api/g/[key]/state.ts`) → 204 when `since === getGuestStateVersion(db, name)`, else 200 `GuestStateDto { version, name, status, seat, planVersion }` (`src/types.ts:204-210`). Token = `guestStateVersion(seatingVersion, name)` (`src/lib/guest-links/state.ts:24-26`), `MAX_VERSION_LENGTH = 64`. S-05 reserved this spot: a later slice "adds a field to `GuestStateDto` and a part to the token instead of starting a second poll".
- The poller lives inside `useGuestState` (`src/components/hooks/useGuestState.ts`), a per-component hook used by `GuestSeatView`. A second island calling it would start a second poll per phone.
- Guest page `src/pages/g/[key].astro`: `<main>` with stacked `<section>`s; S-06 adds its section below the seat section.
- Organizer shell `src/pages/o/[key].astro` lists "Strzały i ranking" under `upcomingSections` ("Wkrótce"); smoke asserts `countOf(shell, "Wkrótce") === 2` (`scripts/smoke.mjs`, S-05 shell check) — it becomes 1.
- Patterns: `organizerApi` + `jsonResponse`/`jsonError`/`readJsonBody` (`astro/zod` `strictObject`)/`parseId` (`src/lib/http.ts`); DB functions with `set search_path = ''`, `raise exception '<CODE>' using errcode = 'P0001'`, revoke/grant (`supabase/migrations/20261027014210_create_seating.sql`); island + hook replacing state with each answer (`useGuestLinks.ts`, `api-failure.ts`); integration tests that restore shared event flags (`readGuestAccessEnabled`/`writeGuestAccessEnabled` in `tests/integration/helpers.ts`) and delete only their own rows; HTTP smoke against the production preview on a DB without an event.
- No money handling exists. `Intl.NumberFormat("pl-PL")` does not group 4-digit numbers ("1500") and its separators depend on the ICU build (workerd SSR vs Node vs phone browser) — a hydration-mismatch risk.
- Runtime: Cloudflare Workers ≈ 10 ms CPU per request; up to 60 phones polling every 2.5 s (NFR-002).

## Desired End State

- `public.guess` holds at most one guess per guest (integer grosze, 0 … 1 000 000 000 = 10 000 000,00 zł), cascading with the guest; `public.event.guess_intake_open` (default `true`) and `public.event.correct_amount_grosze` (nullable, same bounds).
- `/g/<key>` (guest access on): below the seat card a "Twój strzał" section. Intake open → amount field (accepts "1500", "1 500", "1499,99", "1499.99", "1 499,99 zł") + "Zapisz strzał"; after saving: "Twój strzał: 1 499,99 zł" with "Zmień strzał". Intake closed → "Przyjmowanie strzałów jest zamknięte." + the own guess (or "Nie oddano strzału."). A close, reopen or organizer proxy edit shows up within one poll (≤ 2.5 s), with no second poll per phone. A guest save is confirmed in one request (NFR-001).
- `PUT /api/g/<key>/guess { amount }` → 200 `GuestStateDto` (with the new version); 400 with a Polish parse message; 409 „Przyjmowanie strzałów jest zamknięte.” when intake is closed (atomic against a concurrent close).
- `GuestStateDto.guess = { intakeOpen, amountGrosze }` — only the guest's own guess and the intake status; the version token includes both. `TvSeatingDto` unchanged.
- `/o/<key>/strzaly`: intake status with counts and „Zamknij przyjmowanie” / „Otwórz ponownie”; correct amount form; the ranking table (place, name, guess, difference, „remis” badge) once the correct amount is set; „Czytaj od końca” → full-screen readout (one step per place from the last to the first, tied guests together, huge „Dalej”, „Wstecz”, „Zamknij”, keyboard); „Brakuje strzałów” list (absent guests marked); every guest with a proxy entry/correction and delete. The board refreshes every 5 s while visible.
- Organizer API: `GET|PATCH /api/o/<key>/guesses` (`PATCH { intakeOpen?, correctAmount? }`), `PUT|DELETE /api/o/<key>/guesses/<guestId>`; every answer is the whole `GuessBoardDto`.
- Shell card „Strzały i ranking” → `/o/<key>/strzaly` with a summary („Przyjmowanie otwarte · strzały: 32 z 40”).
- Ranking: pure `rankGuesses` in `src/lib/guesses/ranking.ts`; the board DTO carries a self-contained `ranking` (names, amounts, places) that S-09 can cache for offline reading.

Verify: `npm test` (unit + integration on the local DB), `npm run lint`, `npx astro check`, `npm run build` green; `npm run smoke` passes against `npm run preview` on a DB without an event (server stopped and `delete from public.event` afterwards).

### Key Discoveries:

- `src/lib/guest-links/state.ts:24` — the guest token is built in one place; extend it with `<intake 1|0>.<own amount|n>` (still ≤ 64 chars: seating token ~20 + name hash ~8 + ~13).
- `src/pages/api/g/[key]/state.ts:21-28` — the 204 path; the new reads (event intake flag, own guess) run in the same `Promise.all` as `getPublishedVersion`, so latency stays one round trip.
- `src/lib/access/resolve.ts:76-80` — supabase-js embeds work with the hand-written `Relationships` (S-05 embeds `event(...)`), so `guest → event(guess_intake_open)` + `guess(amount_grosze)` (one-to-one, `guest_id` PK) can be one query.
- Astro islands on one page share ES module instances (the documented way to share state between islands), so a module-level store gives one poll for both guest islands without a dependency.
- `scripts/smoke.mjs` S-05 section ends by turning guest access OFF; the S-06 checks run while it is on (before that final check) and the shell "Wkrótce" count changes from 2 to 1.

## What We're NOT Doing

- Showing anything about other guests' guesses, the correct amount or the ranking to guests or the TV (PRD Non-Goal + guardrail) — not even "you won".
- A guest deleting their own guess (they can only change it); the organizer can delete one (to undo a proxy mistake).
- Percentages or other currencies (PRD Non-Goal); amounts above 10 000 000 zł.
- Auto-closing intake when the correct amount is entered, or blocking the correct amount while intake is open (the page warns instead).
- An organizer "to ja" flag: an organizer who added themselves as a guest simply never enters a guess and shows up in „Brakuje” (S-01/S-03 decision; the page says so).
- Offline reading of the ranking (S-09) — only a DTO that can be cached.
- A history of guess changes, "clear all guesses", per-guest deadlines, guest-side countdowns.
- Browser/E2E tests (no Playwright overnight), Supabase Realtime.

## Implementation Approach

Schema and pure domain first (money parse/format with integer math, ranking, readout grouping — all unit-tested), then services over `DbClient` (organizer board, proxy writes, intake/correct amount, the guest write through an atomic DB function, the guest's own guess for the live state), then thin routes and the HTTP guardrail matrix, then the guest island on a shared poll store, and last the organizer page with the readout mode, the shell card and docs.

## Critical Implementation Details

- **Close vs. guest save race.** The guest write goes through `save_guest_guess(p_guest_id, p_amount_grosze)`: it locks the event row `for share` WHERE intake is open (else raises `INTAKE_CLOSED`) and upserts in the same transaction. Closing intake is an `update event` that waits for those share locks, and a save that waits behind a close re-checks the flag and is refused — so no guest guess lands after the close is committed. Organizer proxy writes skip the check.
- **Money is integer grosze end to end.** Parsing is string/integer math (`"4,35"` → 435, never `parseFloat * 100`); formatting is hand-rolled (`"1 499,99 zł"` with U+00A0 as the group and currency separator) so SSR and browsers render identical text.
- **One poll per phone.** The guess island must not call a per-component poller. The poller moves into a module-level store keyed by `apiBase`, created only in the browser (never during SSR — a module-level map on the Worker would be shared between requests), ref-counted by subscribers, read with `useSyncExternalStore` (server snapshot = `initial`). The store accepts a pushed state (the PUT answer) so the version is current at once. "Nowe miejsce!" still reacts to seat changes only.
- **Polling never clobbers typing.** Both the guest field and organizer proxy rows keep a local draft while editing; refreshed data only updates the displayed saved value.
- **Readout works from a frozen copy.** Opening „Czytaj od końca” copies the current ranking; polls during the readout do not shift the steps.

## Phase 1: Schema, types and the pure guess domain

### Overview

The tables/columns and the atomic guest-write function, DB and DTO types, and the pure modules every later phase relies on: amount parsing/formatting, the ranking, the readout steps and the board mapping — with unit tests and schema integration tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261027050000_guesses.sql`

**Intent**: Store one guess per guest and the intake/correct-amount state on the event; make the guest write atomic against a close.

**Contract**:
- `alter table public.event add column guess_intake_open boolean not null default true, add column correct_amount_grosze integer` + `check (correct_amount_grosze is null or correct_amount_grosze between 0 and 1000000000)`.
- `create table public.guess (guest_id bigint primary key references public.guest (id) on delete cascade, event_id smallint not null default 1 references public.event (id) on delete cascade, amount_grosze integer not null check (amount_grosze between 0 and 1000000000), entered_by text not null default 'guest' check (entered_by in ('guest', 'organizer')), updated_at timestamptz not null default now())`.
- `public.save_guest_guess(p_guest_id bigint, p_amount_grosze integer) returns void`, plpgsql, `set search_path = ''`: guest missing → `GUEST_NOT_FOUND`; `perform 1 from public.event where id = <guest's event_id> and guess_intake_open for share`, not found → `INTAKE_CLOSED`; upsert on `guest_id` setting `amount_grosze`, `entered_by = 'guest'`, `updated_at = now()`. Errors `using errcode = 'P0001'`.
- RLS on `guess`, `revoke all … from anon, authenticated`; `revoke execute … from public, anon, authenticated`, `grant execute … to service_role`. Header comment with the contract (one guess per guest, organizer writes bypass the intake check, guests/TV never read this table).

#### 2. DB types and DTOs

**File**: `src/db/database.types.ts`, `src/types.ts`

**Intent**: Mirror the schema; define the guest-facing and organizer-facing shapes.

**Contract**:
- `event`: `guess_intake_open: boolean`, `correct_amount_grosze: number | null` (optional in Insert/Update). `guess` table (Row/Insert/Update, Relationships `guess_guest_id_fkey` → `guest` `isOneToOne: true`, `guess_event_id_fkey` → `event`). Function `save_guest_guess: { Args: { p_guest_id: number; p_amount_grosze: number }; Returns: undefined }`.
- `src/types.ts` (all amounts are integer grosze):
  - `GuestGuessDto { intakeOpen: boolean; amountGrosze: number | null }`; `GuestStateDto` gains `guess: GuestGuessDto`.
  - `GuessEnteredBy = "guest" | "organizer"`; `GuessGuestDto { id; displayName; isAbsent; amountGrosze: number | null; enteredBy: GuessEnteredBy | null }`.
  - `MissingGuessDto { id; displayName; isAbsent }`.
  - `RankingEntryDto { place: number; tied: boolean; guestId: number; displayName: string; isAbsent: boolean; amountGrosze: number; differenceGrosze: number /* guess − correct */; distanceGrosze: number }`.
  - `GuessRankingDto { correctAmountGrosze: number; entries: RankingEntryDto[] /* place ascending */ }` — self-contained (S-09 caches it).
  - `GuessBoardDto { intakeOpen: boolean; correctAmountGrosze: number | null; guests: GuessGuestDto[] /* Polish alphabetical */; missing: MissingGuessDto[]; ranking: GuessRankingDto | null /* null until the correct amount is set */ }`.

#### 3. Amount parsing and formatting

**File**: `src/lib/guesses/amount.ts` (+ `amount.test.ts`)

**Intent**: Accept the ways Poles type money; store exactly; display one canonical format.

**Contract**:
- `MAX_AMOUNT_GROSZE = 1_000_000_000`.
- `parseAmount(text: string): { ok: true; grosze: number } | { ok: false; message: string }` — trims; drops a trailing `zł`/`zl`/`PLN` (any case) and a trailing `,-`/`.-`; removes spaces, U+00A0, U+202F, U+2009; then `^\d+([.,]\d{1,2})?$` via integer math. Messages (Polish, exported constants): empty → „Wpisz kwotę.”; leading `-` → „Kwota nie może być ujemna.”; anything else unparsable (incl. `"1.500"`, `"1,999"`, two separators, letters) → „Wpisz kwotę w złotych, np. 1500 albo 1499,99.”; above max → „Kwota może wynieść najwyżej 10 000 000 zł.”.
- `formatAmount(grosze)` → `"1 499,99 zł"` (U+00A0 group separator every 3 digits incl. 4-digit numbers, `,` decimal, always 2 decimals, U+00A0 before `zł`); `formatAmountInput(grosze)` → `"1499,99"` (prefill); `describeDifference(differenceGrosze)` → „dokładnie!” / „o 50,00 zł za mało” / „o 50,00 zł za dużo”.
- Tests: the PRD formats ("1500", "1 500", "1499,99", "1499.99", "1 499,99 zł", NBSP, "1500,-", "0", "0,5" → 50, "4,35" → 435, "0,29" → 29, "1,1" → 110), rejections ("", "-5", "abc", "1.500", "1,999", "1,2,3", "10000000,01"), the max boundary, round trip `parseAmount(formatAmountInput(x))`, formatting (0, 5, 1500 00, 149 999, 1 000 000 000).

#### 4. Ranking, readout steps and the board mapping

**File**: `src/lib/guesses/ranking.ts`, `src/lib/guesses/board.ts` (+ tests), `src/lib/guesses/index.ts`

**Intent**: The PRD ranking rule as a pure function; the grouping the readout mode steps through; the board DTO from rows.

**Contract**:
- `rankGuesses(guesses: { guestId; displayName; isAbsent; amountGrosze }[], correctAmountGrosze: number): RankingEntryDto[]` — sort by `|amount − correct|` ascending, then Polish collator on the name, then id; competition places (equal distance → equal place, the next place skips: 1, 2, 2, 4); `tied` = the place has more than one entry; a guess above and below by the same distance is a tie.
- `placesFromLast(ranking: GuessRankingDto): { place: number; tied: boolean; entries: RankingEntryDto[] }[]` — one step per distinct place, last place first.
- `toGuessBoard({ intakeOpen, correctAmountGrosze, guests: { id; displayName; isAbsent }[], guesses: { guestId; amountGrosze; enteredBy }[] }): GuessBoardDto` — guests in Polish order with their guess or null; `missing` = guests without a guess (absent ones included and marked); `ranking` = null without a correct amount, else `rankGuesses` over every guess (absent guests who have a guess are ranked, marked).
- `formatGuessSummary(board)` → „Przyjmowanie otwarte · strzały: 32 z 40” / „Przyjmowanie zamknięte · strzały: 38 z 40 · ranking gotowy” (no guests → „Przyjmowanie otwarte · brak gości”).
- Tests: 1, 2, 2, 4 with names in alphabetical order inside the tie; a tie above/below the correct amount; 1 grosz difference is not a tie; exact hit = place 1 with distance 0; all tied; empty; deterministic order by name then id for identical names; `placesFromLast` order and grouping; `toGuessBoard` missing list with absent marks, ranking null without correct amount, ranking includes an absent guest's guess; summary plurals.
- `index.ts` exports the pure modules and (from phase 2) the services.

#### 5. Schema integration tests

**File**: `tests/integration/guess-schema.test.ts`

**Intent**: Prove constraints, cascade, the function's intake check and that browser roles get nothing.

**Contract**: own test guests only (tag names); event flags read first and restored in `afterEach`. Checks: amount check refuses −1 and 1 000 000 001; one row per guest; deleting the guest deletes the guess; `save_guest_guess` saves/overwrites while open (`entered_by = 'guest'`), raises `INTAKE_CLOSED` while closed and `GUEST_NOT_FOUND` for an unknown guest; `correct_amount_grosze` bounds; anon REST cannot read `guess` nor call `save_guest_guess`, and cannot read `event.guess_intake_open`.

### Success Criteria:

#### Automated Verification:

- Migration applies on the local DB: `npx supabase migration up`
- Unit and integration tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 2: Guess services and the guest state extension

### Overview

DB services for the organizer board, proxy writes, intake and the correct amount, the guest write, and the guest's own guess folded into the live guest state and its token.

### Changes Required:

#### 1. Guess services

**File**: `src/lib/guesses/service.ts`, `src/lib/guesses/index.ts`

**Intent**: All guess reads/writes over `DbClient`, status unions for expected outcomes, throws on DB errors.

**Contract**:
- `getGuessBoard(db)` → `GuessBoardDto` (event flags, guests `id, display_name, is_absent`, guesses `guest_id, amount_grosze, entered_by` in parallel; `toGuessBoard`).
- `setGuessIntakeOpen(db, open)`, `setCorrectAmount(db, grosze: number | null)` → void.
- `saveGuessByOrganizer(db, guestId, grosze)` → `{ status: "saved" } | { status: "not-found" }` (upsert, `entered_by = 'organizer'`, `updated_at = now()`; FK violation `23503` → not-found). Works whether intake is open or closed.
- `deleteGuess(db, guestId)` → `{ status: "deleted" } | { status: "not-found" }` (unknown guest → not-found; a guest without a guess → deleted, no-op).
- `submitGuestGuess(db, guestId, grosze)` → `{ status: "saved" } | { status: "closed" } | { status: "not-found" }` via `rpc("save_guest_guess")`, mapping `INTAKE_CLOSED` / `GUEST_NOT_FOUND`.
- `getGuestGuess(db, guestId)` → `GuestGuessDto` (one query: guest with `event(guess_intake_open)` and `guess(amount_grosze)` embedded, or two parallel tiny queries if the embed typing fights).
- Messages: `GUESS_INTAKE_CLOSED_MESSAGE` = „Przyjmowanie strzałów jest zamknięte.”, `GUESS_GUEST_NOT_FOUND_MESSAGE` = „Nie znaleziono gościa.”.

#### 2. Guest state with the own guess

**File**: `src/lib/guest-links/state.ts`, `src/lib/guest-links/service.ts`, `src/lib/guest-links/state.test.ts`

**Intent**: The phone's single poll carries the intake status and the own guess.

**Contract**:
- `guestStateVersion(seatingVersion, name, guess: GuestGuessDto)` → `"<seating>.<name hash>.<1|0>.<amountGrosze|n>"` (≤ 64 chars); `toGuestState` input gains `guess` and the DTO carries it.
- `getGuestState(db, guest)` and `getGuestStateVersion(db, guest: { id; displayName })` run `getPublishedVersion` and `getGuestGuess` in one `Promise.all`; callers (`state.ts` route, `/g/[key].astro`) updated.
- Unit tests: the token changes when intake flips and when the own amount changes; stays equal otherwise; worst-case length ≤ 64; the DTO has no other keys than the documented ones.

#### 3. Integration tests

**File**: `tests/integration/guesses.test.ts`, `tests/integration/helpers.ts`, `tests/integration/guest-links.test.ts`

**Intent**: Services against the local DB without touching real data.

**Contract**: helpers `readGuessSettings`/`writeGuessSettings` (intake flag + correct amount) restored in `afterEach`; own tagged guests only. Cases: guest submit while open → saved, board shows the amount with `enteredBy: "guest"`, not in `missing`; while closed → `closed`, amount unchanged; organizer proxy while closed → saved (`enteredBy: "organizer"`); delete → back in `missing`; unknown guest → not-found for proxy/delete/submit; correct amount set → `ranking` present, own two guests at equal distance share a place and are `tied`, distances right to the grosz; correct amount null → `ranking` null; absent own guest without a guess is in `missing` with `isAbsent`; `getGuestGuess` reflects intake and own amount; `getGuestState`/`getGuestStateVersion` token changes after a guest save, an organizer proxy edit and an intake flip, and equals between them; another guest's state never contains this guest's amount. Existing `guest-links.test.ts` calls updated to the new signatures.

### Success Criteria:

#### Automated Verification:

- Unit and integration tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 3: Guess API routes and the HTTP guardrail smoke

### Overview

Thin organizer and guest routes over the services, and the guess access matrix at HTTP level.

### Changes Required:

#### 1. Organizer routes

**File**: `src/pages/api/o/[key]/guesses.ts`, `src/pages/api/o/[key]/guesses/[id].ts`

**Intent**: Board, intake switch, correct amount, proxy entry and delete for the organizer.

**Contract**: all start with `organizerApi(locals)`; every success answers 200 with the whole `GuessBoardDto`.
- `GET /guesses`.
- `PATCH /guesses` `z.strictObject({ intakeOpen: z.boolean().optional(), correctAmount: z.string().max(40).nullable().optional() })` with at least one key (else 400 „Nieprawidłowe dane.”); `correctAmount` parsed with `parseAmount` (400 with its message), `null` clears it.
- `PUT /guesses/<guestId>` `z.strictObject({ amount: z.string().max(40) })` → 400 parse message / 404 „Nie znaleziono gościa.” (also malformed id); `DELETE /guesses/<guestId>` → 404 for an unknown guest.

#### 2. Guest routes

**File**: `src/pages/api/g/[key]/guess.ts`, `src/pages/api/g/[key]/state.ts`

**Intent**: The guest's only write; the poll uses the extended token.

**Contract**: `PUT /guess` — `guestApi(locals)`; body `z.strictObject({ amount: z.string().max(40) })` (any extra key such as `guestId` → 400); `parseAmount` → 400 with its message; `submitGuestGuess(db, api.access.guest.id, grosze)` → saved: 200 `await getGuestState(db, guest)`; closed: 409 `GUESS_INTAKE_CLOSED_MESSAGE`; not-found: 404 „Brak dostępu”. `state.ts` uses `getGuestStateVersion(db, guest)`.

#### 3. HTTP smoke

**File**: `scripts/smoke.mjs`

**Intent**: Prove the guardrail and intake rules over HTTP on the production preview.

**Contract**: a new S-06 section while guest access is on (before the final "turning guest access off" check), with distinctive amounts (Ania 1234,56; Ola 7777,77; correct 5000,00), using Ania's current key and Ola's key:
- organizer `GET /guesses` → `intakeOpen: true`, `correctAmountGrosze: null`, `ranking: null`, both in `missing`, no-store;
- Ania's state has `guess: { intakeOpen: true, amountGrosze: null }`; guest `PUT /guess { amount: "1 234,56 zł" }` → 200 with `amountGrosze: 123456` and a new version; `?since=<old>` → 200, `?since=<new>` → 204;
- bad amounts (`"-5"`, `"abc"`, `"1.500"`, `"10000000,01"`, `""`) → 400 with the Polish messages; `{ amount, guestId: <ola> }` → 400 and Ola's guess unchanged;
- organizer proxy `PUT /guesses/<ola> { amount: "7777,77" }` → board with Ola's amount; Ola's state shows `777777`; Ania's state/version unchanged by Ola's write (204 since her version);
- leak checks: Ania's state JSON contains neither `777777`, `7 777,77`, `500000`, `ranking`, `place`, `correctAmount` nor Ola's name; Ola's likewise for `123456`;
- `PATCH { intakeOpen: false }` → Ania's state `intakeOpen: false` (since old version → 200); guest `PUT` → 409 „Przyjmowanie strzałów jest zamknięte.” and her amount unchanged; organizer proxy for Ania → 200 while closed;
- `PATCH { correctAmount: "5000" }` → ranking: Ola place 1 (distance 277777), Ania place 2; proxy Ania to `"2222,23"` (distance 277777) → both place 1 and `tied`; guest states still contain no ranking/correct amount; TV `GET /api/tv/<tv>/seating` and `/tv/<tv>` contain none of the amounts (`123456`, `777777`, `222223`, `500000`, formatted forms) and no `guess`;
- `PATCH {}` and `{ intakeOpen: "no" }` → 400; `PATCH { correctAmount: "abc" }` → 400 with the parse message; `PUT /guesses/999999999` and `/guesses/abc` → 404; `DELETE /guesses/<ola>` → Ola back in `missing`;
- wrong roles: TV key and guest key on `GET|PATCH /api/o/<k>/guesses` and `PUT /api/o/<k>/guesses/<id>` → JSON 404; organizer and TV keys on `PUT /api/g/<k>/guess` → JSON 404;
- `PATCH { intakeOpen: true }` → guest `PUT` works again (200). Leaves guest access as the following S-05 check expects.

### Success Criteria:

#### Automated Verification:

- Lint and type check pass: `npm run lint`, `npx astro check`
- Tests pass: `npm test`
- Production build succeeds: `npm run build`
- HTTP smoke passes on a DB without an event: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

---

## Phase 4: Guest guess section on the phone (shared poll)

### Overview

One poll per phone shared by the seat and guess islands, and the "Twój strzał" section.

### Changes Required:

#### 1. Shared guest state store

**File**: `src/components/hooks/guest-state-store.ts`, `src/components/hooks/useGuestState.ts`

**Intent**: Move the S-05 poller into a module-level store so every guest island reads the same state from one `setTimeout` chain.

**Contract**: store per `apiBase`, created lazily in the browser only (never touched during SSR); polling starts with the first subscriber and stops with the last; same behaviour as S-05 (2.5 s, 4 s abort, pause while hidden, poll at once on visible, 404 → state null and keep polling, 3 failures → offline); `push(state)` replaces the state and version (for a PUT answer), `refresh()` polls now. `useGuestState(apiBase, initial)` → `{ state, offline, changed, push, refresh }` via `useSyncExternalStore` (server snapshot from `initial`); `changed` ("Nowe miejsce!") still compares `describeGuestSeat` only, so guess changes never trigger it. `GuestSeatView` keeps working unchanged in behaviour.

#### 2. Guess island

**File**: `src/components/guest/GuestGuessView.tsx`

**Intent**: Enter, change and see the own guess on a phone, quickly.

**Contract**: props `{ apiBase, initial: GuestStateDto }`; uses `useGuestState`. No access (state null) → renders nothing (the seat section shows the no-access text). Intake open, no guess → one-line prompt („Ile wyniesie podwyżka? Wpisz swój strzał w złotych.”), big field (`type="text"`, `inputMode="decimal"`, `autoComplete="off"`, `enterKeyHint="done"`, „zł” suffix, label), „Zapisz strzał”. With a guess → „Twój strzał: <formatAmount>” large + „Zmień strzał” (field prefilled with `formatAmountInput`, „Anuluj”). Client validates with `parseAmount` (message under the field, no request); `PUT <apiBase>/guess` → 200 `push(state)` + „Zapisano: <amount>” (aria-live); 400 → server message; 409 → message + `refresh()`; network failure → „Brak połączenia — spróbuj ponownie.” and the draft stays. Closed → „Przyjmowanie strzałów jest zamknięte.” + own guess or „Nie oddano strzału.”; a close arriving while editing ends the edit and says so. Polls never overwrite the draft.

#### 3. Guest page section

**File**: `src/pages/g/[key].astro`

**Intent**: Mount the island below the seat section.

**Contract**: `<section aria-labelledby="guess-heading">` with a visible `<h2 id="guess-heading">Twój strzał</h2>` and `<GuestGuessView client:load apiBase=… initial=… />` (same `initial` object as the seat island); update the structure comment.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Page-level guardrail.

**Contract**: with a guess saved and the correct amount set, `/g/<ania>` 200 contains „Twój strzał” and her own `formatAmount` text, and none of Ola's amount, the correct amount, `ranking`, `correctAmount` or Ola's name.

### Success Criteria:

#### Automated Verification:

- Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- Build succeeds: `npm run build`
- HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

#### Manual Verification:

- On a real phone (~360 px, iOS Safari / Android Chrome) with guest access on: enter „1 500”, „1499,99” and „1499.99” → each saved and shown as „1 499,99 zł”-style text within ~1 s; the decimal keyboard opens; change the guess; the organizer closes intake → the phone shows „zamknięte” within ~3 s and saving is refused; the organizer enters a guess for this guest → the phone shows it; the seat card's „Nowe miejsce!” does not flash on guess changes; only one `/state` request every 2.5 s in the network panel.

---

## Phase 5: Organizer guesses page, readout mode, shell card and docs

### Overview

The organizer's page for the evening's last act: proxy entries, who is missing, close/reopen, the correct amount, the ranking and the big-font reading from the last place.

### Changes Required:

#### 1. Page, island and hook

**File**: `src/pages/o/[key]/strzaly.astro`, `src/components/guesses/GuessManager.tsx` (+ small subcomponents in `src/components/guesses/`), `src/components/hooks/useGuessBoard.ts`

**Intent**: Everything for FR-018..FR-020 on one page, phone-first, ordered for the < 1 minute flow.

**Contract**:
- SSR: organizer re-check, `getGuessBoard(db)`, back link to the panel.
- Hook: `send({ method, path, body })` replaces the board with each answer (pattern `useGuestLinks`, `api-failure.ts`; 404 → refetch); polls `GET /guesses` every 5 s while the page is visible and no request is pending (setTimeout chain, 4 s abort), `refresh()`.
- Order on the page: (1) intake card — „Przyjmowanie strzałów: otwarte/zamknięte”, „Strzały: 32 z 40”, „Zamknij przyjmowanie” / „Otwórz ponownie” (no confirm, reversible); (2) correct amount — field + „Zapisz prawidłową kwotę”, then „Prawidłowa kwota: 5 000,00 zł” with „Zmień”/„Usuń”; a warning when set while intake is open („Goście nadal mogą zmieniać strzały — ranking może się zmienić.”); (3) when the ranking exists: a big „Czytaj od końca” button and the ranking table (place, name, guess, `describeDifference`, „remis” badge, absent mark); (4) „Brakuje strzałów (N)” list with „nieobecny” marks and a note that an organizer listed as a guest does not guess; (5) all guests (Polish order) with their guess or „brak strzału”, „Wpisz”/„Popraw” → inline field (client `parseAmount`) + „Zapisz”/„Anuluj”, „Usuń strzał” with `window.confirm`; „wpisany przez organizatora” hint when `enteredBy === "organizer"`.
- Empty states: no guests → link to `/o/<key>/goscie`; no guesses with a correct amount → „Brak strzałów do rankingu.”.

#### 2. Readout mode

**File**: `src/components/guesses/RankingReadout.tsx`

**Intent**: Read the ranking aloud from the last place in seconds, on a phone.

**Contract**: full-screen overlay (`fixed inset-0`, `role="dialog"`, `aria-modal`, focus on „Dalej”) over a frozen copy of `ranking`; steps = `placesFromLast`; each step: „Miejsce N” (huge) with „remis” when tied, every name in the step (≥ 2.5rem), each with „strzał: <amount>” and `describeDifference`; progress „krok i z n”; the first place step titled „Zwycięzca!”/„Zwycięzcy!”; „Dalej” fills the bottom (≥ 64 px high), „Wstecz” and „Zamknij” smaller; keyboard → / Space / Enter = next, ← = back, Esc = close; after the first place „Dalej” becomes „Zakończ”. The correct amount is shown on the first screen header („Prawidłowa kwota: 5 000,00 zł”).

#### 3. Shell card

**File**: `src/pages/o/[key].astro`

**Intent**: Replace the "Wkrótce" entry with a real card.

**Contract**: card „Strzały i ranking” → `/o/<key>/strzaly`, description „Strzały gości, zamknięcie przyjmowania, prawidłowa kwota i ranking od końca.”, summary `formatGuessSummary(await getGuessBoard(db))` (in the same `Promise.all`).

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Page checks and the updated shell count.

**Contract**: `/o/<org>/strzaly` 200, no-store, contains both names, the ranking and „Czytaj od końca”; TV key and guest key → identical 404 denied body without names or amounts; shell shows the card linking `/o/<org>/strzaly` with its summary, and `countOf(shell, "Wkrótce") === 1`.

#### 5. Docs

**File**: `CLAUDE.md`

**Intent**: Record the S-06 contracts for S-07..S-09.

**Contract**: a "Guesses and ranking (S-06)" data-access entry (tables/columns, `save_guest_guess` and the intake rule, money in grosze + parse/format helpers, services, organizer/guest APIs, `GuessBoardDto`/`GuessRankingDto` shape for S-09 caching, the shared guest poll store `guest-state-store.ts` that later guest islands reuse instead of polling).

### Success Criteria:

#### Automated Verification:

- Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- Build succeeds: `npm run build`
- HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

#### Manual Verification:

- On a phone (~360 px) as the organizer with ~40 demo guests and guesses (incl. a tie and an absent guest): enter a guess for a guest, correct one, delete one; „Brakuje strzałów” updates within ~5 s after a guest saves on another phone; close intake, type the correct amount, tap „Czytaj od końca” and read the last place in under 1 minute from closing; step through to the first place with „Dalej” — tied guests appear together with „remis”, text readable at arm's length, no horizontal scrolling; reopen intake and the guest can save again.

---

## Testing Strategy

### Unit Tests:

- Amount: every accepted Polish format, rejections with the right message, boundaries (0, 10 000 000,00 zł, +1 grosz), integer-only math cases, round trip, canonical formatting (NBSP, 4-digit grouping), difference descriptions.
- Ranking: competition places 1, 2, 2, 4; ties above/below; 1-grosz precision; exact hit; all tied; empty; deterministic in-tie order (name, then id); `placesFromLast` grouping and order.
- Board: missing list with absent marks; ranking null without a correct amount; absent guest's guess ranked; summary strings and plurals.
- Guest token: changes on intake flip and own amount change, stable otherwise, ≤ 64 chars.

### Integration Tests:

- Schema: bounds, one guess per guest, cascade, `save_guest_guess` open/closed/unknown guest, anon refusals.
- Services: guest submit open/closed, organizer proxy while closed, delete, unknown guest, ranking ties and grosze, guest state/token after guest save, proxy edit and intake flip; no cross-guest data.

### Manual Testing Steps:

1. Two phones as guests + the organizer on a third device: both guests save guesses; the organizer sees them disappear from „Brakuje”.
2. Close intake: both phones show „zamknięte” within ~3 s; a save attempt is refused.
3. Enter the correct amount and read the ranking from the last place with „Dalej”; check a tie is shown together.

## Performance Considerations

- Guest poll 204 path: middleware lookup + `getPublishedVersion` (2 tiny queries) + `getGuestGuess` (1 tiny query) in parallel — still one round trip after the lookup; 60 phones at 2.5 s ≈ 24 req/s.
- Guest save: one RPC + the state read (4 small queries, parallel) — well within 1 s (NFR-001).
- Organizer board: 3 small queries; the ranking for ≤ 100 guests is trivial; polling every 5 s from one device.

## Migration Notes

- `guess_intake_open` defaults to `true` (guests can guess as soon as guest access is on); `correct_amount_grosze` starts null. Existing events get both defaults; no backfill.
- Rollback: drop the function, the table and the two event columns (nothing else depends on them).

## References

- PRD: `context/foundation/prd.md` (US-04, FR-017..FR-020, NFR-001, Business Logic ranking rule, Guardrails, Access Control)
- Guest contract: `context/archive/2026-10-27-guest-links-and-seat-view/plan.md` ("Guest access contract")
- Polling and token: `src/pages/api/g/[key]/state.ts`, `src/lib/guest-links/state.ts`, `src/components/hooks/useGuestState.ts`
- DB function pattern: `supabase/migrations/20261027014210_create_seating.sql` (`seat_guest`)
- Island + hook pattern: `src/components/hooks/useGuestLinks.ts`, `src/components/guest-links/GuestLinksManager.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, types and the pure guess domain

#### Automated

- [x] 1.1 Migration applies on the local DB: `npx supabase migration up` — 56384d8
- [x] 1.2 Unit and integration tests pass: `npm test` — 56384d8
- [x] 1.3 Lint passes: `npm run lint` — 56384d8
- [x] 1.4 Type check passes: `npx astro check` — 56384d8

### Phase 2: Guess services and the guest state extension

#### Automated

- [x] 2.1 Unit and integration tests pass: `npm test` — ef978d5
- [x] 2.2 Lint passes: `npm run lint` — ef978d5
- [x] 2.3 Type check passes: `npx astro check` — ef978d5

### Phase 3: Guess API routes and the HTTP guardrail smoke

#### Automated

- [x] 3.1 Lint and type check pass: `npm run lint`, `npx astro check` — 7115c22
- [x] 3.2 Tests pass: `npm test` — 7115c22
- [x] 3.3 Production build succeeds: `npm run build` — 7115c22
- [x] 3.4 HTTP smoke passes on a DB without an event: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`) — 7115c22

### Phase 4: Guest guess section on the phone (shared poll)

#### Automated

- [x] 4.1 Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test` — d6755de
- [x] 4.2 Build succeeds: `npm run build` — d6755de
- [x] 4.3 HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`) — d6755de

#### Manual

- [ ] 4.4 On a real phone: enter/change a guess in Polish formats, decimal keyboard, close/proxy edits show within ~3 s, no „Nowe miejsce!” on guess changes, one `/state` poll per 2.5 s

### Phase 5: Organizer guesses page, readout mode, shell card and docs

#### Automated

- [x] 5.1 Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test` — aaa8224
- [x] 5.2 Build succeeds: `npm run build` — aaa8224
- [x] 5.3 HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`) — aaa8224

#### Manual

- [ ] 5.4 On a phone as the organizer: proxy entry/correction/delete, „Brakuje” refreshes, close → correct amount → first result read from the last place in < 1 minute, ties together with „remis”, reopen works
