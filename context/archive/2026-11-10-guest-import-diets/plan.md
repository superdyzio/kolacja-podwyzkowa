# Guest import and diets at the seat (S-23) Implementation Plan

## Overview

Roadmap S-23 (`guest-import-diets`; PRD v2 FR-035, FR-036, US-07, NFR-021). The client (and the venue's staff through
the S-14 dispatcher while „Lokal prowadzi” is on) imports guests from a CSV file or a spreadsheet paste (name, diet,
notes), sees a preview with every problem per line before an all-or-nothing save, and marks a diet or allergy per
guest on the list (a fixed set of tags + a short note). The kitchen tablet, the waiters (staff floor and the per-event
waiter), the client's order board, the panel previews and the seating editor show the diets at the guest's seat and
in counts. Diets are health data (GDPR art. 9): they never reach other guests, the TV, an AI prompt or a log.

## Current State Analysis

- Guests (`src/lib/guests/`): `guest` rows with `display_name` (1–40, unique per event case-insensitively),
  `is_absent`, `group_id`; `addGuests(db, eventId, names)` is all-or-nothing (duplicates → `duplicates`, over
  `MAX_GUESTS` = 150 → `too-many`, unique-index race → `duplicates`); `parseGuestList` parses a one-name-per-line paste
  with per-line problems (`too-long`, `duplicate`). `POST /api/o/<key>/guests { text ≤ 20 000 }`,
  `PATCH /guests/<id> { displayName?, isAbsent? }` (strict). Every service read selects explicit columns
  (`GUEST_COLUMNS`), never `*`.
- `GuestDto` (organizer-only) travels in `GuestListDto` (guest page, `SeatingBoardDto.guestList`, the panel previews
  through the dispatcher). Guest phones (`GuestStateDto`, `GuestDrawingDto`, tablemates) and the TV (`TvSeatingDto`)
  read ONLY published snapshots (`seating_snapshot_seat.guest_name`), never `guest` columns beyond the name.
- Order surfaces: `OrderBoardDto` (`getOrderBoard` → client `/o/<key>/zamowienia`, panel `zamowienia` preview, staff
  floor `/panel/obsluga/<id>` and per-event waiter `/kelner/sala/<id>` — both floors render `OrderManager floor` on the
  `orders` GET of `FLOOR_ROUTES`), `RestaurantViewDto` (`getRestaurantView` → tablet `/r/<key>`; `version` =
  `fingerprint(JSON.stringify(content))`). Both builders already read `getGuestList` and the latest snapshot.
- `placeOrders` lists only seats whose guest has order lines (`PlacedSeatDto`), so "the diet at the seat" cannot ride
  on the placement: a guest with a diet and no lines would never appear.
- Client routes: `CLIENT_ROUTE_PATTERNS` (`src/lib/client-routes/match.ts`) + `CLIENT_ROUTE_MODULES`
  (`table.ts`); `match.test.ts` compares the list with `src/pages/api/o/[key]/**`. The lead rule (409 `venue-leads` /
  `client-leads`) is automatic for every mutation.
- Smoke section 38 asserts the EXACT key sets of `/api/g/<key>/state` and `/api/r/<key>/orders` against `src/types.ts`.
- AI: `src/lib/ai-topics/prompt.ts` (categories, themes) and `src/lib/venue-ai/prompt.ts` (rooms, tables) take no
  guest data today.

## Desired End State

- `guest.diets text[]` (known tags only) and `guest.diet_note text` (null or 1–120) exist; existing guests have none.
- `/o/<key>/goscie` has „Import z pliku lub arkusza”: a file (`.csv`, `.tsv`, `.txt`) or a paste → „Sprawdź” shows the
  rows to add (name, diet labels, note) and every problem per line → „Dodaj N gości” saves all or nothing. Each guest
  row shows diet badges and a „Dieta” editor (tag checkboxes + note).
- The tablet `/r/<key>`, the client's `/o/<key>/zamowienia`, the panel preview, `/panel/obsluga/<id>` and
  `/kelner/sala/<id>` show „Diety i alergie”: counts per tag (present guests), then every published table → seat →
  name → diets/note, then present guests with a diet but no published seat; the per-seat serving headings carry the
  same badges; a found guest in `MapSearch` on those screens shows the diet next to the hit. The seating editor's
  guest markers show a diet badge.
