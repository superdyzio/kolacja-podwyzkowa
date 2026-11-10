# Room prints (S-24) Implementation Plan

## Overview

FR-038: the client (`/o/<key>`) and the venue (owners and managers in the panel) print four things for the room, each with the restaurant's and the event's brand (S-18, white-label): (a) a „Znajdź swój stolik” board (guests A→Z → table and room; A4 or an A3 poster), (b) table cards (the table name large, optionally the names seated there; folded tent or flat), (c) place cards („winietki”) in three formats (two folded, one flat) laid out on A4 with cut and fold lines, (d) the staff list per table (seat → name → diets and the diet note). Waiters on the floor (the staff floor and the per-event waiter) print the staff list too. Every print is an HTML page in the v1 QR-card pattern (`/o/<key>/karteczki`): A4/A3 sheets in mm, `@page { margin: 0 }`, a screen-only toolbar, no islands.

## Current State Analysis

- The print pattern exists once: `src/pages/o/[key]/karteczki.astro` — server-rendered fixed-size sheets (`210mm × 297mm`, print height 296 mm to avoid a blank page), `@page { size: A4; margin: 0 }` so browsers have no room for a header with the URL, `print-color-adjust: exact`, a `print:hidden` toolbar with a `data-print` button calling `window.print()`, `languageSwitch={false}`, the brand via `getEventBranding` + `logoUrl("/api/o/<key>/branding", …)` and a colour stripe (`border-top`). It echoes the organizer key (back link, logo URLs) and the guests' keys (QR) by design.
- Data: the latest published snapshot (`getLatestSnapshot`, `src/lib/seating/service.ts:276`) holds only PRESENT guests at publish time; `toPublishedSeating` (`src/lib/seating/published.ts:163`) turns it into `PublishedSeatingDto` (tables by room then `compareTableNames`, seats `{ seat, name }`, no ids except `snapshotId`). `isUpToDate(snapshot, { guestList, venue, assignments })` (`published.ts:120`) drives „nieopublikowane zmiany”.
- Diets: `dietBoard(snapshot, guests)` (`src/lib/diets/board.ts`) joins snapshot seats with live guest rows (present guests WITH a diet only) → `DietBoardDto { tables, unplaced, counts, guests }`; `dietSeatLookup(board)` gives the diet at `(table name, seat)` (table names are unique per event). `DietBadges` (`src/components/diets/DietBadges.tsx`) renders tags (allergies red with „!”) and the note; it renders statically without hydration.
- Guards: client pages — the middleware checks `/o/<key>/**` (any depth) and pages re-check with `accessFor(locals, "organizer")`; panel — `findPanelEvent(locals, id, EVENT_STAFF_ROLES)` (one call per page; support mode logs one `access` row per call; templates, waiters, other restaurants, malformed and unknown ids → null); floor — `findFloorEvent` (members incl. waiters, today's window, no support); per-event waiter — `findWaiterFloorEvent`. Every guard purges an event past its retention term before answering (S-26), so a purged event simply has no snapshots and no guests.
- Panel logos: the dispatcher `/api/panel/events/<id>/klient/branding/logo?kind=` runs the client's logo route for `EVENT_STAFF_ROLES` (`branding/logo` is in `CLIENT_ROUTE_PATTERNS`); in support mode each image load would be one more logged read (S-18 renders support views WITHOUT logo images).
- Language: `LanguageSwitch` links are query-only (`?lang=en`) and the middleware redirects to the same address without `lang` but KEEPS the other parameters (`src/middleware.ts:187`).
- The panel's `/panel/wydarzenia/<id>/<sekcja>` (`[sekcja].astro`) serves `CLIENT_SECTIONS` previews; a deeper route `/panel/wydarzenia/[id]/wydruki/[kind].astro` does not collide with it.
- Polish collation (`Intl.Collator("pl")`) orders Ą after A, Ł after L, Ż after Ź, and É among the E's (checked with node).

## Desired End State

- The client shell has a card „Wydruki dla sali” → `/o/<key>/wydruki` (hub): the publication state, one entry per print with its formats, and the existing QR cards.
- `/o/<key>/wydruki/<kind>` with kind `tablica | karty-stolow | winietki | lista-obslugi` renders the print sheets from the latest published seating with the brand; a screen-only toolbar has the back link, the format choice, PL/EN links that keep the format, the print button and the notes (unpublished changes since the last publish; nothing published yet; guests' data deleted). The HTML of a client print contains NO link key at all (relative links, a key-free logo route `/o/<key>/wydruki/logo`).
- Owners and managers print the same four from `/panel/wydarzenia/<id>/wydruki/<kind>` (linked from a „Wydruki dla sali” section on the event card); the platform admin in support mode reads them too (logged, no logo images, the support banner on screen).
- Waiters print the staff list from their floor: `/panel/obsluga/<id>/lista-obslugi` (members in the floor window) and `/kelner/sala/<id>/lista-obslugi` (the per-event waiter), linked from the floor pages.
- Diets appear ONLY on the staff list. No prices, no ids anywhere in a print.
- Verified by unit tests (format parsing, sorting, letter headings, column and page split, sheet math, staff list pagination, brand), an integration test (the loader: published seating, `upToDate`, diets only on request, isolation), smoke section 44, the demo (fails unless the staff list shows a demo diet and the board a demo guest).

### Key Discoveries:

- `src/pages/o/[key]/karteczki.astro` — the print pattern to copy (sheet CSS, print height 296 mm, `data-print` script).
- `toPublishedSeating` (`src/lib/seating/published.ts:163`) already gives key-free, id-free tables in the right order; `dietBoard` + `dietSeatLookup` (`src/lib/diets/board.ts`) give the diets per published seat.
- `getSeatingBoard` (`src/lib/seating/service.ts:316`) shows how `upToDate` is computed from four reads.
- `formatEventDate` / `formatDateTime` (`src/lib/events/dates.ts:103,170`) for the date and the publication time.
- `logoOfEventResponse(db, eventId, request, locale)` (`src/lib/branding/image-response.ts`) answers a logo for an event the guard opened — reusable for the key-free page-area logo route.
- `findPanelEvent` / `findFloorEvent` (`src/lib/panel-api.ts:143,272`), `findWaiterFloorEvent` (`src/lib/waiter-api.ts:25`).
- Smoke helpers: `staffCall`, `waiterCall`, `isNoAccessPage`, `enterSupport` / `endSupportOf`, `addWaiter` / `enterFloor`, the section-42 setup recipe (`scripts/smoke.mjs:10347`).

## What We're NOT Doing

- No migration and no new JSON API: pages read through services. The only new route is a GET image route in the client's PAGE area (`/o/<key>/wydruki/logo`) so a print's HTML carries no key.
- No stored print settings: formats are query parameters, validated and normalized, an unknown value falls back to the default.
- No QR codes on the new prints (the v1 QR cards stay as they are, linked from the hub).
- No per-table RSVP dish choices on the staff list (S-25 left the tablet counts out too) and no orders, prices or drinks on any print.
- No print from the working arrangement: only the latest PUBLISHED seating (what the TV and the phones show); a screen-only note says when the arrangement changed since.
- No empty seats on the staff list (occupied seats in seat order, „N osób” per table); no seat numbers on the board or the place cards.
- No custom page sizes beyond A4 (A3 for the board poster), no landscape, no pre-perforated stock templates of a specific vendor.
- No print in the platform admin's view of the floor (the admin never works the floor) and no logo images in support mode.
- No `wydruki` entry in `CLIENT_SECTIONS` (it drives the dispatcher and „Praca klienta”): the panel lists the prints in its own section.

## Implementation Approach

Three layers:

1. **Pure models** (`src/lib/prints/`): option parsing per kind; one builder per print over `PublishedSeatingDto` (+ `DietBoardDto` for the staff list only); the sheet math and the pagination in mm/rows units decided on the server, so every printed page is a fixed-size sheet (with `@page { margin: 0 }` normal flow would print edge to edge from page 2 on, and the margin is where browsers print the URL).
2. **One loader** `getRoomPrintSource(db, eventId, { diets })` → the event's name, date and purge state, the branding, the published seating (id-free), `upToDate`, and `DietBoardDto` ONLY when `diets: true` (the staff list).
3. **Astro components** (`src/components/prints/`) render a model with the brand; four page families (client, panel, staff floor, per-event waiter) differ only in the guard, the paths and the logo base.

## Critical Implementation Details

- **No key in a client print's HTML.** Every link on `/o/<key>/wydruki/<kind>` is relative (back `../wydruki`, the unpublished note's `../rozsadzenie`, formats and languages query-only) and the logos come from the relative `./logo?kind=…&v=…` = `/o/<key>/wydruki/logo` (a page-area GET guarded by the middleware like every `/o/<key>/**` path). The smoke scans for the organizer, TV, tablet and guest keys.
- **Page size switch.** `@page` does not take CSS variables and Astro hoists `<style>`: emit `<style is:inline set:html={`@page { size: ${size}; margin: 0 }`} />` from the validated format (A4 or A3) on each print page; the sheets' own sizes come from the model as inline mm.
- **Diets stay on the staff list.** Only the staff list's pages call the loader with `diets: true`; the other builders never receive guest rows.

## Phase 1: Print models, loader and tests

### Overview

Pure option parsing, builders, sheet math, pagination, brand and texts; the loader; unit and integration tests.

### Changes Required:

#### 1. Types

**File**: `src/types.ts`

**Intent**: The print view models next to the other DTOs (no ids, no keys, no prices).

**Contract**: `PrintBrandDto { restaurantName, clientName | null, color | null, textColor | null, restaurantLogo: string | null, clientLogo: string | null }`; `RoomPrintSourceDto { event: { name, date, purgedAt | null }, branding: BrandingDto | null, published: PublishedSeatingDto | null, upToDate, diets: DietBoardDto | null }`; board rows (`{ kind: "letter", letter } | { kind: "guest", name, table, room | null, units }`) and pages (`columns: BoardRowDto[][]`); `TableCardDto { name, room | null, guests: string[] }`; `PlaceCardDto { name, table, room | null }`; `PlaceCardLayoutDto` (page and piece sizes in mm, folded, columns, rows, perPage, offsets); `StaffSeatDto { seat, name, diets, note, units }`, `StaffTableDto { name, room | null, people, counts, seats }`, staff pages of blocks (`summary | table (+ continued) | unplaced (+ continued)`).

#### 2. Options and formats

**File**: `src/lib/prints/options.ts`

**Intent**: The four kinds and their query parameters, parsed leniently (unknown → default) and written back canonically (defaults omitted) for the toolbar links.

**Contract**: `PRINT_KINDS = ["tablica", "karty-stolow", "winietki", "lista-obslugi"]`, `isPrintKind`; `BOARD_FORMATS` `a4` (default, 210 × 297, scale 1) | `a3` (297 × 420, scale √2); `TABLE_CARD_FORMATS` `tent` (default: one table per A4 portrait sheet, two 210 × 148.5 halves, the top one turned 180°, a fold line) | `flat` (two tables per A4 portrait sheet, a cut line); table cards `names=1` shows the seated names (default off); `PLACE_CARD_FORMATS` `tent-90x45` (default, folded 90 × 45, piece 90 × 90) | `tent-95x70` (folded 95 × 70, piece 95 × 140) | `flat-90x50` (flat 90 × 50); `parsePrintOptions(kind, searchParams)` → `PrintOptions` (discriminated by kind); `printQuery(kind, options)` → `""` or `"?format=a3"` etc.

#### 3. Builders

**File**: `src/lib/prints/board.ts`, `table-cards.ts`, `place-cards.ts`, `staff-list.ts`, `brand.ts`

**Intent**: Turn the published seating into the four print models and lay them out on fixed sheets.

**Contract**:
- `boardEntries(published)` → every published seat as `{ name, table, room }`, Polish name order (`Intl.Collator("pl")`), then `compareTableNames` of the table, then the seat; `boardShowsRooms(published)` = more than one distinct room. `boardLetter(name)` = the first character upper-cased when it is a letter of the Polish alphabet (A–Z, Ą Ć Ę Ł Ń Ó Ś Ź Ż), else its base letter (NFD, „É” → „E”), else `#`. `boardPages(entries, showRooms)` → pages of `BOARD_COLUMNS` (3) columns of `BOARD_ROWS` (34) units: a letter heading (1 unit) before each new letter, a guest row 1 unit or 2 when name + table (+ room) exceed `BOARD_ROW_CHARS` (30); a heading never ends a column (it moves to the next one with its first guest), and a column that starts in the middle of a letter repeats its heading.
- `tableCards(published)` → every published table (empty ones too) in the published order with the seated names in seat order; `tableCardSheets(cards, format)` → tent one card per sheet, flat two per sheet; `tableNameSizePt(name, withNames)` (longer names smaller).
- `placeCards(published)` → one card per published seat, by room → table (published order) → seat; `placeCardLayout(format)` — A4 portrait, minimum margin `PLACE_SHEET_MARGIN_MM` (8): columns = ⌊194 / piece width⌋, rows = ⌊281 / piece height⌋, the grid centred (tent-90x45 → 2 × 3 = 6, offsets 15 / 13.5 mm; tent-95x70 → 2 × 2 = 4, 10 / 8.5; flat-90x50 → 2 × 5 = 10, 15 / 23.5); `placeCardSheets(cards, layout)`; `fitFontPt(text, basePt, minPt, charsAtBase)`.
- `staffList(published, diets)` → every published table with its OCCUPIED seats in seat order, each with the diet at that seat from `dietSeatLookup(diets)` (none when the guest has none or was absent), per-table counts in tag order without zeros, plus `diets.unplaced` and `diets.counts`; `staffListPages(list)` → pages of at most `STAFF_PAGE_UNITS` (36): a summary block (2), each table block = 2 header units + its rows (1 unit, 2 when the diet labels and the note pass ~45 characters, 3 above ~90), a block that does not fit the rest of the page starts a new one, a block bigger than a page is split with `continued: true`; the unplaced block last, split the same way.
- `printBrand(branding, logoBase | null)` → `PrintBrandDto` (`logoUrl(logoBase, kind, version)` when there is a logo and a base; null base → names only).

#### 4. Texts

**File**: `src/lib/prints/messages.ts`

**Intent**: Every text PL/EN through `defineMessages`: print titles and descriptions, the hub and the shell card, the panel section, the floor link, toolbar (back, print, hint, format labels, language links), notes (unpublished changes, nothing published, data deleted, nobody seated, no tables), sheet texts (board title „Znajdź swój stolik” / „Find your table”, column headings, „N osób” with `pluralPl`, „Strona X z Y”, „(cd.)”, staff list headings, no diets).

#### 5. Loader

**File**: `src/lib/prints/service.ts`, `src/lib/prints/index.ts`

**Intent**: The one DB read of a print page.

**Contract**: `getRoomPrintSource(db, eventId, { diets }: { diets: boolean })` → `RoomPrintSourceDto | null` (null for an unknown id or a template): in parallel the event row (`name`, `event_date`, `guest_data_purged_at`, filtered `is_template = false`), `getEventBranding`, `getGuestList`, `getVenue`, `getAssignments`, `getLatestSnapshot`; `published = toPublishedSeating(latest)`, `upToDate = isUpToDate(latest, …)`, `diets = diets ? dietBoard(latest, guestList.guests) : null`. `index.ts` re-exports the pure modules and the service; islands are not involved.

#### 6. Tests

**File**: `src/lib/prints/prints.test.ts`, `tests/integration/room-prints.test.ts`

**Intent**: Pin the rules the sheets depend on and the loader's reads.

**Contract**: unit — options (each kind's default, every valid value, unknown / repeated / empty → default, canonical query), board (Polish order with Ł / Ą / É / digits, equal names ordered by table, letter headings, column and page split with a heading never last in a column and repeated at a column that starts mid-letter, long rows count 2, rooms only with > 1 room), table cards (empty tables kept, names in seat order, tent 1 and flat 2 per sheet), place cards (order, the three layouts' numbers above, pagination), staff list (every occupied seat, the diet at the right seat, an absent-since-publish guest without a diet, per-table counts, unplaced, pagination split with `continued`), brand (URLs with a base, none without). Integration (`describe.skipIf(!hasLocalDb)`, own test event) — before a publish `published` null; guests with diets, a room, a table, seats, publish → the published tables and names, `upToDate` true, `diets` null without the option and the counts with it; a guest marked absent afterwards → `upToDate` false; another event's id reads only its own (empty) data; a template id → null.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npx vitest run src/lib/prints`
- Integration test passes on the local DB: `npx vitest run tests/integration/room-prints.test.ts`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- The model types carry no ids, keys or prices (read `src/types.ts` additions)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Print pages for the client, the panel and the floor

### Overview

Components for the four prints, the toolbar and the hub list; the client's hub, prints and logo route; the panel's prints and the event-card section; the floor's and the per-event waiter's staff list.

### Changes Required:

#### 1. Components

**File**: `src/components/prints/PrintToolbar.astro`, `PrintBrand.astro`, `FindTableBoard.astro`, `TableCards.astro`, `PlaceCards.astro`, `StaffList.astro`, `RoomPrint.astro`, `PrintLinks.astro`

**Intent**: `RoomPrint` renders one print page body from `{ kind, options, source, brand, paths: { back, backLabel, seating | null }, support | null, locale }`: the `@page` style (A4, or A3 for the board poster), the `print:hidden` toolbar (`PrintToolbar`: back link, title, hint, the format choice as links with `aria-current`, PL/EN links keeping the options, the print button `data-print`, the notes, the support banner when given) and the sheets of the kind's component. `PrintBrand` = the restaurant's logo or name and the client's logo and/or name, the event name and date, on the sheet; the colour as a stripe (`print-color-adjust: exact`). Sheets copy the karteczki CSS rules (mm sizes from the model, screen shadow, print height 1 mm less, `break-after: page`), classes prefixed `rp-`. `StaffList` uses `DietBadges` statically. `PrintLinks` lists the four prints with their formats (hub and panel section).

**Contract**: data attributes for the smoke and the demo — `main[data-room-print="<kind>"][data-print-format="<format>"]`, `[data-print-sheet]`, `[data-print-empty="unpublished|purged|nobody|no-tables"]`, `[data-print-unpublished]`, `[data-board-guest]`, `[data-table-card]`, `[data-place-card]`, `[data-staff-seat]`, logos `[data-print-logo="restaurant|event"]`, the hub list `[data-print-links]` with `[data-print-link="<kind>"]`. Names, tables and rooms are DB content (never translated).

#### 2. Client pages

**File**: `src/pages/o/[key]/wydruki/index.astro`, `src/pages/o/[key]/wydruki/[kind].astro`, `src/pages/o/[key]/wydruki/logo.ts`, `src/pages/o/[key].astro`

**Intent**: The hub (publication state, `PrintLinks`, the QR cards link, `OfflineSync` like every organizer page), the print page (`accessFor(locals, "organizer")`, unknown kind → 404 `NoAccess`, `getRoomPrintSource(db, id, { diets: kind === "lista-obslugi" })`, relative paths, logo base `.`, `Layout title={event name} languageSwitch={false}`, no `OfflineSync`), the logo route (GET only, `prerender = false`, `logoOfEventResponse`), and the shell's card „Wydruki dla sali” (`data-prints-card`). Prints are reads: the lead rule and the modules never apply.

#### 3. Panel pages

**File**: `src/pages/panel/wydarzenia/[id]/wydruki/[kind].astro`, `src/pages/panel/wydarzenia/[id].astro`

**Intent**: The panel print page: ONE `findPanelEvent(…, EVENT_STAFF_ROLES)` call, then the loader by `panel.event.id`; logo base = the dispatcher's `${panelClientApiBase(id)}/branding` for members, null in support mode (names only, the support banner in the toolbar, no extra logged reads). The event card gets „Wydruki dla sali” (`data-event-prints`, `PrintLinks` to `/panel/wydarzenia/<id>/wydruki/<kind>`) for members and support mode (it uses the page's existing seating board for the state line).

