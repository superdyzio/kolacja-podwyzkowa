<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Waiter's day view, floor marking and refills (S-21)

- **Plan**: context/changes/waiter-day-and-refills/plan.md
- **Mode**: Quick (unattended run, time box)
- **Date**: 2026-11-10
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding
6/6 paths ✓, 5/5 symbols ✓ (`matchClientRoute`, `clientRouteHandler`, `getClientAccess`, `markOrderPieces`, `eventTiming`), brief↔plan ✓

## Findings

### F1 — The roadmap outcome includes the per-event waiter, which the plan cuts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: What We're NOT Doing
- **Detail**: FR-023's „kelner na imprezę” is part of S-21's outcome; archiving S-21 as `done` would overstate it.
- **Fix**: Log the cut under `## Decyzje`, keep a follow-up note in the roadmap item (the per-event waiter stays open), and say so in CLAUDE.md and the report.
- **Decision**: FIXED (plan already names the cut; archive step adds the roadmap note)

### F2 — Smoke dates must not depend on the hour

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — smoke
- **Detail**: Before noon "yesterday" is still in the window; the smoke runs at any hour.
- **Fix**: closed events use D−2 (past) and D+1 (upcoming); the noon edge is covered only by unit tests with fixed clocks.
- **Decision**: FIXED (implementation note)