- Diets never appear in `/api/g/<key>/state`, the guest drawing, tablemates or `/api/tv/<key>/seating` (raw JSON),
  and nothing under `src/lib/ai-topics/` or `src/lib/venue-ai/` can read them (test).
- `npm run demo` imports part of its guests through the new route (a `;` CSV with a header and diets) and prints a
  line; smoke section 39 covers import preview/save, diets on the board/tablet/floor, the leak checks and the
  cross-event denials.

### Key Discoveries:

- `src/lib/guests/service.ts:21` `GUEST_COLUMNS = "id, display_name, is_absent, group_id"` — the one select to extend;
  `addGuests` (`:111`) and `updateGuest` (`:152`) are the only writers.
- `src/lib/orders/service.ts:135` `getOrderBoard` and `:148` `getRestaurantView` already load guests + snapshot:
  diets cost no extra query.
- `src/lib/orders/restaurant.ts:44` the fingerprint hashes `content` — `diets` must be inside `content`.
- `src/lib/client-routes/match.ts:7` + `table.ts` — `guests/import` is a literal 2-segment pattern and wins over
  `guests/:id` (`matchClientRoute` prefers literals); Astro also prefers the static file over `[id].ts`.
- `src/components/seating/GuestMarkers.tsx` — the seating editor's per-guest marker strip (cards and unseated list).
- `src/components/orders/ServingPlan.tsx` + `src/components/map-search/MapSearch.tsx` — shared by the tablet and every
  order board; the hit list is the place for an optional per-seat note.
- `supabase/migrations/20261110230000_event_modules.sql` — the `text[] <@ array[...]` CHECK idiom to copy.

## What We're NOT Doing

- No `.xlsx` (Open Question 7 stays open), no new dependency, no column mapping UI (header auto-detect + positional
  fallback only), no group column (FR-035: groups are made on the list after the import).
- No import that updates existing guests („skip / merge existing”): a name already on the list is a blocking problem,
  exactly like the paste today.
- Unknown diet words are NOT silently moved into the note: they are a blocking problem naming the accepted words.
- The guest never sees a diet, not even their own (guest DTOs and the poll token unchanged).
- No diet in seating snapshots, on the TV, on the guest drawing, in `PublishedSeatingDto` / the offline readout cache.
- No diet marks drawn on the venue drawing (chairs keep names only; diets are listed per table/seat beside it).
- No diet editing for waiters (the floor allowlist `FLOOR_ROUTES` is unchanged) and no diet editing on the tablet.
- No diet counts per dish/course (S-25 will relate dish choice to the guest).

## Implementation Approach

Columns on `guest` (cascades, reset part `guests`, S-26 retention and export come for free). One pure diet module
(`src/lib/diets/`: tags, aliases, normalisation, the per-table/seat board builder S-24 will reuse) and one pure import
parser (`src/lib/guests/import.ts`). One new organizer route `POST /api/o/<key>/guests/import { text, preview? }`:
`preview: true` answers the preview without saving, otherwise it saves all-or-nothing (problems → 400 with the same
preview). The island reads the file in the browser (UTF-8, falling back to Windows-1250 for Polish Excel) and sends
text. Read surfaces get one shared `DietBoardDto` built from the LATEST snapshot's seats joined to LIVE guest rows by
`guest_id` at read time, so nothing published ever carries a diet.

## Critical Implementation Details

- **Migration verification order (brief).** Before writing the migration: build the CURRENT commit, start
  `AI_PROVIDER=mock npm run preview`, run `npm run demo` (populated data), stop the preview. Then add the migration,
  `npx supabase migration up` and compare row counts (guests, events) before/after; later `npx supabase db reset` and
  the full test suite from zero.
- **Deploy order.** `getGuestList` selects the new columns, so the migration must reach the database BEFORE the code
  (else the guest page, seating, orders and the tablet are a 500); it is additive.
- **Counting rule.** Counts and the per-seat list cover PRESENT guests (live `is_absent = false`); seats come from the
  latest snapshot (where people really sit), diets and the name of an unplaced guest from the live row; a snapshot
  seat whose guest was deleted has no diet. Names at seats are the published names (like the TV and the placement).