#### 4. Floor pages

**File**: `src/pages/panel/obsluga/[id]/lista-obslugi.astro`, `src/pages/kelner/sala/[id]/lista-obslugi.astro`, `src/pages/panel/obsluga/[id].astro`, `src/pages/kelner/sala/[id].astro`

**Intent**: The staff list behind `findFloorEvent` / `findWaiterFloorEvent` (no logo images: names and the colour), back to the floor; each floor page links it (`data-floor-print-link`). The S-27 workers of those scopes answer only on network failure, so nothing changes there.

### Success Criteria:

#### Automated Verification:

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Unit and integration tests pass: `AI_PROVIDER=mock npm test`
- Build passes: `npm run build`

#### Manual Verification:

- The four prints look right in Chrome's print preview (A4, no header with the URL, cut and fold lines, the brand stripe), the board also as A3
- A folded place card and a tent table card read the right way up on both sides after folding

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Smoke, demo and documentation

### Overview

Smoke section 44, the demo's print links and checks, CLAUDE.md.

### Changes Required:

#### 1. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Section 44 (room-prints) before `finish()`: a new event of A (panel, today) filled through its client link (two guests, one with a diet tag and a note tagged by the run, a room, a 4-seat table, a draft, a publish).

**Contract**: checks — before the publish the board is 200 with `data-print-empty="unpublished"`; the hub 200 with the four links and the shell's `data-prints-card`; each client print 200 with `data-room-print`, the names / table as expected and NO organizer, TV, tablet or guest key in its HTML; the diet label and the note only on `lista-obslugi` (not on the board, table cards with `names=1`, place cards); formats (`?format=a3` → A3, `?format=flat-90x50`, `?names=1`, `?format=bogus` → the default); EN with `kp-lang=en`; a guest added after the publish → `data-print-unpublished`; an unknown kind → the no-access page; the TV key on `/o/<tv>/wydruki/tablica` → the same 404 as an unknown key; the logo route answers like `/api/o/<key>/branding/logo` (status); the panel prints 200 for owner and manager with `data-event-prints` on the event card; a waiter account, owner B, the admin outside support, event B's id (as the manager of A), a malformed id, an unknown id, a template of A (created and deleted here) and an unknown kind → the no-access page; no session → 303 `/logowanie`; „Lokal prowadzi” on → the client's and the panel's prints still 200; support mode → the staff list 200 with the diet and no `data-print-logo`, then exit; the staff floor list for A's waiter 200 with the diet and linked from the floor, owner B → 404; the per-event waiter's list 200, no cookie → 303 `/kelner`; the event (and its waiter) deleted.

