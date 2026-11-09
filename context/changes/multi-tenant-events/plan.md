# Restaurants and many events (F-02 multi-tenant-events) Implementation Plan

## Overview

The data model stops being "one dinner per deployment". A new `restaurant` table owns events; `event` loses its singleton check and gets an identity id, a required `restaurant_id` and DB-generated keys; every `event_id` loses `default 1`. Every DB function that writes or reads event data takes `p_event_id` and checks that the rows it touches belong to that event, under per-event advisory locks. Every server service takes the event id from the resolved link access. The home page stops creating events. Smoke, demo and integration tests create their own restaurant + events, and new tests prove that a key or API of event A never reads or writes event B. The existing event 1 moves to a „Restauracja domyślna” restaurant with all its data and links intact. Everything from v1 works as before inside one event (PRD v2 NFR-012, NFR-015, US-10; FR-001..FR-020, FR-043..FR-047 preserved).

## Current State Analysis

- `public.event` (`20261026232057_create_event.sql`): `id smallint primary key default 1`, `constraint event_singleton check (id = 1)`, `name default 'Kolacja podwyżkowa'`, `organizer_key`/`tv_key` without defaults (generated in TS by `createEvent`), `restaurant_key` with the DB default `translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')`.
- 14 tables carry `event_id smallint not null default 1 references event on delete cascade`: `guest_group`, `guest`, `venue_plan` (PK), `venue_room`, `venue_table`, `seat_assignment`, `seating_snapshot`, `guess`, `question`, `ai_topic`, `tv_spotlight`, `order_item`, `order_piece`, `drink_item`. Snapshot children (`seating_snapshot_table/_seat/_room`) hang off `seating_snapshot` and have no `event_id`.
- Cross-row references use single-column FKs: `guest.group_id`, `venue_table.room_id`, `seat_assignment.guest_id/table_id`, `guess.guest_id`, `ai_topic.guest_id`, `order_item.guest_id/table_id`, `order_piece.order_item_id/guest_id`. Nothing stops a row of event A pointing at a row of event B.
- DB functions that are event-blind or take `smallint`: `create_guest_group(bigint[])`, `seat_guest(bigint, bigint, integer)`, `publish_seating()`, `replace_seating(jsonb)`, `apply_venue_layout(jsonb, integer)` — all under the global `pg_advisory_xact_lock(3003)`; `save_guest_guess(bigint, integer)`, `save_guest_guess_with_place(bigint, integer, integer)` (derive the event from the guest); `reserve_ai_topic(smallint, …)` under global lock 3008; `ai_topic_usage(smallint, bigint)`, `ai_topic_tokens(smallint)`, `reset_counts(smallint)`, `reset_event(smallint, text[], jsonb)` (latest version in `20261108120000_bill_drinks.sql`); `set_order_pieces(bigint, integer[], boolean, bigint)`. Already event-safe and unchanged: `guest_published_table_id(bigint)`, `guest_order_lines(bigint)` (derive everything from the guest), and the row triggers.
- `src/lib/event.ts`: `EVENT_ID = 1`, `hasEvent`, `createEvent` (insert with id 1, then best-effort `loadStarterQuestions`). 45 `EVENT_ID` uses in 10 files, but `guests/service.ts`, `questions/service.ts` and most seating/venue reads use NO event filter at all (they rely on `default 1` and unfiltered selects) — ~105 `.from()`/`.rpc()` calls in `src/lib` need scoping. `getSnapshot(db, id)` (restore) and "latest snapshot" reads are global today.
- Access: `resolveAccess` (`src/lib/access/resolve.ts`) already returns `event.id` for every role; keys are globally unique. Guards `organizerApi`/`guestApi`/`restaurantApi` return `{ access, db }`.
- Event creation: `/` (`src/pages/index.astro`) shows a form posting to `src/pages/api/event.ts` while no event exists. Smoke (`scripts/smoke.mjs` sections 1–6) and demo (`scripts/demo.mjs` section 1) create the event through it; smoke needs a DB without an event. Integration tests reuse the existing event (`acquireTestEvent` in `tests/integration/helpers.ts`) and insert rows relying on `default 1`. `npm run links` prints the single event's links.
- PostgREST embeds in use (must keep exactly one FK path each): `guest → event` (`resolve.ts:101`), `seating_snapshot_seat → seating_snapshot_table` (`guest-links/service.ts:89`), `guest → event` and `guest → guess` one-to-one (`guesses/service.ts:193`).
- Local Postgres is 17 (`supabase/config.toml`), so `on delete set null (column)` on composite FKs is available. A rolled-back trial on the populated local DB confirmed: drop default → drop `event_singleton` → `alter column id type integer` (FKs from `smallint` columns survive) → `add generated always as identity` → `setval` works.
- Pre-migration data was captured during planning (base commit `16f27e0`): `npx supabase db reset`, base build + preview, `npm run demo`, plus guest access on, one AI attempt, a TV spotlight and a drink through the old API. Counts and event 1's keys are in the scratchpad (`pre-migration-counts.txt`, `pre-migration-keys.txt`; data dump `pre-migration-public-data.dump`): event 1, 40 guests, 3 groups, plan, 3 rooms, 7 tables, 39 seats, 1 snapshot (7 tables, 39 seats), 30 guesses, 90 questions, 1 AI attempt, 1 spotlight, 9 order lines, 1 piece, 1 drink. The local DB must NOT be reset until the new migration has been applied to it with `npx supabase migration up` and checked.