## Phase 1: Data, rules, import parser, service and routes

### Overview

The migration, the pure diet and import rules, the service changes, the import route, the diet PATCH and the
`diets` boards on the order board and the tablet — all tested without UI.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261111030000_guest_diets.sql`

**Intent**: Add the diet columns to `guest`, additive and data-preserving (existing guests get `'{}'` / null).

**Contract**: `guest.diets text[] not null default '{}'` with CHECKs `guest_diets_known` (`diets <@ array[<the 8
tags>]`) and `guest_diets_size` (`cardinality(diets) <= 8`); `guest.diet_note text null` with CHECK
`guest_diet_note_length` (`diet_note is null or char_length(diet_note) between 1 and 120`); column comments naming
GDPR art. 9 and "never in snapshots, guest or TV answers, AI". No function changes (`reset_event`'s `guests` part
deletes the rows). Tag keys: `vegetarian`, `vegan`, `gluten-free`, `lactose-free`, `nut-allergy`, `seafood-allergy`,
`halal`, `no-pork`.

#### 2. Types

**File**: `src/db/database.types.ts`, `src/types.ts`

**Intent**: Mirror the columns; carry diets on the organizer's guest and on the two order read models.

**Contract**: `guest` Row/Insert/Update gain `diets: string[]` / `diet_note: string | null`. `GuestDto` gains
`diets: DietTag[]` and `dietNote: string | null`. New `DietTag` (from `src/lib/diets/rules.ts`), `DietSeatDto { seat,
guestName, diets, note }`, `DietTableDto { name, room, seats }`, `DietGuestDto { guestName, diets, note }`,
`DietCountDto { tag, count }`, `DietBoardDto { tables, unplaced, counts, guests (present guests with any diet or
note) }` — no ids. `OrderBoardDto.diets: DietBoardDto`, `RestaurantViewDto.diets: DietBoardDto`. Import DTOs:
`GuestImportRowDto { line, name, diets, note }`, `GuestImportPreviewDto { rows, problems: string[] (localized,
"Linia N: …"), header: boolean, separator: "tab" | "semicolon" | "comma" | "none", ready: boolean }`; the save answer
is `{ added, ...GuestListDto }` (like `POST /guests`).

#### 3. Pure diet rules and the board builder

**File**: `src/lib/diets/rules.ts`, `board.ts`, `messages.ts`, `index.ts` (+ `diets.test.ts`)

**Intent**: One place for the tag set, labels, aliases, normalisation and the per-table/seat grouping (reused by S-24's
service list).

**Contract**: `DIET_TAGS` (order above = display order), `isDietTag`, `ALLERGY_TAGS` (`nut-allergy`,
`seafood-allergy`; drawn as allergies), `normalizeDiets(tags)` (dedupe, canonical order), `MAX_DIET_NOTE_LENGTH` =
120, `parseDietNote(raw)` (normalised like names; empty → null; too long → problem), `matchDietWord(word)` (case- and
diacritics-insensitive aliases PL and EN, e.g. „wege”, „wegetariańska”, „vegetarian”, „bez glutenu”, „bezglutenowa”,
„celiakia”, „gluten free”, „GF”, „bez laktozy”, „orzechy”, „alergia na orzechy”, „ryby”, „owoce morza”, „bez
wieprzowiny”; „-”, „brak”, „nie”, „none”, „no” = nothing) → `DietTag | "none" | null`, `parseDietCell(cell)` (split on
`,` `;` `/` `+` `&` and the words „i” / „and”) → `{ tags, unknown: string[] }`, `hasDiet(guest)`. `board.ts`:
`dietBoard(snapshot: SeatingSnapshot | null, guests: readonly GuestDto[]) → DietBoardDto` (tables in the placement's
order: room, then `compareTableNames`; seats ascending; only seats with a present guest who has diets or a note;
`unplaced` = present guests with a diet not seated in the snapshot, Polish order; `counts` in `DIET_TAGS` order, zero
omitted) and `dietAtSeat(board, table, seat)` lookup. `messages.ts`: `dietMessages(locale)` — tag labels, short
labels, section texts (counts, „Bez miejsca na planie”, note label), the accepted-words list for the import problem.

#### 4. Import parser

**File**: `src/lib/guests/import.ts` (+ `import.test.ts`), texts in `src/lib/guests/messages.ts`

**Intent**: Turn a CSV / TSV / paste into rows and per-line problems, dependency-free.

**Contract**: `parseGuestImport(text) → { rows: GuestImportRow[], problems: GuestImportProblem[], header, separator }`
and `checkImportAgainstList(parsed, existingNames: readonly string[])` (adds `on-list` per row and `too-many` when
existing + rows > `MAX_GUESTS`). Rules: strip a UTF-8 BOM; split records RFC 4180-style (double quotes, `""` escape,
line breaks inside quotes, CRLF/LF/CR); separator = tab if the first non-empty record has a tab, else `;` or `,` by
the count outside quotes (`;` wins ties — Polish Excel), else one column; header = the first record's cells match
known header words (PL/EN: imię, imię i nazwisko, nazwa, gość, osoba, name, guest; dieta, diet, alergie; uwagi,
notatki, notes, comments) → columns mapped by header, else positional name, diet, notes (extra columns ignored);
blank records skipped; at most 1 000 records (beyond → one `too-many-lines` problem). Per-line problems (1-based
record line, header counted): `name-missing` (diet/notes but no name), `too-long` (name > 40), `duplicate` (repeats an
earlier line), `on-list` (already a guest), `unknown-diet` (words not recognised), `note-too-long` (> 120); whole-file
`too-many` (limit) and `empty` (no rows). A list marker is NOT stripped from CSV names (only the plain paste does
that). `describeImportProblem(problem, locale)` → „Linia 4: …” / "Line 4: …".

#### 5. Service

**File**: `src/lib/guests/service.ts`, `src/lib/guests/index.ts`

**Intent**: Read and write the diet columns; let `addGuests` take diets, still all-or-nothing in one insert.

**Contract**: `GUEST_COLUMNS` adds `diets, diet_note`; `toGuestDto` maps them (unknown tags dropped defensively);
`addGuests(db, eventId, guests: readonly (string | NewGuestInput)[])` with `NewGuestInput { name, diets?, dietNote? }`
(existing callers unchanged); `GuestPatch` gains `diets?: DietTag[]` and `dietNote?: string | null`
(`updateGuest` normalises; a too-long note → `invalid` with a new reason `note-too-long`). No logging of guest rows.

#### 6. Routes

**File**: `src/pages/api/o/[key]/guests/import.ts` (new), `src/pages/api/o/[key]/guests/[id].ts`,
`src/lib/client-routes/match.ts`, `src/lib/client-routes/table.ts`

**Intent**: The import endpoint (preview and save) for the client and the panel dispatcher; the diet edit.

**Contract**: `POST /api/o/<key>/guests/import` body strict `{ text: string ≤ 200 000, preview?: boolean }` →
`preview: true` → 200 `GuestImportPreviewDto` (nothing saved); otherwise problems → 400 `{ error: fixList, ...preview }`,
no rows → 400, `addGuests` `duplicates` (race) → 409 like `/guests`, `too-many` → 400, saved → 201 `{ added,
...GuestListDto }`. `PATCH /guests/<id>` strict body adds `diets?: string[] (≤ 8, each a known tag else 400)` and
`dietNote?: string | null` (≤ 1 000 chars raw; rule message on > 120); the body's `refine` accepts any one of the four
fields. `guests/import` added to
`CLIENT_ROUTE_PATTERNS` and `CLIENT_ROUTE_MODULES`. The lead rule, module gates (none) and the 404 for foreign keys
come from the middleware as for every organizer route.

#### 7. Read models

**File**: `src/lib/orders/service.ts`, `src/lib/orders/restaurant.ts`

**Intent**: Give the order board and the tablet the diet board from data they already read.

**Contract**: `toOrderBoard` adds `diets: dietBoard(snapshot, guestList.guests)`; `toRestaurantView(items, source,
planVersion, diets: DietBoardDto = EMPTY_DIET_BOARD)` (optional 4th parameter, so `placement.test.ts` keeps compiling)
puts `diets` INSIDE `content` so the fingerprint covers it; `getRestaurantView` passes `dietBoard(snapshot,
guestList.guests)`. No ids, prices or keys added to `RestaurantViewDto`.

#### 8. Tests

**File**: `src/lib/diets/diets.test.ts`, `src/lib/guests/import.test.ts`, `src/lib/diets/privacy.test.ts`,
`tests/integration/guest-diets.test.ts`, existing fixtures (`src/lib/seating/fixtures.test-helpers.ts`, inline
`GuestDto` literals in tests)

**Intent**: Prove the rules, the parser, the leak boundary and the DB behaviour.

**Contract**: unit — aliases (PL/EN, diacritics, case), `parseDietCell` splits and unknown words, `normalizeDiets`,
`dietBoard` (seat order, absent excluded, deleted guest seat skipped, unplaced, counts), parser cases (BOM, `;` with a
header in any column order, `,` with quoted commas and `""`, a tab paste from a spreadsheet, CRLF, a quoted line
break, single column, blank lines, every problem kind with its line number, 1 000-record cap). Privacy (static, reads
files with `node:fs`): no module under `src/lib/ai-topics/` or `src/lib/venue-ai/` (non-test) imports `@/lib/guests`,
`@/lib/diets` or mentions `diet`. Integration (own restaurant + two events, `createTestEvent`): migration columns and
CHECKs (unknown tag / 121-char note rejected by the DB), `addGuests` with diets all-or-nothing (a duplicate in the
batch saves nothing), `updateGuest` diets/note and event B's id → `not-found`, `getRestaurantView` / `getOrderBoard`
carry the diet at the published seat, the tablet `version` changes when only a diet changes, `getGuestState` (own and
a tablemate) and `getTvScreen` JSON contain neither the tag nor the note, reset part `guests` removes them.

### Success Criteria:

#### Automated Verification:

- Migration applies on populated data (`npx supabase migration up` after `npm run demo` on the previous commit; row
  counts unchanged) and from zero (`npx supabase db reset`)
- Unit and integration tests pass: `AI_PROVIDER=mock npm test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- A real Polish Excel export (`;`, Windows-1250 or UTF-8 with BOM) and a Google Sheets paste preview correctly via the
  route

