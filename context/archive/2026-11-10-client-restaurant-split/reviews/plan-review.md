<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Client / venue split, „lokal prowadzi” and the client's trial reset (S-14)

- **Plan**: context/changes/client-restaurant-split/plan.md
- **Mode**: Deep (claims verified inline: no sub-agent — the overnight rules forbid parallel agents and the claims were few)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after fixes)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
Grounding: 7/7 paths ✓ (`src/middleware.ts`, `src/lib/access/resolve.ts`, `src/lib/panel-api.ts`, `src/lib/events/api.ts`, `src/components/reset/ResetPanel.tsx`, `src/lib/orders/input.ts`, `src/pages/api/o/[key]/reset.ts`), symbols ✓ (`isMutation` in `src/lib/auth/origin.ts`, `findPanelEvent`, `resetEvent`, `toOrderItemInput`, `formatAiTopicSummary`, `RestaurantLinkCard` used only by `zamowienia.astro`), brief↔plan ✓. Spike: page-module import from a catch-all route builds.

## Findings

### F1 — The smoke reaches the removed client routes before any staff session exists

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phases 3–4 (smoke migration)
- **Detail**: Section 20 reads `GET /api/o/<key>/ai-topics` (lines ~2319, 2468, 3988), section 23 rotates `/restaurant-link` (~3552) and sends prices in sections 23–23d, section 24 runs the full reset on the client link (~3889–4060). Staff sessions appear only in section 25, and sections 26/28 assert exact member counts of restaurant A (`memberCount === 2`, team of 3), so simply adding an owner of A early breaks them.
- **Fix**: Create an early „ops” owner account of restaurant A in the smoke (platform.mjs helpers + an invitation redeemed over HTTP → session) used by sections 20–24 for the panel routes (AI board, full reset, tablet rotation, prices), and remove its membership before section 25 with a new `removeMembership(env, restaurantId, accountId)` in `scripts/lib/platform.mjs`.
- **Decision**: FIXED (plan phases 3 and 4, smoke bullets)

### F2 — `OrganizerAccess` gains a required field

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3
- **Detail**: `tests/integration/access.test.ts:32` compares a full `OrganizerAccess`; adding `venueLeads` changes it.
- **Fix**: Update that expectation in phase 1 (listed under tests).
- **Decision**: FIXED

### F3 — The switch must not touch guest, TV and tablet routes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §3
- **Detail**: Guests keep „Dotarło”, guesses and AI topics on their phones whoever leads (PRD: guest links keep their actions). The middleware check must be scoped to the organizer role and `/api/o/`.
- **Fix**: State it in the contract and check a guest write while ON in smoke 30.
- **Decision**: FIXED

### F4 — Offline fallback inside the frame

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §2
- **Detail**: `SeatingEditor` and `GuessManager` render `OfflineFallback` inside themselves, so while the venue leads its „Pokaż ostatni zapisany stan” button on those two pages is inert; the shell, the other pages (`OfflineSync` outside the frame) and `/odczyt` still offer it.
- **Fix**: Accept; noted in „What We're NOT Doing”.
- **Decision**: ACCEPTED
