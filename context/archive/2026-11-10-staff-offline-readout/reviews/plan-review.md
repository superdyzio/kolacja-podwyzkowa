<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Staff offline readout (S-27)

- **Plan**: context/changes/staff-offline-readout/plan.md
- **Mode**: Quick
- **Date**: 2026-11-10
- **Verdict**: SOUND (after F1)
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding
8/8 paths ✓, 5/5 symbols ✓ (`toRestaurantItem`, `localInputToInstant`, `addDays`, `isFloorOpen`, `formatDateTime`), brief↔plan ✓, Progress↔Phase ✓

## Findings

### F1 — Adding `date` to `RestaurantAccess` breaks an integration test

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Event date on the tablet's access
- **Detail**: `tests/integration/access.test.ts:100` compares the restaurant access with `toEqual({ role, event: { id, name, modules } })`; the new field would fail it. Other callers only read `access.event.id/name`.
- **Fix**: Name the test in the plan's contract and update it with the field.
- **Decision**: FIXED

### F2 — Sessions ended on another device

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: What We're NOT Doing
- **Detail**: „Wyloguj wszędzie” / a password change ends the session of other devices, but a device that stays offline cannot learn it; its copy stays until the window end (first online read → 401 → clear). No remote wipe is possible for localStorage.
- **Fix**: State it under "What We're NOT Doing".
- **Decision**: FIXED

Other checks: static (no hydration) `OrderManager` in the panel preview's support mode stays safe (new hooks only act in effects; no scope passed); the worker's `redirect: "manual"` keeps the organizer's tests green (their routes return pages); `/r/<key>/odczyt` gets the tablet's EN default through the `/r/` prefix.
