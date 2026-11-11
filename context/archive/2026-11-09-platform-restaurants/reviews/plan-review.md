<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Platform panel: restaurants and owner invitations (S-10 platform-restaurants)

- **Plan**: context/changes/platform-restaurants/plan.md
- **Mode**: Deep (verification done inline — unattended run, no parallel subagents)
- **Date**: 2026-11-09
- **Verdict**: SOUND (after fixes)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding
11/11 paths ✓ (new dirs `src/lib/platform`, `src/lib/restaurants` expected absent), symbols ✓ (`findRestaurantMembership`, `findEventMembership`, `setPasswordPath`, `normalizeEmail`, smoke `noAccessJson` = exact `{"error":"Brak dostępu"}`, `viaProxy`, `behindTls`), `staff_account_email_key` is a plain unique index (valid `on conflict (email)` target), section-25 sessions `sessionOwner`/`sessionAdmin`/`sessionB`/`sessionWaiter` still valid at its end, brief↔plan ✓.

## Findings

### F1 — Text module locations inconsistent

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §4 vs Phase 2 §5
- **Detail**: Phase 1 puts `restaurantPanelMessages` (restaurant page AND hub additions) in `src/lib/platform/messages.ts`, while Phase 2 §5 edits `src/lib/auth/messages.ts` for the hub. The implementer would have to guess.
- **Fix**: `restaurantPanelMessages` lives in `src/lib/restaurants/messages.ts` (restaurant panel page); the hub's new texts (platform card, open-panel link, disabled badge and note) go into `authMessages`, which owns `/panel`.
- **Decision**: FIXED

### F2 — Barrel import could pull node:crypto into the island bundle

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §4–5 (`src/lib/platform/index.ts`), Phase 2 §3
- **Detail**: `src/lib/platform/index.ts` re-exports `service.ts`, which imports `@/lib/auth/service` (node:crypto). An island importing `@/lib/platform` would break the client build. CLAUDE.md's convention (islands import pure modules directly) applies but the plan does not say it.
- **Fix**: State that islands and the hook import `@/lib/platform/rules`, `/messages`, `/summary` directly; the index is for server code.
- **Decision**: FIXED

### F3 — RPC list capped by PostgREST max_rows

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Performance Considerations
- **Detail**: `platform_restaurant_list()` returns a set through PostgREST, capped at `max_rows = 1000` (`supabase/config.toml:18`); beyond 1000 restaurants the list would silently truncate.
- **Fix**: Note the limit in Performance Considerations (fine for M-2; paging when needed).
- **Decision**: FIXED

### F4 — One-time link disappears on reload

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §3 (`StaffLinkCard`)
- **Detail**: The link is shown only in the island's state after the action; a reload loses it (by design: only the hash is stored). The admin should be told, and that „Nowy link” makes a fresh one.
- **Fix**: Add the hint to the messages contract and the card.
- **Decision**: FIXED
