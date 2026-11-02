# Drawn venue plan (TV and phones), drawing editor and AI proposal from a photo — Implementation Plan

## Overview

The TV stops showing the plan photo with name cards next to table pins. Instead it draws the venue in one consistent style: room outlines with names, tables with their chairs, and each seated guest's name centred over their chair. Guest phones show the same drawing with their own table enlarged and their chair highlighted. The organizer redraws the venue on `/o/<key>/sale` over the photo, which serves as a tracing background. Claude (Sonnet 5.5, vision) can propose the layout from the photo as a draft the organizer corrects and applies.

Production data has been live since 2026-10-31. The dinner is 2026-11-08.

## Current State Analysis

- **Tables** (`venue_table`) carry a centre pin (`pos_x`, `pos_y` ∈ [0, 1] of the rendered photo), `shape` and `seat_count`. They have no rotation or size. Rooms (`venue_room`) are a name only, with no geometry.
- **The TV** (`src/components/tv/TvSeatingView.tsx`) does four things:
  - loads the photo (`planImagePath`) and sizes a `containBox` from its natural size;
  - draws an amber dot per pin;
  - places one `TableCard` per table near the pin with `layoutCards` (`src/lib/seating/tv-layout.ts`);
  - draws everything from the latest snapshot only (`TvSeatingDto`, `toTvSeating` in `src/lib/seating/published.ts`).
- **Seat numbering** (`src/lib/venue/seats.ts`) is a contract shared by phones, the draw, neighbour history and restore:
  - round tables: 1..n clockwise;
  - rectangular tables: side A = 1..⌈n/2⌉, side B = the rest, same direction, with position p on A opposite position p on B;
  - no seats at the ends.
- **Snapshots:**
  - `publish_seating()` (`supabase/migrations/20261027014210_create_seating.sql:197`) copies tables into `seating_snapshot_table`.
  - "Unpublished changes" compares `publishableFingerprint` with `snapshotFingerprint` (`src/lib/seating/published.ts:39-102`).
- **The editor** (`src/components/venue/VenueEditor.tsx`, `PlanCanvas.tsx`):
  - click the photo to add a table;
  - click a pin to edit it;
  - "move" mode re-pins a table;
  - each change is saved at once (PATCH `/tables/<id>`).
- **The guest phone** (`src/components/guest/GuestSeatView.tsx`) shows the photo with the guest's table pin (`GuestSeatDto` x/y), plus tablemates.
- **AI:**
  - `src/lib/ai-topics/anthropic-provider.ts` is a plain `fetch` adapter (no SDK), `anthropic-version: 2026-10-21`.
  - Mock provider by default; `tests/setup/no-ai-network.ts` blocks the Anthropic host in tests.
  - Lambda timeout is `TIMEOUT_SECONDS = 15` (`scripts/lib/aws-deploy.mjs:14`).

## Desired End State

- **TV:**
  - After a publish, the TV shows a drawn plan: room rectangles with names, every table drawn to scale with its chairs, and every seated name horizontal and centred over its chair, outward from the table.
  - Empty chairs are drawn without a name.
  - The photo is not shown; its natural size only defines the stage's aspect ratio.
  - Names stay readable from a sofa on a 1920×1080 TV with the demo data (40 guests, 7 tables, 3 rooms).
- **Guest phone:** the same drawing, zoomed to fit, with the guest's table emphasised and the guest's chair highlighted. Names are only those at the guest's own table, so the guardrail is unchanged.
- **`/sale`:**
  - Tables are dragged on the drawing over a semi-transparent photo and rotated with a handle, arrow keys or a number field.
  - Room outlines are drawn and resized.
  - One "skala" slider sets the chair pitch for the whole venue.
  - "Podgląd jak na TV" hides the photo.
  - Every edit is saved like today, and the TV changes only after "Opublikuj".
- **AI on `/sale`:** „Zaproponuj układ ze zdjęcia (AI)”:
  - The browser downscales the plan photo and sends it, and Sonnet 5.5 returns a layout.
  - The editor shows it as a draft: existing tables (matched by name, else nearest pin) get new position and rotation, new tables appear as proposals with a suggested name, room and seat count, and rooms get outlines, plus a suggested scale.
  - The organizer can drop any line.
  - „Zastosuj” writes the accepted lines in one transaction.
  - Seat counts of existing tables and deletions never change automatically.
