# Guest search on the venue map (S-22) Implementation Plan

## Overview

FR-048 / US-08: everyone who sees the FULL venue map on a device with a keyboard — the guest on their phone, the
client, the staff (floor, per-event waiter) and the restaurant tablet — types part of a guest's name and the map lights
up that guest's seat. The TV has no search. The search runs only over the names the viewer's browser already holds
(the published snapshot): no new data, routes, poll tokens or DTO fields.

## Current State Analysis

- The venue is drawn by ONE component, `src/components/venue-drawing/VenueDrawing.tsx`, used by the guest's phone
  (`GuestSeatView.tsx`: own table + „Pokaż plan sali ze wszystkimi” → `VenueMap`), the order pages' plan
  (`src/components/orders/ServingPlan.tsx`), the TV (`TvSeatingView.tsx`) and the venue editor (`DrawingCanvas.tsx`).
  It already has two highlight mechanisms: `highlight` (the guest's own chair, red) / `VenueDrawingTable.highlighted`
  (own table, red ring) and `marks: DrawingMark[]` (serving-highlight: red pulsing chair / table marks with labels).
- `ServingPlan` is rendered by `RestaurantView` (`/r/<key>`) and `OrderManager`, which itself is on the client's
  `/o/<key>/zamowienia`, the panel preview `/panel/wydarzenia/<id>/zamowienia`, the floor `/panel/obsluga/<id>` and the
  per-event waiter's floor `/kelner/sala/<id>`. All of them draw `TvSeatingDto` built from the LATEST PUBLISHED
  snapshot (`RestaurantViewDto.seating`, `OrderBoardDto.seating`).
- The guest's whole-venue map draws `GuestDrawingDto.tables[].seats` (published names) plus its own table from
  `seat.tablemates` and the guest's current name (`SeatDrawing` in `GuestSeatView.tsx:243`). `VenueMap` mounts only
  after the toggle click, so nothing inside it is in the server-rendered HTML.
- A name search already exists: `normalizeSearch` / `findGuestSeats` in `src/lib/offline/readout.ts:55-80` (NFD marks
  stripped, `ł` → `l`, lower case, single spaces; substring; Polish name order then natural table order), used by the
  offline readout's „Gdzie siedzi…?” (`OfflineSeating.tsx`) and tested in `readout.test.ts:85-103`.
- `/o/<key>/rozsadzenie` (`SeatingEditor`) does NOT draw the venue (table cards, no `VenueDrawing`).
- `useServingSelection` owns a `window` keydown listener that clears the serving selection on Escape.
- `ReadOnlyFrame.astro` makes the panel previews (staff-preview, support) and the client's pages while the venue leads
  `inert`; support previews render statically.

## Desired End State

- On every page that renders `ServingPlan` with a published seating, and on the guest's phone whenever the guest is
  seated with a drawing, a labelled search field („Znajdź gościa na planie” / „Find a guest on the plan”,
  `data-map-search`) is rendered server-side. Typing part of a name (any case, with or without Polish letters, words in
  any order) lists the matching guests (name — table, seat · room; at most 8 with „i jeszcze N”) and lights their chairs
  on the map in a distinct violet „found” style (pulsing halo + a steady ring around the table) — never the red of the
  guest's own seat or of a serving mark. One hit (or the one picked from the list) is the only one lit; picking it on
  the phone opens the whole-venue map and scrolls to that table. Escape clears, Enter picks the first hit, everything
  works with the keyboard; results are announced in an `aria-live` region; PL + EN.
- The TV page renders no search. Guest and tablet API answers have exactly the fields they had before.
- The offline readout keeps its search, now through the same shared matcher.

Verify: `npm test` (new `src/lib/map-search/search.test.ts`, unchanged `readout.test.ts`), lint, `astro check`, build,
smoke section 38 (markers on `/g/`, `/r/`, `/o/…/zamowienia`, `/panel/obsluga/<id>`, `/kelner/sala/<id>`; none on
`/tv/`; none on `/r/` before the first publish; exact key sets of `/api/g/<key>/state` and `/api/r/<key>/orders`).

### Key Discoveries:

- `src/lib/offline/readout.ts:55` — the matcher to lift into a shared module (one source for the map search, the
  offline readout and later S-27).
- `VenueDrawing.tsx:422-439` — a seat mark wins over the own chair (`mine`) and a label-less mark looks almost like the
  own chair (both red discs with a halo; names `fill-red-700` at :464): a `tone` is needed to keep them apart.
- `VenueDrawing.tsx:144` `mergeMark` — the later mark's fields win; search marks are appended after serving marks.
- `ServingPlan.tsx:36` — `bright` = serving marks' tables or `servingTables`; a found table must be added, else it is
  lit AND faded (`opacity-40`).
- `GuestSeatView.tsx:98-160` — `VenueMap` scrolls to the own table (`anchor` own / point); generalise to any table.
- Every drawing's table key is the table name on the phone; `DrawingMark.table` is matched by name (`VenueDrawing.tsx:293`),
  so a hit's `table` works as mark and scroll target on every surface.

## What We're NOT Doing

- No search on the TV (FR-048) — `TvSeatingView` is untouched.
- No search on `/o/<key>/rozsadzenie`: it draws no map (table cards); the client searches on the „Plan sali” of
  `/o/<key>/zamowienia`.
- No search in the venue editor's „Podgląd jak na TV” (`DrawingCanvas`): an editing tool whose names are the working
  arrangement or example names.
- No change to `ReadOnlyFrame`: where a page is `inert` (panel preview while the client leads, support mode, the
  client's page while the venue leads) the field is rendered but not usable, like every other control there. The
  staff's day-of surfaces (`/panel/obsluga/<id>`, `/kelner/sala/<id>`) and the tablet are not framed.
- No working-arrangement search: every surface searches the published snapshot it already draws.
- No new API route, DTO field, poll token part, DB migration or dependency; no browser tests.
- Guests who are unseated or before the first publish get no map and so no search (unchanged).

## Implementation Approach

One pure shared matcher (`src/lib/map-search/`), one hook (`useMapSearch`) holding the query and the picked hit, one
presentational component (`MapSearch`) and an optional `tone` on the existing `DrawingMark`. `ServingPlan` wires it
once for five pages; `GuestSeatView` wires it with the input outside the toggled map so it is server-rendered.

## Critical Implementation Details

- **Escape**: clear the search from the component's own `onKeyDown` and call `stopPropagation()` — React's
  `stopPropagation` stops the native event at the root, so `useServingSelection`'s `window` listener does not also
  clear a picked dish. Never add a second `window` listener.
- **Guest scroll target**: picking a hit before the map exists sets `planWanted` / `showVenue`; `VenueMap` must take the
  target as its initial anchor (it measures zoom first, then scrolls with the anchor), and a later target change scrolls
  at the current zoom. A republish that moves the own table still resets the anchor to the own table (existing rule).

## Phase 1: Shared matcher, found marks and the plan's search

### Overview

The pure module, the hook, the component, the `tone` on marks, and the search in `ServingPlan` (tablet, client
orders, panel preview, floor, per-event waiter).

### Changes Required:

#### 1. Shared matcher

**File**: `src/lib/map-search/search.ts` (new), `src/lib/map-search/index.ts` (new barrel), `src/lib/map-search/search.test.ts` (new)

**Intent**: Move `normalizeSearch` here and add `searchSeats` over any table list the viewer already has, with ranking
and multi-word queries; helpers for keys and marks.

**Contract**:
- `normalizeSearch(text): string` (unchanged behaviour; also folds `đ`, `ø`, `ß`, `æ`, `œ` that NFD keeps).
- `interface SearchableTable { name: string; room: string; seats: readonly { seat: number; name: string }[] }` —
  `TvTableDto`, `DrawingTableDto` and `PublishedSeatingDto` tables fit it.
- `interface SeatHit { name: string; table: string; room: string; seat: number }`.
- `searchSeats(tables, query): SeatHit[]` — query split into words; a seat matches when EVERY word is a substring of
  its normalized name; rank 0 when every word starts a word of the name (words split on spaces and hyphens), else 1;
  then Polish name order, `compareTableNames`, seat. Empty / blank query → `[]`. Returns all hits (callers slice).
- `MAP_SEARCH_LIMIT = 8`, `seatHitKey(hit)` (`table\u0000seat`), `searchMarks(hits)` →
  `{ table, seat, label: null, done: false, tone: "search" }[]`, `hitTables(hits)` → `Set<string>`.

**File**: `src/lib/offline/readout.ts`, `src/lib/offline/index.ts`

**Intent**: `normalizeSearch` re-exported and `findGuestSeats(seating, query)` = `searchSeats(seating.tables, query)`;
`GuestSeatMatch` = `SeatHit`. `OfflineSeating.tsx` and `readout.test.ts` keep working unchanged. Accepted side effect:
the offline readout now also takes words in any order and lists word-prefix hits first (same rule everywhere).

#### 2. Texts

**File**: `src/lib/map-search/messages.ts` (new)

**Intent**: `mapSearchMessages = defineMessages(pl, en)`: label, placeholder, the published-snapshot note, results
heading for screen readers, count („Znaleziono 3 osoby” with `pluralPl` / `pluralEn`), not found (with the query),
„i jeszcze N — wpisz więcej liter”, a hit's line and its button label („Pokaż na planie: …”), the picked announcement
(„Basia: Stolik 3, miejsce 4, Sala główna” via `seatLabel`), clear button.

#### 3. Found marks in the drawing

**File**: `src/components/venue-drawing/VenueDrawing.tsx`

**Intent**: Extend the existing marks with a tone instead of a second mechanism; keep the own seat red and serving red.

**Contract**: `DrawingMark.tone?: "serving" | "search"` (absent = serving). Search tone: violet halo
(`fill-violet-500/30 motion-safe:animate-pulse`), violet badge (`fill-violet-600 stroke-white`), the name in
`fill-violet-700` bold, and a steady violet ring around the table body when the table has a search seat mark and no
table mark / own-table ring. `mergeMark`: tone `search` when either is, `done` false for a search tone.

#### 4. Hook and component

**File**: `src/components/hooks/useMapSearch.ts` (new), `src/components/map-search/MapSearch.tsx` (new)

**Intent**: The hook keeps the query and the picked hit; the component renders the field, the live summary and the
hit buttons.

**Contract**:
- `useMapSearch(tables)` → `{ query, setQuery, hits, shown, more, active, pick, clear, marks, foundTables }`; `active` =
  the picked hit while it is still among the hits, else the only hit, else null; `marks` = `searchMarks(active ? [active]
  : shown)`; `setQuery` drops the pick.
- `<MapSearch search locale note? onPick? className? />`: wrapper `data-map-search`, `<label>` + `Input type="search"`
  (`autoComplete="off"`, `enterKeyHint="search"`), `aria-describedby` the note, Enter = pick the first shown hit,
  Escape anywhere inside = clear + focus the field (stopPropagation), `aria-live="polite"` summary, `<ul>` of buttons
  (`aria-pressed`) for `shown`, then the „more” line.

#### 5. Search on the order pages' plan

**File**: `src/components/orders/ServingPlan.tsx`

**Intent**: The search above the drawing while a seating is published, with the published-snapshot note; marks =
serving marks then search marks; `bright` = (serving marks' tables or `servingTables`) ∪ found tables.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, incl. the new matcher tests and the unchanged offline readout tests: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`

#### Manual Verification:

- On `/r/<key>` and `/o/<key>/zamowienia` typing a name lights its chair violet, distinct from a picked dish's red
  marks; Escape clears only the search; Tab/Enter work without a mouse

**Implementation Note**: unattended run — manual rows are left for the user (overnight brief).

---

## Phase 2: Guest phone, smoke, documentation

### Overview

The guest's phone gets the search (server-rendered, opens and scrolls the whole-venue map), smoke section 38 proves the
markers and unchanged API shapes, CLAUDE.md documents the slice.

### Changes Required:

#### 1. Guest phone

**File**: `src/components/guest/GuestSeatView.tsx`

**Intent**: `SeatDrawing` runs `useMapSearch(tables)` over exactly the tables it draws and renders `MapSearch` under the
„Pokaż plan sali ze wszystkimi” button (so it is in the SSR HTML). Picking a hit (click or Enter) opens the map
(`planWanted`, `showVenue`) and makes that hit's table the scroll target. Both drawings get the search marks.

**Contract**: `VenueMap` gains `marks` and `target: string | null` (table name) = the table of `search.active` (the
picked hit, or the only hit), so a single hit while the map is open scrolls too; only an explicit pick (click or Enter)
OPENS a closed map. `ZoomAnchor` gains `{ kind: "table"; key }` (own = the own table key); the initial anchor is the
target when set; a changed non-null target scrolls to that table at the current zoom; a target going back to null
leaves the view where it is; „Mój stolik” and the republish rule unchanged.

#### 2. Smoke section 38

**File**: `scripts/smoke.mjs`

**Intent**: A self-contained section like 35–37: a today event of A (panel), two guests, a room and a table, `/r/` page
before publishing without the marker, seat both, publish, guest links on, a per-event waiter redeemed; the marker
`data-map-search` on `/g/<key>`, `/r/<key>`, `/o/<key>/zamowienia`, `/panel/obsluga/<id>` (owner), `/kelner/sala/<id>`
(waiter cookie); `/tv/<key>` renders the seated names but no marker; the key sets of `/api/g/<key>/state` (top level,
`seat`, `drawing.tables[]`, its `seats[]`) and `/api/r/<key>/orders` (top level, `seating`) equal the known lists —
from `src/types.ts`: state `drawing guess modules name orders planVersion seat status version`; seat
`room seat seatCount shape table tablemates x y`; drawing table `name room rotation seatCount seats shape x y`; seat
`name seat`; tablet `placement prep seating totals version`; seating `chairPitch planVersion publishedAt rooms tables
version` (run the section once BEFORE the UI changes are built, or confirm against these lists, so the check proves
"unchanged" rather than "whatever it is now"); the event deleted.

#### 3. Documentation

**File**: `CLAUDE.md`

**Intent**: A „Map search (guest-map-search, S-22)” entry (module, hook, component, surfaces and their source, marks'
`tone`, what is not searched, smoke 38), the offline readout's search pointing to the shared matcher, `npm run smoke`'s
section list extended.

### Success Criteria:

#### Automated Verification:

- Tests with the local DB pass: `AI_PROVIDER=mock npm test`
- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`
- Smoke passes against `AI_PROVIDER=mock npm run preview`, incl. section 38: `npm run smoke`
- Demo still fills the local app: `npm run demo`

#### Manual Verification:

- Guest phone: the field lists hits before the map is open; picking one opens „Pokaż plan sali ze wszystkimi” and
  scrolls to the hit; the own chair stays red, the hit is violet; a screen reader announces the results

**Implementation Note**: unattended run — manual rows are left for the user (overnight brief).

---

## Testing Strategy

### Unit Tests:

- `normalizeSearch`: case, Polish marks, `ł`, extra spaces.
- `searchSeats`: a guest found without Polish letters; several hits listed (Polish order); words in any order
  („kow an” → „Anna Kowalska”); word-prefix hits before substring hits („an” → „Anna …” before „Joanna …”); blank query
  → nothing; an empty table list; ties by table (natural order) and seat.
- `searchMarks` / `seatHitKey` / `hitTables` shapes.

### Integration Tests:

- None (no DB code). HTTP and page behaviour in smoke section 38.

### Manual Testing Steps:

1. `npm run demo`, open the printed guest link on a phone width, type „an”, pick a hit → the map opens at that table.
2. On `/r/<key>` pick a dish, then search a guest: red serving marks and a violet hit together; Escape clears the search
   only; Escape again clears the dish.
3. `/tv/<key>`: no field.

## Performance Considerations

At most 150 names: matching is a linear scan per keystroke (microseconds); no debounce needed.

## Migration Notes

None (no migration, no API change).

## References

- `src/lib/offline/readout.ts:55` (matcher), `src/components/venue-drawing/VenueDrawing.tsx:144,422-479` (marks),
  `src/components/orders/ServingPlan.tsx`, `src/components/guest/GuestSeatView.tsx:72-215`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared matcher, found marks and the plan's search

#### Automated

- [x] 1.1 Unit tests pass, incl. the new matcher tests and the unchanged offline readout tests — 829534d
- [x] 1.2 Lint passes — 829534d
- [x] 1.3 Type check passes — 829534d
- [x] 1.4 Build passes — 829534d

#### Manual

- [ ] 1.5 On `/r/<key>` and `/o/<key>/zamowienia` typing a name lights its chair violet, distinct from serving marks; Escape clears only the search; keyboard only works

### Phase 2: Guest phone, smoke, documentation

#### Automated

- [x] 2.1 Tests with the local DB pass — c86ecd3
- [x] 2.2 Lint, type check and build pass — c86ecd3
- [x] 2.3 Smoke passes incl. section 38 — c86ecd3
- [x] 2.4 Demo still fills the local app — c86ecd3

#### Manual

- [ ] 2.5 Guest phone: hits listed before the map opens; picking opens and scrolls the map; own chair red, hit violet; screen reader announces results
