<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Scale to 150 guests (S-19, scale-150)

- **Plan**: context/changes/scale-150/plan.md
- **Mode**: Quick (unattended overnight run; grounding done inline, no sub-agent)
- **Date**: 2026-11-10
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding
Grounding: 6/6 paths ✓ (`venue-ai/prompt.ts`, `seating/draft.ts`, `orders/rules.ts`, `venue-zoom.ts`, `scripts/lib/platform.mjs`, `smoke.mjs`), 5/5 symbols ✓ (`MAX_GUESTS`, `MAX_SEATS`, `MAX_TABLES`, `p_max_tables`, `DEFAULT_DRAW_BUDGET_MS`), brief↔plan ✓. No other hard-coded 100/20/40 in messages or components (the `max={100}` in `TableForm`/`RoomOutlinePanel` are percentages).

## Findings

### F1 — The load script's second publish must actually change the snapshot

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Load script
- **Detail**: `publishSeating` with no change answers `unchanged` (same snapshot id), so a re-publish would never reach the phones and the measurement would hang until timeout.
- **Fix**: before the measured publish, POST a shifted draft (every guest one seat over) so the fingerprint changes; measure from the publish answer to each poller's first 200 carrying the new seating token.
- **Decision**: FIXED (plan Phase 2 §2 states it)

### F2 — Venue-AI schema test clamps to the old maximum

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Tests
- **Detail**: `src/lib/venue-ai/schema.test.ts:43` expects `seatCount: 20` for an over-range input; with `MAX_SEATS = 30` it becomes 30.
- **Fix**: assert against `MAX_SEATS` (already covered by „`src/lib/venue-ai/*.test.ts`” in Phase 1 §3).
- **Decision**: ACCEPTED (handled in Phase 1)

### F3 — The DB CHECK for places must equal MAX_GUESTS

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Migration
- **Detail**: `MAX_PREDICTED_PLACE = MAX_GUESTS` lives in TS, the CHECK in SQL; they can drift.
- **Fix**: the integration test stores `predicted_place = MAX_GUESTS` and expects `MAX_GUESTS + 1` to be refused by the DB.
- **Decision**: FIXED (plan Phase 1 §3)