#### 2. Demo

**File**: `scripts/demo.mjs`

**Intent**: Fetch the main event's client board and staff list (no cookie, PL) and fail unless the board shows a demo guest's name and the staff list a demo diet („alergia na orzechy”, Gosia Kowalska), and the board does NOT show the note „celiakia”; print a „Wydruki” block: the hub, the four client prints, the panel's print link and the floor's staff list.

#### 3. Documentation

**File**: `CLAUDE.md`

**Intent**: A „Room prints” bullet under Data access (models, loader, pages, formats, key-free client prints, diets only on the staff list, support and floor rules, tests), the section-44 text in the `npm run smoke` description and the demo addition in `npm run demo`.

### Success Criteria:

#### Automated Verification:

- Full suite passes: `AI_PROVIDER=mock npm test`
- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`
- Smoke passes against `AI_PROVIDER=mock npm run preview`: `npm run smoke`
- Demo passes: `npm run demo`

#### Manual Verification:

- The demo's printed print links open and print as expected

---

## Testing Strategy

### Unit Tests:

- `src/lib/prints/prints.test.ts` — options, the board's order and split, table cards, place-card sheet math, staff list and its pagination, brand.

### Integration Tests:

- `tests/integration/room-prints.test.ts` — the loader against the local DB (publish, up to date, diets on request only, absent after publish, isolation, template).

### Manual Testing Steps:

1. `npm run demo`, open the „Wydruki” links, print preview each print in Chrome (A4, margins none) — no URL header, the brand stripe, cut/fold lines.
2. Print the place cards `tent-90x45`, cut and fold one — the name reads from both sides.
3. Open the board with `?format=a3` and print to A3.

## Performance Considerations

A print page makes the same six reads as the seating board (plus branding); the diets are computed only for the staff list. Sheets are plain HTML, no islands.

## Migration Notes

None (no migration).

## References

- Print pattern: `src/pages/o/[key]/karteczki.astro`
- Diets per seat: `src/lib/diets/board.ts`
- Published seating: `src/lib/seating/published.ts:163`
- Smoke recipe: `scripts/smoke.mjs:10347` (section 42)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Print models, loader and tests

#### Automated

- [x] 1.1 Unit tests pass: `npx vitest run src/lib/prints` — acbd401
- [x] 1.2 Integration test passes on the local DB: `npx vitest run tests/integration/room-prints.test.ts` — acbd401
- [x] 1.3 Type check passes: `npx astro check` — acbd401
- [x] 1.4 Lint passes: `npm run lint` — acbd401

#### Manual

- [ ] 1.5 The model types carry no ids, keys or prices (read `src/types.ts` additions)

### Phase 2: Print pages for the client, the panel and the floor

#### Automated

- [x] 2.1 Type check passes: `npx astro check` — 84c54a2
- [x] 2.2 Lint passes: `npm run lint` — 84c54a2
- [x] 2.3 Unit and integration tests pass: `AI_PROVIDER=mock npm test` — 84c54a2
- [x] 2.4 Build passes: `npm run build` — 84c54a2

#### Manual

- [ ] 2.5 The four prints look right in Chrome's print preview (A4, no header with the URL, cut and fold lines, the brand stripe), the board also as A3
- [ ] 2.6 A folded place card and a tent table card read the right way up on both sides after folding

### Phase 3: Smoke, demo and documentation

#### Automated

- [x] 3.1 Full suite passes: `AI_PROVIDER=mock npm test`
- [x] 3.2 Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`
- [x] 3.3 Smoke passes against `AI_PROVIDER=mock npm run preview`: `npm run smoke`
- [x] 3.4 Demo passes: `npm run demo`

#### Manual

- [ ] 3.5 The demo's printed print links open and print as expected
