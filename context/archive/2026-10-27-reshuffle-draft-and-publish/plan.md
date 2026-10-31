# Reshuffle draft without repeated neighbours, review, publish and restore — Implementation Plan

## Overview

Roadmap S-04 (`reshuffle-draft-and-publish`, the north star; PRD US-02, FR-009, FR-010, NFR-007). On `/o/<key>/rozsadzenie` the organizer draws a draft of a new seating: inseparable groups sit together on consecutive seats at one table, pinned guests keep their seats, absent guests get no seat, and as few neighbour pairs as possible repeat any pair from the previously published arrangements. The draft lands in the working arrangement only (the TV and phones keep showing the last published snapshot), with live stats of repeated pairs; the organizer redraws, fixes it manually (S-03 tools), publishes (S-03), discards it, or goes back to the arrangement published before the current one. Infeasible inputs give a Polish message naming the cause and change nothing.

## Current State Analysis

- S-03 is done: working arrangement `public.seat_assignment(guest_id PK, table_id, seat, is_pinned)` with `unique (table_id, seat)`, trigger `check_seat_in_range`, trigger `unseat_beyond_seat_count`; immutable snapshots `seating_snapshot` / `_table` (copy of every table incl. `shape`, `seat_count`; `table_id` SET NULL) / `_seat` (`guest_id` SET NULL, `guest_name`); functions `seat_guest()` and `publish_seating()` under `pg_advisory_xact_lock(3003)` (`supabase/migrations/20261027014210_create_seating.sql`).
- Service `src/lib/seating/service.ts`: `getAssignments`, `getLatestSnapshot`, `getSnapshot`, `getSeatingBoard` (→ `SeatingBoardDto { guestList, venue, assignments, published, upToDate }`), `publishSeating` (no-op when unchanged), `getSeatingVersion` (TV polling: two tiny queries via `latestSnapshotRow`).
- Pure rules: `src/lib/venue/seats.ts` (`neighbours`, `sideNeighbours`, `areConsecutiveSeats` — the shared "consecutive seats" definition), `src/lib/seating/rules.ts` (`seatingWarnings`, `describeWarnings`, `formatNameList`, `formatPublishedAt`, `pluralPl` usage), `published.ts` (fingerprints, TV mapping), `board.ts` (click rules), test builders `fixtures.test-helpers.ts` (`guest`, `table`, `seat`, `input`, `snapshotOf`).
- UI: `src/components/seating/SeatingEditor.tsx` + `PublishBar.tsx` + hook `src/components/hooks/useSeatingBoard.ts` (every change replaces the board with the server's answer; 404/409 reload the board). Page `src/pages/o/[key]/rozsadzenie.astro`; shell `src/pages/o/[key].astro` still lists "Losowanie i cofnięcie" under "Wkrótce".
- API pattern: `organizerApi(locals)`, `readJsonBody` + `astro/zod` strict objects, `jsonError(status, message, { problems })` (the island shows `problems` as detail lines via `toFailure`).
- `supabase/config.toml` sets PostgREST `max_rows = 1000`: a single select of all snapshot seats is silently truncated after ~25 publishes of 40 guests.
- No draw, no history, no restore, no hard group rule anywhere yet; S-03 only warns about split groups.

## Desired End State

- `/o/<key>/rozsadzenie` has a "Losowanie" panel: „Wylosuj projekt” (then „Losuj ponownie”), the live stat „Powtórzone pary sąsiadów: N” with the pairs listed by name and table (or „Nikt nie siedzi obok tych samych osób co wcześniej.”), the history size („Historia: K opublikowanych rozkładów”), „Odrzuć zmiany — wróć do tego, co jest na TV” (when published and not up to date) and „Wróć do poprzedniego rozkładu (z 27.10, 19:42)” (when an earlier snapshot exists). A draw computes in the browser (≤ 1.2 s budget), saves the draft into the working arrangement and says „Wylosowano projekt — 0 powtórzonych par sąsiadów. Przejrzyj, popraw i opublikuj.”; an infeasible draw shows „Nie da się wylosować rozkładu.” with the causes and changes nothing. Draw/restore ask for confirmation only when they would overwrite unpublished manual changes.
- Organizer API: `GET /api/o/<key>/seating/history` → `NeighbourHistoryDto`; `POST /api/o/<key>/seating/draft` `{ seats }` → 200 board | 409 `{ error, problems }` | 400; `POST /api/o/<key>/seating/restore` `{ snapshotId }` → 200 board + `notice` | 404 | 409. The board carries `previous` (the snapshot before the latest). TV/guest responses unchanged; nothing of the draft reaches the TV until publish.
- DB: `replace_seating(p_seats jsonb)` replaces every non-pinned working row atomically under the seating lock; browser roles cannot call it.
- The shell card "Rozsadzenie" mentions draws; "Losowanie i cofnięcie" leaves the "Wkrótce" list. CLAUDE.md documents the draw model for S-05/S-09.

Verify: `npm test` (unit + integration on the local DB, incl. the acceptance and performance tests), `npm run lint`, `npx astro check`, `npm run build` green; `npm run smoke` passes against `npm run preview` on a DB without an event (server stopped and `delete from public.event` afterwards).

### Draw rules (the contract this slice implements and tests)

- **Inputs**: present guests (`isAbsent = false`), groups (only present members count; a group with 0–1 present members imposes nothing — its present member is a single), pinned working rows, all venue tables (`seatCount`, `shape`), and history pairs.
- **Neighbour** = `neighbours()` from `seats.ts` (round: i±1 with wrap; rectangular: i±1 on the same side + opposite). A seat held by an absent pinned guest is occupied but empty on the TV: it produces no pairs (and nobody else may sit there).
- **Consecutive seats (hard)**: all present members of a group sit at one table and their seats satisfy `areConsecutiveSeats` (connected via side neighbours: an arc around a round table, wrap allowed; a contiguous run on one side of a rectangular table; "opposite" never joins them).
- **Pins (hard)**: pinned rows stay exactly as they are (also for absent guests). A group with pinned member(s): its other present members must form one consecutive block with the pinned seat(s) at that table.
- **Absent (hard)**: absent non-pinned guests lose their seats in a draft.
- **Completeness (hard)**: every present non-pinned guest gets a seat.
- **History**: union of neighbour guest pairs over ALL published snapshots, each computed from the snapshot's own table shape and seat count; seats whose guest was deleted are skipped.
- **Objective (soft)**: minimise the number of unordered guest pairs that are neighbours now and in the history, not counting pairs of members of the same (current) group. Stop at 0; otherwise return the best found within the budget. Ties broken by the RNG, so a redraw gives a different result.
- **Infeasible** (no POST, nothing changes): `too-many-guests` (present guests > seats minus seats held by absent pinned guests), `group-too-large` (no block of k consecutive seats at any table that avoids other people's pins), `pinned-group-split` (pinned members of one group at different tables, or at one table but not joinable into one block of the group's size), `pinned-group-no-room` (no block around the pinned member(s) with enough free seats), `groups-do-not-fit` (each group fits alone but no simultaneous placement exists).

### Key Discoveries:

- `areConsecutiveSeats(shape, seatCount, seats)` (`src/lib/venue/seats.ts:90`) is already "the S-04 group rule"; reuse it for validation and for enumerating blocks in tests.
- `snapshotOf(input, id)` (`src/lib/seating/fixtures.test-helpers.ts:40`) builds what `publish_seating()` would write — the acceptance test publishes through it, so history in tests is computed exactly like in production.
- `useSeatingBoard.run()` already reloads the board on 404/409 (`src/components/hooks/useSeatingBoard.ts:66`) — a stale draft answered with 409 refreshes the page state for free.
- `toFailure` shows `problems: string[]` as detail lines (`src/components/hooks/api-failure.ts:15`).
- `latestSnapshotRow` (`src/lib/seating/service.ts:149`) backs the TV polling token; it must stay a one-row query.
- Supabase errors from constraint violations carry `error.code` (`23505`, `23503`, `23514`); raises from plpgsql carry `error.message` (`SEAT_OUT_OF_RANGE`).
- `ACCESS_PATH_PATTERN` (`src/lib/access/paths.ts:18`) already covers `/api/o/<key>/seating/<anything>`; no middleware change.

## What We're NOT Doing

- Running the search on the server (Cloudflare CPU limits) or in a Web Worker (the budget is short; the main thread yields once to paint „Losuję…”).
- A separate stored "draft" object or several drafts side by side: the draft is the working arrangement (S-03 contract).
- Publishing directly from "back to previous": restore fills the working arrangement; the organizer publishes with the existing button.
- Browsing/restoring arbitrary older snapshots in the UI (the API takes any `snapshotId`, the UI offers only "what the TV shows" and "the one before").
- Resetting or pruning the neighbour history (rehearsal/prep publishes count — see Open Risks).
- Secondary objectives (e.g. "move everyone to a different table", balancing empty seats, keeping friends apart).
- Guest phone view (S-05), offline (S-09), browser/E2E tests (no Playwright overnight).

## Implementation Approach

Pure modules first, densely tested: neighbour history and repeat report, hard-rule validation and snapshot restore mapping (Phase 1), then the solver with acceptance, randomized-property and performance tests that cross-check every result through the independent validator and repeat counter (Phase 2). Then one DB function for atomic replacement plus services and integration tests (Phase 3), thin organizer routes plus HTTP smoke (Phase 4), and the draw panel in the existing seating island plus docs (Phase 5). The browser fetches the board and history, runs the solver, and posts only the resulting seats; the server re-checks the hard rules against the current DB state (cheap) before writing.

## Critical Implementation Details

- **Tests never stop on the wall clock.** `drawSeating` takes `random`, `timeBudgetMs`, `maxIterations` and `now`; acceptance and property tests pass `timeBudgetMs: Infinity` and a fixed `maxIterations`, so a seed gives the same result on any machine. Only the performance test uses the real clock; the solver checks `now()` at least every 256 iterations so it cannot overshoot the budget noticeably.
- **History read must paginate.** `max_rows = 1000` truncates silently; `getNeighbourHistory` reads `seating_snapshot_seat` (and `seating_snapshot_table`) in ordered `.range()` pages until a short page.
- **Restore is not a draft.** A restore may legitimately leave people unseated or a newly formed group split; it goes straight to `replace_seating` with only its own mapping rules, never through `validateDraft`'s completeness/group checks.
- **`replace_seating` failures by code.** Map `error.code` `23505`/`23503`/`23514` and `error.message` `SEAT_OUT_OF_RANGE` to a `conflict` status (409 „Rozsadzenie zmieniło się w międzyczasie…”); anything else throws. The function runs in one transaction, so a failure leaves the working arrangement untouched.
- **Board `previous` gets its own query** (`order id desc, range(1, 1)`), keeping `latestSnapshotRow` one row for TV polling; update `isBoard`/`pick` in the hook and every board fixture/assertion for the new field.

## Phase 1: Neighbour history, repeat report, draft validation and restore mapping (pure)

### Overview

The rules the solver, server and UI share: which pairs are history, which current pairs repeat it, whether a proposed draft obeys the hard rules, and how a snapshot maps back onto today's venue.

### Changes Required:

#### 1. Neighbour history and repeats

**File**: `src/lib/seating/neighbours.ts` (+ `neighbours.test.ts`)

**Intent**: One definition of "pair of neighbours" for history, stats and solver cross-checks.

**Contract**:
- `type GuestPair = readonly [number, number]` (always `[smaller id, larger id]`); `pairKey(a, b): string`.
- `historyPairs(snapshots: readonly SeatingSnapshot[]): GuestPair[]` — union over snapshots, each table's pairs from its own `shape`/`seatCount` via `neighbours()`; seats with `guestId === null` skipped; sorted, deduplicated.
- `RepeatedPair { guestIds: GuestPair; names: [string, string]; tableId: number; tableName: string }`; `repeatedNeighbours(input: SeatingInput, history: readonly GuestPair[]): RepeatedPair[]` — neighbour pairs of seated PRESENT guests in the working arrangement (absent seated guests produce no pairs) that are in the history, excluding pairs within one current group; ordered by table (venue order) then names.
- `formatRepeatCount(n)` → „0 powtórzonych par sąsiadów” / „1 powtórzona para sąsiadów” / „2 powtórzone pary sąsiadów” / „5 powtórzonych par sąsiadów” (`pluralPl`); `describeRepeat(pair)` → „Ania i Kuba (Stolik 3)”.
- Tests: round 6 and rectangular 6/7 pairs incl. opposite and the odd seat; union of two snapshots dedupes; deleted guest skipped; a snapshot of a table that was later reshaped still uses the snapshot's shape; repeats exclude same-group pairs and absent seated guests; repeats ordered; plural forms.

#### 2. Draft validation and restore mapping

**File**: `src/lib/seating/draft.ts` (+ `draft.test.ts`)

**Intent**: The server's cheap re-check of the hard rules for a proposed draft, and the S-03 restore rules as a pure function.

**Contract**:
- `DraftSeat { guestId: number; tableId: number; seat: number }` (also exported as `DraftSeatDto` in `src/types.ts`).
- `DraftProblem` union: `{ kind: "unknown-guest"; guestId }`, `{ kind: "absent-guest"; name }`, `{ kind: "pinned-guest"; name }`, `{ kind: "duplicate-guest"; name }`, `{ kind: "missing-guest"; names: string[] }`, `{ kind: "unknown-table"; tableId }`, `{ kind: "seat-out-of-range"; tableName; seat }`, `{ kind: "seat-taken"; tableName; seat }` (twice in the draft or held by a pinned row), `{ kind: "group-split"; names: string[] }`.
- `validateDraft(input: SeatingInput, seats: readonly DraftSeat[]): DraftProblem[]` — the draft lists exactly the present non-pinned guests; seats exist, are unique and not held by pinned rows (absent pinned included); for every group with ≥ 2 present members the combined seats (draft + pinned rows) are at one table and `areConsecutiveSeats`. Empty array = valid.
- `describeDraftProblem(problem): string` (Polish, e.g. „Ania, Kuba i Ola — muszą siedzieć obok siebie przy jednym stoliku.”, „Bez miejsca w projekcie: Ewa.”); `DRAFT_STALE_MESSAGE` = „Rozsadzenie zmieniło się w międzyczasie — wylosuj jeszcze raz.”
- `restoreSeats(snapshot: SeatingSnapshot, input: SeatingInput): { seats: DraftSeat[]; unseated: { name: string; reason: "table-deleted" | "seat-removed" | "seat-pinned" | "not-in-snapshot" }[] }` — non-pinned present guests get their snapshot seat when the snapshot table still exists (`tableId` non-null and in the venue), the seat ≤ current `seatCount` and the seat is not held by a pinned row; rows with `guestId === null`, now-absent guests and currently pinned guests are skipped silently; `unseated` lists present non-pinned guests left without a seat with the reason (guests not in that snapshot → `not-in-snapshot`).
- `describeRestore(publishedAt, unseated): string` → „Przywrócono rozkład z 27.10, 19:42 — sprawdź i opublikuj.” plus „Bez miejsca: Ania (stolik usunięty), Kuba (miejsce zajmuje przypięta osoba).” when needed.
- Tests: valid draft → `[]`; each problem kind; a group with one pinned member validated with the pinned seat; absent pinned seat counts as taken; restore of a snapshot after a table delete, seat-count decrease, a pin on someone's old seat, a deleted guest, a now-absent guest, a new guest; Polish strings.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 2: Solver with acceptance, property and performance tests (pure)

### Overview

The draw itself: a feasible random placement under the hard rules, then a bounded local search minimising repeated pairs; with a deterministic, clock-free test harness.

### Changes Required:

#### 1. Solver

**File**: `src/lib/seating/draw.ts` (+ `draw.test.ts`)

**Intent**: Compute a draft for up to ~100 guests in well under NFR-007's 3 s, in the browser, from the board and the history.

**Contract**:
- `createRandom(seed: number): () => number` (mulberry32, no dependency); `randomSeed(): number` (`crypto.getRandomValues`).
- `DEFAULT_DRAW_BUDGET_MS = 1200`.
- `DrawOptions { random: () => number; timeBudgetMs?: number; maxIterations?: number; now?: () => number }`.
- `DrawProblem` union (see Draw rules): `{ kind: "too-many-guests"; present; seats }`, `{ kind: "group-too-large"; names }`, `{ kind: "pinned-group-split"; names }`, `{ kind: "pinned-group-no-room"; names }`, `{ kind: "groups-do-not-fit" }`; `describeDrawProblem(problem): string` (Polish, naming the cause and what to do, e.g. „Obecnych gości jest 41, a miejsc 40 — dodaj miejsca albo oznacz kogoś jako nieobecnego.”, „Grupa Ania, Kuba, Ola, Ewa i Jan (5 osób) nie zmieści się na kolejnych miejscach przy żadnym stoliku.”); `DRAW_INFEASIBLE_MESSAGE` = „Nie da się wylosować rozkładu.”
- `DrawResult = { status: "drawn"; seats: DraftSeat[]; repeats: number; iterations: number } | { status: "infeasible"; problems: DrawProblem[] }`.
- `drawSeating(input: SeatingInput, history: readonly GuestPair[], options: DrawOptions): DrawResult` — `seats` covers exactly the present non-pinned guests; `repeats` is the solver's own count of repeated pairs for the returned arrangement.
- Approach (implementer's freedom within it): global seat index with neighbour lists from `seats.ts`; seats of pinned rows fixed (absent pinned: blocked, no pairs); a guest×guest conflict matrix from history with same-group pairs cleared; candidate blocks per group size (round: n arcs, or the whole table when k = n; rectangular: runs per side), anchored groups limited to blocks containing their pinned seats; static feasibility checks (counts, per-group candidates, pinned-group joinability), then randomized backtracking placement of groups (largest first, random block order, node limit) → `groups-do-not-fit` when exhausted; singles shuffled into the remaining free seats; local search with moves {swap/move a single, relocate a group to a free-or-singles block with displaced singles taking the vacated seats, permute members within a group's block (pinned members fixed)}, incremental delta over the changed seats' edges, simulated-annealing acceptance with restarts from the best, stop at 0 / `maxIterations` / budget (clock checked every ≤ 256 iterations).

#### 2. Tests

**File**: `src/lib/seating/draw.test.ts` (+ a demo fixture builder in `src/lib/seating/fixtures.test-helpers.ts`)

**Intent**: Prove the hard rules always hold, the soft goal is met on the demo venue, infeasible inputs are named, and NFR-007 holds.

**Contract**:
- Harness: every `drawn` result is checked independently — `validateDraft(input, seats)` returns `[]`, and `repeatedNeighbours(applied input, history).length === result.repeats` (the applied input = pinned rows + draft seats).
- Demo fixture `demoEvening()`: 40 guests, 3 rooms, 7 tables — 4 × round 6, 2 × rectangular 6, 1 × rectangular 4 (40 seats); groups of 2, 2 and 4; 1 pinned guest (round table, seat 1); 1 absent guest → 39 present.
- Acceptance (seeds 1–8, `timeBudgetMs: Infinity`, fixed `maxIterations`): a manual initial arrangement published through `snapshotOf`; then draw → publish twice; after each draw `repeats === 0`, groups consecutive at one table, the pinned guest on his seat, the absent guest unseated, all 38 other present guests seated.
- Redraw: two seeds on the same input give different seat maps.
- Infeasible, each with its message and `status: "infeasible"`: 41 present for 40 seats; a group of 5 with no 5-run anywhere (only round 4 + rectangular 8); two pinned members of one group at different tables; a pinned group member whose side neighbours are pinned by other people; three pairs that each fit alone but not together (e.g. two rectangular 4 tables with 2+2 already pinned singles); plus a tight exact-fit feasible case (seats = present, groups filling whole sides/tables) that must be `drawn`.
- Pinned group member: the other members end up in one block with him across several seeds; an absent pinned guest keeps his row and the seat is not used.
- Property test: ~150 small random venues (1–4 tables, mixed shapes and sizes, 0–3 groups of 2–4, 0–2 pins, 0–2 absent) on fixed seeds, `maxIterations` small — every result is `infeasible` or passes the harness; never throws.
- Performance (real clock, default budget): 60 guests on 64 seats (e.g. 6 × round 8 + 2 × rectangular 8) with groups, history from ≥ 5 arrangements produced by successive draws → the 6th draw finishes in < 3000 ms; a dense-history case (e.g. 20 previous arrangements) that cannot reach 0 stops within `DEFAULT_DRAW_BUDGET_MS + 300 ms`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, incl. acceptance, property and performance tests: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 3: Atomic draft write, services and integration tests

### Overview

One DB function to replace the non-pinned working rows atomically; services for history, saving a draft and restoring a snapshot; the board learns about the previous snapshot.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261027030000_replace_seating.sql`

**Intent**: Write a draft or a restored snapshot in one transaction under the seating lock, keeping pinned rows.

**Contract**: header comment (draw model: draft = working arrangement, pinned rows kept, caller validates, restore rules live in `src/lib/seating/draft.ts`). `public.replace_seating(p_seats jsonb) returns void` (plpgsql, `set search_path = ''`): `pg_advisory_xact_lock(3003)`; lock the venue tables named in `p_seats` `for share` in id order; `delete from public.seat_assignment where not is_pinned`; insert `(guest_id, table_id, seat)` from `jsonb_to_recordset(p_seats) as x(guest_id bigint, table_id bigint, seat integer)` (new rows unpinned). Constraint violations (duplicate guest/seat, pinned collision, missing guest/table, seat out of range) abort the whole call. `revoke execute … from public, anon, authenticated`; `grant execute … to service_role`; comment on the function.

#### 2. Types

**Files**: `src/db/database.types.ts`, `src/types.ts`

**Contract**: `Functions.replace_seating: { Args: { p_seats: Json-compatible array }; Returns: undefined }` (a local `Json` type if none exists). `src/types.ts`: `SeatingBoardDto.previous: PublicationDto | null` (the snapshot before the latest); `NeighbourHistoryDto { snapshotCount: number; pairs: [number, number][] }`; `DraftSeatDto`.

#### 3. Service

**Files**: `src/lib/seating/service.ts`, `src/lib/seating/index.ts`

**Intent**: History, draft saving and restore taking a `DbClient`, status unions, Supabase errors thrown.

**Contract**:
- `getSeatingBoard` adds `previous` from its own query (second-newest snapshot row); `latestSnapshotRow` unchanged.
- `getNeighbourHistory(db): Promise<NeighbourHistoryDto>` — snapshot count, then paginated reads (`.range()`, page 1000, ordered) of `seating_snapshot_table` (`id, snapshot_id, shape, seat_count`) and `seating_snapshot_seat` (`snapshot_table_id, seat, guest_id`, non-null guest) → `historyPairs`.
- `saveDraft(db, seats): Promise<{ status: "saved" } | { status: "invalid"; problems: string[] } | { status: "conflict" }>` — reads guest list, venue and assignments, `validateDraft` → `invalid` with `describeDraftProblem` lines; else `replace_seating` with snake_case rows; mapped failures → `conflict`.
- `restoreSnapshot(db, snapshotId): Promise<{ status: "restored"; notice: string } | { status: "not-found" } | { status: "conflict" }>` — `getSnapshot` + current input → `restoreSeats` → `replace_seating` → `describeRestore`.
- `index.ts` re-exports `neighbours.ts`, `draft.ts`, `draw.ts` helpers and the new service functions.

#### 4. Integration tests

**Files**: `tests/integration/draw.test.ts` (+ helpers in `tests/integration/helpers.ts` if needed), existing seating tests updated for `previous`

**Intent**: Prove the write is atomic and keeps pins, history matches published geometry, restore follows the S-03 rules — without touching foreign data.

**Contract**: `describe.skipIf(!hasLocalDb)`; each test first checks that the event holds no guests other than its own tagged ones and calls `ctx.skip()` otherwise (a draft replaces the whole event's working rows). Cases: `getNeighbourHistory` after two publishes contains the round/rectangular (incl. opposite) pairs of the tagged tables and stays the same after a later shape change; a deleted guest's pairs disappear; `saveDraft` valid → non-pinned rows replaced, a pinned row (also of an absent guest) kept, an absent non-pinned guest's row removed, TV version unchanged, board `upToDate` false; `saveDraft` invalid (missing guest, split group, seat of a pinned guest) → `invalid` with Polish lines and rows unchanged; `replace_seating` called directly with a row colliding with a pinned seat → error with code 23505 and rows unchanged; `restoreSnapshot` of the latest after a draft → board `upToDate` true; of the previous after two publishes → its seats back, `previous` on the board; after deleting a table and lowering a seat count → those guests reported unseated; unknown id → `not-found`; an end-to-end `drawSeating(board, history)` → `saveDraft` → `saved` with 0 repeats on a small venue; anonymous REST `POST /rest/v1/rpc/replace_seating` not 2xx and nothing changed.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase migration up`
- Unit + integration tests pass (integration not skipped): `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 4: Organizer draw API and HTTP smoke

### Overview

Expose history, draft saving and restore as organizer-only routes; extend the smoke test.

### Changes Required:

#### 1. Routes

**Files**: `src/pages/api/o/[key]/seating/history.ts`, `src/pages/api/o/[key]/seating/draft.ts`, `src/pages/api/o/[key]/seating/restore.ts`

**Intent**: Thin adapters (`prerender = false`, `organizerApi(locals)`, strict zod bodies).

**Contract**:
- `GET seating/history` → 200 `NeighbourHistoryDto`.
- `POST seating/draft` `{ seats: { guestId, tableId, seat }[] }` (positive ints, ≤ 200 entries, strict) → `saved` 200 board; `invalid` 409 `{ error: DRAFT_STALE_MESSAGE, problems }`; `conflict` 409 `{ error: DRAFT_STALE_MESSAGE }`; bad body 400.
- `POST seating/restore` `{ snapshotId: positive int }` → `restored` 200 `{ ...board, notice }`; `not-found` 404 „Nie znaleziono opublikowanego rozkładu.”; `conflict` 409.

#### 2. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: HTTP-level proof on the production preview, appended after the TV page section (state: Ania Smoke and Ola Smoke present, Ania seated on "Okno Smoke" seat 4, Ola unseated, two snapshots, the last one with both).

**Contract**: `GET history` → 200 with `snapshotCount ≥ 2` and the pair [Ania, Ola] (they sat opposite/next in the last snapshot — assert by ids present in `pairs`); board has `previous`. `POST draft` missing Ola → 409 with `problems`; board unchanged. `POST draft` with both present guests on two non-neighbouring seats → 200, board `upToDate` false; TV `since=<current version>` still 204 (draft never reaches the TV). `POST restore` `{ snapshotId: <latest> }` → 200 with `notice`, `upToDate` true. `POST restore` unknown id → 404. Unknown body keys → 400. TV key on all three routes → 404 `Brak dostępu`; organizer key on `/api/tv/<org>/seating/history` style paths unaffected (not added). Nothing published by the smoke draft.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- HTTP smoke passes against the production preview on a DB without an event: `npm run preview` + `npm run smoke` (server stopped afterwards with `npx astro preview stop`; smoke data removed with `delete from public.event`)

---

## Phase 5: Draw panel on the seating page, shell card and docs

### Overview

The organizer-facing flow: draw, review stats, redraw, fix, publish, discard or go back.

### Changes Required:

#### 1. Hook

**File**: `src/components/hooks/useSeatingBoard.ts`

**Intent**: Keep the history next to the board and add draw/restore actions.

**Contract**: `useSeatingBoard(apiBase, initialBoard, initialHistory)` adds `history`, `origin: "draw" | null` (set by a successful draw, cleared by every other mutation), `draw()` and `restore(snapshotId)`. `draw()`: pending on; fetch `GET seating` and `GET seating/history` in parallel (fresh inputs; failures → network failure); yield one frame; `drawSeating(board, history.pairs, { random: createRandom(randomSeed()) })`; infeasible → `failure = { message: DRAW_INFEASIBLE_MESSAGE, details: problems.map(describeDrawProblem) }`, board/history replaced with the fresh ones, nothing posted; drawn → `POST seating/draft` → board; notice „Wylosowano projekt — <formatRepeatCount>. Przejrzyj, popraw i opublikuj.”. `restore(id)`: `POST seating/restore` → board, notice from the answer. After a 201 publish, refetch history. `isBoard`/`pick` include `previous`.

#### 2. Draw panel and island wiring

**Files**: `src/components/seating/DrawPanel.tsx`, `src/components/seating/SeatingEditor.tsx`, `src/components/seating/PublishBar.tsx` (if a hint changes)

**Intent**: One panel under the publish bar.

**Contract**: props from the editor: board-derived `repeats = repeatedNeighbours(board, history.pairs)`, `history.snapshotCount`, `published`, `previous`, `upToDate`, `origin`, `pending`, handlers. Shows: heading „Losowanie”; short rule line („Grupy razem na kolejnych miejscach, przypięci zostają, nieobecni bez miejsca, jak najmniej tych samych sąsiadów.”); „Wylosuj projekt” / „Losuj ponownie” (after a draw) with „Losuję…” while pending; `formatRepeatCount` + list of `describeRepeat` lines (or „Nikt nie siedzi obok tych samych osób co wcześniej.” when 0 and history exists; „Brak historii — to będzie pierwszy opublikowany rozkład.” when no snapshot); „Historia: K opublikowanych rozkładów”; „Odrzuć zmiany — wróć do tego, co jest na TV” (published && !upToDate) and „Wróć do poprzedniego rozkładu (z <formatPublishedAt>)” (previous ≠ null). Draw/restore call `window.confirm` („Losowanie zastąpi nieopublikowane zmiany (przypięci zostają). Kontynuować?” / „Przywrócenie zastąpi nieopublikowane zmiany. Kontynuować?”) only when `!upToDate && origin !== "draw"`. Buttons ≥ 40 px, wrap on 360 px, `cn()` for conditional classes, `aria-live` for the stats line. Existing warnings and failure/notice regions reused.

#### 3. Pages

**Files**: `src/pages/o/[key]/rozsadzenie.astro`, `src/pages/o/[key].astro`

**Contract**: the seating page passes `initialHistory = await getNeighbourHistory(db)` and its intro mentions drawing („Wylosuj projekt, przejrzyj go i popraw ręcznie — TV pokaże go dopiero po publikacji.”). Shell: "Losowanie i cofnięcie" removed from `upcomingSections`; the "Rozsadzenie" card description becomes „Losowanie bez powtórek sąsiadów, ręczne poprawki, publikacja na TV i powrót do poprzedniego.”

#### 4. Smoke and docs

**Files**: `scripts/smoke.mjs`, `CLAUDE.md`

**Contract**: smoke: the seating page contains „Wylosuj projekt” and „Losowanie”; the shell no longer lists „Losowanie i cofnięcie” as „Wkrótce”. CLAUDE.md "Data access → Seating (S-04)": draw model (browser solver, inputs, hard/soft rules, contiguity and pinned-group definitions, absent pinned), `replace_seating`, history (union, pagination), restore rules, routes, `previous` on the board, what S-05/S-09 can rely on (the draft never reaches TV/phones; publish unchanged).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Tests pass: `npm test`
- Build passes: `npm run build`
- HTTP smoke passes against the production preview on a DB without an event (server stopped afterwards; smoke data removed)

#### Manual Verification:

- On a laptop with demo data (40 guests, 7 tables, groups 2/2/4, 1 pinned, 1 absent) open `/o/<key>/rozsadzenie`: seat everyone manually and publish; „Wylosuj projekt” → a draft appears within ~2 s with „0 powtórzonych par sąsiadów”, groups sit together, the pinned person stays, the absent one has no seat, the TV still shows the old arrangement; „Losuj ponownie” gives a different draft; swap two people manually and see the repeat stats update; publish → the TV changes within 5 s; draw + publish again → still 0 repeats; „Wróć do poprzedniego rozkładu” → the previous arrangement is back (unpublished), publish it; make the venue infeasible (pin two members of a pair at different tables) → the draw explains why and nothing changes; on a phone (~360 px) the panel is usable without horizontal scrolling

**Implementation Note**: Unattended run — after each phase's automated checks pass, commit and continue; manual rows stay pending for the morning (`overnight-log.md` → „Do sprawdzenia rano”).

---

## Testing Strategy

### Unit Tests:

- `neighbours.ts`: pair geometry per shape, union/dedupe, deleted guests, snapshot geometry vs live venue, same-group and absent exclusion, Polish plurals.
- `draft.ts`: every `DraftProblem` kind, pinned-group validation, absent pinned seat, restore mapping per rule, Polish lines.
- `draw.ts`: acceptance on the demo evening (several seeds, manual → 2 draws, 0 repeats), redraw differs, every infeasible kind + exact-fit feasible, pinned group member, absent pinned, property test over ~150 random small venues, performance (60 guests, ≥ 5 snapshots, < 3 s; dense history stops at the budget). Every result cross-checked by `validateDraft` and `repeatedNeighbours`.

### Integration Tests:

- `replace_seating` atomicity and pin preservation, anonymous denial; history pagination-independent correctness; `saveDraft` valid/invalid; `restoreSnapshot` latest/previous/deleted table/lower seat count/unknown; board `previous`; end-to-end draw → save.

### Manual Testing Steps:

1. With demo data publish a manual seating, then draw: 0 repeats, groups together, pin kept, absent unseated; TV unchanged until publish.
2. Redraw → different draft; manual swap → stats update.
3. Publish, draw, publish → still 0 repeats; „Wróć do poprzedniego rozkładu” → previous back; publish.
4. Make it infeasible → Polish cause, nothing changes.

## Performance Considerations

The search runs in the organizer's browser: O(1) incremental delta per move (≤ ~10 changed seats × ≤ 3 neighbours), so ~10⁶ moves/s on a laptop; typical demo draws reach 0 in milliseconds. The budget (1.2 s) caps the worst case (unreachable 0) on any device; with the two fetches and the POST the draft is ready well within NFR-007's 3 s. Server work stays O(n): `validateDraft` over ≤ 100 rows and one RPC — within Cloudflare's per-request CPU. `getNeighbourHistory` reads all snapshot seats (≈ 40 rows × publishes, paginated) only on page load, after a publish and per draw — never on TV polling.

## Migration Notes

Fifth migration (function only, no tables). Locally `npx supabase migration up`; CI's `supabase start` applies it. No data changes.

## Open Risks & Assumptions

- Every publish that changes something joins the history, including prep tweaks and the rehearsal; a busy prep phase can make 0 repeats impossible on the evening. The solver then minimises and the stats name the pairs; a history reset is out of scope (could be a later change).
- With nearly full venues (e.g. 39 present on 40 seats) and big groups, 0 repeats after many draws is not guaranteed; the PRD target (1–2 reshuffles) is covered by the acceptance test.
- The draw blocks the organizer's main thread for up to the budget in the worst case (~1.2 s); acceptable for a rare action.

## References

- PRD US-02, FR-009, FR-010, NFR-007, Business Logic: `context/foundation/prd.md`
- Roadmap S-04: `context/foundation/roadmap.md`
- Run rules and decisions: `context/foundation/overnight-brief.md`, `context/foundation/overnight-log.md` (S-04 lines)
- S-03 plan (working vs published model, restore rules): `context/archive/2026-10-27-manual-seating-on-tv/plan.md`
- Seat convention: `src/lib/venue/seats.ts`; seating service: `src/lib/seating/service.ts`; RPC mapping pattern: `src/lib/seating/service.ts:seatGuest`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Neighbour history, repeat report, draft validation and restore mapping (pure)

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — 6a9edec
- [x] 1.2 Lint passes: `npm run lint` — 6a9edec
- [x] 1.3 Type check passes: `npx astro check` — 6a9edec

### Phase 2: Solver with acceptance, property and performance tests (pure)

#### Automated

- [x] 2.1 Unit tests pass, incl. acceptance, property and performance tests: `npm test` — a6d2e03
- [x] 2.2 Lint passes: `npm run lint` — a6d2e03
- [x] 2.3 Type check passes: `npx astro check` — a6d2e03

### Phase 3: Atomic draft write, services and integration tests

#### Automated

- [x] 3.1 Migration applies cleanly: `npx supabase migration up` — ddc15ab
- [x] 3.2 Unit + integration tests pass (integration not skipped): `npm test` — ddc15ab
- [x] 3.3 Lint passes: `npm run lint` — ddc15ab
- [x] 3.4 Type check passes: `npx astro check` — ddc15ab

### Phase 4: Organizer draw API and HTTP smoke

#### Automated

- [x] 4.1 Unit tests pass: `npm test` — 453e841
- [x] 4.2 Lint passes: `npm run lint` — 453e841
- [x] 4.3 Type check passes: `npx astro check` — 453e841
- [x] 4.4 Build passes: `npm run build` — 453e841
- [x] 4.5 HTTP smoke passes against the production preview on a DB without an event — 453e841

### Phase 5: Draw panel on the seating page, shell card and docs

#### Automated

- [x] 5.1 Lint passes: `npm run lint` — 0ca66e7
- [x] 5.2 Type check passes: `npx astro check` — 0ca66e7
- [x] 5.3 Tests pass: `npm test` — 0ca66e7
- [x] 5.4 Build passes: `npm run build` — 0ca66e7
- [x] 5.5 HTTP smoke passes against the production preview on a DB without an event — 0ca66e7

#### Manual

- [ ] 5.6 Laptop + phone check of the draw flow on `/o/<key>/rozsadzenie` (draw, redraw, stats, manual fix, publish, second draw, back to previous, infeasible message, TV unchanged until publish)
