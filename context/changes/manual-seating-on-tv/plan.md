# Manual seating, publishing and the live TV plan Implementation Plan

## Overview

Roadmap S-03 (`manual-seating-on-tv`, PRD US-01, FR-004, FR-007, FR-008, NFR-003, NFR-006). The organizer gets a "Rozsadzenie" page where they seat guests on concrete seats (table + seat number), swap two guests, pin a guest (also themself) to a seat and unpin, see group/absence warnings, and publish the arrangement. Publishing freezes an immutable snapshot; the read-only TV view `/tv/<key>` shows the venue plan with guest display names next to each table according to the latest published snapshot and refreshes itself within ≤ 5 s by polling a lightweight version endpoint. The working-arrangement / published-snapshot split is the foundation S-04 (draws, history, undo) and S-05 (guest phones) build on.

## Current State Analysis

- S-01 (guests) and S-02 (venue) are done: `public.guest` (`display_name`, `is_absent`, `group_id`), `public.guest_group`, `public.venue_plan` (singleton base64 image), `public.venue_room`, `public.venue_table` (`seat_count` 2–20, `shape`, `pos_x`/`pos_y` fractions). Services `getGuestList` (`src/lib/guests/service.ts`) and `getVenue` / `getPlanImage` (`src/lib/venue/service.ts`) take a `DbClient` and return DTOs; mutations return status unions.
- Seat convention (`src/lib/venue/seats.ts`): `seatPlace`, `sideALength`, `sideNeighbours`, `oppositeSeat`, `neighbours`. Nothing yet answers "do these seats form one consecutive block".
- S-02 contract for S-03 (`supabase/migrations/20261027011055_create_venue_plan_rooms_tables.sql` header, CLAUDE.md "Deletion/edit semantics"): deleting a table/room removes its seat assignments and pins (FK cascade); lowering `seat_count` removes those above the new count (S-03 enforces and warns first); shape change keeps seat numbers; renames, room moves, pin moves and plan replacement do not touch seating.
- TV: `src/pages/tv/[key].astro` is a shell ("Rozsadzenie pojawi się tutaj po publikacji."); `GET /api/tv/<key>/plan/image` serves the plan. `TvAccess` carries no keys (`src/lib/access/resolve.ts`).
- Organizer shell `src/pages/o/[key].astro` lists "Rozsadzenie" under `upcomingSections` ("Wkrótce").
- Patterns to mirror: atomic multi-row writes in plpgsql functions with distinct raised messages mapped to statuses (`create_guest_group`, `src/lib/guests/service.ts:createGroup`); thin API routes with `organizerApi(locals)` + `astro/zod` + whole-DTO answers; SSR page + one island + a hook that replaces state with every answer (`src/components/hooks/useVenue.ts`); HTTP checks in `scripts/smoke.mjs` on the production preview; integration tests that touch only rows they created (`tests/integration/helpers.ts`).
- The middleware (`src/middleware.ts:15-21`) rebuilds every guarded response with `new Response(response.body, { status, headers })` and forces `Cache-Control: no-store` — a 204 passes through (null body).
- The local DB currently has no event; `npm run smoke` needs that state and ends by creating one (removed afterwards with `delete from public.event`).

## Desired End State

- `/o/<organizerKey>/rozsadzenie` (Polish, laptop-first, usable on a phone): publication status ("TV pokazuje rozkład opublikowany 27.10, 19:42" / "Są nieopublikowane zmiany" / "Jeszcze nic nie opublikowano") with "Opublikuj na TV"; warnings (groups split, absent guests with a seat, more present guests than seats); table cards grouped by room with every seat (number, occupant or "wolne", pin marker, absent marker; rectangular tables as two sides); a "Bez miejsca" list; select a guest, then click a seat to seat/move/swap; a selected-guest bar with "Przypnij"/"Odepnij", "Zwolnij miejsce", "Anuluj".
- The organizer shell card "Rozsadzenie" links there with a summary (e.g. `32 z 38 obecnych ma miejsce · opublikowano 27.10, 19:42`).
- `/o/<key>/sale`: deleting a table or room, or lowering a table's seat count, asks for confirmation naming the guests who lose their seat.
- `/tv/<tvKey>`: full-screen dark view; the plan image contain-fitted to the viewport (scaled up or down, natural proportions); for every table of the latest snapshot a card anchored at its pin with the table name and the seated guests' display names in seat order (rectangular: two columns = two sides), names ≥ 2.5 vh (3 vh), cards kept inside the screen and pushed apart, no scrolling. Polls every 2.5 s; shows a new publish (or a replaced plan image) within ≤ 5 s without any action; keeps the same `<img>` element and changes its URL only when the plan version changes. Before the first publish: the event name and "Rozsadzenie pojawi się tutaj po publikacji."
- APIs: organizer `GET /api/o/<key>/seating`, `PUT|PATCH|DELETE /api/o/<key>/seating/guests/<guestId>`, `POST /api/o/<key>/seating/publish` (all answer with the whole `SeatingBoardDto`); TV `GET /api/tv/<tvKey>/seating?since=<version>` → 204 when unchanged, else 200 `TvSeatingDto`. Cross-role keys → the existing 404 `{"error":"Brak dostępu"}`.
- DB guarantees: a guest has at most one seat, a seat at most one guest, seats within `1..seat_count`; lowering `seat_count` / deleting a table, room or guest removes the affected working rows (pins included); snapshots are immutable copies that survive later deletions; browser roles see nothing and cannot call the functions.

Verify: `npm test` (unit + integration on the local DB), `npm run lint`, `npx astro check`, `npm run build` green; `npm run smoke` passes against `npm run preview` on a DB without an event (server stopped and `delete from public.event` afterwards).

