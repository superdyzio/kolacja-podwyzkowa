# Event modules (S-17) Implementation Plan

## Overview

Games and extras become optional modules per event (FR-031, US-07, NFR-023): questions, AI topics, the bill-guessing
game, the seating draw, „Pokaż na TV” and pub quiz. The venue (owner, manager) marks which modules may be available for
an event, the client switches the available ones on and off, AI topics and the guessing game are off for new events,
and paid modules stay locked until the platform admin unlocks them for the event. A module that is off disappears for
the client, the guests and the TV on their next poll and its routes refuse; its data stays and comes back when it is on
again.

## Current State Analysis

- Every module exists and is always on: questions (`src/lib/questions/`, guest `POST /api/g/<key>/questions/draw`),
  AI topics (`src/lib/ai-topics/`, guest `POST /api/g/<key>/ai-topics`, organizer `POST /api/o/<key>/ai-topics`),
  guesses (`src/lib/guesses/`, guest `PUT /api/g/<key>/guess`, organizer `/guesses*`, `/o/<key>/strzaly`), the draw
  (browser-side, `DrawPanel` → `POST /seating/draft`), the TV screen (`/tv-spotlight*`, TV poll token
  `"<snapshot>.<plan>.<spotlight id>"`). Pub quiz does not exist (S-28).
- Key access is resolved once per request in `src/middleware.ts` → `resolveAccess` (`src/lib/access/resolve.ts`); the
  S-14 lead rule already refuses organizer API mutations there with a 409 `{ code }` — the module gate mirrors it.
- Staff reach the organizer routes through the dispatcher `src/pages/api/panel/events/[id]/klient/[...path].ts`
  (`CLIENT_ROUTE_PATTERNS` / `CLIENT_ROUTE_MODULES`, coverage test `match.test.ts`), which bypasses the middleware gate.
- The guest phone has ONE shared poll (`GuestStateDto`, token `guestStateVersion` with the hashed `live` part); the 200
  and 204 paths must build the token from the same reads.
- Support mode (S-13): the admin reads a restaurant only inside a logged grant; `support_log` is append-only with a
  `kind` CHECK (`enter | access | exit`) and `grant_id NOT NULL`.
- Templates (S-15) are `event` rows with `is_template`; `create_event_from_template` / `create_template` insert explicit
  columns, so new columns take their defaults.
- `scripts/lib/platform.mjs` `createEvent` inserts the smoke's events A/B and the demo's main event over PostgREST: with
  the new defaults their guesses and AI topics would be off and smoke sections 18–21 and the demo would fail.

## Desired End State

- `event` carries three module sets; the effective state of a module = available ∧ enabled ∧ (¬paid ∨ unlocked).
- Every event that existed before the migration (event 1 included) keeps every v1 module on (pub quiz stays off).
- New events: questions, the draw and the TV screen on; AI topics and guessing off; paid modules (AI topics, pub quiz)
  locked.
- Off module: its organizer routes → 409 `{ code: "module-off", module }` (client link and the staff dispatcher alike),
  its guest routes → the identical 404 of a wrong key, its UI (shell cards, page sections, guest sections, the TV
  spotlight) is gone; the guest token and the TV token change, so phones and the TV drop it on their next poll.
- The client switches modules on the shell's „Moduły” card (`PUT /api/o/<key>/modules`, lead rule applies; staff do it
  through the dispatcher while „Lokal prowadzi” is on). The venue sets availability on the event card in the panel
  (`PUT /api/panel/events/<id>/modules`, owners and managers, never lead-gated). The platform admin unlocks a paid module
  for one event from the support-mode event card (`PUT /api/panel/platform/events/<id>/modules/<module>`), which writes
  an `unlock` / `lock` row to the owner's support log.
- Verified by unit tests (rules, path map, token), an integration test (DB function, defaults, migration rule), smoke
  section 33 and the demo.

### Key Discoveries:

