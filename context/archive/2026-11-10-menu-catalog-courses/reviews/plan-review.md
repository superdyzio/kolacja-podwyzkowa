<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Menu catalog with courses (S-16)

- **Plan**: context/changes/menu-catalog-courses/plan.md
- **Mode**: Quick (time box; no sub-agent)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after the fixes below)
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
6/6 paths ✓, prep consumers found (`OrderManager`, `RestaurantView`, `useServingSelection`, `useOrderBoard`, `useRestaurantView`), brief↔plan ✓

## Findings

### F1 — PATCH gate must not block edits of legacy lines

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Orders
- **Detail**: When an event switches its menu on after free-text lines exist, PATCHes of quantity, note, assignment, „Wydane” and a spelling fix (same `dishKey`) on those lines must keep working; only a rename to another dish is gated.
- **Fix**: State it in the plan; the gate runs only when the new name's `dishKey` differs from the line's.
- **Decision**: FIXED

### F2 — Same name in two course groups

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — prep grouping
- **Detail**: Grouping by `course|dishKey` can show a free-text „Rosół” (no course) and a menu „Rosół” (zupa) as two prep lines; serving chips (`dishInstances`) stay keyed by `dishKey` and merge them. Acceptable, but the board validators (`useOrderBoard`, `useRestaurantView`) must accept the new fields.
- **Fix**: Note the behaviour in the plan; validators accept `course` / `menu`.
- **Decision**: FIXED

### F3 — Legacy zero price

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Implementation Approach
- **Detail**: Event-first pricing keeps a name priced 0 (unpriced S-14 line) at 0 for menu lines; already listed in the brief's risks.
- **Fix**: Keep; documented in CLAUDE.md.
- **Decision**: ACCEPTED
