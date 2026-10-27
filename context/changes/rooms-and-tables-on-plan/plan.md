# Rooms and tables on the venue plan Implementation Plan

## Overview

Roadmap S-02 (`rooms-and-tables-on-plan`, PRD US-01, FR-005, FR-006). The organizer (at `/o/<key>`) gets a "Sale i stoliki" page where they upload one screenshot of the venue floor plan (PNG/JPEG/WebP, ≤ 5 MB, stored in Postgres), create/rename/delete named rooms, and add/edit/delete tables — each in a room, with a name, a seat count (2–20), a type (okrągły / prostokątny) and a pin clicked on the plan. Pin positions are fractions of the rendered image, so the TV (S-03) can draw guest names next to tables on the same plan at any resolution; the image is served by a key-guarded route for both the organizer and the TV. The plan also fixes the seat-numbering/neighbour convention and the deletion semantics that S-03 (seat assignments) and S-04 (neighbours) build on.

## Current State Analysis

- F-01 and S-01 are done: singleton `public.event` (id = 1), middleware guarding `/o|tv|g/` and `/api/o|tv|g/` (`src/middleware.ts`), role re-check `accessFor(locals, role)` (`src/lib/access/resolve.ts:88-97`), organizer API prelude `organizerApi(locals)` (`src/lib/organizer-api.ts`), JSON helpers `jsonResponse`/`jsonError`/`readJsonBody`/`parseId` (`src/lib/http.ts`).
- S-01 pattern to mirror: pure rules module (`src/lib/guests/names.ts`), DB service taking a `DbClient` with status-union results (`src/lib/guests/service.ts`), thin API routes returning the whole list after each mutation (`src/pages/api/o/[key]/guests.ts`), SSR page + one React island + a hook that replaces state with each API answer (`src/pages/o/[key]/goscie.astro`, `src/components/guests/GuestManager.tsx`, `src/components/hooks/useGuestList.ts`), smoke checks in `scripts/smoke.mjs`.
- Organizer shell `src/pages/o/[key].astro:25-31` still lists "Sale i stoliki" as "Wkrótce".
- TV view `src/pages/tv/[key].astro` is a placeholder; S-03 renders the plan there.
- No Supabase Storage (disabled locally, brief: "Obraz planu sal jest przechowywany w bazie").
- Verified during planning: the local Kong gateway accepts a 6 MB JSON body (PostgREST answered 404 for a missing RPC, not 413). PostgREST/supabase-js transport `bytea` as a `\x…` hex string (2× the size), base64 text is 1.33×.
- Astro's origin check (`node_modules/astro/dist/core/app/origin-check.js`) only blocks cross-site non-GET requests with form-like content types (or none); a same-origin `fetch` PUT with `Content-Type: image/png` passes. Astro's body size limits apply to actions/server islands, not API routes.
- Supabase grants `anon`/`authenticated` everything on new tables by default — every new table needs RLS + `revoke all` (as in S-01).

## Desired End State

- `/o/<organizerKey>/sale`: Polish page "Sale i stoliki". Upload/replace the plan image; the plan shown full width with table pins (name + seat count, round/rectangular marker); clicking the plan opens a "Nowy stolik" form at that point; clicking a pin opens its edit form (name, room, seats, type, "Przestaw pinezkę", "Usuń"); a rooms section (add, rename, delete with a confirm that names the number of tables deleted with it); a table list grouped by room.
- The organizer shell card "Sale i stoliki" links to that page with a summary (`Plan wgrany · 3 sale · 7 stolików · 52 miejsca`).
- JSON API under `/api/o/<organizerKey>/`: `GET venue`, `PUT plan` (raw image body), `GET plan/image`, `POST rooms`, `PATCH/DELETE rooms/<id>`, `POST tables`, `PATCH/DELETE tables/<id>`; every mutation answers with the whole `VenueDto`. `GET /api/tv/<tvKey>/plan/image` serves the same image to the TV. Other keys → the existing 404 `{"error":"Brak dostępu"}`.
- DB guarantees: one plan per event (PNG/JPEG/WebP, 1 B – 5 MB, base64 length consistent with the byte size); room names 1–40 chars and table names 1–24 chars, normalized, unique per event case-insensitively; seats 2–20; type `round`/`rectangular`; pin fractions in [0, 1]; deleting a room deletes its tables; browser roles see nothing.
- `src/lib/venue/seats.ts` encodes the seat convention below, unit-tested.

Verify: `npm test` (unit + integration on the local DB), `npm run lint`, `npx astro check`, `npm run build` green; `npm run smoke` passes against `npm run preview` on a DB without an event.

### Seat numbering and neighbours (contract for S-03/S-04)