### Working arrangement vs published snapshots (contract for S-04 and S-05)

- **Working arrangement** = rows of `public.seat_assignment(guest_id, table_id, seat, is_pinned)`; the only thing the organizer edits. Every write goes through `seat_guest()` (seat/move/swap/replace), `unseatGuest`, `setPinned` or the DB triggers. S-04's draw will replace the non-pinned rows of this table (keeping pinned rows) to produce the draft; the draft *is* the working arrangement.
- **Pins** = `is_pinned = true` on a working row. A pinned guest is locked for manual operations (cannot be moved, swapped, displaced or unseated until unpinned) and S-04's draw must keep them in place. Deleting their table/room or lowering the seat count below their seat removes the row, pin included. A pinned absent guest is S-04's call.
- **Published snapshot** = one `seating_snapshot` row (its `id` is the published *version*: monotonic, never reused) + `seating_snapshot_table` (copy of every venue table at publish time: `table_id` (SET NULL on delete), name, room name, shape, seat count, pin) + `seating_snapshot_seat` (snapshot table, seat, `guest_id` (SET NULL on delete), display name at publish time). Created only by `publish_seating()`, never updated. **Absent guests are left out** of the snapshot. The latest snapshot (highest id) is what the TV and (S-05) guest phones show; the list of snapshots is the history S-04 uses for neighbour pairs (compute pairs from the snapshot's own shape/seat count, so later structure edits do not rewrite history).
- **Publishing with no changes is a no-op** (no new snapshot), so the history has no accidental duplicates. "Up to date" = the snapshot that would be written now equals the latest one (tables, rooms, pins, seat counts, shapes, seated present guests and their names).
- **Restoring a snapshot into the working arrangement** (S-04 undo / discarding a draft): skip rows whose `guest_id` or `table_id` is now null, skip seats above the table's current count, keep the current pinned rows.
- **Polling contract**: version token = `"<latest snapshot id or 0>.<plan version or 0>"` (opaque string, compared for equality). `GET …/seating?since=<token>` → `204` (no body) when equal, otherwise `200` with the full state including the new `version`. S-05 reuses the pattern for `/api/g/<key>/…` with its own DTO.

### Key Discoveries:

- `src/lib/access/paths.ts` already matches `/o/<key>/rozsadzenie`, `/api/o/<key>/seating/guests/<id>` and `/api/tv/<key>/seating`; no middleware change.
- `src/pages/api/o/[key]/plan.ts` + `plan/image.ts` shows a file and a same-named folder coexisting — `seating.ts` + `seating/guests/[id].ts` + `seating/publish.ts` work the same way.
- supabase-js has no transactions: swap and publish must be single plpgsql functions (pattern `create_guest_group`, `set search_path = ''`, EXECUTE revoked from `public, anon, authenticated`, granted to `service_role`).
- `planImagePath(apiBase, version)` (`src/lib/venue/pin.ts`) builds versioned image URLs for both roles; `fractionStyle` positions pins.
- Island props are serialized into the SSR HTML, so the TV page body must be checked for privacy as well as the TV API.
- `pluralPl` (`src/lib/guests/summary.ts`) for Polish counts; `compareTableNames` for table order.

## What We're NOT Doing

- Draws, draft review, re-draw, neighbour-repeat avoidance, undo to a previous snapshot, the hard group rule (S-04). S-03 only warns about split groups.
- Guest links, the guest phone view, the guest-access switch (S-05); no `/g/` changes.
- An "organizer is me" flag — the organizer seats/pins themself like any guest.
- Drag and drop; seating from the plan image on the organizer page (table cards instead); bulk "clear all seats".
- Showing absent guests on the TV; live TV updates for venue edits made after a publish (only a new publish, or a replaced plan image, changes the TV).
- Seat-loss warnings on the guest page (deleting or renaming a guest there); the seating page shows the result.
- Offline cache (S-09), browser/E2E tests (no Playwright overnight), Supabase Realtime.

## Implementation Approach

Schema first: the working table with its invariants and triggers, the three snapshot tables, and two plpgsql functions (`seat_guest`, `publish_seating`) that serialize seating writes with a transaction-scoped advisory lock. Pure modules own the rules (consecutive seats, group/absence warnings, summaries, the publishable-state comparison, TV DTO mapping and version token, card columns, the venue-change pruning helper and the TV label layout), all unit-tested. A DB service (`src/lib/seating/service.ts`) returns status unions and the whole board; thin routes map statuses to HTTP + Polish messages. The organizer page is SSR + one island; the TV page is SSR + one island that polls.

## Critical Implementation Details

- **One lock for all seating writes.** `seat_guest()` and `publish_seating()` start with `pg_advisory_xact_lock(<one constant>)`, so a publish never copies half of a swap and two swaps never interleave. The pinned-check, delete and re-insert of a swap happen inside that one function (the `(table_id, seat)` unique index forbids doing it as two client calls).
- **Publish in one statement chain.** Insert the snapshot row, then a data-modifying CTE that inserts the snapshot tables (`returning id, table_id`) and joins it to `seat_assignment` + `guest` (present guests only) to insert the snapshot seats — no table-id mapping in the client.
- **TV image sizing.** `max-w/max-h` alone never scales a small screenshot up. Compute the contain-fit box from `naturalWidth`/`naturalHeight` and the viewport, set the `<img>` width/height explicitly (no object-fit, padding or border — the pin contract), and recompute on resize and data change. The SSR'd `<img>` may finish loading before hydration: in an effect also check `img.complete && img.naturalWidth > 0`, not only `onLoad`.
- **Polling must not stall.** `setTimeout` chain (next poll scheduled after the previous finishes), each request aborted after ~4 s (`AbortController`), failures keep the last state; check `status === 204` before reading JSON. Keep the `<img>` mounted across polls; only its `src` changes when `planVersion` changes.
- **Venue-page pruning mirrors the trigger.** The same pure helper decides which occupants a table delete, room delete or seat-count decrease removes — used both for the confirm text and to update the page's local occupancy after success — and is unit-tested against the same cases the DB integration tests use.

## Phase 1: Schema, types and pure seating rules

### Overview

The working arrangement and snapshot schema with DB-enforced invariants, triggers and functions; DB types and DTOs; the pure seating rules; proof that browser roles see nothing and that the DB invariants hold.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261027014210_create_seating.sql`

**Intent**: Durable working arrangement with pins and immutable published snapshots for the singleton event, invisible to browser roles.

**Contract**:
- Header comment: the working/published model, pins as locks, absent guests excluded at publish, no-op publish lives in the app, snapshot survival (SET NULL + copied names), deletion semantics, pointer to `src/lib/seating/`.
- `public.seat_assignment(guest_id bigint primary key references public.guest(id) on delete cascade, event_id smallint not null default 1 references public.event(id) on delete cascade, table_id bigint not null references public.venue_table(id) on delete cascade, seat smallint not null check (seat >= 1), is_pinned boolean not null default false, updated_at timestamptz not null default now())`; `unique (table_id, seat)`.
- Trigger `seat_assignment_seat_in_range` (`before insert or update`): raises `SEAT_OUT_OF_RANGE` unless `new.seat <= seat_count` of `new.table_id` (read with `for share`).
- Trigger on `venue_table` (`after update of seat_count`, when it decreased): `delete from public.seat_assignment where table_id = new.id and seat > new.seat_count` (pinned rows too).
- `public.seating_snapshot(id bigint generated always as identity primary key, event_id smallint not null default 1 references public.event(id) on delete cascade, published_at timestamptz not null default now())`.
- `public.seating_snapshot_table(id bigint identity primary key, snapshot_id bigint not null references public.seating_snapshot(id) on delete cascade, table_id bigint null references public.venue_table(id) on delete set null, room_name text not null, name text not null, seat_count smallint not null, shape text not null, pos_x double precision not null, pos_y double precision not null)`; index on `snapshot_id`; checks mirroring `venue_table` (seat count 2–20, shape, fractions).
- `public.seating_snapshot_seat(snapshot_id bigint not null references public.seating_snapshot(id) on delete cascade, snapshot_table_id bigint not null references public.seating_snapshot_table(id) on delete cascade, seat smallint not null check (seat >= 1), guest_id bigint null references public.guest(id) on delete set null, guest_name text not null, primary key (snapshot_table_id, seat))`; `unique (snapshot_id, guest_id)`; index on `guest_id`.
- `public.seat_guest(p_guest_id bigint, p_table_id bigint, p_seat integer) returns void` (plpgsql, `set search_path = ''`): advisory lock; raise `GUEST_NOT_FOUND`, `TABLE_NOT_FOUND`, `SEAT_OUT_OF_RANGE`; same seat → no-op; moving guest pinned → `GUEST_PINNED`; occupant pinned → `SEAT_PINNED`; otherwise delete both rows and re-insert: guest at the target; occupant (if any) at the guest's old seat when the guest had one, else the occupant stays unseated. New rows `is_pinned = false`.
- `public.publish_seating() returns bigint` (plpgsql, `set search_path = ''`): advisory lock; insert snapshot; copy every `venue_table` (+ its room name) and every `seat_assignment` of a guest with `is_absent = false` (+ `display_name`); return the snapshot id.
- RLS on all four tables, no policies, `revoke all … from anon, authenticated`; `revoke execute` on both functions and the trigger functions `from public, anon, authenticated`; `grant execute` on `seat_guest` and `publish_seating` to `service_role`; comments on tables and functions.

#### 2. DB and shared types

**Files**: `src/db/database.types.ts`, `src/types.ts`

**Intent**: Typed queries/RPCs; DTOs for service, API, pages and islands.

**Contract**: `Tables.seat_assignment`, `seating_snapshot`, `seating_snapshot_table`, `seating_snapshot_seat` (`Row`/`Insert`/`Update`/`Relationships`); `Functions.seat_guest: { Args: { p_guest_id: number; p_table_id: number; p_seat: number }; Returns: undefined }`, `Functions.publish_seating: { Args: Record<string, never>; Returns: number }`. In `src/types.ts`: `SeatAssignmentDto { guestId; tableId; seat; pinned }`; `PublicationDto { snapshotId: number; publishedAt: string }`; `SeatingBoardDto { guestList: GuestListDto; venue: VenueDto; assignments: SeatAssignmentDto[]; published: PublicationDto | null; upToDate: boolean }`; `SnapshotTable { snapshotTableId; tableId: number | null; roomName; name; seatCount; shape: TableShape; x; y }`, `SnapshotSeat { snapshotTableId; seat; guestId: number | null; guestName }`, `SeatingSnapshot { id; publishedAt; tables: SnapshotTable[]; seats: SnapshotSeat[] }` (server-side, for S-04/S-05); `TvSeatDto { seat; name }`, `TvTableDto { name; shape; seatCount; x; y; seats: TvSeatDto[] }`, `TvSeatingDto { version: string; planVersion: number | null; publishedAt: string | null; tables: TvTableDto[] }` (no ids, no pins, no absence, no keys); `SeatOccupantDto { tableId; seat; guestName }` (venue page).

#### 3. Consecutive seats (pure)

**File**: `src/lib/venue/seats.ts` (+ `seats.test.ts`, re-export in `index.ts`)

**Intent**: One definition of "sitting next to each other" for the S-03 warning and the S-04 group rule.

**Contract**: `areConsecutiveSeats(shape, seatCount, seats: readonly number[]): boolean` — true when the distinct seats form one connected block under `sideNeighbours` (round wraps; rectangular never crosses sides; opposite does not count); 0 or 1 seat → true; out-of-range seat → `RangeError`. Tests: round 8 {8,1,2} true, {1,3} false; rectangular 8 {4,5} false (different sides), {1,5} false (opposite), {5,6,7} true; n = 2 round {1,2} true, rectangular {1,2} false.

#### 4. Seating rules (pure)

**File**: `src/lib/seating/rules.ts` (+ `rules.test.ts`)

**Intent**: Polish messages, labels, warnings and summaries shared by service, API and UI.

**Contract**:
- Messages: `GUEST_NOT_FOUND_MESSAGE` („Nie znaleziono gościa.”), `TABLE_NOT_FOUND_MESSAGE` (reuse venue), `seatOutOfRangeMessage(tableName?, seat)` („Ten stolik nie ma miejsca nr 9.”), `guestPinnedMessage(name)` („„Ola” ma przypięte miejsce — najpierw je odepnij.”), `seatPinnedMessage(name)` („To miejsce zajmuje przypięta osoba „Ola” — najpierw ją odepnij.”), `NOT_SEATED_MESSAGE` („Najpierw posadź tę osobę, potem przypnij miejsce.”), `PUBLISH_UNCHANGED_MESSAGE`.
- `seatLabel(tableName, seat)` → „Stolik 3, miejsce 2”.
- `seatingWarnings(board-like input: guestList, venue, assignments)` → `{ groups: { groupId; memberNames; problem: "different-tables" | "not-adjacent" | "partly-seated" }[]; absentSeated: string[] (names); missingSeats: number (present guests − seats, if > 0) }` — only present members count for groups; a group with < 2 present members or no seated present member gives no warning; adjacency via `areConsecutiveSeats`.
- `describeWarnings(warnings)` → Polish lines (e.g. „Ania, Kuba — siedzą przy różnych stolikach.”, „Kasia jest nieobecna — ma miejsce, ale nie pojawi się na TV.”, „Brakuje 3 miejsc dla obecnych gości.”).
- `summarizeSeating(board)` → `{ present; seatedPresent; seats; pinned }`; `formatSeatingSummary(summary, published, upToDate)` → e.g. „32 z 38 obecnych ma miejsce · opublikowano 27.10, 19:42” / „… · nieopublikowane zmiany” / „… · jeszcze nie opublikowano”; `formatPublishedAt(iso)` with `Intl.DateTimeFormat("pl", { timeZone: "Europe/Warsaw", day, month, hour, minute })`.

#### 5. Published state, TV mapping, version token and venue pruning (pure)

**File**: `src/lib/seating/published.ts` (+ `published.test.ts`)

**Intent**: Decide "up to date", map a snapshot to the TV DTO, build the polling token, and compute which occupants a venue change removes.

**Contract**:
- `publishableFingerprint(guestList, venue, assignments): string` and `snapshotFingerprint(snapshot): string` — canonical, order-independent JSON of tables (`tableId`, name, room name, seat count, shape, x, y) and seats of present guests (`tableId`, seat, `guestId`, name); a snapshot table with `tableId === null` never matches. `isUpToDate(snapshot | null, …)` → false when no snapshot.
- `seatingVersion(snapshotId: number | null, planVersion: number | null): string` → `"12.1761529200000"` / `"0.0"`.
- `toTvSeating(snapshot | null, planVersion | null): TvSeatingDto` — tables ordered by `compareTableNames`, seats by seat number, only names (no ids).
- `tableCardColumns(table: TvTableDto): TvSeatDto[][]` — rectangular: [side A seats, side B seats] by position (an empty side → omitted); round: one column, two columns (seat order split in half) when more than 8 names.
- `occupantsRemovedBy(occupancy: SeatOccupantDto[], change: { kind: "delete-table"; tableId } | { kind: "delete-room"; tableIds } | { kind: "seat-count"; tableId; seatCount }): SeatOccupantDto[]` and `describeRemovedOccupants(removed): string` („Miejsce stracą: Ania (miejsce 7), Kuba (miejsce 8).”).

#### 6. Schema and invariant tests

**File**: `tests/integration/seating-schema.test.ts` (+ helpers in `tests/integration/helpers.ts`)

**Intent**: Prove browser roles see nothing and the DB invariants hold on the real schema.

**Contract**: `describe.skipIf(!hasLocalDb)`; creates its own tagged room, two tables and guests; anonymous `GET /rest/v1/{seat_assignment,seating_snapshot,seating_snapshot_table,seating_snapshot_seat}` denied or `[]`; anonymous `POST /rest/v1/rpc/seat_guest` and `/rpc/publish_seating` not 2xx (and no snapshot created). Direct service-role inserts: a second row for the same guest → `23505`; a second guest on the same seat → `23505`; seat 0 → check violation; seat > `seat_count` → `SEAT_OUT_OF_RANGE`. Lowering `seat_count` from 8 to 4 removes rows on seats 5–8 (a pinned one included) and keeps 1–4; raising keeps everything; deleting a table removes its rows (pinned included); deleting a guest removes their row. Helpers: `deleteTestSnapshots(db, ids)`, `seatDirect(db, …)`. Cleans up only its rows.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase migration up`
- Unit + integration tests pass (integration not skipped): `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 2: Seating services

### Overview

DB-backed operations for the working arrangement, publishing and the published reads, integration-tested on the local DB.

### Changes Required:

#### 1. Service

**Files**: `src/lib/seating/service.ts`, `src/lib/seating/index.ts`

**Intent**: All seating reads and writes, taking a `DbClient`, no `astro:*`; Supabase errors throw; expected outcomes as status unions.

**Contract**:
- `getAssignments(db): Promise<SeatAssignmentDto[]>`.
- `seatGuest(db, guestId, tableId, seat)` → `{ status: "seated" }` | `"guest-not-found"` | `"table-not-found"` | `{ status: "seat-out-of-range"; seatCount: number | null }` | `{ status: "guest-pinned" }` | `{ status: "seat-pinned"; occupantId: number }` — calls `seat_guest`, maps its messages (pattern `createGroup`).
- `unseatGuest(db, guestId)` → `unseated` (also when they had no seat) | `guest-not-found` | `pinned`.
- `setPinned(db, guestId, pinned)` → `updated` | `guest-not-found` | `not-seated`.
- `getLatestSnapshot(db): Promise<SeatingSnapshot | null>` and `getSnapshot(db, id)` (for S-04/S-05).
- `publishSeating(db)` → `{ status: "published"; snapshotId }` | `{ status: "unchanged"; snapshotId }` — reads the board's fingerprint vs the latest snapshot; calls `publish_seating` only when they differ.
- `getSeatingBoard(db): Promise<SeatingBoardDto>` — guest list, venue, assignments and latest snapshot in parallel; `published` + `upToDate`.
- `getSeatingVersion(db): Promise<string>` — latest snapshot id + plan `updated_at` (two tiny queries in parallel, no image, no seats).
- `getTvSeating(db): Promise<TvSeatingDto>` — latest snapshot + plan version through `toTvSeating`.
- `getSeatOccupancy(db): Promise<SeatOccupantDto[]>` — working rows with guest names (venue page).
- `index.ts` re-exports rules, published helpers and service.

#### 2. Integration tests

**File**: `tests/integration/seating.test.ts`

**Intent**: Prove FR-004/FR-007 and the publish/snapshot semantics without touching pre-existing data.

**Contract**: tagged guests/room/tables created per test, removed in `afterEach` together with snapshot ids the test created (publishes copy the whole event, so assertions look only at tagged rows). Cases: seat on an empty seat; move to another table; swap two seated guests (both rows correct); unseated guest onto an occupied seat → occupant unseated; same seat → no change; seat 9 at an 8-seat table → `seat-out-of-range`; unknown guest/table → not found; pin → pinned guest cannot move (`guest-pinned`), cannot be displaced (`seat-pinned`), cannot be unseated (`pinned`); unpin → can move; pin an unseated guest → `not-seated`; publish → snapshot holds the tagged tables (name, room, shape, seat count, pin) and seated present guests with names; an absent seated guest is not in the snapshot; publish again without changes → `unchanged`, same id; after a move → `published` with a higher id; board `upToDate` true right after publish, false after a move, after a rename of a seated guest, after marking a seated guest absent, after moving a table pin; deleting a guest/table after publish keeps the snapshot rows (`guestId`/`tableId` null, names kept); `getSeatingVersion` changes on publish and stays equal after an unpublished move; `getTvSeating` contains the tagged names and no ids; `getSeatOccupancy` matches the rows.

### Success Criteria:

#### Automated Verification:

- Unit + integration tests pass (integration not skipped): `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 3: Organizer seating API, TV seating endpoint and HTTP smoke

### Overview

Expose the services as organizer-only JSON routes and a TV polling route; extend the smoke test.

### Changes Required:

#### 1. Routes

**Files**: `src/pages/api/o/[key]/seating.ts`, `src/pages/api/o/[key]/seating/guests/[id].ts`, `src/pages/api/o/[key]/seating/publish.ts`, `src/pages/api/tv/[key]/seating.ts`

**Intent**: Thin adapters (`prerender = false`; organizer routes start with `organizerApi(locals)`; TV route re-checks `accessFor(locals, "tv")` and `getDb()`), validate with `astro/zod`, map statuses to HTTP + Polish messages; organizer mutations answer with the whole `SeatingBoardDto`.

**Contract**:
- `GET seating` → 200 `SeatingBoardDto`.
- `PUT seating/guests/<guestId>` `{ tableId: positive int, seat: positive int }` (strict) → 200 board; `guest-not-found` → 404 „Nie znaleziono gościa.”; `table-not-found` → 404 „Nie znaleziono stolika.”; `seat-out-of-range` → 400; `guest-pinned` / `seat-pinned` → 409 with the names.
- `PATCH seating/guests/<guestId>` `{ pinned: boolean }` (strict) → 200 board | 404 | 409 `not-seated`.
- `DELETE seating/guests/<guestId>` → 200 board | 404 | 409 `pinned`.
- `POST seating/publish` → `published` 201 board, `unchanged` 200 board.
- `GET /api/tv/<key>/seating?since=<token>` → `since` (≤ 64 chars) equal to `getSeatingVersion` → 204 empty body; otherwise 200 `getTvSeating`.
- Malformed `<guestId>` → 404 like unknown; unknown body keys → 400.

#### 2. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: HTTP-level proof on the production preview, appended after the S-02 section (the S-01 "TV view shows no guest names" check runs before any publish and stays valid).

**Contract**: reuse leftover state (guests Ania Smoke, Ola Smoke; room "Sala Główna Smoke"; rectangular 6-seat "Okno Smoke"). TV `GET seating` before any publish → 200 with `publishedAt: null`, no tables; `since=<that version>` → 204. Organizer: `GET seating` board; `PUT` Ania → seat 1, Ola → seat 4; swap (Ania → seat 4); seat 7 → 400; `PATCH pinned: true` on Ola; moving Ola → 409; `DELETE` Ola → 409; `POST publish` → 201, `upToDate: true`; publish again → 200 unchanged. TV `GET seating` → 200 with both names on "Okno Smoke", a new `version`, and the body contains no organizer key, no guest ids (`"guestId"`, `"id"`), no `pinned`/`isAbsent`; `since=<new version>` → 204. Unpublished move (unpin Ola, unseat her) → TV `since` still 204 (US-02: a draft never reaches the TV); publish → TV 200 with only Ania. TV key on every organizer seating route → 404 `Brak dostępu`; organizer key on `/api/tv/<org>/seating` → 404; TV-key requests changed nothing.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- HTTP smoke passes against the production preview on a DB without an event: `npm run preview` + `npm run smoke` (server stopped afterwards with `npx astro preview stop`; smoke data removed with `delete from public.event`)

---

## Phase 4: Organizer seating page, shell card and venue-page confirmations

### Overview

The "Rozsadzenie" page with its island, the shell link, and the S-02 seat-loss confirmations on the venue page.

### Changes Required:

#### 1. Hook

**File**: `src/components/hooks/useSeatingBoard.ts`

**Intent**: Board state of the page; every change goes through the API and the state is replaced with the returned board; one pending flag; Polish failures; on 404/409 reload `GET seating`.

**Contract**: `useSeatingBoard(apiBase, initialBoard)` → `{ board, pending, failure, notice, seat(guestId, tableId, seat), unseat(guestId), setPinned(guestId, pinned), publish(), dismissFailure, dismissNotice }`; `seat` sets `notice` („„Kuba” nie ma teraz miejsca.”) when an unseated guest displaced a seated one (compared from the board before/after); `publish` sets „Opublikowano — TV pokaże rozkład w ciągu kilku sekund.” or „Nic się nie zmieniło od ostatniej publikacji.”.

#### 2. Island

**Files**: `src/components/seating/SeatingEditor.tsx` (+ small siblings, e.g. `PublishBar.tsx`, `SeatingWarnings.tsx`, `TableSeats.tsx`, `UnseatedList.tsx`, `SelectedGuestBar.tsx`)

**Intent**: Seat 40 guests quickly from a laptop (usable on a phone).

**Contract**: props `{ apiBase: string; initialBoard: SeatingBoardDto }`. Sections:
- Publish bar: status line (published time / „Są nieopublikowane zmiany” / „Jeszcze nic nie opublikowano”, with the reason hint that absent guests are left out), summary (`formatSeatingSummary`), „Opublikuj na TV” (disabled when up to date or pending; with warnings present asks `window.confirm` listing them).
- Warnings (`describeWarnings`) in a non-blocking `aria-live` region.
- Table cards grouped by room (tables in `venue.tables` order): header (name, seats, type), seats as buttons ≥ 40 px: number, occupant name or „wolne”, pin marker (text „przypięty” plus a lucide pin icon), absent marker („nieobecny”), group marker; rectangular: two columns (side A, side B) aligned by position; round: seat order.
- „Bez miejsca”: present unseated guests (alphabetical), then absent unseated guests (muted); clicking selects.
- Selection: click a guest (list or seat) to select; click a seat to `seat(selected, table, seat)` (empty → move, occupied → swap/replace); clicking the selected guest again or „Anuluj” / `Escape` clears. Hint line describes the current mode („Wybierz osobę…”, „Kliknij miejsce dla „Ania”. Zajęte miejsce — zamiana.”). Selected-guest bar (sticky at the bottom on phones): name, current seat (`seatLabel`) or „bez miejsca”, „Przypnij do tego miejsca” / „Odepnij”, „Zwolnij miejsce” (hidden when pinned), „Anuluj”. Seats of pinned guests are not valid targets while another guest is selected (disabled, with a title explaining).
- Failure region `role="alert"` with „Zamknij”; notice region `aria-live="polite"`; no horizontal scroll at 360 px; `cn()` for conditional classes.
- Without tables or guests: short hints linking to `/o/<key>/sale` and `/o/<key>/goscie`.

#### 3. Page and shell link

**Files**: `src/pages/o/[key]/rozsadzenie.astro`, `src/pages/o/[key].astro`

**Intent**: SSR page with the initial board; the shell card becomes a link with the seating summary.

**Contract**: `rozsadzenie.astro`: `accessFor(Astro.locals, "organizer")` and `getDb()` else 404 + `<NoAccess />`; title „Rozsadzenie”; back link; short intro (select a person, then a seat; pinned seats stay during draws; TV shows only what you publish); `<SeatingEditor client:load apiBase={…} initialBoard={…} />`. Shell: „Rozsadzenie” card links to `/o/<key>/rozsadzenie` with `formatSeatingSummary(...)`, removed from `upcomingSections`.

#### 4. Venue page confirmations

**Files**: `src/pages/o/[key]/sale.astro`, `src/components/venue/VenueEditor.tsx` (and `RoomsSection.tsx` if its delete confirm lives there)

**Intent**: S-02 contract — warn before a structure edit unseats guests, naming them.

**Contract**: the page passes `initialOccupancy = await getSeatOccupancy(db)`; the island keeps it in state; deleting a table, deleting a room, and saving a lower seat count use `occupantsRemovedBy` + `describeRemovedOccupants` in the `window.confirm` text (lowering with nobody affected saves without a confirm); after a successful save the occupancy drops the same occupants.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Contract**: `/o/<org>/rozsadzenie` 200 contains „Rozsadzenie” and a seated guest name; `/o/<tv>/rozsadzenie` 404 with the no-access text and no guest names; the shell links to `/o/<org>/rozsadzenie`; `/o/<org>/sale` still renders.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Tests pass: `npm test`
- Build passes: `npm run build`
- HTTP smoke passes against the production preview on a DB without an event (server stopped afterwards; smoke data removed)

#### Manual Verification:

- On a laptop open `/o/<key>/rozsadzenie` with demo data (≈ 40 guests, 7 tables): seat everyone, swap two guests, seat an unseated guest on a taken seat (the notice names who lost the seat), pin yourself and try to move/swap into your seat (refused with a clear message), unpin, mark a seated guest absent on the guest page (warning + „nieopublikowane zmiany”), split a pair (warning), publish (status flips to up to date); on `/o/<key>/sale` lower a seat count and delete a table (confirm names the guests); on a phone (≈ 360 px) the page is usable with no horizontal scroll

**Implementation Note**: Unattended run — after each phase's automated checks pass, commit and continue; manual rows stay pending for the morning (`overnight-log.md` → „Do sprawdzenia rano”).

---

## Phase 5: TV view with names on the plan, live refresh and docs

### Overview

Render the published arrangement on the TV with readable, non-overlapping table cards, poll for changes, and document the model for later slices.

### Changes Required:

#### 1. Label layout (pure)

**File**: `src/lib/seating/tv-layout.ts` (+ `tv-layout.test.ts`)

**Intent**: Place table cards near their pins, inside the screen, pushed apart when they overlap; deterministic and bounded.

**Contract**:
- `containBox(natural: { width; height }, viewport: { width; height }): { left; top; width; height }` — largest box with the image's aspect ratio inside the viewport, centred (scales up too); zero sizes → the viewport.
- `layoutCards(cards: { id: string; anchorX; anchorY; width; height }[], bounds: { width; height }, options?: { gap?: number; iterations?: number }): { id; x; y }[]` (top-left) — start centred on the anchor, clamp into bounds, then a fixed number of passes (default 200) pushing each overlapping pair apart along the axis of least overlap (half each), clamping every pass; stable order by id.
- Tests: a single card centred on its anchor; a card at a corner anchor stays inside; two cards on the same anchor end without overlap; a realistic fixture — 7 tables (two 10-seat rectangular), 40 names, estimated card sizes at 1920×1080 with 3vh names — ends inside the bounds with no overlapping pair; the same input gives the same output.

#### 2. TV island and page

**Files**: `src/components/tv/TvSeatingView.tsx` (+ `src/components/tv/TableCard.tsx`, `src/components/hooks/useTvSeating.ts`), `src/pages/tv/[key].astro`

**Intent**: The read-only TV screen (FR-008, NFR-003, NFR-006).

**Contract**:
- Page: `accessFor(Astro.locals, "tv")` and `getDb()` else 404 + `<NoAccess />`; `apiBase = /api/tv/<key from the URL>`; `initial = await getTvSeating(db)`; full-viewport dark layout with `overflow: hidden`; `<TvSeatingView client:load apiBase initial eventName />`. Only `TvSeatingDto` and the event name reach the HTML.
- `useTvSeating(apiBase, initial)`: polls `GET ${apiBase}/seating?since=<version>` every 2 500 ms via a `setTimeout` chain with a 4 s `AbortController` timeout; 204 → keep; 200 → replace; errors → keep the last state and count failures (after 3 in a row show a small „Brak połączenia — ponawiam…” badge until the next success).
- View: nothing published → event name + „Rozsadzenie pojawi się tutaj po publikacji.”; otherwise the plan `<img>` (`planImagePath(apiBase, planVersion)`, mounted once, `src` changes only with `planVersion`) sized by `containBox` from its natural size (effect checks `complete && naturalWidth`; `onLoad` too; recompute on `resize`), a small dot at each pin, and one card per table positioned by `layoutCards` from measured card sizes (`useLayoutEffect`; cards hidden until first placed). No plan → a 16:9 blank stage instead of the image. Card: table name (3 vh, bold) and names (3 vh, never below 2.5 vh) in `tableCardColumns` order with a small muted seat number; long names wrap within ~30 vh; dark translucent background, white text.
- `aria-live="polite"` on a visually hidden "Zaktualizowano" line after a change.

#### 3. Smoke and docs

**Files**: `scripts/smoke.mjs`, `CLAUDE.md`

**Intent**: Smoke checks the TV page; CLAUDE.md documents the seating model for S-04/S-05.

**Contract**: smoke: after the last publish `/tv/<tv>` 200 contains the published names and the TV API base, and contains neither the organizer key nor `"guestId"`, `"pinned"`, `"isAbsent"`; after an unpublished change the TV page body still has the published names only. CLAUDE.md "Data access": seating tables, functions, working vs published model, pins as locks, absent excluded, no-op publish, snapshot survival, polling contract (`since` → 204/200, token format), restore rules for S-04, `src/lib/seating` functions, TV layout notes.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (incl. `tv-layout.test.ts`): `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- HTTP smoke passes against the production preview on a DB without an event (server stopped afterwards; smoke data removed)

#### Manual Verification:

- On the real TV (landscape 16:9, Open Question 2) open `/tv/<tvKey>` with demo data (40 guests, 7 tables, 3 rooms): the whole plan with all names fits without scrolling, names are readable from the room and at least 2.5% of the screen height, cards do not cover each other, the image is not cropped and pins sit on the tables; publish a change from the organizer page — the TV shows it within 5 s without touching it; an unpublished change never appears; replacing the plan image updates the TV picture

---

## Testing Strategy

### Unit Tests:

- `seats.ts` `areConsecutiveSeats`: cases listed in Phase 1 §3.
- `rules.ts`: group warnings (pair at different tables; triple not adjacent; one member unseated; absent member ignored; group with one present member ignored; consecutive across the round-table wrap), absent-seated names, missing seats, Polish summaries and plurals, `formatPublishedAt` in Europe/Warsaw.
- `published.ts`: fingerprint equality regardless of row order; differs on a move, a rename, an absence, a pin move, a room rename, a deleted table (`tableId` null); `toTvSeating` order and absence of ids; version token; `tableCardColumns` for rectangular 6/7/10 and round 4/10; `occupantsRemovedBy` for each change kind (seat-count raise removes nobody; pinned occupants included).
- `tv-layout.ts`: cases listed in Phase 5 §1.

### Integration Tests:

- Anonymous REST/RPC denial for the four tables and two functions; DB invariants and triggers (Phase 1 §6).
- Service behaviour: seat/move/swap/replace, pins as locks, publish/unchanged, absent excluded, snapshot survival, up-to-date flag, version token (Phase 2 §2).

### Manual Testing Steps:

1. With demo data, seat all guests on `/o/<key>/rozsadzenie`, pin yourself, publish.
2. Open `/tv/<tvKey>` on the TV: names next to tables, readable, no scrolling.
3. Swap two guests, check the TV does not change; publish, check the TV changes within 5 s.
4. On `/o/<key>/sale` lower a seat count with guests on the removed seats — the confirm names them.

## Performance Considerations

TV polling every 2.5 s costs the middleware key lookup plus two tiny queries (latest snapshot id, plan `updated_at`); the full state (two snapshot queries + mapping) is read only when the token changed. The image is fetched once per plan version. Organizer mutations return the whole board (guest list, venue, assignments, latest snapshot — a handful of small parallel queries, ~5 KB for 40 guests). Layout is O(n²·iterations) with n ≤ 40 cards — negligible.

## Migration Notes

Fourth migration. Locally `npx supabase migration up`; CI's `supabase start` applies it. Everything cascades from `public.event` (smoke/test cleanup with `delete from public.event`).

## Open Risks & Assumptions

- TV readability with 40 real names on the real plan is unverified until the rehearsal (PRD Open Question 2); the layout is best effort (cards may still be crowded around dense table clusters). Fallback if unreadable: a later change can switch the TV to a split view (plan + per-table lists).
- Hosted latency: polling adds ~3 DB round trips every 2.5 s per TV (and later per phone in S-05); fine for 1 TV + 60 phones on a small Postgres, but unmeasured on the deploy target.

## References

- PRD US-01, FR-004, FR-007, FR-008, NFR-003, NFR-006: `context/foundation/prd.md`
- Roadmap S-03 (and S-04/S-05 that build on it): `context/foundation/roadmap.md`
- Run rules: `context/foundation/overnight-brief.md`; decisions: `context/foundation/overnight-log.md` (S-03 lines)
- S-02 plan (seat convention, deletion semantics): `context/archive/2026-10-27-rooms-and-tables-on-plan/plan.md`
- Patterns: `src/lib/guests/service.ts` (`createGroup` RPC mapping), `supabase/migrations/20261026234000_create_guests_and_groups.sql` (plpgsql + privileges), `src/components/hooks/useVenue.ts`, `src/components/venue/PlanCanvas.tsx` (pin contract)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, types and pure seating rules

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase migration up`
- [x] 1.2 Unit + integration tests pass (integration not skipped): `npm test`
- [x] 1.3 Lint passes: `npm run lint`
- [x] 1.4 Type check passes: `npx astro check`

### Phase 2: Seating services

#### Automated

- [ ] 2.1 Unit + integration tests pass (integration not skipped): `npm test`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Type check passes: `npx astro check`

### Phase 3: Organizer seating API, TV seating endpoint and HTTP smoke

#### Automated

- [ ] 3.1 Unit tests pass: `npm test`
- [ ] 3.2 Lint passes: `npm run lint`
- [ ] 3.3 Type check passes: `npx astro check`
- [ ] 3.4 Build passes: `npm run build`
- [ ] 3.5 HTTP smoke passes against the production preview on a DB without an event

### Phase 4: Organizer seating page, shell card and venue-page confirmations

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 Type check passes: `npx astro check`
- [ ] 4.3 Tests pass: `npm test`
- [ ] 4.4 Build passes: `npm run build`
- [ ] 4.5 HTTP smoke passes against the production preview on a DB without an event

#### Manual

- [ ] 4.6 Laptop + phone check of `/o/<key>/rozsadzenie` (seat, swap, displace, pin/unpin locks, absent and group warnings, publish) and seat-loss confirms on `/o/<key>/sale`

### Phase 5: TV view with names on the plan, live refresh and docs

#### Automated

- [ ] 5.1 Unit tests pass (incl. `tv-layout.test.ts`): `npm test`
- [ ] 5.2 Lint passes: `npm run lint`
- [ ] 5.3 Type check passes: `npx astro check`
- [ ] 5.4 Build passes: `npm run build`
- [ ] 5.5 HTTP smoke passes against the production preview on a DB without an event

#### Manual

- [ ] 5.6 Real TV check of `/tv/<tvKey>` (all names fit without scrolling, ≥ 2.5% height, no overlap, pins aligned, publish visible within 5 s, unpublished changes never shown, plan replacement visible)
