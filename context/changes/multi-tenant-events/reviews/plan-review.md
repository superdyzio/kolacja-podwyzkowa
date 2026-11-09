<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Restaurants and many events (F-02 multi-tenant-events)

- **Plan**: context/changes/multi-tenant-events/plan.md
- **Mode**: Deep (verification done inline, no sub-agent: unattended run, no parallel agents)
- **Date**: 2026-11-09
- **Verdict**: SOUND (after fixes; REVISE before)
- **Findings**: 1 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding
Grounding: 7/7 paths ✓ (event.ts, api/event.ts, shell/messages.ts, helpers.ts, links.mjs, venue-ai/service.ts, ci.yml), symbols ✓ (EVENT_ID, hasEvent, createEvent, seat_guest 23503 mapping, CONFLICT_CODES, place-gone), brief↔plan ✓, Progress↔Phase ✓ (4/4 phases, every criterion mirrored).

Verified claims: seat_guest maps `23503` by `error.details.includes("guest_id")` — composite FK details read `Key (event_id, guest_id)=…`, still matching; replace_seating treats `23503` as conflict (409); orders map `23503` to place-gone; guesses map `23503` (single FK kept) to not-found; astro's tsconfig has `allowJs` without `checkJs`, so `.mjs` scripts importing `seed.ts` are not type-checked.

## Findings

### F1 — Composite FKs would break a constraint-name match

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Migration (composite FKs)
- **Detail**: `src/lib/venue/service.ts:44,390` recognises "room not found" on add/update table by the FK name `venue_table_room_id_fkey`. The plan replaces the single-column FKs with composite ones without fixing their names; a new name turns "room not found" (also the foreign-room case the isolation tests need) into a thrown 500.
- **Fix**: Name every composite FK exactly like the single-column FK it replaces (`<table>_<column>_fkey`), stated in the migration contract.
- **Decision**: FIXED

### F2 — Phase 1 link check could run on the old build

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Success Criteria 1.2
- **Detail**: `dist/` still holds the base build made for the pre-migration data; criterion 1.2 must run on a fresh `npm run build`, else it proves nothing about the new code.
- **Fix**: Criterion 1.2 says "after `npm run build` of the new code".
- **Decision**: FIXED

### F3 — No DB guard for guess ↔ guest event

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Migration / What We're NOT Doing
- **Detail**: `guess.guest_id` keeps its single-column FK (embed), so the DB alone does not stop `guess(event A, guest of B)`. The plan scopes both save functions and `saveGuessByOrganizer`, and the isolation test covers organizer and guest saves with B's guest.
- **Fix**: none beyond the planned service check and test.
- **Decision**: ACCEPTED
