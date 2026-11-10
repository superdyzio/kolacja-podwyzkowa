<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Guest import and diets at the seat (S-23)

- **Plan**: context/changes/guest-import-diets/plan.md
- **Mode**: Quick (grounding by hand; unattended run, no subagent)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after fixes)
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
9/9 paths ✓ (`guests/service.ts`, `orders/restaurant.ts`, `client-routes/table.ts`, `GuestMarkers.tsx`, `MapSearch.tsx`,
`UnseatedList.tsx`, `fixtures.test-helpers.ts`, `ai-topics/prompt.ts`, `venue-ai/prompt.ts`), symbols ✓
(`GUEST_COLUMNS`, `toRestaurantView`, `toOrderBoard`, `matchClientRoute`, `toFailure` reads `problems`), brief↔plan ✓.

## Findings

### F1 — `toRestaurantView` signature change breaks its unit test

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Read models
- **Detail**: `src/lib/orders/placement.test.ts:182` calls `toRestaurantView(items, source, 123)`; the plan left the new
  parameter open ("the guests or a prepared board").
- **Fix**: optional 4th parameter `diets: DietBoardDto = EMPTY_DIET_BOARD`.
- **Decision**: FIXED

### F2 — The preview answer is not a guest list

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Guest list
- **Detail**: `useGuestList.send` only replaces the list on a `GuestListDto` answer and returns a boolean, so the
  preview (a `GuestImportPreviewDto`) cannot ride on it.
- **Fix**: a small `useGuestImport` hook for the preview POST; the save stays on `useGuestList.send` (400 shows
  `error` + `problems` like the paste); oversize text refused in the browser.
- **Decision**: FIXED

### F3 — The PATCH body's `refine` must accept the new fields

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Routes
- **Detail**: `UpdateGuestBody` refines on `displayName !== undefined || isAbsent !== undefined`; a diet-only PATCH would
  be a 400.
- **Fix**: refine on any of the four fields.
- **Decision**: FIXED

### F4 — Smoke needs a redeemed per-event waiter

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Smoke
- **Detail**: Section 39 checks the diet through the per-event waiter's floor; section 37 already has the add/redeem
  helpers.
- **Fix**: reuse section 37's helpers.
- **Decision**: FIXED
