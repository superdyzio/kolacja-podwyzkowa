# Scale to 150 guests (S-19, scale-150) Implementation Plan

## Overview

Raise the per-event limits from v1 (100 guests, 20 seats per table, 40 tables) to FR-033's 150 guests, 30 seats per
table and 60 tables, keep the DB CHECKs, the app rules and the UI in step, prove the browser draw stays correct and
fast at full size (NFR-011: ≤ 3 s), and measure locally what a publish and the TV / phone polls cost at that size, so
the 200-phone / several-events target (NFR-011, NFR-015) has a documented estimate and a script the user can re-run.

## Current State Analysis

The limits live in several places at once (roadmap Risk):

- Guests: `MAX_GUESTS = 100` (`src/lib/guests/names.ts:12`), checked in `addGuests` (`src/lib/guests/service.ts:126`),
  answered by `src/pages/api/o/[key]/guests.ts:58`; `MAX_PREDICTED_PLACE = MAX_GUESTS` (`src/lib/guesses/place.ts:10`)
  with the DB CHECK `guess_predicted_place_range` 1…100 (`20261106120000_guess_predicted_place.sql:15`).
- Seats: `MIN_SEATS = 2`, `MAX_SEATS = 20` (`src/lib/venue/rules.ts:18-19`) used by `TableForm`, `LayoutProposal`,
  venue-AI `schema.ts` / `draft.ts`; DB CHECKs `venue_table_seat_count` (`20261027011055_…sql:75`) and
  `seating_snapshot_table_seat_count` (`20261027014210_create_seating.sql:102`) both `between 2 and 20`. Triggers
  `check_seat_in_range` / `unseat_beyond_seat_count` compare against the row's `seat_count` (no constant). The venue-AI
  prompt hard-codes „2 to 20” (`src/lib/venue-ai/prompt.ts:34`).
- Tables / rooms: `MAX_TABLES = 40`, `MAX_ROOMS = 10` (`rules.ts:14-15`), checked in `venue/service.ts` and passed as
  `p_max_tables` to `apply_venue_layout` (no DB constant, so no signature change); venue-AI `MAX_PROPOSED_TABLES = 60`
  (`schema.ts:91`) with a stale comment, `match.ts:118` caps new tables by `MAX_TABLES`.
- Per-event caps that scale with guests: `MAX_ORDER_ITEMS = 400` (`orders/rules.ts:15`); the draft endpoint
  `.max(200)` rows (`src/pages/api/o/[key]/seating/draft.ts:24`).
- Paging: snapshot tables/seats for the neighbour history are already read in pages of 1000; `guestDrawing`
  (`guest-links/service.ts:136`) reads one snapshot's seats in one request — ≤ 150 rows < `max_rows` 1000.
- Guest token: `guestStateVersion` ends with `.<place>.<maxPlace>` — 150 is still 3 characters, so the worst case
  stays 62 of 64.
- Draw: `DEFAULT_DRAW_BUDGET_MS = 1200` (`seating/draw.ts:33`), tests only at the 40-guest demo size.
- Drawing: geometry tested for 2..20 seats (`venue/drawing.test.ts:120`), name fitting tested with a 20-seat table;
  phone zoom `VENUE_ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6]` (`guest-links/venue-zoom.ts:5`).
- Templates (S-15) are hidden `event` rows: their venues use the same `venue_table` CHECKs and the same service
  limits, so they follow automatically.

## Desired End State

A client adds up to 150 guests, tables of 2–30 seats and up to 60 tables (10 rooms as before); the 151st guest, a
31-seat table and the 61st table are refused with the rule's PL/EN message by the app and by the DB CHECKs. Existing
events and the local data survive `migration up` unchanged. The browser draw at 150 guests / 60 tables / 30-seat tables
passes every hard rule and the nobody-alone rule (clock-free test) and is measured well under 3 s. Smoke section 35
fills an event to the limits and passes seating, publish, the TV poll and a guest poll; `npm run load:local` measures
publish → 200 phones + TV locally and prints the numbers. CLAUDE.md states the new numbers and the load estimate.

### Key Discoveries:

- Relaxing a CHECK is data-preserving: every existing row (2..20 seats, places 1..100) satisfies the wider range.
- No DB function hard-codes the limits (`apply_venue_layout` takes `p_max_tables`) → no signature change.
- Measured during planning (M-series laptop, Node 22, vitest): the full-size draw with a 4-round history takes 0–6 ms
  and reaches 0 repeats in all three venues (banquet 5×30 + 10 seats; 60 mixed tables; 60 × 30 seats).

## What We're NOT Doing

- No change to the polling design (2.5 s TV/phone polls with 204s) or to the TV's per-room rotation (S-20).
- `MAX_ROOMS` stays 10, `MAX_DRINK_ITEMS` 200, `MAX_QUESTIONS` 500, `MAX_EVENT_TOPICS` 1000 (a cost cap, AI is an
  opt-in module), `expected_guests` 1–1000 (informative).
