# Guess the place — Implementation Plan

## Overview

Next to the guess of what the whole dinner cost, a guest may (optionally) predict their own final place in the
ranking. The ranking itself does not change: it is still measured from the amount only. The prediction decides a
consolation prize the organizer hands out on the evening: the organizer's ranking lights the podium in gold, silver
and bronze and everyone who hit their own place in light green.

## Current State Analysis

- `public.guess` (`guest_id` PK, `amount_grosze`, `entered_by`, `updated_at`); guests write only through
  `save_guest_guess(p_guest_id, p_amount_grosze)` (event row `FOR SHARE` while intake is open, else
  `INTAKE_CLOSED`); the organizer upserts directly (`saveGuessByOrganizer`).
- `rankGuesses` (pure, `src/lib/guesses/ranking.ts`): competition places 1, 2, 2, 4 by distance, `tied` flag.
  `toGuessBoard` builds `GuessBoardDto` (guests, missing, ranking). `offlineRanking` re-ranks the saved board with a
  locally typed correct amount.
- The guest's phone gets `GuestStateDto.guess = GuestGuessDto { intakeOpen, amountGrosze }` (one query in
  `getGuestGuess`, also on the 204 poll path) and the token `guestStateVersion(seating, name, guess)` (route limit
  64 chars, today ≤ ~50).
- The offline readout validates the cached board in depth (`isGuessBoardData`, also used for the live sync answer).
- `isGuestState` on the phone is lenient (extra fields pass), so phones with the old JS keep working after the deploy.

## Desired End State

- Guest phone: under the amount an optional „Na którym miejscu w rankingu będziesz?” (1…number of guests) with the
  prize hint; the saved state shows the amount and „typ miejsca: 5”; both change together until intake closes.
- Organizer `/strzaly`: entering a guess for a guest takes an optional place too; every guest row shows the
  prediction; the ranking rows of places 1/2/3 are gold/silver/bronze (with a medal as a non-colour cue), every hit
  is light green with „trafione miejsce” (a podium hit keeps its medal colour and gets the badge), a legend and a
  one-line list of who hit their place; „Czytaj od końca” shows each person's prediction and the hit.
- Offline readout: the same highlights from the same pure function (also with a locally typed amount); caches saved
  before this change still load.
- Guests and the TV never get anyone else's prediction or anyone's hit.

### Key Discoveries:

- A same-name overload of `save_guest_guess` would make PostgREST's RPC ambiguous for a 2-argument call, and the old
  code must keep working between `db push` and the deploy → a new function `save_guest_guess_with_place`.
- PostgREST upsert updates only the columns in the payload, so an organizer save without `place` keeps the stored
  prediction; the old guest function's `do update` does not name the new column either.
- Under tie rule A, a group sharing displayed place p with n members spans places p…p+n−1; with competition ranking
  the next displayed place is exactly p+n, so the spans never overlap.

## What We're NOT Doing

- No change to how the ranking is computed or read, no prize logic (who is excluded is the organizer's call on the
  evening), nothing on the TV, no shell-card change.
- The guest never sees their actual place or whether they hit (the organizer reads the results out).
- No change to reset (deleting guess rows clears predictions) or to the guest's other sections.

## Implementation Approach

One additive migration, pure rules first (parse, hit, medal), then service + APIs, then the three UIs (guest,
organizer, offline), tests at every level (unit, integration on the local DB, smoke), docs. One phase: the change is
small enough to verify as a whole.

## Critical Implementation Details

- **Place rule**: integer 1…`maxPlace`, `maxPlace` = number of guests in the event (absent ones included: their
  proxy guesses are ranked), DB check 1…100 (`MAX_GUESTS`). Empty = no prediction. A place without an amount is
  refused by the forms (the API always takes the amount with it).
- **Hit** (`placeHit`): `predictedPlace` within `[place, place + sharing − 1]` of the entry's group. **Medal**:
  displayed place 1 gold, 2 silver, 3 bronze (1, 2, 2, 4 → two silvers, no bronze — the sports convention).
- **Keep vs clear**: API bodies `{ amount, place? }` — `place` missing = keep the stored prediction (old phones),
  `""` or `null` = clear, a number text = set. Guest: missing → `save_guest_guess`, present →
  `save_guest_guess_with_place`; both under the same intake lock.
