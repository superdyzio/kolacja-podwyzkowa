<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Venue templates of a restaurant (S-15)

- **Plan**: context/changes/venue-templates/plan.md
- **Mode**: Quick (unattended run; grounding inline, no sub-agent)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after fixes)
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
7/7 paths ✓ (resolve.ts, auth/service.ts, client-routes/access.ts, events/service.ts, platform.mjs, restaurant page, NewEventForm), symbols ✓ (`findEventMembership`, `getClientAccess`, `listRestaurantEvents`, `platform_restaurant_list`, `record_support_access`, `occupantsRemovedBy`), brief↔plan ✓. No organizer route handler reads `venueLeads` itself (the S-14 409 lives in the middleware for `/api/o/` and in the event dispatcher), so a template's organizer access needs no lead flag.

## Findings

### F1 — Test cleanup leaves templates behind and the restaurant delete fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Tests
- **Detail**: `releaseTestEvent` (`tests/integration/helpers.ts:83`) deletes the event by id, then the restaurant; `event.restaurant_id` has no cascade, so templates (event rows) created in the test restaurant make the restaurant delete fail.
- **Fix**: the new integration test deletes every event row of its restaurant (templates included) before `releaseTestEvent`; the smoke never deletes restaurants (no change).
- **Decision**: FIXED

### F2 — Starter questions for an event created from a template

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 1 — Template module (`createEventFromTemplate`)
- **Detail**: `createEvent` loads the starter questions best effort; the DB function path skips `createEvent`, so an event from a template would start with no questions, unlike every other new event.
- **Fix**: `createEventFromTemplate` calls the starter load (same best-effort helper as `createEvent`) after the RPC; the template itself never gets questions.
- **Decision**: FIXED

### F3 — Support mode on the template page and dispatcher

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Pages
- **Detail**: every guarded read in support mode is one log row; a hydrated editor would poll the dispatcher.
- **Fix**: the template page renders the editor statically (no hydration) in support mode, like S-14's previews; one guard call per page.
- **Decision**: FIXED