- **Production safety:**
  - The migration only adds.
  - Old snapshots render with defaults (rotation 0, default pitch, no outlines) and still count as up to date, so no board shows "nieopublikowane zmiany" after the deploy.

### Key Discoveries:

- `publish_seating()` is the only writer of snapshots. Copying the new columns means replacing it (`create or replace`, same signature, same lock 3003).
- Fingerprints must treat a snapshot's `null` rotation, pitch or outline exactly like the live default. Otherwise every board flips to "unpublished" after `db push` (`src/lib/seating/published.ts:39`).
- Deleting `venue_table` rows cascades `seat_assignment` (incl. pins) and nulls `seating_snapshot_table.table_id` (breaks restore and history). The AI path must therefore update existing rows, never recreate them.
- The guest seat view and the TV already download the plan image for its natural size, so the drawing reuses that for the stage aspect ratio. No dimension columns are needed.
- The Messages API takes structured JSON via `output_config.format = { type: "json_schema", schema }`. On Sonnet 5.5 thinking cannot be disabled (`effort` is the control) — from the claude-api skill (`shared/model-migration.md`, `shared/models.md`). Image limits and block shape must be confirmed against `https://platform.claude.com/docs/en/build-with-claude/vision.md` when Phase 4 starts.
- `package:lambda` rejects native modules, so image resizing happens in the browser (canvas), never with `sharp`.

## What We're NOT Doing

- No per-table size: size comes from seat count × the venue's chair pitch.
- No AI changes to seat counts of existing tables and no AI deletions.
- No chairs at table ends and no change to seat numbering or neighbour rules.
- No change to the offline readout (it is a list).
- No room geometry beyond one axis-aligned rectangle per room.
- No multi-touch gestures (pinch or two-finger rotate). The phone gets number fields.
- No new npm dependency: no Anthropic SDK and no diagram library. SVG is drawn by hand.
- The AI layout call does not count against the topics limit or the topics cost estimate. Its estimated cost is shown in the editor after each call.

## Implementation Approach

Geometry is one pure module. The DB, TV, phone and editor all use the same numbers:

- **Stage:** a box with the photo's aspect ratio, in fractions like today's pins.
- **Chair pitch:** a fraction of the stage width.
- **Table body:** derived from shape, seat count and pitch.
- **Chairs:** placed by the existing seat contract, rotated with the table.
- **Labels:** sit at chair + outward normal × offset, horizontal, centred (`text-anchor: middle`, baseline chosen by the vertical sign of the normal). One font size per table is shrunk until neighbouring labels at that table do not overlap.

Rendering is SVG with a `viewBox` in stage units, so the TV, phone and editor scale identically.

Build order follows value and risk: data and geometry, then the renderer, then the editor, then AI.

## Critical Implementation Details

- **Migration order on prod:**
  1. The user takes a `supabase db dump --data-only` backup.
  2. `db push` runs.
  3. Then `deploy:aws`.

  The old app must keep working against the new schema in between. This holds because all new columns are nullable or defaulted, and `publish_seating()` keeps its signature.