## Desired End State

- Migration `supabase/migrations/20261109120000_multi_tenant_events.sql` applies both from scratch (`npx supabase db reset`) and on the populated pre-migration DB (`npx supabase migration up`). After it: `restaurant` exists; event 1 belongs to „Restauracja domyślna” with every row and all keys unchanged; `/o/`, `/tv/`, `/g/`, `/r/` links of event 1 open with the new code; new events get ids 2, 3, … and DB-generated keys.
- Every service, route and page works on `access.event.id`; a foreign or unknown id gets the same answer (status and body) as today's unknown id; DB functions refuse rows of another event exactly like unknown rows; composite FKs make cross-event references impossible at the DB level.
- `/` shows only the app name and „Dostęp tylko przez link…” (PL/EN); `POST /api/event` no longer exists (404).
- `npm run event:create -- --restaurant "<name>" --name "<event>"` creates a restaurant (or uses `--restaurant-id`) and an event with the starter questions and prints its three links; `npm run links` lists every event (restaurant, name, id) with its links.
- `npm run smoke` creates its own restaurant and two events (no fresh DB needed) and checks cross-event denials; `npm run demo` creates a new demo restaurant + event and fills it.
- `AI_PROVIDER=mock npm test` (incl. new `tests/integration/isolation.test.ts`), `npm run lint`, `npx astro check`, `npm run build`, smoke and demo pass; CLAUDE.md and README describe the new model.

### Key Discoveries:

- `seed.ts` keeps only a type import so it loads under `node --experimental-strip-types` (`src/lib/questions/seed.ts:11-13`); Node 22 (CI) needs the flag.
- Unknown-id answers already come from status unions (`not-found`) and FK violations `23503` (e.g. orders → `PLACE_GONE_MESSAGE`, `src/lib/orders/service.ts`); scoping by event reuses those paths, so foreign ids answer identically.
- `restoreSnapshot` returns `describeRestore` names from the snapshot: an unscoped `getSnapshot` would leak another event's guest names — it must be scoped.
- `reset_event` lock order 3003 → 3008 → event row `for update` matches every writer's first lock; keep the order with the two-argument locks.

## What We're NOT Doing

- No accounts, sessions, panel, restaurant settings, event date/status/archive, restaurant enable flag (F-03, S-10, S-11 add what they need).
- No new limits (150 guests etc. is S-19); limits stay per event as today.
- No change to link formats, key format, middleware denial logic, TV/guest polling tokens or any UI except the home page.
- No branding change („Kolacja podwyżkowa” in the layout stays until S-18); only the DB column default of `event.name` goes.
- No `create_event` DB function and no HTTP creation route of any kind (not even dev-only): creation is a plain insert by the server (`createEvent`) or by the CLI scripts with the service-role key.
- No composite FK for `guess.guest_id` (the `guest → guess` one-to-one embed needs its single-column FK); guess writes are scoped in the functions and the service instead. Snapshot children keep their single-column FKs (only `publish_seating` writes them, from the same event).
- Smoke and demo do not delete what they create (local DB; `npm run links` lists it).