- Lead 409 block to mirror: `src/middleware.ts:134-147`; pure lead rules `src/lib/lead/rules.ts`.
- Dispatcher: `src/pages/api/panel/events/[id]/klient/[...path].ts`; organizer access for staff `src/lib/client-routes/access.ts`.
- Guest token: `src/lib/guest-links/state.ts:39` (`live = shortHash(name \0 orders)`), service `src/lib/guest-links/service.ts:183-222`.
- TV token/screen: `src/lib/tv-spotlight/service.ts` (`getTvScreen`, `getTvScreenVersion`), callers `src/pages/tv/[key].astro`, `src/pages/api/tv/[key]/seating.ts`.
- Offline sync reads `/guesses`: `src/lib/offline/sync.ts:49` — a 409 there would mean „offline” forever.
- Support log shape: `supabase/migrations/20261110160000_admin_support_log.sql:48-70`, guard check pattern in `record_support_access`.

## What We're NOT Doing

- No price list and no online payment: which module is paid is the constant `PAID_MODULES` (AI topics — the one module
  with a per-call cost — and pub quiz) until Open Question 5 is answered; the admin's lever is the per-event unlock.
  A platform-wide editable paid list is cut (one constant to change).
- No pub quiz routes, pages or data (S-28): only its key, its availability, its paid lock and its client switch.
- No change to services: gating happens at the edge (middleware, dispatcher, pages, islands); services stay callable
  (integration tests and the reset keep working).
- No gate on `seating/history` (the seating editor reads it on mount for its stats; only `seating/draft` is gated for
  the draw). `tv-spotlight` is gated for every method (the questions page does not render the TV panel then).
- Templates ignore modules (never opened by key; their columns keep the defaults).
- No module UI in the TV/guest beyond disappearing; no per-module reset.

## Implementation Approach

Three text[] columns on `event` (`modules_available`, `modules_enabled`, `modules_unlocked`) with CHECKs against the
known keys; one pure `effectiveModules()` in `src/lib/modules/rules.ts`; the access resolver reads the columns in the
same query it already makes and puts `modules: EventModules` (effective booleans) on every access kind; a pure
`moduleForApiPath(role, subPath)` drives the middleware and dispatcher gates; pages and islands read the same booleans.

## Critical Implementation Details

- **Ordering in the middleware**: the module gate runs before the lead 409 (an off module answers `module-off` whatever
  the lead), and the guest gate returns the exact denial of a wrong key (same body and headers).
- **Token parity**: the guest token folds the module flags (`questions`, `aiTopics`, `guessing`) into the existing
  hashed part — no new part (62 of 64 chars). Both the 200 and the 204 paths take `modules` from `api.access.event`.
  The TV token needs no change: with `tvSpotlight` off the spotlight is absent (id 0).
- **Migration data rule**: `update event set modules_enabled = v1 set, modules_unlocked = {aiTopics}` for every row that
  exists at migration time, then the defaults apply to new rows only.

## Phase 1: Data, gates, tokens and routes

### Overview