- **Republish after the deploy.** After the deploy the TV always draws. For old snapshots it uses defaults: rotation 0, the default pitch and no outlines. The organizer sees the real drawing on the TV only after redrawing and publishing again. The README and the success summary must say so.
- **Label fitting needs real text widths.** The TV measures them in the browser (an SVG `getComputedTextLength` pass in a layout effect, like today's card measuring) and then applies the per-table font size. The pure module takes measured widths as input so it stays testable.
- **AI timing:**
  - Lambda timeout goes to 30 s.
  - The server aborts the vision call at 25 s and the browser at 32 s.
  - The topic path keeps its 9 s.

## Phase 1: Data model and drawing geometry

### Overview

Add the columns, copy them into snapshots, expose them in DTOs and APIs, and write the pure geometry. The UI is unchanged in this phase.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261101120000_venue_drawing.sql`

**Intent**: Add the drawing data to the live venue and to snapshots, additively, and make publish copy it.

**Contract**:
- `venue_table.rotation smallint not null default 0`, check 0..359 (degrees clockwise).
- `venue_room.outline_x`, `outline_y`, `outline_w`, `outline_h real null`. All four are null or all four are set; x, y ∈ [0, 1] and w, h ∈ (0, 1].
- `venue_plan.chair_pitch real not null default 0.035`, check 0.005..0.2, as a fraction of the stage width.
- `seating_snapshot.chair_pitch real null` and `seating_snapshot_table.rotation smallint null`. Null means the default, for snapshots published before this migration.
- New `seating_snapshot_room (id identity, snapshot_id → seating_snapshot on delete cascade, room_name text, x, y, w, h real)`, with rows only for rooms that have an outline.
  - Enable RLS, revoke from anon and authenticated.
  - Reset `seating` deletes it through the cascade from `seating_snapshot`. Check that `reset_event` deletes snapshots with DELETE, which cascades.
- `create or replace function public.publish_seating()`:
  - same signature, lock and return value;
  - also copies `rotation`, the plan's `chair_pitch` (or the default when there is no plan) and the outlined rooms;
  - keeps `set search_path = ''` and the revoke/grant.
- New `apply_venue_layout(p_layout jsonb)` (lock 3003, `search_path ''`, revoked from public, anon and authenticated) for Phase 4, in ONE transaction:
  - updates `pos_x`, `pos_y` and `rotation` of listed existing tables;
  - sets or clears room outlines;
  - sets `chair_pitch`;
  - inserts new tables `{ roomId, name, seatCount, shape, x, y, rotation }`.

  Errors: `TABLE_NOT_FOUND`, `ROOM_NOT_FOUND`, unique violations as `DUPLICATE_NAME`, and the existing `MAX_TABLES` check. It never deletes and never updates `seat_count`, `shape` or `name` of existing tables.

#### 2. Types

**File**: `src/db/database.types.ts`, `src/types.ts`

**Intent**: Mirror the schema and extend the DTOs.

**Contract**:
- `TableDto.rotation`.
- `RoomDto.outline: { x, y, width, height } | null`.
- `VenueDto.chairPitch`.
- `SnapshotTable.rotation` (number, defaulted on read), `SeatingSnapshot.chairPitch`, `SeatingSnapshot.rooms`.
- `TvTableDto.rotation`, `TvSeatingDto.chairPitch` and `TvSeatingDto.rooms: [{ name, x, y, width, height }]`.
- `GuestStateDto.drawing: GuestDrawingDto | null` = `{ chairPitch, rooms, tables: [{ name, shape, seatCount, x, y, rotation }] }`, built from the guest's snapshot. Table and room names only; no guest names except via `seat.tablemates`.

#### 3. Services and fingerprints

**File**: `src/lib/venue/service.ts`, `src/lib/seating/service.ts`, `src/lib/seating/published.ts`, `src/lib/guest-links/service.ts`

**Intent**: Read and write the new fields, and keep "up to date" stable across the migration.

**Contract**:
- `updateTable` accepts `rotation`.
- `updateRoom` (renamed from or added next to `renameRoom`) accepts `outline | null`.
- New `setChairPitch`.
- `getSnapshot`/`getLatestSnapshot` default null rotation to 0 and null pitch to `DEFAULT_CHAIR_PITCH`, and read `seating_snapshot_room`.
- Both fingerprints include rotation, pitch and outlined rooms (sorted by name), with null read as the default, so an old snapshot plus untouched live data compares equal.
- `toTvSeating` and `getGuestState` carry the new fields. The guest's `drawing` is read on the 200 path only, with one more query; the token is unchanged because the snapshot id already covers it.

#### 4. Organizer API

**File**: `src/pages/api/o/[key]/tables/[id].ts`, `src/pages/api/o/[key]/rooms/[id].ts`, new `src/pages/api/o/[key]/venue.ts` (PATCH)

**Intent**: Let the editor save rotation, outlines and pitch.

**Contract**:
- `PATCH /tables/<id>` accepts `rotation` (integer, normalized to 0..359).
- `PATCH /rooms/<id>` accepts `{ name?, outline?: {x,y,width,height} | null }`.
- `PATCH /venue { chairPitch }`.

Every answer is the whole `VenueDto`, and validation errors are in Polish.

#### 5. Pure geometry

**File**: `src/lib/venue/drawing.ts` (+ `drawing.test.ts`)

**Intent**: The single source of where tables, chairs and labels are, in stage units.

**Contract**:
- `tableBody(table, pitch, aspect)` → round `{ cx, cy, r }` | rectangular `{ cx, cy, length, depth, rotation }`.
  - Round: circumference ≈ n × pitch, with a minimum radius.
  - Rectangular: length = ⌈n/2⌉ × pitch, fixed depth ≈ 1.6 × pitch.
- `chairPositions(table, pitch, aspect)` → `[{ seat, x, y, normalX, normalY }]`, numbered exactly as `seats.ts`:
  - round seat 1 at the top (12 o'clock before rotation), clockwise;
  - rectangular side A along the top edge left→right, side B along the bottom edge left→right, so seat p faces seat a+p;
  - everything rotated by `rotation` about the centre.
- `labelAnchor(chair, offset)` → `{ x, y, baseline: "auto" | "hanging" | "middle" }`.
- `fitTableFont(chairs, measuredWidths, maxFont, minFont)` → one font size per table such that neighbouring labels (side neighbours) do not overlap; `minFont` floors it.
- `fitStage(aspect, viewport)` re-exports or reuses `containBox`.

The y axis is scaled by the aspect ratio, so circles stay circular on non-square stages.

### Success Criteria:

#### Automated Verification:

- Migration applies on a fresh local DB and on a local DB loaded with demo data: `npx supabase db reset` then `npm run demo`, then `npx supabase migration up` on a copy taken before.
- After the migration on demo data, `GET /api/o/<key>/seating` reports `upToDate: true` for a board published before it (integration test).
- `drawing.test.ts`:
  - round seat 1 at the top and clockwise order;
  - rectangular seat p opposite a+p, odd n, n = 2;
  - rotation 90° maps top to the right;
  - chair order agrees with `sideNeighbours` and `oppositeSeat` for n = 2..20;
  - `fitTableFont` shrinks for long names and respects `minFont`.
- Integration tests:
  - `publish_seating()` copies rotation, pitch and outlined rooms;
  - `apply_venue_layout` updates existing rows in place (seat assignments and pins survive) and refuses unknown ids and duplicate names without partial writes;
  - nothing is ever deleted.
- `npm run lint`, `npx astro check`, `npm test` pass.

#### Manual Verification:

- None (no UI change yet).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Drawn plan on the TV and the guest phone

### Overview

One SVG renderer replaces the photo, the pins and the name cards on the TV, and the photo pin on the phone.

### Changes Required:

#### 1. Shared renderer

**File**: `src/components/venue-drawing/VenueDrawing.tsx`

**Intent**: Draw rooms, tables, chairs and names from a drawing DTO in a `viewBox`.

**Contract**: Props:
- `{ aspect, chairPitch, rooms, tables (with seats: [{ seat, name }]), highlight?: { table, seat }, focusTable?, variant: "tv" | "phone" | "editor" }`.

Rendering:
- Rooms: thin outline with the name at the top-left inside.
- Tables: filled body with the table name in the middle.
- Chairs: small circles. Occupied chairs are filled; empty ones are an outline only.
- Names: horizontal, centred on `labelAnchor`, with the per-table font size from a measuring layout effect.

Colours follow the TV's dark theme. The phone uses the app tokens.

#### 2. TV

**File**: `src/components/tv/TvSeatingView.tsx`

**Intent**: Use `VenueDrawing` instead of `<img>`, dots and `TableCard`.

**Contract**:
- The photo is still loaded (hidden, `aria-hidden`) only to read its natural size, keyed by `planVersion`. Without a plan, the stage is 16:9.
- The spotlight layer (`z-20`), the offline badge and the "before publish" screen are unchanged.
- Remove `TableCard.tsx` and `layoutCards` (with its tests), and keep `containBox`.

#### 3. Guest phone

**File**: `src/components/guest/GuestSeatView.tsx`

**Intent**: Replace the photo-and-pin block with `VenueDrawing variant="phone"`, cropped or zoomed so the guest's table is large, with the guest's chair highlighted and the tablemates' names at their chairs.

**Contract**:
- Uses `state.drawing` and `state.seat`.
- Names come only from `seat.tablemates` plus the guest's own name.
- „Nowe miejsce!” and polling are unchanged.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Follow the DTO changes and keep the guardrails.

**Contract**:
- `TvSeatingDto` and `GuestStateDto` key sets updated.
- Guest `drawing` carries no guest names, ids or keys.
- The TV page HTML still carries no organizer data.

### Success Criteria:

#### Automated Verification:

- `npm test`, `npm run lint`, `npx astro check` pass.
- `npm run smoke` passes on a fresh local DB (mock AI).
- `dist/server` still does not contain `qrcode`, and no new dependency is in `package.json`.

#### Manual Verification:

- Seed the demo, give tables rotations and room outlines through the API, and publish. A 1920×1080 screenshot of `/tv/<key>` shows every name readable and centred over its chair, with no overlaps between labels of the same table.
- A table with seats 1..n: names follow the same order as `/o/<key>/rozsadzenie` lists them, and opposite seats face each other.
- Phone (~360 px): the guest sees the drawing with their table large and their chair highlighted. No other table's names appear.
- An old snapshot (published before Phase 1) renders with defaults and the board says up to date.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Drawing editor on /sale

### Overview

The organizer redraws the venue over the photo.

### Changes Required:

#### 1. Editor canvas

**File**: `src/components/venue/DrawingCanvas.tsx` (replaces `PlanCanvas.tsx`), `src/components/venue/VenueEditor.tsx`

**Intent**: The photo at reduced opacity under `VenueDrawing variant="editor"` (tables as draggable groups, rooms as resizable rectangles), keeping today's modes (click empty → "Nowy stolik" there, click a table → edit).

**Contract**:
- **Mouse:**
  - Pointer drag moves a table and saves on release (PATCH x, y).
  - A rotate handle snaps to 15°, or free with Shift.
- **Keyboard:**
  - On a selected table, arrows move it, `[`/`]` rotate ±15° (Shift ±1°), and Esc deselects.
- **Rooms:**
  - Draw an outline by drag in "Rysuj salę" mode for the selected room.
  - Move and resize it with corner handles.
- **Venue-wide controls:**
  - A „Skala krzeseł” slider with a debounced save.
  - „Podgląd jak na TV” hides the photo and shows example names on empty chairs.
- **Narrow screens:** `TableForm` gains `x`, `y`, `rotation` number fields; `RoomsSection` gains outline fields.
- **Saving:** every save uses the existing `useVenue.send`. A failed save restores the last saved geometry. The seat-loss confirmations are unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests for the pure editor helpers:
  - pointer → stage fraction with clamping;
  - rotation from a handle angle with snapping;
  - outline from two corners, normalized.
- `npm test`, `npm run lint`, `npx astro check`, `npm run smoke` pass.

#### Manual Verification:

- On a laptop, redraw the demo venue over its photo:
  - drag, rotate (handle and keys), draw and resize the three room outlines, change the scale;
  - reload, and everything stays.
- „Podgląd jak na TV” matches the TV after „Opublikuj”, and the TV does not change before publishing.
- On a phone, the number fields change a table's position and rotation.
- Seat assignments and pins are untouched by any geometry edit.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: AI layout proposal from the photo

### Overview

Sonnet 5.5 reads the uploaded plan photo and proposes the drawing. The organizer reviews a draft and applies it.

### Changes Required:

#### 1. Vision provider

**File**: `src/lib/venue-ai/` (`prompt.ts`, `schema.ts`, `match.ts`, `mock-provider.ts`, `anthropic-provider.ts`, `config.ts`, `service.ts`, tests)

**Intent**: One call that turns an image and the current venue (table names, shapes, seat counts, pins; room names; no guest data) into a proposal.

**Contract**:
- `proposeLayout(image: { mimeType, bytes }, venue)` → `{ chairPitch, rooms: [{ name, outline }], tables: [{ name, shape, seatCount, x, y, rotation }] }`, or an `AiProviderError` with the existing kinds and Polish hints.
- **Anthropic adapter:**
  - same plain-`fetch` style as `anthropic-provider.ts`;
  - model constant `VENUE_VISION_MODEL = "claude-sonnet-5-5"`, `output_config: { effort: "low", format: { type: "json_schema", schema } }`;
  - image as a base64 block;
  - 25 s abort;
  - the output is validated with zod and clamped to valid ranges;
  - returns `usage` for the cost estimate.
- **Mock:** returns a deterministic grid layout of the current tables, plus one new table and outlines, after 300 ms. No network. It is selected when `AI_PROVIDER=mock`.
- `match.ts` pairs proposed tables with existing ones by name (case-insensitive, normalized), then by nearest pin within a radius, one-to-one. Unmatched proposals become "new". Existing tables left unmatched stay as they are.

#### 2. Endpoint

**File**: `src/pages/api/o/[key]/venue/layout-proposal.ts`, `src/pages/api/o/[key]/venue/layout.ts`

**Intent**: Run the proposal and apply an accepted draft.

**Contract**:
- `POST /venue/layout-proposal`: raw JPEG/PNG/WebP body ≤ 1.5 MB via `readBodyBytes` (sniffed) → 200 `{ proposal: { updates: [{ tableId, x, y, rotation }], newTables: [...], rooms: [{ roomId, outline }], chairPitch }, costNanoUsd }`, 413/415, or 503 `{ error, hint }`.
- `POST /venue/layout` with the accepted subset → `apply_venue_layout` → 200 `VenueDto`, or 409/400 with a Polish message.
- Both are organizer-only (TV and guest keys get 404).

#### 3. Editor UI

**File**: `src/components/venue/LayoutProposal.tsx`, `src/components/hooks/useLayoutProposal.ts`, `VenueEditor.tsx`

**Intent**: The button „Zaproponuj układ ze zdjęcia (AI)” opens a draft. It shows ghost tables and outlines on the canvas and a list of changes: „Stolik 3: przesunięty, obrót 90°”, „Nowy stolik „Okno 2” (8 miejsc, Sala A)”, „Sala A: kontur”, „Skala: 0,04”. Each line has a checkbox, and the new tables have editable name, room and seat count. „Zastosuj zaznaczone” and „Odrzuć” close it.

**Contract**:
- The browser draws the plan image to a canvas, downscales the long edge to ≤ 1568 px, encodes JPEG at quality 0.85 and POSTs the bytes.
- 32 s client abort, with a pending state „AI czyta zdjęcie… (do 30 s)”.
- The cost of the call is shown („≈ 0,02 USD”).

#### 4. Infra and docs

**File**: `scripts/lib/aws-deploy.mjs`, `tests/scripts/aws-deploy.test.ts`, `CLAUDE.md`, `README.md`

**Intent**: Raise the Lambda timeout and document the feature, the deploy order and the republish note.

**Contract**:
- `TIMEOUT_SECONDS = 30`.
- The CLAUDE.md architecture section documents the drawing (geometry contract, DTOs, editor, AI path).
- The README „Plan sali” section is in Polish.

### Success Criteria:

#### Automated Verification:

- Unit tests:
  - the schema and zod parse with clamping;
  - matching by name, then by nearest pin, one-to-one, with no match for a far pin;
  - the anthropic adapter with injected `fetch` stubs (request shape incl. image block and `output_config.format`, refusal, `max_tokens`, 402/`billing_error`, 429, timeout).
- Integration: apply a proposal on demo data. Moved tables keep their seat assignments and pins, new tables are added, and a duplicate name or `MAX_TABLES` refuses everything.
- Smoke (mock):
  - the proposal endpoint answers with the mock layout;
  - TV and guest keys get 404;
  - an oversized or non-image body gets 413/415;
  - applying it leaves `/seating` showing unpublished changes, and publishing makes the TV show the new rotation.
- `tests/setup/no-ai-network.ts` still blocks every test call. `npm test`, `npm run lint`, `npx astro check`, `npm run package:lambda` pass.

#### Manual Verification:

- With the real key locally (one or two paid calls, cents), upload the real venue photo. The proposal places tables roughly right within ~30 s, the draft lists the changes, unticking a line skips it, and „Zastosuj” updates the drawing without touching seat assignments.
- A refused or failed call shows a Polish message and changes nothing.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Geometry: seat order versus `seats.ts` for n = 2..20 and both shapes, rotation, aspect scaling, label anchors and font fitting.
- Fingerprints: an old snapshot (null fields) versus a fresh live venue with defaults → equal; any rotation, outline or pitch change → not equal.
- Editor helpers (pointer → fraction, snapping, outline normalization).
- AI: prompt contains no guest names, schema parse and clamp, matching, adapter error mapping.

### Integration Tests:

- Migration on demo data keeps `upToDate`.
- Publish copies the new fields.
- `apply_venue_layout` is atomic, in place, and never deletes.
- `getGuestState` drawing has no guest names.

### Manual Testing Steps:

1. Deploy order on prod: dump → `db push` → `deploy:aws` → the TV still shows the old arrangement drawn with defaults.
2. Redraw over the photo (AI proposal, then corrections), then „Opublikuj” → the TV shows names at the chairs.
3. Phone of a seated guest: their chair is highlighted, and there are no other tables' names.

## Performance Considerations

- The TV poll stays 204 when nothing changed. The 200 path reads `seating_snapshot_room` (a handful of rows) in addition.
- The guest 200 path adds one query for the snapshot tables and rooms, without names.
- SVG with about 60 chairs and 60 labels renders cheaply. Label measuring runs once per TV update.

## Migration Notes

- The migration only adds columns and tables; it replaces `publish_seating()` with the same signature and adds `apply_venue_layout()`.
- Before `db push`, the user takes `npx supabase db dump --data-only -f ~/kolacja-backup-<date>.sql`.
- Optionally I test the migration locally on that dump first.
- Order: `db push`, then `deploy:aws` (the Lambda timeout change is applied by the same deploy), then reload the TV.
- Rollback: the old app ignores the new columns, so redeploying the previous build is safe without touching the DB.

## References

- Seat contract: `src/lib/venue/seats.ts:7-14`.
- Snapshot publish: `supabase/migrations/20261027014210_create_seating.sql:197`.
- Fingerprints: `src/lib/seating/published.ts:39-102`.
- TV layout today: `src/components/tv/TvSeatingView.tsx:82-160`.
- AI adapter pattern: `src/lib/ai-topics/anthropic-provider.ts`.
- Lambda timeout: `scripts/lib/aws-deploy.mjs:14`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model and drawing geometry

#### Automated

- [x] 1.1 Migration applies on a fresh DB and on demo data
- [x] 1.2 A board published before the migration stays up to date
- [x] 1.3 drawing.test.ts covers seat order, rotation and font fitting
- [x] 1.4 Integration: publish copies the new fields; apply_venue_layout is atomic and in place
- [x] 1.5 Lint, astro check and tests pass

### Phase 2: Drawn plan on the TV and the guest phone

#### Automated

- [ ] 2.1 Tests, lint and astro check pass
- [ ] 2.2 Smoke passes on a fresh DB
- [ ] 2.3 No new dependency; qrcode still not in dist/server

#### Manual

- [ ] 2.4 1920×1080 TV screenshot: names readable and centred over chairs
- [ ] 2.5 Name order matches the seat numbering
- [ ] 2.6 Phone shows the drawing with the guest's chair highlighted and no other tables' names
- [ ] 2.7 An old snapshot renders with defaults and stays up to date

### Phase 3: Drawing editor on /sale

#### Automated

- [ ] 3.1 Editor helper unit tests
- [ ] 3.2 Tests, lint, astro check and smoke pass

#### Manual

- [ ] 3.3 Redraw the demo venue on a laptop; it survives a reload
- [ ] 3.4 TV preview matches the TV after publish; the TV is unchanged before publish
- [ ] 3.5 Phone number fields edit position and rotation
- [ ] 3.6 Geometry edits never touch seat assignments or pins

### Phase 4: AI layout proposal from the photo

#### Automated

- [ ] 4.1 Schema, matching and adapter unit tests
- [ ] 4.2 Integration: applying a proposal is in place and atomic
- [ ] 4.3 Smoke covers the proposal and apply endpoints on the mock
- [ ] 4.4 No AI network in tests; lint, astro check, tests and package:lambda pass

#### Manual

- [ ] 4.5 Real photo with the real key gives a usable draft within ~30 s
- [ ] 4.6 A failed AI call shows a Polish message and changes nothing