## Implementation Approach

One atomic core phase (schema + every server caller + tests), because a dropped function signature or a missing default breaks the app until every caller is updated — nothing smaller is green. Then isolation proof and CLIs, then smoke/demo, then docs.

Rules every phase follows:
- Every exported DB service function takes `eventId: number` as its SECOND parameter (after `db`) and filters every select/update/delete with `.eq("event_id", eventId)` (or `.eq("id", eventId)` on `event`), sets `event_id: eventId` on every insert/upsert and passes `p_event_id` to every RPC. Pure modules are untouched. Routes pass `api.access.event.id`; pages pass `access.event.id`.
- Updating `src/db/database.types.ts` first makes `event_id` required in every `Insert` and adds `p_event_id` to every changed function, so `npx astro check` enumerates unscoped inserts and RPC calls; unscoped selects/updates/deletes are found by grepping `.from(` in `src/lib` and checking each line.
- A foreign id must take the same path as an unknown id (same status, same body).

## Critical Implementation Details

- **Migration order (tested):** create `restaurant` → insert „Restauracja domyślna” only `where exists (select 1 from public.event)` → `drop function` every old signature → event: drop `event_singleton`, drop id default, `alter column id type integer`, `add generated always as identity`, `setval(pg_get_serial_sequence('public.event','id'), coalesce(max(id),0)+1, false)` → add `restaurant_id`, backfill, `set not null` → column defaults for `organizer_key`/`tv_key` (the `restaurant_key` expression), drop the `name` default → `event_id` columns: `type integer`, `drop default` → composite uniques and FKs → indexes → new functions with grants. `supabase migration up` runs the file in one transaction.
- **PostgREST:** after the migration check that the three embeds still resolve (integration tests for guest access, guest state and guest guess cover them) and that the new RPC signatures resolve; if PostgREST serves a stale cache, `notify pgrst, 'reload schema'`.
- **Locks:** `pg_advisory_xact_lock(3003, p_event_id)` in `seat_guest`, `publish_seating`, `replace_seating`, `apply_venue_layout`, `reset_event`; `pg_advisory_xact_lock(3008, p_event_id)` in `reserve_ai_topic`, `reset_event` (order 3003 → 3008 → event row `for update`).

## Phase 1: Event-scoped schema and server code

### Overview

