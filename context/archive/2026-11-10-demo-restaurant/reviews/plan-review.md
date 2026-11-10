<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Demo restaurant (S-29)

- **Plan**: context/changes/demo-restaurant/plan.md
- **Mode**: Quick (unattended run, no sub-agent; the riskiest claims checked by hand)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after fixes)
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding
5/5 paths ✓ (`scripts/demo.mjs`, `scripts/lib/`, `tests/scripts/`, `README.md`, `CLAUDE.md`), symbols ✓ (`CreateRestaurantBody`, `TEMPLATE_ROUTE_PATTERNS`, `isValidOutline`, `MAX_PLAN_BYTES`, `getEventMenu` / `compareMenuItems`, `POST …/events { templateId }`), brief↔plan ✓

## Findings

### F1 — A stable restaurant keeps hand-made settings between runs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — order of steps
- **Detail**: The old demo set the retention term (30 days) and the brand after creating the events, on a fresh restaurant. On a stable restaurant a term shortened by hand (e.g. 7 days) would purge „Urodziny Ani (demo)” (−10 days) on its first read, before the demo resets the term.
- **Fix**: Set the term back to 30 days and the restaurant's brand right after the team step, before any event is created.
- **Decision**: FIXED

### F2 — `pickMenuItem` relied on the API's order

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `scripts/lib/demo-data.mjs`
- **Detail**: `getEventMenu` returns the catalog's order (course, then name) today, but the dish choice should not depend on it.
- **Fix**: `pickMenuItem` sorts the available items itself (course order, Polish names).
- **Decision**: FIXED

### F3 — No-op `package.json` change entry

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 2 — change 2
- **Detail**: npm forwards arguments after `--` to `node scripts/demo.mjs` unchanged; the entry asked only to verify that.
- **Fix**: Remove the entry.
- **Decision**: FIXED

### F4 — „Links only to real paths” was not checkable as written

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — success criterion 3.1
- **Detail**: `test -f` checks only that the file exists.
- **Fix**: The criterion names an `ls` of every repository path the scenario mentions.
- **Decision**: FIXED
