<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Per-event waiter („kelner na imprezę”, S-21b)

- **Plan**: context/changes/event-waiter-access/plan.md
- **Mode**: Quick (unattended run; no sub-agent)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after fixes; REVISE before)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding
8/8 paths ✓, 4/4 symbols ✓ (`findFloorEvent`, `readSessionToken`, `beginAttempt`, `classifyAuthPath`), brief↔plan ✓

## Findings

### F1 — `/kelner` redirect loops into the floor's 404

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Implementation Approach (middleware areas)
- **Detail**: With a live waiter session `/kelner` was to 303 to that waiter's floor; once that event is archived or its window is over the floor answers 404, and the waiter could never reach the code form again (no logout on the 404 page).
- **Fix**: `/kelner` never redirects; with a session it shows „Wróć na salę” + „Wyloguj” above the code form; a new redeem ends the old session first.
- **Decision**: FIXED

### F2 — `beginAttempt` is private and e-mail keyed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details
- **Detail**: The plan said "reuse `begin_login_attempt`", but the TS wrapper hashes `login:<email>`.
- **Fix**: the waiter service calls the RPC with `sha256("waiter-code:<id>")` and clears that key on success.
- **Decision**: FIXED

### F3 — Expiry tests on past dates would be refused

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Tests
- **Detail**: `add_event_waiter` refuses a computed expiry ≤ now(), so the CET/CEST expiry checks must use future dates.
- **Fix**: future dates 2026-12-15 (CET) and 2027-07-15 (CEST).
- **Decision**: FIXED

### F4 — Floor dispatch must stay out of the floor barrel; one redeemable check

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — Shared floor dispatch / link page
- **Detail**: `@/lib/floor` is a pure barrel; the dispatch imports route modules and `astro:env`. The link page and the redeem must not drift apart on what „redeemable” means.
- **Fix**: no re-export from `index.ts`; one shared redeemable check.
- **Decision**: FIXED
