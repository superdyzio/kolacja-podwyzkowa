# Waiter's day view, floor marking and refills (S-21) Implementation Plan

## Overview

Roadmap S-21 (FR-029, FR-023, US-08): a waiter with their staff account sees the restaurant's events running today
(the window covers after midnight until noon of the next day, Europe/Warsaw), with the plan with guests, the orders
with prices and the bill, marks delivered pieces and adds orders on the floor (refills, extra drinks). Unattended run,
fast mode (time box ~07:20): the per-event waiter („na imprezę”, link/code without a password) is CUT — see "What We're
NOT Doing".

## Current State Analysis

- Waiters are `restaurant_member` rows with role `waiter` (S-12) and get only a note on `/panel/restauracje/<id>`
  (`te.waiterNote`). Every event route admits `EVENT_STAFF_ROLES` (owner, manager) only.
- `eventTiming(date, now)` in `src/lib/events/dates.ts` already implements the noon rule (yesterday's event is
  „today” until 12:00 Warsaw).
- The S-14 dispatcher `src/pages/api/panel/events/[id]/klient/[...path].ts` runs the client's organizer route modules
  (`clientRouteHandler`, `getClientAccess`) behind `panelEventApi`; the lead rule gates its mutations.
- The organizer's `POST /orders` prices every line on the server (newest event price, else menu price, else 0; menu
  gate while a menu is active); `PUT /orders/<id>/pieces` marks a piece as `marked_by = 'organizer'`; `POST /drinks`
  takes no price either.
- `OrderManager` (island) is the full order page: bill, add form, prep list, serving plan, lines with edit/delete,
  `DrinkPanel`.
- `findPanelEvent` has a support branch that writes an `access` log row for a platform admin's read.

## Desired End State

- `/panel/restauracje/<id>`: a waiter sees „Dziś na sali” — the restaurant's events in today's window (non-archived)
  linking to `/panel/obsluga/<eventId>`; owners and managers get the same link on today's rows.
- `/panel/obsluga/<eventId>` (owner, manager, waiter; only inside the window): the order page in floor mode — bill,
  prep list, serving plan with guests, every line with prices, „Wydane” per line and per piece, the add form (refills,
  priced by the server), drinks add-only. No edit/delete of lines, no links, no settings.
- Floor API `/api/panel/events/<id>/obsluga/<sub-path>`: an allowlist of the client's order routes; anything else, an
  event outside the window, another restaurant's event, unknown/malformed ids, a template and the platform admin (also
  in support mode) → the identical 404; no session 401; foreign Origin 403 (middleware).

### Key Discoveries:

- `src/lib/panel-api.ts` `findPanelEvent` — support branch logs reads; the floor guard must use the membership only.
- `src/pages/api/panel/events/[id]/klient/[...path].ts` — the dispatcher shape to clone.
- `src/lib/client-routes/match.ts` `matchClientRoute` / `table.ts` `clientRouteHandler`.
- `src/components/orders/ServingPlan.tsx:86` loads `planImagePath(apiBase, …)` → `plan/image` GET must be allowed.

## What We're NOT Doing

- The per-event waiter („kelner na imprezę”: name + one-time link or code until the end of the window, no password) —
  CUT for time; logged under `## Decyzje`; stays open in the roadmap item (status stays honest). Design note for the
  follow-up: own table (never `restaurant_member`), token hashed, `expires_at` = noon Warsaw the day after the event,
  `created_by`, revoke = delete row, cookie scoped to the floor area only.
- No migration: a waiter's mark is recorded like the venue's other day-of writes (`marked_by = 'organizer'`, as the
  S-14 dispatcher already does). A `staff` marker with the account is a later option.
- No edit/delete of order lines or drink lines by waiters; no price setting.
- No offline readout for staff (S-27), no guest search (S-22).

## Implementation Approach

Reuse, don't rebuild: a floor guard + a floor dispatcher with an allowlist over the client's order route modules, and a
`floor` mode on `OrderManager`.

Decisions:
- Lead rule: the floor routes are the venue's day-of work — allowed whoever leads (not under `/api/o/`, no
  `staffMayWrite` gate). Modules do not gate orders (S-17).
- The window applies to every role on the floor routes and page (owners/managers keep the full event card for other
  days).
