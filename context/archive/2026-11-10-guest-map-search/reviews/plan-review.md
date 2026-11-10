<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Guest search on the venue map (S-22)

- **Plan**: context/changes/guest-map-search/plan.md
- **Mode**: Quick (unattended run; one-phase-at-a-time subagents not used)
- **Date**: 2026-11-10
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING (fixed) |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING (fixed) |

## Grounding
7/7 paths ✓ (readout.ts, offline/index.ts, VenueDrawing.tsx, ServingPlan.tsx, GuestSeatView.tsx, smoke.mjs, ui/input.tsx), symbols ✓ (normalizeSearch, findGuestSeats — only caller OfflineSeating.tsx; pluralPl/pluralEn; seatLabel), brief↔plan ✓, Progress↔Phase ✓

## Findings

### F1 — Guest scroll target ambiguous for a single hit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — Guest phone
- **Detail**: The plan said picking scrolls, but not whether the target is only an explicit pick or also the single hit, nor whether a single hit opens the map.
- **Fix**: target = the active hit's table (picked or only hit); only an explicit pick opens a closed map; a null target leaves the view.
- **Decision**: FIXED

### F2 — Smoke "unchanged shape" lists not pinned

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Smoke section 38
- **Detail**: Without the expected key lists the check would only assert "whatever the server says now".
- **Fix**: lists from `src/types.ts` written into the plan.
- **Decision**: FIXED

### F3 — Offline readout order changes slightly

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Shared matcher
- **Detail**: Delegating `findGuestSeats` to the ranked matcher changes the offline list order (word-prefix hits first) and adds any-order words.
- **Fix**: accepted and stated in the plan (one rule everywhere; the existing tests still hold).
- **Decision**: FIXED