**Implementation Note**: After completing this phase and all automated verification passes, continue (unattended run:
manual rows are listed for the user in the report).

---

## Phase 2: Import and diet UI, diets on every staff and client surface

### Overview

The import panel and the diet editor on the guest list; the „Diety i alergie” section and per-seat badges on the
tablet and every order board; the diet next to a map-search hit on staff/client screens; the seating editor's badge.

### Changes Required:

#### 1. Guest list

**File**: `src/components/guests/GuestImportForm.tsx` (new), `GuestAddForms.tsx` or `GuestManager.tsx`,
`GuestRow.tsx`, `src/components/guests/DietEditor.tsx` (new), `src/components/diets/DietBadges.tsx` (new),
`src/lib/guests/messages.ts`, `src/lib/diets/messages.ts`

**Intent**: Import with a preview before saving; per-guest diet badges and an editor.

**Contract**: `GuestImportForm` — a `<details>`/button „Import z pliku lub arkusza”: file input (`accept=".csv,.tsv,
.txt,text/csv,text/tab-separated-values,text/plain"`) read as `ArrayBuffer` → `TextDecoder("utf-8", { fatal: true })`,
on failure `TextDecoder("windows-1250")`; or a textarea paste; „Sprawdź” → `POST …/guests/import { text, preview: true
}` → a preview table (line, name, diet badges, note) + the problem list (`role="alert"` when not ready) + the format
hint (columns name; diet; notes, header optional, accepted diet words) → „Dodaj N gości” (disabled unless `ready`) →
`POST …/guests/import { text }` through `useGuestList.send` (the 201 answer replaces the list; the form resets; a 400
shows `error` + `problems` like the paste). The preview POST is its own small hook `useGuestImport(apiBase, locale)`
(its answer is a `GuestImportPreviewDto`, not a list); text over 200 000 characters is refused in the browser with a
local message. Any edit of the text/file clears the preview. `GuestRow` shows `DietBadges` (allergies red with „!”, diets amber, the note
in a muted line) and a „Dieta” button → `DietEditor` (checkbox per tag, note input with a counter, „Zapisz” → `PATCH
/guests/<id> { diets, dietNote }`). Works unchanged in the panel previews (the dispatcher base) and inside
`ReadOnlyFrame`.

