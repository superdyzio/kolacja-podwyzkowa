<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Guest RSVP with a dish choice until a deadline (S-25)

- **Plan**: context/changes/guest-rsvp-menu/plan.md
- **Mode**: Quick (unattended overnight run, no sub-agent)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after fixes)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING → PASS after fixes |
| Plan Completeness | WARNING → PASS after fixes |

## Grounding
8/8 paths ✓ (state.ts, service.ts, match.ts, table.ts, ClientWorkCards.astro, [sekcja].astro, shell messages, dates.ts), symbols ✓ (`guestStateVersion`, `getAvailableMenu`, `findMenuItem`, `CLIENT_SECTIONS` used only in sections.ts and the event page; `on delete set null (col)` already used in 20261109120000), brief↔plan ✓; smoke has no assumption on the number of client sections; smoke 38 pins the guest key set (plan covers it).

## Findings

### F1 — Dish sent with „no” undefined

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Service / Routes
- **Detail**: The DB function only accepts a dish with `p_attending = true`; the routes did not say what happens to a dish sent with „no”.
- **Fix**: The service passes `attending === true ? dish : null` (a dish with „no” is dropped, never an error).
- **Decision**: FIXED

### F2 — Board read and template / inactive-menu edges

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Service
- **Detail**: `getRsvpBoard` did not state the `is_template = false` filter, the guest order, how an empty option list behaves and what options do while the menu is inactive; organizer writes while RSVP is off were unstated.
- **Fix**: Stated in the service contract: template filter, Polish order then id, empty list clears, any name with an inactive menu → `not-on-menu`, organizer writes work whether RSVP is on or off.
- **Decision**: FIXED

### F3 — DST gap in the deadline input

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — dates.ts
- **Detail**: A local time inside the spring-forward gap (e.g. 2027-03-28 02:30) does not exist in Warsaw.
- **Fix**: The offset lookup resolves it to the instant after the gap (the second offset pass); a unit test pins it.
- **Decision**: ACCEPTED (implementation detail)

### F4 — Two mounts of the guest island

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — Guest phone
- **Detail**: Two `GuestRsvpView` mounts subscribe to the same ref-counted store (`guest-state-store.ts`), so no second poll; each renders only in its placement.
- **Fix**: None needed.
- **Decision**: DISMISSED