- **Phone token**: `guestStateVersion` gets the prediction and `maxPlace` (a place the organizer enters for a guest,
  or a new guest raising the limit, must reach the phone; ≤ ~58 chars).
- **Offline**: validators accept boards without the new fields and fill `predictedPlace: null`, `placeHit: false`.
- **Deploy order**: the code reads `guess.predicted_place`; without the migration the guest page and `/strzaly`
  fail. Dump → `supabase db push` → `deploy:aws`.

## Phase 1: Place prediction end to end

### Overview

Data model, pure rules, service and APIs, guest phone, organizer page, offline readout, tests and docs.

### Changes Required:

- Migration `supabase/migrations/20261106120000_guess_predicted_place.sql`: `guess.predicted_place integer` (null,
  check 1…100), `save_guest_guess_with_place(bigint, integer, integer)` (same lock as `save_guest_guess`, sets both,
  `entered_by = 'guest'`), revoked from browser roles. `src/db/database.types.ts`.
- `src/types.ts`: `GuestGuessDto.predictedPlace`, `.maxPlace`; `GuessGuestDto.predictedPlace`;
  `RankingEntryDto.predictedPlace`, `.placeHit`.
- `src/lib/guesses/place.ts` (`parsePredictedPlace`, `podiumMedal`, `placeHits`), `ranking.ts` (hits on entries),
  `board.ts`, `messages.ts` (PL/EN), `service.ts` (reads, `saveGuessByOrganizer`/`submitGuestGuess` with an
  optional place, range check), `index.ts`; unit tests.
- `src/lib/guest-links/state.ts` token; routes `PUT /api/g/<key>/guess` and `PUT /api/o/<key>/guesses/<id>`
  (`place` optional, 400 with the range message).
- UI: `GuestGuessView.tsx`, `AmountForm.tsx` (optional place field), `GuessGuestRow.tsx`, `GuessManager.tsx`,
  `RankingTable.tsx`, `RankingReadout.tsx`, `OfflineRanking.tsx`; `src/lib/offline/cache.ts` + `readout.ts`.
- Tests: `tests/integration/guesses.test.ts` / `guess-schema.test.ts`, smoke section 18, `scripts/demo.mjs`
  predictions; `CLAUDE.md`, `README.md`.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, `npm test` (with the local DB) pass.
- `npm run build`, then `npm run smoke` against the production preview on a fresh DB passes.
- `npm run package:lambda` passes.

#### Manual Verification:

- Guest phone (narrow window): save an amount with and without a place, change it, see the closed state.
- `/strzaly` with demo data: podium colours, green hits, ties, the readout, the offline readout.

## Migration Notes

Additive: one nullable column (existing guesses get no prediction) and one new function; `save_guest_guess` stays
for the old code until the deploy. Hosted DB: dump → `db push` → `deploy:aws`.

## Progress

### Phase 1: Place prediction end to end

#### Automated

- [x] 1.1 Migration, DB types and DTOs — 48f54a5
- [x] 1.2 Pure place rules, ranking hits and messages with unit tests — 48f54a5
- [x] 1.3 Service, APIs and phone token with integration tests — 48f54a5
- [x] 1.4 Guest phone field — 48f54a5
- [x] 1.5 Organizer page: form, rows, ranking highlights, readout — 48f54a5
- [x] 1.6 Offline readout and cache compatibility — 48f54a5
- [x] 1.7 Smoke, demo data and docs — 48f54a5
- [x] 1.8 Full checks (lint, check, tests, build, smoke, package:lambda) — 48f54a5

#### Manual

- [ ] 1.9 Guest phone and `/strzaly` checked in Chrome

## Deviations

- Review fixes (Fable, `reviews/fable-review.md`) landed in a second commit: the `service_role` grant on the new
  function, the place error routed to the place field (`field: "place"`), docs, `placeHitters` in the table.
- 1.9 (manual): checked headless (Playwright, local demo data): guest form with a wrong and a right place, clearing,
  the organizer's proxy place reaching the phone, podium/hit colours, the readout. A check in Chrome by the user
  is still open.
