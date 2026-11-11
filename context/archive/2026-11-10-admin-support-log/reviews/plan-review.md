<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Platform admin's support access with an access log for the owner (S-13 admin-support-log)

- **Plan**: context/changes/admin-support-log/plan.md
- **Mode**: Deep (codebase verification done inline by the planner: guard callers, middleware locals, team service, smoke state, and a throw-away SQL experiment on the local DB for the append-only trigger)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after the fixes below)
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

8/8 paths ✓ (`src/lib/panel-api.ts`, `src/middleware.ts`, `src/env.d.ts`, `src/pages/panel/restauracje/[id].astro`, `src/pages/panel/wydarzenia/[id].astro`, `src/pages/api/panel/events/[id].ts`, `src/components/platform/PlatformRestaurantCard.tsx`, `src/lib/platform/messages.ts`), 6/6 symbols ✓ (`findPanelRestaurant`, `findPanelEvent`, `localDateTime`, `PLATFORM_TIME_ZONE`, `logout`, `getEventCard`), brief↔plan ✓. Guard callers: 9 route/page files, all through `findPanelRestaurant` / `findPanelEvent` (no direct `findRestaurantMembership` in routes) — the one-place integration holds. No Astro `prefetch` configured, so support pages do not generate background reads. Append-only trigger verified on the local DB (rolled back): a cascade delete from the parent passes, a direct delete raises.

## Findings

### F1 — `truncate` cannot be tested through PostgREST

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Tests
- **Detail**: The integration test list said `update` / `delete` / `truncate` on `support_log` raise; Vitest talks to the DB through PostgREST, which has no truncate.
- **Fix**: Test update and delete in Vitest; check the truncate trigger once by hand with `psql` in the DB container and note it in the overnight log.
- **Decision**: FIXED

### F2 — A long request path would turn into a 500

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Service (`recordSupportAccess`)
- **Detail**: The log's path column is checked ≤ 300; the guard passes `url.pathname` as is.
- **Fix**: The service cuts the path to 300 characters before the call.
- **Decision**: FIXED

### F3 — Vague "texts touched elsewhere" item

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — §8
- **Detail**: "`src/lib/auth/messages.ts` (only if a shared label is needed)" leaves the implementer guessing.
- **Fix**: Name `platformMessages().intro` and the comments to update; all support texts in `supportMessages`.
- **Decision**: FIXED

### F4 — An expired support session still shows as active on the platform card

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — §7
- **Detail**: The island's `active` list comes from the server render; after 60 minutes it would still offer „Otwórz”.
- **Fix**: Render an entry whose `expiresAt` has passed in the browser as not active.
- **Decision**: FIXED

### F5 — `role: "owner"` in support answers is unexplained

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — §5
- **Detail**: Read answers that name a role (restaurant GET, team GET `you`) would say "owner" for the admin in support mode.
- **Fix**: State it in the plan: the role is the view's role, `support` marks support answers, and no answer carries a grant or session id.
- **Decision**: FIXED