Everything server-side: migration, types, domain module, access, gates, tokens, offline sync tolerance and the three
routes, with unit and integration tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261111000000_event_modules.sql`

**Intent**: Add the module sets to `event`, keep every existing event as it worked yesterday, extend the support log for
the admin's unlock, and add the unlock DB function.

**Contract**: `event.modules_available text[] not null default '{questions,aiTopics,guessing,seatingDraw,tvSpotlight,pubQuiz}'`,
`modules_enabled text[] not null default '{questions,seatingDraw,tvSpotlight}'`, `modules_unlocked text[] not null
default '{}'`, each `check (x <@ array[known keys])`; existing rows → enabled = the five v1 modules, unlocked =
`{aiTopics}`. `support_log`: add `module text` (nullable), kind CHECK extended to `unlock | lock`, a CHECK that
`module` is set exactly for those kinds. `set_event_module_unlock(p_session_id bigint, p_event_id integer, p_module
text, p_unlocked boolean) returns text` (`changed | unchanged | not-found`): live session of a platform admin with a
live support grant of THIS session for the event's restaurant, event not a template, module known; updates
`modules_unlocked` and on a change inserts the log row (`grant_id`, admin snapshot, `event_id`, `event_name`,
`module`). `security`: `set search_path = ''`, revoke execute from public, anon, authenticated.

#### 2. Types and domain module

**File**: `src/db/database.types.ts`, `src/types.ts`, `src/lib/modules/{rules,messages,api,service,index}.ts`

**Intent**: The one source of module keys, defaults, paid set and effective state, the PL/EN texts, the zod bodies and
the DB reads/writes.

**Contract**: `MODULE_KEYS = ["questions","aiTopics","guessing","seatingDraw","tvSpotlight","pubQuiz"]`, `PAID_MODULES`,
`ModuleKey`, `EventModules = Record<ModuleKey, boolean>`, `ModuleSets { available, enabled, unlocked }`,
`effectiveModules(sets)`, `ALL_MODULES_ON`, `moduleForApiPath(role: "organizer" | "guest", subPath)`,
`MODULE_CODES { off: "module-off", unavailable: "module-unavailable", locked: "module-locked" }`,
`clientMayEnable(sets, key)`; DTO `EventModulesDto { modules: EventModuleDto[] }` with
`{ key, available, enabled, paid, unlocked, active }`; service `getEventModules(db, eventId)`,
`setModuleEnabled(db, eventId, key, enabled)` (→ `updated | unavailable | locked | not-found`),
`setModuleAvailable(db, restaurantId, eventId, key, available)`, `unlockEventModule(db, sessionId, eventId, key,
unlocked)`; `modulesMessages(locale)` names, hints, states, errors, confirm texts.

#### 3. Access and gates

**File**: `src/lib/access/resolve.ts`, `src/lib/client-routes/access.ts`, `src/middleware.ts`,
`src/pages/api/panel/events/[id]/klient/[...path].ts`, `src/lib/client-routes/match.ts`, `table.ts`

**Intent**: Every access kind carries `event.modules`; an off module's organizer API answers 409 `module-off` and its
guest API the identical 404, from the middleware and from the dispatcher alike; `modules` becomes a client route.

**Contract**: `OrganizerAccess|TvAccess|GuestAccess|RestaurantAccess .event.modules: EventModules`. Mapping: organizer
`questions*` → questions, `ai-topics` → aiTopics, `guesses*` → guessing, `seating/draft` → seatingDraw,
`tv-spotlight*` → tvSpotlight; guest `questions/draw` → questions, `ai-topics` → aiTopics, `guess` → guessing.

#### 4. Tokens and offline

**File**: `src/lib/guest-links/{state,service}.ts`, `src/types.ts`, guest routes and page, `src/lib/tv-spotlight/service.ts`,
TV page and route, `src/lib/offline/sync.ts` and its caller

**Intent**: `GuestStateDto.modules { questions, aiTopics, guessing }` folded into the hashed token part; the TV treats an
off spotlight as absent; the offline sync treats a `module-off` 409 on `/guesses` as „ok, no board”.

#### 5. Routes

**File**: `src/pages/api/o/[key]/modules.ts`, `src/pages/api/panel/events/[id]/modules.ts`,
`src/pages/api/panel/platform/events/[id]/modules/[module].ts`

**Intent**: client `GET|PUT { module, enabled }` (409 `module-unavailable` / `module-locked`), venue `GET|PUT { module,
available }` (`panelEventApi(…, EVENT_STAFF_ROLES)`), admin `PUT { unlocked }` (`panelPlatformApi`; only paid modules;
not-found → identical 404). Each answers `EventModulesDto`.

#### 6. Tests

**File**: `src/lib/modules/modules.test.ts`, `src/lib/guest-links/state.test.ts`, `tests/integration/event-modules.test.ts`

**Intent**: rules (defaults, effective state, paid lock, path map), token changes with modules, DB defaults for new
events vs the migration rule, the unlock function (no grant → not-found, grant → changed + log row, unchanged). Update
the tests that assert the access shape (`tests/integration/access.test.ts`,
`tests/integration/client-restaurant-split.test.ts`, `src/lib/support/support.test.ts`) for `event.modules`.

### Success Criteria:

#### Automated Verification:

- Migration applies on the current local data and every pre-existing event keeps the v1 modules on: `npx supabase migration up`
- Unit and integration tests pass: `AI_PROVIDER=mock npm test`
- Lint and types: `npm run lint`, `npx astro check`

---

## Phase 2: UI

### Overview

The client's „Moduły” card, the venue's and the admin's controls on the panel event card, and every module surface
disappearing when off.

### Changes Required:

- `src/components/modules/EventModulesManager.tsx` (+ hook `useEventModules`): one island, three capabilities (client
  toggle, venue availability, admin unlock); used on `/o/<key>` and `/panel/wydarzenia/<id>` (support mode: admin unlock
  only).
- Shell `/o/<key>`: cards for guesses, questions, AI topics only when active; the „Moduły” card.
- `/o/<key>/pytania` + panel preview: `QuestionManager` gets `modules` (TV panel, draw, AI, base by module); all off →
  module-off notice. `/o/<key>/strzaly` + panel preview: notice when guessing is off.
- `SeatingEditor`/`DrawPanel`: draw controls hidden when the draw is off (discard / back to previous stay).
- Guest page: `GuestModuleGate` island (hidden wrapper reading `useGuestState`) around the guess, question and AI
  sections; skip the AI quota read when AI is off.
- Support log texts for `unlock` / `lock`.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, `npm run build`

#### Manual Verification:

- Client toggles, venue availability and admin unlock work in the browser in PL and EN

---

## Phase 3: Smoke, demo, docs

### Overview

Smoke section 33, the smoke's and demo's events with all modules on, the demo's default event, CLAUDE.md and README.

### Changes Required:

- `scripts/lib/platform.mjs` `createEvent(env, restaurantId, name, { allModules })`; smoke and demo main event pass it.
- `scripts/smoke.mjs` section 33: defaults of a new event, each module off → its guest/organizer routes refuse
  (404 / 409) and its data survives → on → data back; guest token and TV token change; availability and lead rule;
  paid lock; admin unlock (no grant 404, support → 200 + owner's log entry, owner 404, unknown/malformed 404, foreign
  Origin 403); waiter / owner B 404, no session 401, support read-only.
- `scripts/demo.mjs`: main event all on (AI unlocked) and one event with defaults; adjust the support-log assertion.
- CLAUDE.md section, README if commands change.

### Success Criteria:

#### Automated Verification:

- `npm run build`, `npm run smoke` against `AI_PROVIDER=mock npm run preview`, `npm run demo`

---

## Testing Strategy

### Unit Tests:

- `effectiveModules` for every layer combination; defaults; paid lock; `moduleForApiPath` for every gated and ungated path.
- Guest token differs when a module flag changes and stays when nothing changes.

### Integration Tests:

- New event defaults; the unlock function's grant checks and log row; enabling/disabling keeps data.

### Manual Testing Steps:

1. Toggle modules as client, venue and admin in PL and EN; watch a guest phone and the TV drop a module on their next poll.

## Migration Notes

Additive; the code reads the new columns in the access resolver, so the migration must reach the DB BEFORE the code
(else every keyed page is a 500).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data, gates, tokens and routes

#### Automated

- [x] 1.1 Migration applies on the current local data and every pre-existing event keeps the v1 modules on — b45397a
- [x] 1.2 Unit and integration tests pass — b45397a
- [x] 1.3 Lint and types — b45397a

### Phase 2: UI

#### Automated

- [x] 2.1 Lint, types and build — 2646eb0

#### Manual

- [ ] 2.2 Client toggles, venue availability and admin unlock work in the browser in PL and EN

### Phase 3: Smoke, demo, docs

#### Automated

- [x] 3.1 Build, smoke and demo pass — ffb9fb5