#### 2. Diet section and per-seat badges on order surfaces

**File**: `src/components/diets/DietSection.tsx` (new), `src/components/restaurant/RestaurantView.tsx`,
`src/components/orders/OrderManager.tsx`, `src/lib/orders/messages.ts` (if needed)

**Intent**: The kitchen and waiters see diets in counts and at every seat.

**Contract**: `DietSection { diets: DietBoardDto, locale }` (`data-diet-section`; nothing rendered when
`diets.guests === 0`): heading „Diety i alergie (N)”, counts as chips (`data-diet-count="<tag>"`), then per table
(`data-diet-table`) its seats „Miejsce 3 · Ania — wegetariańska, bez glutenu · uwaga”, then „Bez miejsca na planie”.
On the tablet it sits in the list column before „Do przygotowania”; in `OrderManager` (client, preview, floor,
waiter) after the totals. The per-seat serving headings in both components add `DietBadges` from
`dietAtSeat(diets, table.name, seat.seat)`.

#### 3. Map search and seating editor

**File**: `src/components/orders/ServingPlan.tsx`, `src/components/map-search/MapSearch.tsx`,
`src/components/seating/GuestMarkers.tsx`, `TableSeats.tsx`, `UnseatedList.tsx`

**Intent**: A found guest shows their diet on staff/client screens; the seating editor marks diets.