- No real-hosting load test (deploy is the user's; Open Question 4) — only the local script and a documented estimate.
- The default `npm run demo` stays small; the big event comes from `npm run load:local -- --keep`.

## Implementation Approach

One migration relaxes the three CHECKs; the constants move to 150 / 30 / 60 and everything else reads them (prompt text
and AI caps included). Tests that hard-code the old numbers move to the constants. A clock-free full-size draw test
plus a `DRAW_BENCH=1` benchmark prove NFR-011's draw target. Smoke section 35 and a local load script (dependency-free
Node, refuses non-local targets) measure publish and polls at full size; the numbers go into the plan, the overnight
log and CLAUDE.md.

## Critical Implementation Details

- **Performance constraints**: the draw budget stays `DEFAULT_DRAW_BUDGET_MS = 1200` — measured runs finish in
  milliseconds; the budget only caps unlucky searches, leaving ~1.8 s of NFR-011's 3 s for the two GETs and the POST
  on a slow phone. The Lambda estimate (one request per instance) is Little's law: concurrent instances ≈ request rate
  × mean duration.

## Phase 1: Limits at 150 / 30 / 60 across DB, rules, draw and drawing

### Overview

Raise every limit in step and prove correctness at full size.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261111010000_scale_150.sql`

**Intent**: Relax the CHECKs so 30-seat tables and places up to 150 are storable; data-preserving.

**Contract**: drop + re-add `venue_table_seat_count` and `seating_snapshot_table_seat_count` as `between 2 and 30`,
`guess_predicted_place_range` as `predicted_place is null or between 1 and 150`. No function changes.

#### 2. Constants and rules

**Files**: `src/lib/guests/names.ts`, `src/lib/venue/rules.ts`, `src/lib/orders/rules.ts`,
`src/pages/api/o/[key]/seating/draft.ts`, `src/lib/venue-ai/{prompt,schema}.ts`, `src/lib/venue-ai/anthropic-provider.ts`
(comment), `src/lib/guest-links/service.ts` (comment), `src/lib/guest-links/venue-zoom.ts`

**Intent**: `MAX_GUESTS = 150`, `MAX_SEATS = 30`, `MAX_TABLES = 60`, `MAX_ORDER_ITEMS = 600` (4 lines per guest as
before); the draft body `.max(MAX_GUESTS)`; the venue-AI prompt states `MIN_SEATS`–`MAX_SEATS`, `MAX_PROPOSED_TABLES`
= `MAX_TABLES + 30`; `VENUE_ZOOM_STEPS` gains an 8× step for dense 60-table venues.

**Contract**: exported constants keep their names; messages already take the numbers as parameters.

#### 3. Tests

**Files**: `src/lib/seating/draw-scale.test.ts` (new), `src/lib/venue/drawing.test.ts`, `src/lib/venue/rules.test.ts`,
`src/lib/venue-ai/*.test.ts`, `src/lib/guest-links/venue-zoom.test.ts`, `tests/integration/scale.test.ts` (new)

**Intent**: clock-free full-size draw in three venues (two rounds each: `validateDraft` = [], nobody alone, every
present guest seated, pinned rows unchanged, repeats recounted) + `DRAW_BENCH=1` benchmark (< 3000 ms); geometry for
2..`MAX_SEATS`; a 30-seat table fits names; messages read 2–30; integration: an event takes 150 guests and refuses the
151st, a 30-seat table is stored and a 31-seat insert is refused by the DB CHECK, 60 tables then the 61st refused, a
snapshot of a 30-seat table publishes, `predicted_place` = `MAX_GUESTS` is stored and `MAX_GUESTS + 1` is refused by the DB CHECK.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration up` applies on the current local data; `npx supabase db reset` from zero
- `AI_PROVIDER=mock npm test` passes (unit + DB integration incl. `scale.test.ts`, `draw-scale.test.ts`)
- `DRAW_BENCH=1 npx vitest run src/lib/seating/draw-scale.test.ts` passes and its numbers are logged
- `npm run lint` and `npx astro check` pass

#### Manual Verification:

- A 30-seat rectangular and round table look right on `/o/<key>/sale` and the TV (names readable)

---

## Phase 2: Full-size smoke, local load script and documentation

### Overview

Prove publish → TV / phones at full size over HTTP and document the load estimate.

### Changes Required:

#### 1. Smoke section 35

**File**: `scripts/smoke.mjs`

**Intent**: a new event of restaurant A (panel) filled through the organizer API to 150 guests (151st → 400), 3 rooms,
60 tables (4 rectangular of 30, the rest round of 4–6; a 31-seat table and the 61st table → 400), a draft seating of
all 150 through `POST /seating/draft`, publish 201, the TV poll 200 with 60 tables / 150 names then 204 with its
version, a guest poll 200 with the drawing (60 tables, 150 names, size printed) then 204; the event deleted at the end.

#### 2. Load script

**Files**: `scripts/load-local.mjs` (new), `package.json` (`load:local`)

**Intent**: refuses a non-local `SUPABASE_URL` or `BASE_URL`; creates its own restaurant + event (`scripts/lib/platform.mjs`),
fills it to the limits over the organizer API, enables guest links, then runs 200 phone pollers + 1 TV poller (2.5 s,
`since` tokens like the islands) for a warm-up, saves a shifted draft (every guest one seat over, so the snapshot fingerprint changes — an unchanged
publish keeps the old version), publishes it and measures (from the publish answer to each poller's first 200 with the
new seating token): the publish request time,
the time until the TV and every phone got the new version (≤ 5 s target), p50/p95 of 204 and 200 polls, payload sizes;
deletes its rows unless `--keep` (then prints the links: the big event for manual checks). Options `--phones N`,
`--events N` (several events at once, NFR-015), `--seconds N`.

#### 3. Documentation

**Files**: `CLAUDE.md`, `README.md`, `context/foundation/overnight-log.md`

**Intent**: every place that states 100 guests / 20 seats / 40 tables / 1…100 / 400 order lines; the new command; the
measured numbers and the Lambda estimate (instances ≈ rate × duration; requests per event-hour vs the free tier; the
default account concurrency) and what the user measures after deploy.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes
- `npm run smoke` passes against `AI_PROVIDER=mock npm run preview` (section 35 included)
- `npm run load:local` runs against the preview and every phone + the TV see a publish within 5 s
- `npm run demo` passes

#### Manual Verification:

- After deploy (user): run the load estimate's measurements on the Lambda URL (see CLAUDE.md „Skala”)

---

## Testing Strategy

### Unit Tests:

- Full-size draw correctness (seeded, `maxIterations`) and the opt-in clock benchmark.
- Geometry 2..30 seats; name fitting at 30 seats; messages with the new numbers; zoom steps.

### Integration Tests:

- `tests/integration/scale.test.ts`: limits at the service and DB level, own event, cleaned up.

### Manual Testing Steps:

1. `npm run load:local -- --keep`, open the printed organizer link → `/sale`, `/rozsadzenie` (draw), the TV and one
   guest link; check readability of 30-seat tables.

## Performance Considerations

See Phase 2 and the measured numbers in `## Measurements` (filled during implementation).

## Migration Notes

Additive relaxation: the migration can reach the hosted DB before or after the code. Old code on the migrated DB keeps
its old (stricter) limits; new code on an old DB fails only when someone saves > 20 seats or a place > 100 (a 500), so
push the migration first as usual.

## References

- `src/lib/seating/draw.ts`, `src/lib/venue/drawing.ts`, `src/lib/guest-links/state.ts`
- Smoke section 34 (`scripts/smoke.mjs:7840`) as the pattern for a panel-created event

## Measurements

Machine: the run's laptop (Apple Silicon, Node 22.14, vitest), 2026-11-10.

Draw (`DRAW_BENCH=1 npx vitest run src/lib/seating/draw-scale.test.ts`; 150 guests, 34 groups, 2 pinned, 3 absent):

| Venue | History | Times (5 seeds) | Repeats |
| --- | --- | --- | --- |
| banquet (5 × 30 rect + 1 × 10 = 160 seats) | 4 earlier draws | 0–1 ms | 0 |
| many-tables (60 tables, 320 seats) | 4 earlier draws | 1 ms | 0 |
| max-venue (60 × 30 = 1 800 seats) | 4 earlier draws | 3–6 ms | 0 |
| banquet, worst case | every pair already together | 1 201 ms (budget) | 137 |
| many-tables, worst case | every pair already together | 1 202 ms (budget) | 34 |
| max-venue, worst case | every pair already together | 1 204 ms (budget) | 33 |

The search stops at 0 repeats; only when repeats cannot be avoided does it run to `DEFAULT_DRAW_BUDGET_MS` (1 200 ms,
wall clock, so a slower phone stops at the same time). NFR-011's 3 s leaves ~1.8 s for the two GETs and the POST.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Limits at 150 / 30 / 60 across DB, rules, draw and drawing

#### Automated

- [x] 1.1 `npx supabase migration up` applies on the current local data; `npx supabase db reset` from zero
- [x] 1.2 `AI_PROVIDER=mock npm test` passes (unit + DB integration incl. `scale.test.ts`, `draw-scale.test.ts`)
- [x] 1.3 `DRAW_BENCH=1 npx vitest run src/lib/seating/draw-scale.test.ts` passes and its numbers are logged
- [x] 1.4 `npm run lint` and `npx astro check` pass

#### Manual

- [ ] 1.5 A 30-seat rectangular and round table look right on `/o/<key>/sale` and the TV (names readable)

### Phase 2: Full-size smoke, local load script and documentation

#### Automated

- [ ] 2.1 `npm run build` passes
- [ ] 2.2 `npm run smoke` passes against `AI_PROVIDER=mock npm run preview` (section 35 included)
- [ ] 2.3 `npm run load:local` runs against the preview and every phone + the TV see a publish within 5 s
- [ ] 2.4 `npm run demo` passes

#### Manual

- [ ] 2.5 After deploy (user): run the load estimate's measurements on the Lambda URL (see CLAUDE.md „Skala”)