- The platform admin never acts as a waiter: the floor guard has no support branch (identical 404, no log row).
- Whole-line „Wydane”: the dispatcher accepts `PATCH orders/<id>` only with the strict body `{ delivered }` and calls
  `markOrderPieces(…, null, delivered)` itself (the organizer PATCH would also rename/re-quantity/reassign).

## Phase 1: Floor rules, guard, API and page

### Changes Required:

#### 1. Pure rules and texts
**File**: `src/lib/floor/rules.ts`, `src/lib/floor/messages.ts`, `src/lib/floor/index.ts`, `src/lib/floor/floor.test.ts`
**Intent**: `FLOOR_ROLES` (owner, manager, waiter), `isFloorOpen(eventDate, archivedAt, now)`, `FLOOR_ROUTES`
allowlist (pattern × methods) + `floorRouteAllows(pattern, method)`, `floorPath(id)`, `floorApiBase(id)`; texts
`floorMessages(locale)` PL/EN.
**Contract**: unit tests with fixed instants (event day 00:00 Warsaw open, next day 11:59 open, 12:00 closed, the day
before closed, archived closed; allowlist ⊂ `CLIENT_ROUTE_PATTERNS`).

#### 2. Floor guard
**File**: `src/lib/panel-api.ts`
**Intent**: `findFloorEvent(locals, idParam, now)` (membership only → role in `FLOOR_ROLES` → event date/archived →
`isFloorOpen`) and `panelFloorApi(locals, idParam)`.

#### 3. Floor dispatcher
**File**: `src/pages/api/panel/events/[id]/obsluga/[...path].ts`
**Intent**: guard → `matchClientRoute` → allowlist → `getClientAccess` → organizer handler (no lead gate); `PATCH
orders/:id` handled in place with `{ delivered }` only.

#### 4. Pages
**Files**: `src/pages/panel/obsluga/[id].astro`, `src/pages/panel/restauracje/[id].astro`, `OrderManager.tsx`,
`OrderLineRow.tsx`, `DrinkPanel.tsx`
**Intent**: the floor page with `OrderManager floor`; the restaurant page's today list for waiters and the floor link
for owners/managers on today's rows.

### Success Criteria:

#### Automated Verification:
- `npm test` passes (floor unit tests included)
- `npm run lint` and `npx astro check` pass

#### Manual Verification:
- A waiter on a phone marks pieces and adds a refill on `/panel/obsluga/<id>` (demo waiter)

## Phase 2: Smoke, demo, documentation

### Changes Required:
- `scripts/smoke.mjs` section 36 (floor): waiter of A — read 200 with prices, refill 201, body `price` 400, piece PUT
  200, PATCH `{ delivered }` 200, PATCH `{ name }` / DELETE / other routes (guests, links, event card) → 404,
  upcoming / past / archived-today events → 404, event B and malformed ids → the identical 404, venue leads → still 200,
  admin (support mode) → 404 and no new log row, no session 401, foreign Origin 403, pages 200/404 and the restaurant
  page's today list.
- `scripts/demo.mjs`: the waiter adds one refill on the main event (today) and the demo prints the floor page.
- CLAUDE.md: a „Floor (waiter's day view)” section, demo/smoke lines, S-12 note on the per-event waiter.

### Success Criteria:

#### Automated Verification:
- `npm run build`; `npm run smoke` passes against `AI_PROVIDER=mock npm run preview`; `npm run demo` passes

#### Manual Verification:
- The waiter's restaurant page lists today's event after midnight until noon

## Testing Strategy

Unit: window edges with fixed clocks, allowlist. HTTP: smoke section 36 (cross-tenant, roles, window, lead, support).

## Progress

### Phase 1: Floor rules, guard, API and page

#### Automated

- [x] 1.1 `npm test` passes (floor unit tests included)
- [x] 1.2 `npm run lint` and `npx astro check` pass

#### Manual

- [ ] 1.3 A waiter on a phone marks pieces and adds a refill on `/panel/obsluga/<id>` (demo waiter)

### Phase 2: Smoke, demo, documentation

#### Automated

- [ ] 2.1 `npm run build`; `npm run smoke` passes against `AI_PROVIDER=mock npm run preview`; `npm run demo` passes

#### Manual

- [ ] 2.2 The waiter's restaurant page lists today's event after midnight until noon