The migration, the DB types, event creation, every service, route and page, the home page, and every existing integration test moved to its own events. Lands as one commit on green.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261109120000_multi_tenant_events.sql` (new)

**Intent**: Turn the singleton into restaurants + many events without losing a row, and make every function and cross-row reference event-scoped. Header comment states the model, the default-restaurant move and the access model (as earlier migrations).

**Contract**:
- `public.restaurant (id integer generated always as identity primary key, name text not null check (char_length(name) between 1 and 80 and name = btrim(name)), created_at timestamptz not null default now())`; RLS on, `revoke all … from anon, authenticated`; comment.
- `event`: drop `event_singleton`; `id integer generated always as identity` (sequence past `max(id)`); `restaurant_id integer not null references public.restaurant (id)` (no action on delete) + index; `organizer_key`/`tv_key` defaults = the `restaurant_key` expression; drop `name` default; `constraint event_name_format check (char_length(name) between 1 and 120 and name = btrim(name))`. Existing event(s) → the default restaurant.
- Every `event_id` column of the 14 tables: `integer`, no default.
- `unique (event_id, id)` on `guest`, `guest_group`, `venue_room`, `venue_table`, `order_item`. Replace the single-column FKs (by their default names `<table>_<column>_fkey`) with composite ones that KEEP THE SAME NAME (`src/lib/venue/service.ts` recognises "room not found" by `venue_table_room_id_fkey`): `guest (event_id, group_id) → guest_group on delete set null (group_id)`; `venue_table (event_id, room_id) → venue_room on delete cascade`; `seat_assignment (event_id, guest_id) → guest on delete cascade` and `(event_id, table_id) → venue_table on delete cascade`; `ai_topic (event_id, guest_id) → guest on delete set null (guest_id)`; `order_item (event_id, guest_id) → guest on delete set null (guest_id)` and `(event_id, table_id) → venue_table on delete set null (table_id)`; `order_piece (event_id, order_item_id) → order_item on delete cascade` and `(event_id, guest_id) → guest on delete set null (guest_id)`. `guess.guest_id` and snapshot-child FKs stay.
- Indexes: `seating_snapshot (event_id, id)`, `seat_assignment (event_id)`, `guess (event_id)`, `event (restaurant_id)`.
- `drop function` (old signatures): `create_guest_group(bigint[])`, `seat_guest(bigint, bigint, integer)`, `publish_seating()`, `replace_seating(jsonb)`, `apply_venue_layout(jsonb, integer)`, `save_guest_guess(bigint, integer)`, `save_guest_guess_with_place(bigint, integer, integer)`, `reserve_ai_topic(smallint, bigint, text, integer, integer)`, `ai_topic_usage(smallint, bigint)`, `ai_topic_tokens(smallint)`, `reset_counts(smallint)`, `reset_event(smallint, text[], jsonb)`, `set_order_pieces(bigint, integer[], boolean, bigint)`.
- New functions (`set search_path = ''`, `revoke execute … from public, anon, authenticated`, `grant execute … to service_role`, comments), same behaviour and error names as before plus the event scope:
  - `create_guest_group(p_event_id integer, p_guest_ids bigint[]) → bigint` — guests counted/locked `where event_id = p_event_id` (foreign → `GUEST_NOT_FOUND`); group inserted with `event_id`.
  - `seat_guest(p_event_id integer, p_guest_id bigint, p_table_id bigint, p_seat integer)` — lock `(3003, p_event_id)`; guest, table and occupant looked up in the event; inserts carry `event_id`.
  - `publish_seating(p_event_id integer) → bigint` — lock `(3003, p_event_id)`; pitch from the event's plan; snapshot with `event_id`; rooms, tables, seats of the event only.
  - `replace_seating(p_event_id integer, p_seats jsonb)` — lock; deletes only the event's non-pinned rows; inserts with `event_id` (composite FKs refuse foreign guests/tables → constraint error → 409 as today).
  - `apply_venue_layout(p_event_id integer, p_layout jsonb, p_max_tables integer)` — lock; table/room updates `and event_id = p_event_id` (not found → `TABLE_NOT_FOUND`/`ROOM_NOT_FOUND`); new tables with `event_id`, room checked in the event; table count and pitch update per event.
  - `save_guest_guess(p_event_id integer, p_guest_id bigint, p_amount_grosze integer)` and `save_guest_guess_with_place(p_event_id integer, p_guest_id bigint, p_amount_grosze integer, p_predicted_place integer)` — guest must be in the event (`GUEST_NOT_FOUND`); same `for share` intake lock.
  - `reserve_ai_topic(p_event_id integer, p_guest_id bigint, p_category text, p_guest_limit integer, p_event_limit integer) → bigint` — lock `(3008, p_event_id)`; rest unchanged.
  - `ai_topic_usage(p_event_id integer, p_guest_id bigint default null)`, `ai_topic_tokens(p_event_id integer)`, `reset_counts(p_event_id integer)` — bodies as the latest versions.
  - `reset_event(p_event_id integer, p_parts text[], p_starter_questions jsonb) → jsonb` — body of `20261108120000_bill_drinks.sql` with locks `(3003, p_event_id)` then `(3008, p_event_id)`.
  - `set_order_pieces(p_event_id integer, p_item_id bigint, p_pieces integer[], p_delivered boolean, p_guest_id bigint)` — line locked `where id = p_item_id and event_id = p_event_id` (else `ITEM_NOT_FOUND`).

#### 2. DB types

**File**: `src/db/database.types.ts`

**Intent**: Mirror the migration so the compiler finds every unscoped insert and RPC call.

**Contract**: new `restaurant` table; `event` Row gains `restaurant_id`, Insert requires `restaurant_id` and `name`, keys optional; every `event_id` required in Insert; relationships updated to the composite FKs; `Functions` entries replaced with the new argument lists (incl. `p_event_id: number`); old signatures removed.

#### 3. Event creation

**File**: `src/lib/event.ts`

**Intent**: Replace the singleton helpers with restaurant/event creation used by tests now and the panel later (S-11).

**Contract**: remove `EVENT_ID`, `hasEvent`; `createRestaurant(db, name) → { id: number; name: string }`; `createEvent(db, { restaurantId, name }) → { status: "created"; event: { id; name; organizerKey; tvKey; restaurantKey } } | { status: "restaurant-not-found" }` — plain insert (keys from the DB defaults; FK `23503` → `restaurant-not-found`), then `loadStarterQuestions(db, event.id)` best effort as today.

#### 4. Services (event-scoped)

**Files**: `src/lib/guests/service.ts`, `src/lib/venue/service.ts`, `src/lib/seating/service.ts`, `src/lib/guest-links/service.ts`, `src/lib/guesses/service.ts`, `src/lib/questions/service.ts`, `src/lib/ai-topics/service.ts`, `src/lib/tv-spotlight/service.ts`, `src/lib/orders/service.ts`, `src/lib/orders/drinks-service.ts`, `src/lib/reset/service.ts`, `src/lib/venue-ai/service.ts`

**Intent**: Every read and write is limited to the caller's event (rules in Implementation Approach).

**Contract**:
- Every exported function: `(db, eventId, …rest)`; module comments that say "singleton event" updated.
- Seating: latest snapshot, `getSnapshot(db, eventId, id)` (restore of a foreign snapshot → `snapshot-not-found`), history, versions, plan version, occupancy, board and TV reads per event; `publish_seating`, `seat_guest`, `replace_seating` with `p_event_id`.
- Guest links: `getGuestState(db, eventId, guest)` / `getGuestStateVersion(db, eventId, guest)` read the event's latest snapshot; `revokeGuestKey` scoped.
- Guesses: `saveGuessByOrganizer` checks the guest belongs to the event before the upsert (foreign → `not-found`), upsert sets `event_id`; guest saves pass `p_event_id`.
- Venue: `addTable`/`updateTable` with a room of another event → the existing room-not-found answer (composite FK `23503` or a scoped lookup); plan upsert keyed by `event_id`.
- Orders: assignment to a foreign guest/table → existing `place-gone` path (`23503`); `markOrderPieces`/`markGuestPiece` pass `p_event_id`.
- AI topics, TV spotlight, reset, questions, drinks: `p_event_id`/filters per event; reset's spotlight cleanup per event.

#### 5. Routes and pages

**Files**: every route under `src/pages/api/{o,g,tv,r}/[key]/**` and the pages `src/pages/o/[key].astro`, `src/pages/o/[key]/*.astro`, `src/pages/g/[key].astro`, `src/pages/tv/[key].astro`, `src/pages/r/[key].astro`

**Intent**: Pass the resolved event id to every service call; nothing else changes.

**Contract**: routes use `api.access.event.id`; pages use `access.event.id`.

#### 6. Home page, removed creation route

**Files**: `src/pages/index.astro`, `src/pages/api/event.ts` (DELETED), `src/lib/shell/messages.ts`

**Intent**: `/` no longer creates events (PRD v2 §Removed).

**Contract**: `/` renders the app name and the link-only text (PL/EN), or the no-database text when no DB is configured; no DB query, no form. `src/pages/api/event.ts` is deleted (POST `/api/event` → 404). Unused messages (`noEventYet`, `bookmarkNow`, `createEvent`, `noDatabaseError`) removed from both dictionaries.

#### 7. Integration tests on their own events

**Files**: `tests/integration/helpers.ts`, every `tests/integration/*.test.ts`

**Intent**: Tests never touch pre-existing events: each file creates a restaurant + event (two where needed) and deletes them afterwards (cascade).

**Contract**: `createTestEvent(db, label?) → TestEvent { id, restaurantId, name, organizerKey, tvKey, restaurantKey }` and `releaseTestEvent(db, event)` (deletes the event, then its restaurant) replace `acquireTestEvent`/`readEvent`/`releaseEvent`; helpers that insert or read event state take `eventId` (`createTestSeating`, `createTestGuests`, `planExists`, `deleteTestPlan`, `readGuestAccessEnabled`/`writeGuestAccessEnabled`, `readGuessSettings`/`writeGuessSettings`, `countSnapshots`); direct inserts set `event_id`. `access.test.ts`: the creation race and „already exists” cases are DELETED (their premise is gone) and replaced by: two created events have distinct ids and keys, each key resolves to its own event id, `createEvent` with an unknown restaurant → `restaurant-not-found`, a new event has the 90 starter questions, `decideAccess(db, "/api/event")` stays public.

### Success Criteria:

#### Automated Verification:

- Migration applies on the populated pre-migration DB: `npx supabase migration up`; row counts equal the recorded ones, event 1 has `restaurant_id` of „Restauracja domyślna” and the same three keys
- Old links of event 1 work on the new build (after `npm run build` of the new code): `/o/`, `/tv/`, `/r/`, `/g/` (guest from the recorded key) pages answer 200 and `GET /api/g/<key>/state` answers 200 with the seat (preview with `AI_PROVIDER=mock`)
- Tests pass: `AI_PROVIDER=mock npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- No `EVENT_ID`/`hasEvent` left: `grep -rn "EVENT_ID\|hasEvent" src tests scripts` is empty

#### Manual Verification:

- Event 1's organizer pages (guests, rooms, seating, links, questions, guesses, orders) look exactly as before the migration

**Implementation Note**: unattended run — manual rows are left for the morning checklist.

---

## Phase 2: Isolation proof, event CLI and links

### Overview

Integration tests that prove cross-event isolation at the service and DB-function level, and the CLI path for creating events until the panel exists.

### Changes Required:

#### 1. Isolation integration tests

**File**: `tests/integration/isolation.test.ts` (new)

**Intent**: Two events A and B (two restaurants), each with a guest group, room + tables, seats, a published snapshot, a guess, a question, an order line with a marked piece, a drink, an AI attempt and a spotlight. Every service operation called with A's id and B's ids answers like an unknown id and leaves B unchanged; every read with A's id contains nothing of B.

**Contract**: covers (at least) guests (update/delete), groups (create with B's guests, dissolve B's group), venue (rename/delete B's room and table, add a table to B's room, plan read), seating (seat/pin/unseat B's guest, seat A's guest at B's table, restore B's snapshot → `snapshot-not-found`, draft with B's ids → refused, publish A leaves B's latest snapshot id), guesses (organizer save/delete for B's guest, guest save with A's event and B's guest → not-found), questions (update/delete B's), orders (assign A's line to B's guest/table → place-gone, update/delete/mark B's line, guest of A marking B's line → not-found), drinks (update/delete B's), AI usage/tokens per event, spotlight per event, reset of A (all parts) leaves B's `reset_counts` identical, `resolveAccess` of every key of B returns B's id only; direct RPC calls with `p_event_id = A` and B's ids raise the not-found errors; a direct insert linking A's row to B's (e.g. `seat_assignment` with A's event and B's guest) fails with `23503`.

#### 2. Shared script helpers and the event CLI

**Files**: `scripts/lib/platform.mjs` (new), `scripts/create-event.mjs` (new), `package.json`

**Intent**: Dependency-free creation of restaurants and events over PostgREST with the service-role key, shared by the CLI, smoke and demo (resolves the roadmap Unknown).

**Contract**:
- `platform.mjs`: `readDbEnv({ requireLocal })` (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; with `requireLocal` refuses anything but `127.0.0.1`/`localhost`), `createRestaurant(env, name) → { id, name }`, `createEvent(env, restaurantId, name) → { id, name, organizerKey, tvKey, restaurantKey }`, `listEvents(env)`; errors exit with a Polish message.
- `create-event.mjs`: `npm run event:create -- [--restaurant "<name>" | --restaurant-id <id>] [--name "<event name>"]` (defaults „Restauracja”/„Wydarzenie”), inserts the starter questions from `src/lib/questions/seed.ts` (upsert, ignore duplicates), prints the target DB host and the organizer/TV/restaurant links (`BASE_URL`, default `http://localhost:4321`). Works against any configured DB (like `links`).
- `package.json`: `"event:create": "node --experimental-strip-types --env-file-if-exists=.env scripts/create-event.mjs"`.

#### 3. Links for every event

**File**: `scripts/links.mjs`

**Intent**: Recovery of lost links now that there are many events.

**Contract**: prints every event (`<restaurant> · <event name> (id N)`) with its organizer, TV and restaurant links, ordered by id; „Nie ma jeszcze wydarzeń. Utwórz je: npm run event:create” when none.

### Success Criteria:

#### Automated Verification:

- Tests pass incl. isolation: `AI_PROVIDER=mock npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- `npm run event:create -- --restaurant "CLI test" --name "Test CLI"` prints three links and the event has 90 questions; `npm run links` lists it

---

## Phase 3: Smoke and demo on their own events

### Overview

Smoke and demo bootstrap through `platform.mjs`; the smoke gains cross-event checks.

### Changes Required:

#### 1. Smoke

**Files**: `scripts/smoke.mjs`, `package.json`

**Intent**: Replace sections 1–6 (home-page creation, second creation, home after creation — DELETED) with: home renders the link-only text and no creation form; `POST /api/event` → 404; create restaurant A + event A and restaurant B + event B via `platform.mjs` (local DB only); load the starter base for A via `POST /api/o/<A>/questions/starter` (the premise of section 19). Then everything else runs on event A unchanged. New final section „Event isolation (multi-tenant-events)”: give B a guest, a group, a room + table, a seat and a publish, an order line, a drink and a question through B's organizer API; with A's organizer key, every PATCH/DELETE/PUT/POST addressing B's ids (guest, group, room, table, seating guest, pin, restore B's snapshot, order line, piece, drink, question, guess) answers with the same status and body as the same call with an unknown id; A's GET answers contain none of B's names; B's own GETs are unchanged afterwards; a guest key of A cannot mark B's line (same 409 as an unknown line); B's TV and guest keys never open A's pages and vice versa (identical 404 page/JSON).

**Contract**: `"smoke": "node --env-file-if-exists=.env scripts/smoke.mjs"`; header comment: needs a running server and a LOCAL DB (no longer an empty one); the event-name leak check uses the smoke's own event names.

#### 2. Demo

**File**: `scripts/demo.mjs`

**Intent**: Always fill a NEW demo restaurant + event („Restauracja demo” / „Kolacja podwyżkowa (demo)”) through `platform.mjs` (local DB only) and load the starter base via the organizer API; the „refuse when there is data” logic goes (a fresh event is always empty).

**Contract**: output unchanged apart from the first line naming the restaurant and event.

#### 3. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Comment only — the smoke no longer needs an empty DB (the step order stays).

### Success Criteria:

#### Automated Verification:

- From scratch: `npx supabase db reset`, then `AI_PROVIDER=mock npm test` passes
- Build succeeds: `npm run build`
- Smoke passes: `AI_PROVIDER=mock npm run preview` + `npm run smoke` (twice in a row on the same DB)
- Demo fills a new event: `AI_PROVIDER=mock npm run demo` against the running preview
- Lint passes: `npm run lint`

#### Manual Verification:

- The demo event's organizer, TV, guest and restaurant pages look as before F-02

---

## Phase 4: Docs

### Overview

CLAUDE.md and README describe restaurants, many events and the new bootstrap path.

### Changes Required:

#### 1. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Every place describing the singleton is rewritten.

**Contract**: Commands (`event:create`, `links`, `smoke` and `demo` prerequisites); Data access (`src/lib/event.ts` → `createRestaurant`/`createEvent`, no `EVENT_ID`; restaurant table; the service rule „`(db, eventId, …)`”; composite FKs; per-event locks `(3003, event_id)`/`(3008, event_id)`); every DB function signature with `p_event_id`; integration-test rule (own events, deleted afterwards); access section unchanged except the event id note; the `/` home text.

#### 2. README

**File**: `README.md`

**Intent**: Replace „Utwórz wydarzenie” on `/` with `npm run event:create` (local) and note that the panel comes later; `npm run links` lists all events; deployment step 5 likewise.

### Success Criteria:

#### Automated Verification:

- Prettier/lint clean: `npm run lint`
- No stale singleton wording: `grep -n "EVENT_ID\|Created once from\|/api/event\|Utwórz wydarzenie" CLAUDE.md README.md` is empty

---

## Testing Strategy

### Unit Tests:

- Existing pure tests stay green; no new pure logic beyond the script helpers (checked by running them).

### Integration Tests:

- Every existing integration file runs on its own events (behaviour unchanged).
- `isolation.test.ts`: cross-event service calls, RPCs and direct inserts (Phase 2 list).
- `access.test.ts`: creation, key resolution per event.

### Manual Testing Steps:

1. Open event 1's organizer link from before the migration: guests, seating, TV, orders as before.
2. `npm run event:create`, open the printed organizer link: an empty event with the starter questions.
3. With two events open, change something in one — the other's TV does not change.

## Performance Considerations

New indexes keep per-event reads indexed (`seating_snapshot (event_id, id)` for "latest snapshot per event" on every TV/guest poll, `seat_assignment (event_id)`, `guess (event_id)`; the composite uniques index the other tables). Per-event advisory locks stop one event's publish or draft from waiting on another's (NFR-015).

## Migration Notes

- Data: event 1 and every child row are kept; only types, defaults, FKs and functions change. New events start at id `max(id) + 1`. Snapshot ids keep their identity sequence (never reset).
- Deploy order stays: the migration reaches a database BEFORE the code (the old code calls dropped signatures). It is never pushed to the old dinner project (`eaubtfkoehpekdckhnxf`); the platform's new project gets it (user's decision and action).
- Rollback = restore from backup; the migration is not reversible in place (dropped functions, identity).

## References

- Roadmap: `context/foundation/roadmap.md` § F-02; PRD v2 Constraints & Compatibility, NFR-012, US-10
- Design notes: `context/foundation/m2-product-notes.md` item 1; `context/foundation/shape-notes.md` Forward blocks
- Latest function bodies: `supabase/migrations/20261108120000_bill_drinks.sql` (reset), `20261101120000_venue_drawing.sql` (publish, layout), `20261107120000_order_piece_delivery.sql` (pieces), `20261106120000_guess_predicted_place.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Event-scoped schema and server code

#### Automated

- [x] 1.1 Migration applies on the populated pre-migration DB with counts and keys preserved
- [x] 1.2 Old links of event 1 work on the new build
- [x] 1.3 Tests pass: `AI_PROVIDER=mock npm test`
- [x] 1.4 Lint passes: `npm run lint`
- [x] 1.5 Type check passes: `npx astro check`
- [x] 1.6 Build succeeds: `npm run build`
- [x] 1.7 No `EVENT_ID`/`hasEvent` left

#### Manual

- [ ] 1.8 Event 1's organizer pages look exactly as before the migration

### Phase 2: Isolation proof, event CLI and links

#### Automated

- [ ] 2.1 Tests pass incl. isolation: `AI_PROVIDER=mock npm test`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Type check passes: `npx astro check`
- [ ] 2.4 `npm run event:create` prints three links with 90 questions; `npm run links` lists it

### Phase 3: Smoke and demo on their own events

#### Automated

- [ ] 3.1 From scratch: `npx supabase db reset`, then `AI_PROVIDER=mock npm test` passes
- [ ] 3.2 Build succeeds: `npm run build`
- [ ] 3.3 Smoke passes twice in a row on the same DB
- [ ] 3.4 Demo fills a new event
- [ ] 3.5 Lint passes: `npm run lint`

#### Manual

- [ ] 3.6 The demo event's organizer, TV, guest and restaurant pages look as before F-02

### Phase 4: Docs

#### Automated

- [ ] 4.1 Prettier/lint clean: `npm run lint`
- [ ] 4.2 No stale singleton wording in CLAUDE.md and README