**Contract**: `ServingPlan` takes optional `diets?: DietBoardDto` and passes `MapSearch` an optional
`hitExtra?: (table: string, seat: number) => ReactNode` (short diet labels); the guest phone's `MapSearch` never gets
it. `GuestMarkers` takes optional `diets` / `dietNote` and renders the short badge (text, never colour alone).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Tests pass: `AI_PROVIDER=mock npm test`
- Build passes: `npm run build`

#### Manual Verification:

- Import on `/o/<key>/goscie` (PL and EN): a file and a paste, the preview with problems, the save; the diet editor
- Diets on `/r/<key>`, `/o/<key>/zamowienia`, `/panel/obsluga/<id>`, `/kelner/sala/<id>` and the seating editor read
  well on a phone and a tablet

---

## Phase 3: Smoke, demo, documentation

### Overview

HTTP-level proof (smoke section 39, section 38's key sets), the demo shows diets, CLAUDE.md describes the slice.

### Changes Required:

#### 1. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Cover import preview + save, diets on every read surface, the leak boundary and isolation.

**Contract**: section 38's exact key set of `/api/r/<key>/orders` gains `diets`. New section 39 (guest-import-diets):
a today event of A through the panel with every module on; preview of a `;` CSV with a BOM, a header, quoted fields
and diets → 200 with rows and `ready: true`, nothing saved (guest count unchanged); a preview with problems (unknown
diet, duplicate, missing name, on-list, too long) → `ready: false` with line numbers; the save with problems → 400
and nothing saved; the save → 201 with the guests and diets; a tab paste; the limit (151) → 400; `PATCH` diets/note
(unknown tag → 400, 121-char note → 400); seat + publish; the order board (client link), the tablet `/api/r/<key>/
orders` (diets at the seat, `version` changes after a diet-only change, no ids or keys in `diets`), the floor
(`/api/panel/events/<id>/obsluga/orders` as A's waiter) and the per-event waiter (added and redeemed with section 37's helpers) carry the diet; `/api/g/<key>/state`
of the dieted guest and of a tablemate and `/api/tv/<key>/seating` raw JSON contain neither any tag key nor the note
marker; the client link while the venue leads → 409 `venue-leads` on import, the staff import through `…/klient/
guests/import` → 201, while the client leads → 409 `client-leads`; event B's key on A's guest id → 404, A's key on
B's guest id (PATCH) → the identical 404, the import through event B's dispatcher by owner A / waiter → 404; the
pages `/o/<key>/goscie` (`data-guest-import`), `/r/<key>` and `/o/<key>/zamowienia` (`data-diet-section`) in PL and
EN; the event deleted.

#### 2. Demo

**File**: `scripts/demo.mjs`

**Intent**: The demo shows imported guests with diets.

**Contract**: part of `GUESTS` (e.g. the last 10) is imported through `POST …/guests/import` from a generated `;` CSV
with a BOM, a header („Imię;Dieta;Uwagi”) and several diets/notes (one allergy), after a `preview: true` check
(`ready`, row count); the rest still through the paste; a couple more diets through `PATCH`; the demo fails unless the
tablet's `diets.counts` matches; prints „Import i diety: N gości z pliku, diety: …”.

#### 3. Documentation

**File**: `CLAUDE.md`

**Intent**: Describe the slice: data, rules, routes, surfaces, the privacy boundary, deploy order, smoke 39, demo.

**Contract**: a „Guest import and diets (guest-import-diets, S-23 …)” bullet under Data access next to „Guests and
groups”; the `npm run smoke` and `npm run demo` command lines; `GuestDto` / `OrderBoardDto` / `RestaurantViewDto`
notes; the guardrail sentence in Access model (diets never in guest/TV/AI).

### Success Criteria:

#### Automated Verification:

- Smoke passes against `AI_PROVIDER=mock npm run preview`: `npm run smoke`
- Demo passes: `npm run demo`
- Full suite, lint, type check and build stay green

#### Manual Verification:

- The demo's tablet and floor links show the imported diets at the seats

---

## Testing Strategy

### Unit Tests:

- Diet aliases and cell splitting, normalisation, the board builder (absent, deleted, unplaced, counts, order).
- The import parser: separators, header detection in any column order, quotes, BOM, line numbers, every problem.
- The static NFR-021 guard over the AI modules.

### Integration Tests:

- DB CHECKs, all-or-nothing import, diet PATCH and cross-event `not-found`, the read models carry diets, the tablet
  version covers them, guest state / TV JSON never contain them, the reset removes them.

### Manual Testing Steps:

1. Import a Polish Excel `;` CSV (Windows-1250) with a header and diets; check the preview, then save.
2. Paste three columns from Google Sheets; fix an unknown diet word after the preview complains.
3. Open the tablet and a floor on a phone: counts and the seat list match the guest list.

## Performance Considerations

No new queries on any polled path: the tablet and the board build diets from rows they already read. The import is
one insert of ≤ 150 rows; the parser caps at 1 000 records.

## Migration Notes

Additive (two columns with defaults/null and three CHECKs); old code ignores them. Deploy: migration BEFORE the code.

## References

- Roadmap `### S-23`, PRD v2 FR-035, FR-036, NFR-021, Access Control table.
- Similar: `src/lib/guests/names.ts` (`parseGuestList`), `src/lib/orders/restaurant.ts` (fingerprint),
  `supabase/migrations/20261110230000_event_modules.sql` (text[] CHECK).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data, rules, import parser, service and routes

#### Automated

- [x] 1.1 Migration applies on populated data and from zero — 972f17c
- [x] 1.2 Unit and integration tests pass — 972f17c
- [x] 1.3 Type checking passes — 972f17c
- [x] 1.4 Linting passes — 972f17c

#### Manual

- [ ] 1.5 A real Polish Excel export and a Google Sheets paste preview correctly

### Phase 2: Import and diet UI, diets on every staff and client surface

#### Automated

- [x] 2.1 Type checking passes — 645331b
- [x] 2.2 Linting passes — 645331b
- [x] 2.3 Tests pass — 645331b
- [x] 2.4 Build passes — 645331b

#### Manual

- [ ] 2.5 Import on `/o/<key>/goscie` (PL and EN) and the diet editor
- [ ] 2.6 Diets on the tablet, order boards, floors and seating editor read well on a phone and a tablet

### Phase 3: Smoke, demo, documentation

#### Automated

- [x] 3.1 Smoke passes — c07fea3
- [x] 3.2 Demo passes — c07fea3
- [x] 3.3 Full suite, lint, type check and build stay green — c07fea3

#### Manual

- [ ] 3.4 The demo's tablet and floor links show the imported diets at the seats
