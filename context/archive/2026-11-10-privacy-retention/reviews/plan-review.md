<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Guest data retention, event export and the guest privacy notice (S-26)

- **Plan**: context/changes/privacy-retention/plan.md
- **Mode**: Quick (unattended run, no sub-agent; targeted grounding by hand)
- **Date**: 2026-11-10
- **Verdict**: SOUND
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
8/8 paths ✓, 7/7 symbols ✓ (`toPublishedSeating`, `getLatestSnapshot`, `orderTotals`, `drinkTotals`, `formatAmountInput`, `addDays`, `platformToday`; event → restaurant FK in `database.types.ts` for the embed), brief↔plan ✓

## Findings

### F1 — Hooks must stay in the guards, not in services

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §5
- **Detail**: `tests/integration/restaurant-events.test.ts:127` creates an event dated 2026-10-01 (40 days old today, past the default 30) and reads it through services (`getEventCard`). If the purge were put into a service (e.g. `getEventCard`), that test would lose data depending on the day it runs. The plan puts the hooks in `resolveAccess` / `findEventMembership` / the support branch only — keep it that way and say so.
- **Fix**: State in Phase 1 §5 that no service gains a purge side effect; only the guards (and the sweep / CLI) call it.
- **Decision**: FIXED

### F2 — The demo's purged check needs a concrete read

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §2
- **Detail**: „must come back purged (`guestDataPurgedAt` on its retention read)” names no route; `GET /api/panel/events/<id>` (EventCardDto) has no such field.
- **Fix**: The demo reads Komunia's export JSON (`event.guestData.purgedAt` non-null) after its archive PATCH (which goes through `findEventMembership` and purges).
- **Decision**: FIXED

### F3 — The client link of an expired event still writes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Implementation Approach
- **Detail**: Guests added through `/o/<key>` to an event past its term are purged at the next read (re-purge rule). Refusing those writes would be friendlier but adds a gate to many routes.
- **Fix**: Accept; the shell's „Dane gości usunięte” note explains it. Logged.
- **Decision**: ACCEPTED

### F4 — Smoke: other events of restaurant A become expired at 7 days

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1
- **Detail**: Section 27's „Urodziny smoke” (−10 days) stays in A; after PATCH 7 the restaurant-A purge call removes its guest data. It is the run's own event, so allowed — but the „untouched” checks must name only the template, Q and B.
- **Fix**: Keep the untouched list to the template, today's event Q and event B (as planned).
- **Decision**: ACCEPTED
