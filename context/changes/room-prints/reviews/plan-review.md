<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Room prints (S-24)

- **Plan**: context/changes/room-prints/plan.md
- **Mode**: Quick (document-only, no sub-agent — unattended overnight run)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after fixes)
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
7/7 paths ✓ (pages, types, diets board, DietBadges), 6/6 symbols ✓ (`isUpToDate` — false for no snapshot, `toPublishedSeating`, `logoOfEventResponse`, `logoUrl`, waiter area regex `/kelner/sala(/.*)?`, panel area regex `/panel(/.*)?`), brief↔plan ✓. `match.test.ts` scans only `src/pages/api/o/[key]/**`, so the page-area logo route needs no client-route entry.

## Findings

### F1 — The unpublished-changes note's seating link would put the key into a client print

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Components (`paths.seating`) and Critical Implementation Details
- **Detail**: The toolbar's note links the seating page; for the client that is `/o/<key>/rozsadzenie`. The smoke checks a print WITH the note for keys, so an absolute link fails it (and breaks the key-free promise).
- **Fix**: Every client path handed to `RoomPrint` is relative (`../wydruki`, `../rozsadzenie`, `./logo`); say so in the Critical Implementation Details.
- **Decision**: FIXED

### F2 — A letter group cut by a column or page break loses its heading

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Builders (`boardPages`)
- **Detail**: A guest reading the second column starting mid-„K” sees no „K”.
- **Fix**: When a column starts with a guest of the same letter as the previous row, repeat the heading (1 unit); unit-test it.
- **Decision**: FIXED