A seat is `(table_id, seat number 1..seat_count)`. Neighbours are always computed from the table's current `shape` and `seat_count`:

- **Round (`round`), n seats:** seats 1..n clockwise. Side neighbours of seat i: i−1 and i+1 with wrap-around (1 and n are neighbours). n = 2: seats 1 and 2 are each other's only neighbour (deduplicated). No "opposite".
- **Rectangular (`rectangular`), n seats:** side A = seats 1..a with a = ceil(n/2), side B = seats a+1..n; both sides numbered in the same direction, so position p (1-based) is seat p on side A and seat a+p on side B. Side neighbours: i±1 on the same side, no wrap-around and no crossing between sides. Opposite of position p: the seat at position p on the other side, if it exists (odd n: the last seat of side A has no opposite). No seats at the table ends. Examples: n = 2 → seats 1 and 2 are opposite, no side neighbours; n = 3 → A = 1,2, B = 3 (1↔2 side, 1↔3 opposite, 2 has no opposite); n = 5 → A = 1,2,3, B = 4,5 (3 has no opposite).
- "Neighbour" for the PRD's no-repeat rule = side neighbours ∪ opposite (rectangular only).
- An inseparable group sits on consecutive seats (S-04 decides the exact rule; the side/wrap rules above define "consecutive").

### Deletion and edit semantics (contract for S-03)

Structure edits always succeed; seating adapts:

- **Delete a table:** every seat assignment and pinned seat at that table (draft and published) is removed with it (S-03: FK to `venue_table` `on delete cascade`); those guests become unseated. S-03's confirm must name the affected guests.
- **Delete a room:** deletes its tables (FK `on delete cascade`), then as above. The S-02 confirm names the number of tables.
- **Lower a table's seat count:** assignments and pins at seats above the new count are removed (guests unseated) — S-03 enforces this (trigger or service) and warns before saving. Raising the count adds empty seats.
- **Change type round ↔ rectangular:** seat numbers and their guests stay; only the neighbour relation changes. S-04 should record neighbour history as guest pairs captured at publish time, so later structure edits do not rewrite history.
- **Rename, move to another room, move the pin, replace the plan image:** no effect on seating. Replacing the plan keeps every pin at its stored fractions; the UI asks the organizer to check the pins.

### Key Discoveries:

- `src/lib/access/paths.ts:18` already matches `/o/<key>/sale`, `/api/o/<key>/plan/image` and `/api/tv/<key>/plan/image`; no middleware change.
- `src/middleware.ts:15-21` rebuilds responses with `new Response(response.body, …)` and forces `Cache-Control: no-store` on all guarded routes — binary bodies pass through; the image is never cached, so the URL carries a version token (`?v=<version>`) to make React swap the `<img>` after a replacement.
- `src/pages/o/[key].astro` + `src/pages/o/[key]/` coexist; likewise `src/pages/api/o/[key]/plan.ts` (PUT) next to `src/pages/api/o/[key]/plan/image.ts` (GET).
- `src/lib/guests/names.ts` already has the name normalization (`normalizeDisplayName`, `displayNameLength` in code points, `displayNameKey`) — reuse it for room/table names.
- `src/lib/guests/summary.ts` has `pluralPl` for Polish plurals.
- Integration tests may delete only rows they created (`tests/integration/helpers.ts`); the plan is a singleton, so plan-mutating test cases must not overwrite a real plan.

## What We're NOT Doing

