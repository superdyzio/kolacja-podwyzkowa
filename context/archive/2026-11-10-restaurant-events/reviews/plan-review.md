<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Restaurant events and the client's links (S-11 restaurant-events)

- **Plan**: context/changes/restaurant-events/plan.md
- **Mode**: Deep (claims verified inline by the planner; no sub-agent — unattended run, no parallel agents)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after fixes)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING → PASS after fixes |
| Plan Completeness | WARNING → PASS after fixes |

## Grounding
7/7 paths ✓ (panel-api.ts, events/[id].ts, restauracje/[id].astro, event.ts, database.types.ts, restaurants/messages.ts, demo.mjs); symbols ✓ (`findEventMembership`, `rotateRestaurantKey`, `createEvent` callers: tests/integration/helpers.ts, access.test.ts only; `/panel/**` and `/api/panel/**` classified by `src/lib/auth/paths.ts:20-21`); `Intl` with `timeZone: Europe/Warsaw` works in Node 22 (2026-11-10T23:30Z → 2026-11-11, hour 00); cascade delete of populated events already exercised by 27 integration files through `releaseTestEvent`; brief↔plan ✓.

## Findings

### F1 — Smoke could rotate or delete event A/B, which other sections compare

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Smoke section 27
- **Detail**: "each link kind: rotate" and "delete by owner A of an event" did not say which event; rotating A's keys or deleting A would invalidate `organizerKey`/`tvKey` used by earlier assertions and the final "A and B unchanged" comparison.
- **Fix**: Rotate and delete only events created in section 27.
- **Decision**: FIXED

### F2 — Section-25 assertion change scheduled after the route change

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 success criteria / Phase 3
- **Detail**: Phase 2 changes `GET /api/panel/events/<id>` to carry links, but the smoke assertion "no keys" was updated only in phase 3, so 2.2 was a fuzzy "passes except …".
- **Fix**: Move the assertion update into phase 2 (new change entry 2.4) so the full smoke is green after phase 2.
- **Decision**: FIXED

### F3 — Delete confirm must name the guests' personal links and QR cards

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — messages
- **Detail**: Deleting an event kills every guest link and printed QR card too; the confirm text listed only "all links".
- **Fix**: Spell out client, TV, tablet and every guest's link and QR card.
- **Decision**: FIXED

### F4 — "Event 1 shows up in its restaurant's list" had no explicit check

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 manual 1.5
- **Detail**: The orchestrator asked that the default restaurant's event 1 appears in its list; a reset local DB has no event 1, so the proof must come from `migration up` on the populated DB plus smoke's event A (inserted without a date, like event 1).
- **Fix**: 1.5 checks pre-existing events' date, archive mark and presence in `listRestaurantEvents`; smoke's event A is the HTTP proof.
- **Decision**: FIXED
