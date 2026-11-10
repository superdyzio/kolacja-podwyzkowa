<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Event modules (S-17)

- **Plan**: context/changes/event-modules/plan.md
- **Mode**: Quick (overnight time box)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after fixes)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding
7/7 paths ✓ (`src/pages/api/panel/platform/events/` is new), symbols `venueLeads`, `getClientAccess`, `readOfflineState`, `getTvScreenVersion` ✓, brief↔plan ✓

## Findings

### F1 — Access shape asserted in existing tests

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Access and gates
- **Detail**: `tests/integration/access.test.ts`, `tests/integration/client-restaurant-split.test.ts` and `src/lib/support/support.test.ts` build or compare `OrganizerAccess` / access objects; adding `event.modules` breaks them.
- **Fix**: Update those tests in Phase 1 (expect `modules` = all v1 modules for events from `createTestEvent`? No — `createEvent` inserts with defaults, so expect the new-event defaults).
- **Decision**: FIXED (listed in Phase 1 tests)

### F2 — Demo's support-log assertion and smoke events need all modules

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3
- **Detail**: The demo fails unless the owner's log reads exit, access, access, enter; an admin unlock adds rows. Smoke events A/B and the demo's main event come from `scripts/lib/platform.mjs` and would get AI/guesses off.
- **Fix**: Already in Phase 3 (all-modules flag; the demo's unlock happens in its own support visit after the asserted one, or the assertion is extended).
- **Decision**: FIXED

### F3 — Client GET ai-topics answers 409 instead of S-14's 404 when AI is off

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — gates
- **Detail**: The module gate runs before the route, so the client's `GET ai-topics` (S-14: identical 404) answers 409 `module-off` when AI topics are off. Nothing leaks (no cost, no provider); with AI on the S-14 404 stays.
- **Decision**: ACCEPTED