- Seats as rows, seat assignment, pinning guests, publishing, TV rendering of the plan/pins (S-03). The TV only gets the image route now.
- Neighbour computation for the shuffle (S-04) beyond the pure, tested convention helpers in `seats.ts`.
- Drawing the plan or room outlines in the app (PRD Non-Goal); rooms have no geometry, only a name.
- Image dimensions in the DB or server-side image decoding (views use the `<img>`'s natural size); resizing/recompressing uploads; more than one plan image; deleting the plan (replace only).
- Drag-and-drop pins, keyboard-only precise pin placement (keyboard "add" places the pin at the plan centre; move it with the pointer).
- Guest (`/g/`) access to the plan (S-05 decides).
- Live refresh of the organizer page; offline cache (S-09); browser/E2E tests (no Playwright overnight).

## Implementation Approach

Schema first: `venue_plan` (singleton per event, image as base64 text plus metadata columns), `venue_room`, `venue_table` (FK to room with cascade; pins as plain fraction columns with checks, independent of the plan at DB level). Pure modules own the rules (names, limits, seat count, shapes), the image checks (magic-byte sniffing, base64 codec) and the seat convention; a DB service takes a `DbClient` and returns status unions; thin API routes validate with `astro/zod` and return the whole `VenueDto`; the image is served by a shared response builder from one organizer and one TV route. The page is SSR (initial venue) plus one React island.

## Critical Implementation Details

- **Never move the image through metadata queries.** `getVenue` and every list/mutation answer select only `mime_type, byte_size, updated_at` from `venue_plan`; `image_base64` is read only by `getPlanImage`. The DTO carries `version` (epoch ms of `updated_at`) so URLs change on replacement.
- **Upload size is enforced while reading.** Reject on a `Content-Length` above 5 MB (5 242 880 B) before reading, then read the body stream with a running byte cap and cancel it once exceeded (the header can be absent or wrong); DB checks are the backstop. The served `Content-Type` is the sniffed type stored in the DB, never the client's header; add `X-Content-Type-Options: nosniff`.
- **Pin contract (organizer now, TV in S-03).** `x`, `y` ∈ [0, 1] are fractions of the rendered `<img>` box from its top-left corner (rounded to 4 decimals). The positioning wrapper is `relative` and sized by the image itself (`<img class="block w-full h-auto">` or `max-h`/`w-auto` on the TV); no `object-fit` letterboxing, padding or border on the `<img>`.
- **TypeScript:** if `astro check` rejects `new Response(bytes)` (`Uint8Array<ArrayBufferLike>` vs `BodyInit`), build the body from an `ArrayBuffer`-backed `Uint8Array`.

## Phase 1: Schema, types and venue rules

### Overview

Create the plan/room/table schema with its invariants and privileges, extend the hand-written DB types and DTOs, and add the pure, unit-tested rules: names and limits, image sniffing and base64 codec, the seat convention, and click-to-fraction conversion.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_venue_plan_rooms_tables.sql`

**Intent**: Durable plan image, rooms and tables for the singleton event with DB-enforced invariants, invisible to browser roles.

**Contract**:
- `public.venue_plan(event_id smallint primary key default 1 references public.event(id) on delete cascade, mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')), byte_size integer not null check (byte_size between 1 and 5242880), image_base64 text not null, updated_at timestamptz not null default now())` with a check `char_length(image_base64) = ((byte_size + 2) / 3) * 4`.
- `public.venue_room(id bigint generated always as identity primary key, event_id smallint not null default 1 references public.event(id) on delete cascade, name text not null, created_at timestamptz not null default now())`; name check like `guest_display_name_format` but `char_length` 1–40; `create unique index venue_room_name_key on public.venue_room (event_id, lower(name))`.
- `public.venue_table(id bigint generated always as identity primary key, event_id smallint not null default 1 references public.event(id) on delete cascade, room_id bigint not null references public.venue_room(id) on delete cascade, name text not null, seat_count smallint not null check (seat_count between 2 and 20), shape text not null check (shape in ('round','rectangular')), pos_x double precision not null check (pos_x between 0 and 1), pos_y double precision not null check (pos_y between 0 and 1), created_at timestamptz not null default now())`; name check 1–24 chars (same whitespace rules); `create unique index venue_table_name_key on public.venue_table (event_id, lower(name))`; index on `room_id`.
- Header comment: purpose, base64-in-DB decision, pin contract, seat convention summary and deletion semantics (pointing to `src/lib/venue/seats.ts`).
- RLS enabled on all three, no policies, `revoke all on table … from anon, authenticated`.

#### 2. DB and shared types

**Files**: `src/db/database.types.ts`, `src/types.ts`

**Intent**: Typed queries; DTOs shared by service, API, page and island.

**Contract**: `Tables.venue_plan` / `venue_room` / `venue_table` (`Row`/`Insert`/`Update`, `Relationships` with the FKs). In `src/types.ts`: `VenuePlanRow`, `VenueRoomRow`, `VenueTableRow`; `PlanImageType = "image/png" | "image/jpeg" | "image/webp"`; `TableShape = "round" | "rectangular"`; `VenuePlanDto { mimeType: PlanImageType; byteSize: number; version: number }`; `RoomDto { id: number; name: string }`; `TableDto { id: number; roomId: number; name: string; seatCount: number; shape: TableShape; x: number; y: number }`; `VenueDto { plan: VenuePlanDto | null; rooms: RoomDto[]; tables: TableDto[] }`.

#### 3. Venue rules (pure)

**File**: `src/lib/venue/rules.ts` (+ `rules.test.ts`)

**Intent**: One place for room/table limits and validation, used by service, API and UI.

**Contract**: constants `MAX_ROOMS = 10`, `MAX_TABLES = 40`, `MAX_ROOM_NAME_LENGTH = 40`, `MAX_TABLE_NAME_LENGTH = 24`, `MIN_SEATS = 2`, `MAX_SEATS = 20`, `TABLE_SHAPES`, `TABLE_SHAPE_LABELS` (`round` → „okrągły”, `rectangular` → „prostokątny”); `normalizeVenueName(raw)` (delegates to `normalizeDisplayName` from `@/lib/guests/names`), `venueNameKey(name)`; `validateRoomName(name)` / `validateTableName(name)` → `"empty" | "too-long" | null`; `describeRoomNameProblem` / `describeTableNameProblem` (Polish, e.g. „Nazwa sali może mieć najwyżej 40 znaków.”); `isValidSeatCount(n)` (integer 2–20); `isValidFraction(v)` (finite, 0–1); `roundFraction(v)` (clamp to [0, 1], 4 decimals); `nextTableName(existingNames)` → first free „Stolik N” (N ≥ 1, compared by key); `compareTableNames` (`Intl.Collator("pl", { numeric: true })`, so „Stolik 2” < „Stolik 10”).

#### 4. Plan image checks (pure)

**File**: `src/lib/venue/image.ts` (+ `image.test.ts`)

**Intent**: Decide what the server accepts and convert between bytes and the stored base64, with no dependency and no `astro:*`.

**Contract**: `MAX_PLAN_BYTES = 5 * 1024 * 1024`; `PLAN_IMAGE_TYPES`; `sniffImageType(bytes: Uint8Array): PlanImageType | null` by magic bytes — PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`, WebP `"RIFF" ???? "WEBP"` (12 bytes); anything else (incl. SVG/HTML/GIF, empty, truncated) → null; `bytesToBase64(bytes)` / `base64ToBytes(text)` (chunked `btoa`/`atob`, work in Workers, Node and browsers; output padded, no line breaks); `formatMegabytes(bytes)` for messages.

#### 5. Seat convention (pure)

**File**: `src/lib/venue/seats.ts` (+ `seats.test.ts`)

**Intent**: The executable form of "Seat numbering and neighbours" above, for S-03/S-04 and the organizer UI.

**Contract**: `seatSide(shape, seatCount, seat): { side: "A" | "B" | null; position: number }` (round → side null, position = seat); `sideNeighbours(shape, seatCount, seat): number[]` (sorted, deduplicated); `oppositeSeat(shape, seatCount, seat): number | null`; `neighbours(shape, seatCount, seat): number[]` (side ∪ opposite); out-of-range seat → `RangeError`. Tests: round n = 2, 3, 8 (wrap 1↔n); rectangular n = 2 (opposite only), 3, 5 (seat 3 no opposite), 8 (1↔5, 4↔8; 4 and 5 not side neighbours).

#### 6. Click → pin position (pure)

**File**: `src/lib/venue/pin.ts` (+ `pin.test.ts`)

**Intent**: Convert a pointer position on the rendered image into stored fractions, and back into CSS.

**Contract**: `pointToFraction(clientX, clientY, rect: { left; top; width; height }): { x; y }` (relative to rect, clamped, `roundFraction`; zero-size rect → centre); `fractionStyle({ x, y })` → `{ left: "…%", top: "…%" }`; `planImagePath(apiBase, version)` → `${apiBase}/plan/image?v=${version}`.

#### 7. Anonymous access to the new schema

**File**: `tests/integration/venue-schema.test.ts`

**Intent**: Prove browser roles see nothing.

**Contract**: `describe.skipIf(!hasLocalDb)`; creates its own room + table (random tag), anonymous `GET /rest/v1/{venue_plan,venue_room,venue_table}?select=*` (no apikey; garbage apikey) are denied or `[]` and never contain the test names; anonymous `POST /rest/v1/venue_room` is not 2xx; cleans up only its rows.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase migration up`
- Unit + integration tests pass (integration not skipped): `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 2: Venue services

### Overview

The DB-backed operations for the plan image, rooms and tables, integration-tested on the local DB.

### Changes Required:

#### 1. Service

**Files**: `src/lib/venue/service.ts`, `src/lib/venue/index.ts`

**Intent**: All venue reads and writes, taking a `DbClient`, no `astro:*`; Supabase errors throw (pattern `src/lib/guests/service.ts`).

**Contract**:
- `getVenue(db): Promise<VenueDto>` — plan metadata only (`mime_type, byte_size, updated_at`), rooms by id, tables ordered by their room's order then `compareTableNames`; `x`/`y` from `pos_x`/`pos_y`.
- `getPlanImage(db): Promise<{ mimeType: PlanImageType; bytes: Uint8Array; version: number } | null>`.
- `savePlanImage(db, bytes): Promise<{ status: "saved"; plan: VenuePlanDto } | { status: "too-large"; limit: number } | { status: "unsupported-type" }>` — size check, `sniffImageType`, upsert on `event_id` with a fresh `updated_at`; tables untouched.
- `addRoom(db, name)` → `added` (`room`) | `invalid` (`reason`) | `duplicate` | `too-many`; `renameRoom(db, id, name)` → `renamed` | `not-found` | `duplicate` | `invalid`; `deleteRoom(db, id)` → `deleted` (`tablesDeleted: number`) | `not-found`.
- `addTable(db, input: { roomId; name; seatCount; shape; x; y })` → `added` (`table`) | `invalid` (`field: "name" | "seatCount" | "position"`, `reason`) | `duplicate` | `room-not-found` | `too-many`; `updateTable(db, id, patch: Partial<…>)` (x and y only together) → `updated` | `not-found` | `room-not-found` | `duplicate` | `invalid`; `deleteTable(db, id)` → `deleted` | `not-found`.
- Mapping: `23505` → `duplicate`; `23503` on `room_id` → `room-not-found`; names normalized and validated before writing; positions through `roundFraction` after `isValidFraction`.
- `index.ts` re-exports rules, image helpers, seats, pin helpers and the service.

#### 2. Test helpers

**File**: `tests/integration/helpers.ts`

**Intent**: Cleanup of venue rows a test created.

**Contract**: `deleteTestRooms(db, ids)` (their tables go with them); `planExists(db)`; a tiny valid PNG byte constant (`TINY_PNG`, 1×1, < 100 B) shared by tests.

#### 3. Integration tests

**File**: `tests/integration/venue.test.ts`

**Intent**: Prove FR-005/FR-006 and the invariants on the real schema without touching pre-existing data.

**Contract**: names carry a random per-run suffix; each test deletes only the rooms/tables it created. Cases: add/rename/delete room; duplicate room name (other case/spacing) → `duplicate`; empty/41-char name → `invalid`; 11th room → `too-many` (only when existing + created stays countable — compute from current count); add table with all fields and read it back via `getVenue` (`x`/`y` rounded to 4 decimals); duplicate table name across rooms → `duplicate`; seats 1 and 21 → `invalid` `seatCount`; position −0.1 / 1.1 / NaN → `invalid` `position`; unknown room → `room-not-found`; update name/seats/shape/room/position; unknown id → `not-found` for update/delete; deleting a room deletes its tables (`tablesDeleted`); tables sort „Stolik 2” before „Stolik 10”. Plan cases run only when no plan exists before the suite (`planExists` in `beforeAll`; otherwise each case calls `ctx.skip()`; the suite deletes the plan it created in `afterAll`): byte-exact round trip of `TINY_PNG` plus bytes `0x00 0x5C 0xFF`; a generated in-memory payload of exactly 5 242 880 bytes with a PNG signature round-trips byte-exactly; 5 242 881 bytes → `too-large`; GIF/SVG/random bytes → `unsupported-type`; replacing changes `version` and keeps tables and their positions; `getVenue` result contains no base64 (serialized DTO is small).

### Success Criteria:

#### Automated Verification:

- Unit + integration tests pass (integration not skipped): `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 3: Organizer API, image routes and HTTP smoke

### Overview

Expose the services as organizer-only JSON routes, serve the image to the organizer and the TV, read uploads with a byte cap, and extend the HTTP smoke test.

### Changes Required:

#### 1. Capped body reader (pure)

**File**: `src/lib/http.ts` (+ `http.test.ts`)

**Intent**: Read a raw upload without ever buffering more than the limit.

**Contract**: `readBodyBytes(request, limit): Promise<{ status: "ok"; bytes: Uint8Array } | { status: "empty" } | { status: "too-large" }>` — `Content-Length` above the limit → `too-large` without reading; otherwise read `request.body` chunk by chunk, cancel the reader and answer `too-large` as soon as the running total exceeds the limit. Tests: under/at/over the limit with and without a `Content-Length`, empty body, a lying `Content-Length`.

#### 2. Image response (shared)

**File**: `src/lib/venue/image-response.ts`

**Intent**: One builder for both image routes.

**Contract**: `planImageResponse(db): Promise<Response>` — no plan → `jsonError(404, "Nie wgrano jeszcze planu.")`; otherwise 200 with the bytes, `Content-Type` = stored type, `Content-Length`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` (the middleware adds `no-store`).

#### 3. Routes

**Files**: `src/pages/api/o/[key]/venue.ts`, `src/pages/api/o/[key]/plan.ts`, `src/pages/api/o/[key]/plan/image.ts`, `src/pages/api/tv/[key]/plan/image.ts`, `src/pages/api/o/[key]/rooms.ts`, `src/pages/api/o/[key]/rooms/[id].ts`, `src/pages/api/o/[key]/tables.ts`, `src/pages/api/o/[key]/tables/[id].ts`

**Intent**: Thin adapters: `export const prerender = false`; organizer routes start with `organizerApi(locals)`; the TV image route re-checks `accessFor(locals, "tv")` (404 `Brak dostępu`) and `getDb()` (503); validate with `import { z } from "astro/zod"`; map statuses to HTTP + Polish messages; every mutation answers with the whole `VenueDto`.

**Contract**:
- `GET venue` → 200 `VenueDto`.
- `PUT plan` raw body → `readBodyBytes(request, MAX_PLAN_BYTES)`; `empty` → 400 „Wybierz plik z planem.”; `too-large` → 413 „Plik jest za duży — najwyżej 5 MB.”; `unsupported-type` → 415 „Wgraj obraz PNG, JPEG albo WebP.”; `saved` → 200 `VenueDto`.
- `GET plan/image` (organizer) and `GET /api/tv/<key>/plan/image` → `planImageResponse`.
- `POST rooms` `{ name }` → 201; `invalid` → 400 (rules message); `duplicate` → 409 „Sala o tej nazwie już jest.”; `too-many` → 400 „Można mieć najwyżej 10 sal.”.
- `PATCH rooms/<id>` `{ name }` → 200 | 400 | 404 „Nie znaleziono sali.” | 409; `DELETE rooms/<id>` → 200 | 404.
- `POST tables` `{ roomId, name, seatCount, shape, x, y }` (zod: positive int, string ≤ 1 000, int, enum, finite numbers) → 201; `invalid` → 400 with the field's Polish message („Stolik ma od 2 do 20 miejsc.”, „Kliknij na planie, gdzie stoi stolik.”, name messages); `duplicate` → 409 „Stolik o tej nazwie już jest.”; `room-not-found` → 404 „Nie znaleziono sali.”; `too-many` → 400 „Można mieć najwyżej 40 stolików.”.
- `PATCH tables/<id>` (strict object, all optional, at least one, `x` and `y` together) → 200 | 400 | 404 „Nie znaleziono stolika.” | 409; `DELETE tables/<id>` → 200 | 404.
- Malformed `<id>` → 404 like an unknown id; unknown body keys → 400.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: HTTP-level proof on the production preview.

**Contract**: the request helper accepts a raw binary body with its content type and can return the response bytes. New checks: `GET venue` → empty venue, `no-store`; image before upload → 404 `Nie wgrano jeszcze planu.`; `PUT plan` with a tiny PNG (inline base64 constant) → 200 with `plan.mimeType === "image/png"`; organizer and TV `GET …/plan/image` → 200, `image/png`, `nosniff`, `no-store`, bytes identical to the upload; HTML bytes sent as `image/png` → 415; a generated 5 242 881-byte body → 413; room add, duplicate (409), rename; table add with a pin, duplicate name (409), seats 21 (400), update seats/shape, delete; deleting a room with a table → its table gone; TV key on `GET venue`, `PUT plan`, `POST rooms`, `POST tables`, `DELETE tables/<id>` → 404 `Brak dostępu`; organizer key on `/api/tv/<org>/plan/image` → 404; TV-key requests changed nothing.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (incl. `http.test.ts`): `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- HTTP smoke passes against the production preview on a DB without an event: `npm run preview` + `npm run smoke` (server stopped afterwards with `npx astro preview stop`; smoke data removed with `delete from public.event`)

---

## Phase 4: Rooms and tables page and organizer shell link

### Overview

The organizer page with a React island for the plan, pins, rooms and tables; the shell link with a summary; docs for later slices.

### Changes Required:

#### 1. Hook

**Files**: `src/components/hooks/useVenue.ts` (and, if it keeps both hooks small, shared `readJson`/`toFailure` moved from `useGuestList.ts` into `src/components/hooks/api-failure.ts`)

**Intent**: Venue state of the page; every change goes through the API and the state is replaced with the returned `VenueDto`; one pending flag; Polish failure messages; on 404/409 reload `GET venue`.

**Contract**: `useVenue(apiBase, initialVenue)` → `{ venue, pending, failure, send({ method, path, body }), uploadPlan(file: File), dismissFailure }`; `uploadPlan` pre-checks type (`image/png|jpeg|webp` by `file.type`) and size (≤ `MAX_PLAN_BYTES`) with the same Polish messages as the API, then `PUT ${apiBase}/plan` with the file as body.

#### 2. Island

**Files**: `src/components/venue/VenueEditor.tsx` (+ small siblings, e.g. `PlanUpload.tsx`, `PlanCanvas.tsx`, `RoomsSection.tsx`, `TableForm.tsx`, `TableList.tsx`)

**Intent**: Set up the venue from a laptop (readable on a phone).

**Contract**: props `{ apiBase: string; initialVenue: VenueDto }`. Sections in order:
- Summary line (`formatVenueSummary`).
- Plan upload: file input (`accept="image/png,image/jpeg,image/webp"`), hint „PNG, JPEG albo WebP, najwyżej 5 MB”; replacing when tables exist asks `window.confirm` („Pinezki zostaną w tych samych miejscach obrazu — sprawdź je po wymianie planu.”).
- Rooms: add (input + „Dodaj salę”), inline rename, delete with `window.confirm` naming the tables deleted with it („Usunąć salę „X” i jej 3 stoliki?”).
- Plan canvas (only with a plan): wrapper `relative` sized by `<img class="block h-auto w-full">` (`src = planImagePath(apiBase, plan.version)`, `alt="Plan sal"`); a full-size transparent `<button>` under the pins receives clicks (`pointToFraction`; a keyboard activation — `event.detail === 0` — uses the centre); pins are `<button>`s at `fractionStyle` with the table name and seat count, `rounded-full` for round and `rounded-sm` for rectangular, `aria-label` with name, seats, type and room; selected pin highlighted. Modes: idle → click on the plan opens „Nowy stolik” at that point (draft pin shown; without rooms show „Najpierw dodaj salę.”); click a pin → edit that table; „Przestaw pinezkę” → the next click moves it (PATCH `x`,`y`); `Escape` / „Anuluj” returns to idle. Hint above the plan describes the current mode.
- Table form (new/edit): room select, name (prefilled `nextTableName`), seats (`type="number"`, 2–20, default 8), type radio „okrągły” / „prostokątny” (default okrągły), short numbering hint („Miejsca numerujemy od 1 zgodnie z ruchem wskazówek zegara; przy prostokątnym najpierw jedna strona, potem druga.”), „Zapisz”, „Anuluj”, for an existing table „Przestaw pinezkę” and „Usuń” (`window.confirm`).
- Table list grouped by room (name, seats, type; click selects the table for editing).
- Failure region `role="alert"` with „Zamknij”; touch targets ≥ 40 px except pins; no horizontal scroll at 360 px; `cn()` for conditional classes.

#### 3. Summary (pure)

**File**: `src/lib/venue/summary.ts` (+ `summary.test.ts`)

**Intent**: Counts for the shell card and the page.

**Contract**: `summarizeVenue(venue) → { hasPlan, rooms, tables, seats }`; `formatVenueSummary(summary)` → e.g. „Plan wgrany · 3 sale · 7 stolików · 52 miejsca” / „Brak planu · 0 sal · 0 stolików · 0 miejsc” (with `pluralPl`).

#### 4. Page and shell link

**Files**: `src/pages/o/[key]/sale.astro`, `src/pages/o/[key].astro`

**Intent**: SSR page with the initial venue; the shell card becomes a link with the summary.

**Contract**: `sale.astro`: `accessFor(Astro.locals, "organizer")` and `getDb()` else `Astro.response.status = 404` + `<NoAccess />` (no frontmatter `return`); title „Sale i stoliki”; back link „← Panel organizatora”; short intro (one plan for the whole venue, rooms are names, pins mark tables); `<VenueEditor client:load apiBase={`/api/o/${key}`} initialVenue={…} />`. Shell: „Sale i stoliki” card links to `/o/<key>/sale` with `formatVenueSummary(summarizeVenue(await getVenue(db)))`; removed from `upcomingSections`.

#### 5. Smoke and docs

**Files**: `scripts/smoke.mjs`, `CLAUDE.md`

**Intent**: Smoke checks the page; CLAUDE.md documents the venue model, seat convention and deletion semantics for S-03/S-04.

**Contract**: smoke: `/o/<org>/sale` 200 contains „Sale i stoliki” and a created room/table name; `/o/<tv>/sale` 404 with the no-access text and none of those names; the shell links to `/o/<org>/sale`. CLAUDE.md "Data access": tables `venue_plan`/`venue_room`/`venue_table`, limits, base64 image, image routes, pin contract, `src/lib/venue` functions, seat convention, deletion/edit semantics.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Tests pass: `npm test`
- Build passes: `npm run build`
- HTTP smoke passes against the production preview on a DB without an event (server stopped afterwards; smoke data removed)

#### Manual Verification:

- On a laptop open `/o/<key>/sale`: upload a real 1–5 MB screenshot, add 3 rooms, click to place 7 tables (mixed types and seat counts), edit one, move one pin, delete one, delete a room with tables (confirm shows the count), replace the plan (confirm, pins kept); pins land where clicked at different window widths; on a phone (≈ 360 px) the page is readable with no horizontal scroll; the TV image URL `/api/tv/<tvKey>/plan/image` shows the plan

**Implementation Note**: Unattended run — after each phase's automated checks pass, commit and continue; manual rows stay pending for the morning (`overnight-log.md` → „Do sprawdzenia rano”).

---

## Testing Strategy

### Unit Tests:

- `rules.ts`: name validation (empty, 40/41 and 24/25 code points, emoji counted once), `venueNameKey` (`SALA` ≡ `sala`), seat count (1, 2, 20, 21, 2.5), fractions (−0.0001, 0, 1, 1.0001, NaN, Infinity), `roundFraction`, `nextTableName` (gaps, other case), `compareTableNames` numeric order.
- `image.ts`: PNG/JPEG/WebP signatures, truncated headers, GIF/SVG/HTML/empty → null, base64 round trip incl. `0x00`, `0x5C`, `0xFF` and lengths 0–3 mod 3, large-buffer chunking.
- `seats.ts`: cases listed in Phase 1 §5.
- `pin.ts`: corners, outside → clamped, zero-size rect, rounding, CSS percentages.
- `http.ts` `readBodyBytes`: cases listed in Phase 3 §1.
- `summary.ts`: Polish plurals (1 sala, 2 sale, 5 sal; 1 stolik, 3 stoliki, 7 stolików; 52 miejsca).

### Integration Tests:

- Anonymous REST denial for the three tables.
- Service behaviour and invariants (Phase 2 list), including byte-exact plan round trips (tiny and exactly 5 MB, generated in memory) — only when no plan exists beforehand.

### Manual Testing Steps:

1. On a laptop open the organizer link → „Sale i stoliki” card → page opens with the summary.
2. Upload a real screenshot; add rooms; click on the plan to add tables; pins appear where clicked; resize the window — pins stay on the same spots of the image.
3. Edit a table (seats, type, room), move its pin, delete it; delete a room with tables (confirm shows the count).
4. Replace the plan (confirm); open `/api/tv/<tvKey>/plan/image` — the new image.

## Performance Considerations

≤ 10 rooms and ≤ 40 tables: every mutation returns the whole venue (three small queries, no image). The image (≤ 5 MB → ≤ 7 MB base64) is read only by the image routes and decoded once per request; organizer/TV load it once per page view (S-03 keeps the same `<img>` across polls thanks to the version token).

## Migration Notes

Third migration. Locally `npx supabase migration up`; CI's `supabase start` applies it. Deleting the event cascades to the plan, rooms and tables (used by test/smoke cleanup).

## Open Risks & Assumptions

- Hosted Supabase gateway body limits for a ~7 MB JSON insert are unverified (local Kong accepted 6 MB; the integration test sends exactly 5 MB → ~7 MB base64). If the hosted limit is lower, lower `MAX_PLAN_BYTES` or downscale in the browser.
- Cloudflare Workers free plan has a 10 ms CPU budget per request; base64 decoding a 5 MB image may exceed it (deploy target still open, PRD Open Question 6). Mitigation if needed: paid plan or smaller images.

## References

- PRD US-01, FR-005, FR-006: `context/foundation/prd.md`
- Roadmap S-02: `context/foundation/roadmap.md`
- Run rules: `context/foundation/overnight-brief.md`; decisions: `context/foundation/overnight-log.md` (S-02 lines)
- S-01 plan (patterns): `context/archive/2026-10-27-guest-list-and-groups/plan.md`
- Service pattern: `src/lib/guests/service.ts`; API pattern: `src/pages/api/o/[key]/guests.ts`; island pattern: `src/components/guests/GuestManager.tsx`, `src/components/hooks/useGuestList.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, types and venue rules

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase migration up`
- [x] 1.2 Unit + integration tests pass (integration not skipped): `npm test`
- [x] 1.3 Lint passes: `npm run lint`
- [x] 1.4 Type check passes: `npx astro check`

### Phase 2: Venue services

#### Automated

- [ ] 2.1 Unit + integration tests pass (integration not skipped): `npm test`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Type check passes: `npx astro check`

### Phase 3: Organizer API, image routes and HTTP smoke

#### Automated

- [ ] 3.1 Unit tests pass (incl. `http.test.ts`): `npm test`
- [ ] 3.2 Lint passes: `npm run lint`
- [ ] 3.3 Type check passes: `npx astro check`
- [ ] 3.4 Build passes: `npm run build`
- [ ] 3.5 HTTP smoke passes against the production preview on a DB without an event

### Phase 4: Rooms and tables page and organizer shell link

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 Type check passes: `npx astro check`
- [ ] 4.3 Tests pass: `npm test`
- [ ] 4.4 Build passes: `npm run build`
- [ ] 4.5 HTTP smoke passes against the production preview on a DB without an event

#### Manual

- [ ] 4.6 Laptop + phone check of `/o/<key>/sale` (upload, rooms, place/edit/move/delete tables, delete room, replace plan, TV image URL)
