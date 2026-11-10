<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Restaurant team — invitations, roles, removal and password-reset links

- **Plan**: context/changes/restaurant-team/plan.md
- **Mode**: Deep (claims verified inline by the planner: no sub-agent, the overnight brief forbids parallel agents and the code was already read)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after fixes)
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS (1 observation) |
| Plan Completeness | WARNING (1 finding) |

## Grounding
7/7 paths ✓ (`src/pages/panel/restauracje/[id].astro`, `src/lib/restaurants/service.ts`, `src/lib/restaurants/index.ts`, `src/db/database.types.ts`, `tests/integration/platform-restaurants.test.ts`, `scripts/demo.mjs`, `src/components/platform/StaffLinkCard.tsx`), 5/5 symbols ✓ (`parseId` safe-integer check, `tokenTtlMs`, `generateSecretToken`, `issue_staff_token` callable from plpgsql like `add_restaurant_owner` inside `create_restaurant_with_owner`, smoke section 26 adds owner A to B so the `elsewhere` check has a subject), brief↔plan ✓, Progress↔Phase ✓.

Riskiest claims checked: (1) nested DB function call under the service role — same pattern as S-10; (2) routes under `restaurants/[id]/team/…` beside `restaurants/[id].ts` — `restaurants/[id]/events.ts` already coexists; (3) `getRestaurantOverview` callers — the page and one integration test only; (4) removal needs no session change — every guard reads `restaurant_member` per request (`findRestaurantMembership`); (5) section 28 sessions — `sessionOwner` is owner of A and B, `sessionB` owner of B only, `sessionManager`/`sessionWaiter` of A.

## Findings

### F1 — Phase 1 deletes `getRestaurantOverview` while the page still imports it until Phase 2

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §4 (Service and DTOs) vs Phase 2 §3 (Restaurant page)
- **Detail**: Phase 1 removes `src/lib/restaurants/service.ts` and `RestaurantTeamMemberDto`, but `src/pages/panel/restauracje/[id].astro` imports `getRestaurantOverview` until Phase 2 rewrites it — Phase 1's `npx astro check` / build would fail, so the phase could not be committed green.
- **Fix**: Move the deletion of `src/lib/restaurants/service.ts`, its export and `RestaurantTeamMemberDto` to Phase 2 §3 together with the page change (Phase 1 only adds `getTeam`; the platform test switches to `getTeam` in Phase 1).
- **Decision**: FIXED

### F2 — The `elsewhere` refusal tells a restaurant that a member also works in another restaurant

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details — cross-restaurant takeover
- **Detail**: The 409 message on „Nowy link” reveals that the account has access elsewhere (not which restaurant, no data). It is the price of refusing the takeover; the team list itself carries no such flag.
- **Fix**: Name it in Open Risks (plan brief) next to the e-mail-existence note and keep the DTO without the flag.
- **Decision**: FIXED
