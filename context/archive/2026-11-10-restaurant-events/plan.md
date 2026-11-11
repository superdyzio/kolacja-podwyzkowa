# Restaurant events and the client's links (S-11 restaurant-events) Implementation Plan

## Overview

The north star of M-2: a restaurant runs its own events in its panel. The owner (and, once S-12 can invite them, a manager — gated by role now) creates an event with a name, a date and an expected number of guests and lands on the event card, where they copy the client (`/o/`), TV (`/tv/`) and staff tablet (`/r/`) links. They browse upcoming, past and archived events, replace any of the three links after a confirmation that says whom it cuts off, archive and restore events, and the OWNER deletes an event permanently. Staff of another restaurant get the identical denial of an unknown event. PRD v2 FR-024, FR-025, US-06 (AC: < 3 minutes from „Nowe wydarzenie” to a copied client link; replacing a link names who is cut off), US-09 (archive; the owner deletes early), US-10 (one denial).

## Current State Analysis

- `public.event` (F-02, `supabase/migrations/20261109120000_multi_tenant_events.sql`): `id` int identity, `restaurant_id`, `name` (1–120, trimmed), `organizer_key` / `tv_key` / `restaurant_key` (unique, filled by column defaults), `created_at`, plus the v1 flags. No date, no status: F-02 left „data/status wydarzenia” for this slice (overnight-log 2026-11-09). Every child table cascades on event delete (`on delete cascade` on every `event_id` FK; composite FKs inside the event) — `tests/integration/helpers.ts:releaseTestEvent` already deletes populated events that way.
- `src/lib/event.ts`: `createRestaurant`, `createEvent(db, { restaurantId, name })` (one insert, then `loadStarterQuestions`, best effort). Used by integration tests; scripts insert the same rows over PostgREST (`scripts/lib/platform.mjs:createEvent`). Its header says nothing in the app creates events yet.
- Guards (`src/lib/panel-api.ts`): `panelApi`, `panelRestaurantApi(locals, id, roles)`, `panelEventApi(locals, id, roles)` (event → its restaurant → membership; malformed/unknown/foreign/disabled/role outside `roles` → the one 404 `{"error":"Brak dostępu"}`), `findPanelRestaurant` for pages. No page-side event lookup yet.
- `GET /api/panel/events/<id>` (F-03) answers `{ event: { id, name, restaurantId }, role }` for owners and managers, deliberately without keys; smoke section 25 (`ownEvent`, `scripts/smoke.mjs:4492`) asserts the body carries neither the organizer nor the TV key.
- `/panel/restauracje/<id>` (`src/pages/panel/restauracje/[id].astro`, S-10): restaurant name, role, „Wydarzeń: N” with `eventsComingSoon`, team for owners/managers (`getRestaurantOverview`, `restaurantPanelMessages`).
- Key rotation exists once: `rotateRestaurantKey(db, eventId)` (`src/lib/orders/service.ts:320`, `generateAccessKey()` + update), used by the CLIENT's „Wymień link” on `/o/<key>/zamowienia` (`RestaurantLinkCard`, copy with select-the-field fallback). The middleware resolves every key per request (`resolveAccess`), so a replaced key opens nothing at once.
- Middleware: `/api/panel/**` mutations without the page's own Origin → 403 before any DB read; `/panel/**` without a session → 303 `/logowanie`; `/api/panel/**` → 401; `AUTH_AREA_HEADERS` (no-store, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`).
- Smoke (`scripts/smoke.mjs`): sections 25–26 leave valid sessions `sessionOwner` (owner of A, and since 26 also owner of B), `sessionB` (owner of B only), `sessionWaiter` (waiter of A), `sessionAdmin` (no memberships); helpers `request`, `panelGet`, `noAccessJson`, `isNoAccessPage`, `authHeaders`, `asStaff`, `sessionOf`, `FOREIGN`, `meNoCookie`. Section 26 asserts A's `memberCount === 2` and `eventCount === 1` (so new accounts/events for this slice are added after it).
- Demo (`scripts/demo.mjs`): one new „Restauracja demo” + event „Kolacja podwyżkowa (demo)” over PostgREST, owner redeemed over HTTP (`demo-wlasciciel-1`), admin; its `request` helper has no cookie support.

## Desired End State

- Migration `supabase/migrations/20261110120000_restaurant_events.sql` (additive) adds `event.event_date` (date, NOT NULL; existing rows backfilled from `created_at` in Europe/Warsaw; default = today in Europe/Warsaw, so every existing insert path keeps working), `event.expected_guests` (nullable, 1–1000) and `event.archived_at` (nullable timestamptz; null = active). Applies with `db reset` and with `migration up` on a populated DB (every row and key unchanged).
- `/panel/restauracje/<id>` for owners and managers: „Nowe wydarzenie” (name, date, optional expected guests) → on success the browser lands on the new event's card; lists „Nadchodzące” (today and later; „Dziś” marked; an event dated yesterday still counts as today until 12:00 Warsaw time), „Minione” and „Archiwum” as tabs (`?lista=nadchodzace|minione|archiwum`) with counts; each row links to the card. Waiters see a note that their day view comes later (S-21), never the lists.
- `/panel/wydarzenia/<id>` (event card, owners and managers): name, date with weekday, expected guests, status; the three links (client first) with „Kopiuj”, „Otwórz” and „Wymień link” whose confirm says exactly who is cut off; edit of name/date/expected guests; „Archiwizuj” / „Przywróć” (links keep working, said in the confirm); „Usuń trwale” for owners only (confirm names the event and says everything in it and all its links go). After deleting: back to the restaurant page.
- API (owners and managers unless noted; everyone else the identical 404; no session the identical 401; mutations without the page's Origin 403):
  - `GET /api/panel/restaurants/<id>/events` → `RestaurantEventListDto { today, upcoming, past, archived }`
  - `POST /api/panel/restaurants/<id>/events { name, date, expectedGuests? }` (strict) → 201 `{ event: EventCardDto, role }`
  - `GET /api/panel/events/<id>` → `{ event: EventCardDto, role }` (now with the link paths)
  - `PATCH /api/panel/events/<id> { name?, date?, expectedGuests?, archived? }` (strict, ≥ 1 field) → `{ event, role }`
  - `DELETE /api/panel/events/<id>` → OWNER only → `{ deleted: true, restaurantId }`
  - `POST /api/panel/events/<id>/links/<organizer|tv|restaurant>` → `{ event, role }` with the new link (old key dead at once); any other kind → the identical 404
- A replaced key: old `/o/…`, `/tv/…`, `/r/…` pages and their APIs → the identical 404; the new one works. A deleted event: card, list, every link → gone; other events (same and other restaurants) untouched.
- Smoke section 27, demo with at least one upcoming, one past and one archived event in the demo restaurant, CLAUDE.md and README updated.

### Key Discoveries:

- `src/lib/auth/service.ts:378-393` `findEventMembership` is the single event lookup (event → restaurant membership, disabled restaurant = null); a page-side `findPanelEvent` and the API guard both go through it.
- `src/lib/orders/service.ts:320` — rotation is `generateAccessKey()` + an update of one key column; the middleware needs nothing else for the old key to die.
- `src/lib/guests/names.ts:43` `normalizeDisplayName` + code-point length is how S-10 validates names (`src/lib/platform/rules.ts`); the event name follows the same rule with the DB's 1–120.
- `src/components/orders/RestaurantLinkCard.tsx` — the copy / open / replace pattern with `origin = Astro.url.origin` (https behind the Lambda proxy).
- Smoke section 26 pins A's member and event counts; new accounts and events go after it.

## What We're NOT Doing

- Creating an event from a venue template, „zaktualizuj z szablonu” (S-15). The create form and `createEvent` take an optional template later; no `kind` column now — S-15 adds it and must filter templates out of `listRestaurantEvents` (the one list query) and the counters.
- Inviting managers or waiters (S-12), the waiter's „dziś” view and per-event waiter access (S-21), the admin's support view (S-13), the client/restaurant split and „lokal prowadzi” (S-14), retention and export (S-26).
- Changing the client's own link handling: the organizer page keeps showing the TV and restaurant links and the client's „Wymień link” for the restaurant link (S-14 decides the client's scope).
- Changing the TV or restaurant views when their key dies (they keep their existing 404/offline behaviour).
- Event times of day, time zones per restaurant, copying an event, bulk actions, pagination (lists ≤ PostgREST `max_rows` 1000 per restaurant — enough for M-2).

## Implementation Approach

Additive schema (three nullable-or-defaulted columns, no new DB function: create is the existing insert, rotate is one update, delete is one `delete … where id and restaurant_id` relying on the cascades). A new domain module `src/lib/events/` (pure rules, dates, messages, zod bodies; DB service) used by thin panel routes behind the central guard, with role sets declared once (`EVENT_STAFF_ROLES = owner, manager`; `EVENT_DELETE_ROLES = owner`) so S-12's managers get exactly the PRD rights. "Today" is computed in one pure function from a single platform time-zone constant (Europe/Warsaw), with the noon rule of FR-029 built in so S-21 reuses it. Pages are server-rendered; two React islands (create form, event card) talk JSON to the API like the platform panel.

## Critical Implementation Details

- **Time zone**: Lambda and Postgres run in UTC. All "today" logic goes through `src/lib/events/dates.ts` (`PLATFORM_TIME_ZONE = "Europe/Warsaw"`, `Intl.DateTimeFormat(…, { timeZone })`), taking `now` as a parameter for tests. The DB default and the backfill use `(… at time zone 'Europe/Warsaw')::date` — never `current_date`.
- **Smoke ordering**: section 25's `ownEvent` assertion (no keys in `GET /api/panel/events/<id>`) changes on purpose: the card carries the link paths for owners and managers (PRD: they hold the links). Update that assertion in phase 2 together with the route change (so the full smoke stays green after every phase) to check the paths match A's keys, and log it; the waiter/foreign denials stay.
- **Deletion scope**: always `delete from event where id = <id> and restaurant_id = <guarded restaurant>`; zero rows → the identical 404. Never a loop over child tables.

## Phase 1: Schema, rules and services

### Overview

The event gets a date, an expected guest count and an archive mark; a pure module defines the inputs, "today" and the texts; a DB service lists, creates, edits, archives, rotates and deletes inside one restaurant.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261110120000_restaurant_events.sql`

**Intent**: Add the three columns with a backfill, a sane date range and an index for the per-restaurant list. Header comment in the style of the earlier migrations (what, why, access model unchanged, additive).

**Contract**: `event_date date not null default ((now() at time zone 'Europe/Warsaw')::date)` with `check (event_date between '2000-01-01' and '2100-12-31')`, backfilled `(created_at at time zone 'Europe/Warsaw')::date` before NOT NULL; `expected_guests integer` with `check (expected_guests is null or expected_guests between 1 and 1000)`; `archived_at timestamptz`; `create index event_restaurant_id_date_idx on public.event (restaurant_id, event_date)`. Column comments. No function changes.

#### 2. DB types

**File**: `src/db/database.types.ts`

**Intent**: `event` Row/Insert/Update gain `event_date: string`, `expected_guests: number | null`, `archived_at: string | null` (Insert/Update optional), with one-line comments.

#### 3. Pure rules, dates, messages, zod bodies

**Files**: `src/lib/events/rules.ts`, `src/lib/events/dates.ts`, `src/lib/events/messages.ts`, `src/lib/events/api.ts`, `src/lib/events/index.ts`

**Intent**: Everything the routes and islands share, without DB or `astro:*`.

**Contract**:
- `rules.ts`: `EVENT_NAME_MAX = 120`, `EXPECTED_GUESTS_MAX = 1000`; `parseEventName(raw)` → `{ ok, name } | { ok: false, reason: "empty" | "too-long" }` (normalizeDisplayName, code points); `parseEventDate(raw)` → `{ ok, date } | { ok: false }` (exactly `YYYY-MM-DD`, a real calendar date, 2000-01-01…2100-12-31); `parseExpectedGuests(value: number | null | undefined)` → `{ ok, value: number | null } | { ok: false }` (integer 1…1000; null/undefined = none); `EVENT_STAFF_ROLES: readonly StaffRole[] = ["owner", "manager"]`, `EVENT_DELETE_ROLES = ["owner"]`, `canDeleteEvents(role)`; `EVENT_LINK_KINDS = ["organizer", "tv", "restaurant"]`, `isEventLinkKind`.
- `dates.ts`: `PLATFORM_TIME_ZONE`, `DAY_ROLLOVER_HOUR = 12`; `localDateTime(now, timeZone?)` → `{ date: "YYYY-MM-DD", hour }`; `platformToday(now)`; `eventTiming(eventDate, now)` → `"upcoming" | "today" | "past"` (today = the local date, or the previous local date while the local hour < 12); `addDays(date, n)`; `partitionEvents(events, now)` → `{ upcoming (today + future, date asc then id asc), past (date desc then id desc), archived (any date, date desc then id desc) }` for items with `{ id, date, archived }`; `formatEventDate(date, locale)` hand-rolled („sob., 12.12.2026” / „Sat, 12 Dec 2026”, weekday from the UTC calendar, so SSR and browsers agree).
- `messages.ts`: `eventPanelMessages` (`defineMessages`, PL + EN): list tabs and empty states, form labels/hints/buttons, validation messages (`eventNameProblem`, date, guests), card headings, the three link labels and per-kind replace confirms naming who is cut off (client: the organizer link stops working at once — send the new one, the client's open pages and offline copy stop; guests' links, TV and tablet are not affected; TV: the screen on the old link stops updating — open the new link on it; tablet: kitchen/service lose the order view until they open the new link), copied / replaced notices, archive / restore confirms (links keep working), delete confirm (names the event; guests, seating, orders, guesses and questions go; the client, TV, tablet AND every guest's personal link and QR card stop working; cannot be undone), status badges („Dziś”, „Nadchodzące”, „Minione”, „Archiwum”), waiter note, aria labels.
- `api.ts`: `CreateEventBody = { name: string ≤ 400, date: string ≤ 20, expectedGuests?: number | null }` strict; `UpdateEventBody = { name?, date?, expectedGuests?, archived?: boolean }` strict, refined to ≥ 1 field.
- `index.ts` re-exports server-side; islands import the pure modules directly.

#### 4. Service

**Files**: `src/lib/events/service.ts`, `src/lib/event.ts`, `src/types.ts`

**Intent**: The DB side of the panel, scoped by restaurant id on every query (defence in depth behind the guard); `createEvent` in `src/lib/event.ts` gains the new fields so there stays one creation path (starter questions included).

**Contract**:
- `src/types.ts`: `EventLinksDto { organizer, tv, restaurant }` (paths `/o/<key>` …), `EventSummaryDto { id, name, date, expectedGuests, archived, timing }`, `EventCardDto extends EventSummaryDto { restaurantId, restaurantName, archivedAt, guestCount, links }`, `RestaurantEventListDto { today, upcoming, past, archived }`.
- `src/lib/event.ts`: `createEvent(db, { restaurantId, name, date?, expectedGuests? })` — omitted fields use the DB defaults; update its header comment (the panel creates events now).
- `service.ts`: `listRestaurantEvents(db, restaurantId, now)` → `RestaurantEventListDto` (the ONE list query; S-15 adds its template filter here); `getEventCard(db, restaurantId, eventId, now)` → `EventCardDto | null` (event + restaurant name + head-count of guests); `createRestaurantEvent(db, restaurantId, input, now)` → `{ status: "created", event } | { status: "restaurant-not-found" }`; `updateEvent(db, restaurantId, eventId, patch)` → `"updated" | "not-found"` (`archived: true` sets `archived_at = now()` only when null, `false` clears it); `rotateEventKey(db, restaurantId, eventId, kind)` → `"rotated" | "not-found"` (new `generateAccessKey()` in that one column); `deleteEvent(db, restaurantId, eventId)` → `"deleted" | "not-found"`. Supabase errors throw.

#### 5. Tests

**Files**: `src/lib/events/events.test.ts`, `tests/integration/restaurant-events.test.ts`

**Intent**: Unit: name/date/guest rules (empty, 120/121 code points, emoji, 2026-02-29 vs 2028-02-29, `12.12.2026`, 0/1/1000/1001/2.5/null); `eventTiming` around midnight and noon in Warsaw (incl. a UTC instant on the previous UTC day), CET and CEST; partition order and archived-first-regardless-of-date; `formatEventDate` both locales; message parity sanity. Integration (own restaurant(s) and events, released after): create with and without date/guests (default date = Warsaw today) and starter questions loaded; list partition with past/today/future/archived; card fields and guest count; edit; archive/restore keeps keys; each rotation changes only its key and `resolveAccess` denies the old one, grants the new; every function with another restaurant's id → `not-found` and nothing changed; delete of a populated event (guests, group, room, table, seating snapshot, order line, guess, question) removes all its rows and leaves a second event of the same restaurant and an event of another restaurant byte-identical.

### Success Criteria:

#### Automated Verification:

- Migration applies from scratch: `npx supabase db reset`
- Migration applies on the populated local DB with every existing row and key unchanged: `npx supabase migration up` (counts before/after)
- Unit and integration tests pass: `AI_PROVIDER=mock npm test`
- Lint and type check pass: `npm run lint`, `npx astro check`

#### Manual Verification:

- After `migration up`, pre-existing events have a date equal to their creation day (Warsaw) and no archive mark, and `listRestaurantEvents` of their restaurant returns them (checked over SQL/REST on the populated DB; smoke's event A, inserted over PostgREST without a date like event 1 was, is the HTTP proof in phase 3)

**Implementation Note**: unattended run — manual rows are verified by the agent where possible (HTTP / SQL) and otherwise left for the user in the closing checklist.

---

## Phase 2: Guard, API routes, pages and islands

### Overview

The panel gets the event routes, the restaurant page lists and creates events, and the event card manages links, archive and delete.

### Changes Required:

#### 1. Guard for pages

**File**: `src/lib/panel-api.ts`

**Intent**: `findPanelEvent(locals, idParam, roles)` (mirror of `findPanelRestaurant`, via `findEventMembership`) for pages; `panelEventApi` reuses it so pages and routes decide identically.

#### 2. API routes

**Files**: `src/pages/api/panel/restaurants/[id]/events.ts` (GET, POST), `src/pages/api/panel/events/[id].ts` (GET extended, PATCH, DELETE), `src/pages/api/panel/events/[id]/links/[kind].ts` (POST)

**Intent**: Thin routes: guard (`panelRestaurantApi` / `panelEventApi` with `EVENT_STAFF_ROLES`, DELETE with `EVENT_DELETE_ROLES`) → `readJsonBody` → rules (400 with the PL/EN message) → service → whole card. `not-found` from the service and an unknown link kind → `denied(locals)`. `export const prerender = false`.

**Contract**: as in Desired End State. POST create → 201. PATCH validates each present field; DELETE answers `{ deleted: true, restaurantId }`.

#### 3. Restaurant page: lists and create form

**Files**: `src/pages/panel/restauracje/[id].astro`, `src/components/events/NewEventForm.tsx`, `src/lib/restaurants/messages.ts`

**Intent**: Replace `eventsComingSoon`: for owners/managers the „Nowe wydarzenie” island (POST → `window.location.assign("/panel/wydarzenia/<id>")`; errors inline; date input `type="date"`, guests `type="number"` optional) and the three tabs rendered server-side from `listRestaurantEvents(…, new Date())` (tab from `?lista=`, unknown value = upcoming; each row `data-event-id`, name linked to the card, formatted date, guests, „Dziś” badge); waiters get the S-21 note. Unused texts removed.

#### 4. Smoke section 25 assertion

**File**: `scripts/smoke.mjs`

**Intent**: `ownEvent` now expects the card with the three link paths equal to `/o/<organizerKey>`, `/tv/<tvKey>`, `/r/<restaurantKey>` of event A (comment: owners and managers hold the links since S-11).

#### 5. Event card page and island

**Files**: `src/pages/panel/wydarzenia/[id].astro`, `src/components/events/EventCard.tsx`, `src/components/events/EventLinkRow.tsx`, `src/components/hooks/useEventCard.ts`

**Intent**: Page: `findPanelEvent(…, EVENT_STAFF_ROLES)` else `NoAccess` (404); back link to the restaurant; island with `initial` card, `role`, `origin`, `locale`. Island: header (name, date, guests, status badge), the three `EventLinkRow`s (client first; read-only field, „Kopiuj” with select fallback, „Otwórz” in a new tab, „Wymień link” → `window.confirm(kind-specific text)` → POST → new link shown + notice), details form (PATCH), „Archiwizuj”/„Przywróć” with confirm, owner-only danger zone „Usuń trwale” (confirm → DELETE → `window.location.assign` to the restaurant page). Hook: every answer replaces the card; 404 → the card is gone (message + link back); network failures via `api-failure.ts`.

### Success Criteria:

#### Automated Verification:

- Tests, lint, type check and build pass: `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build`
- On `AI_PROVIDER=mock npm run preview`, the existing smoke (with the updated section-25 assertion) passes: `npm run smoke`

#### Manual Verification:

- In a browser: log in as the demo owner → „Nowe wydarzenie” → the card → „Kopiuj” the client link → it opens the organizer view (< 3 minutes, US-06 AC)
- Replace each link: the confirm names who is cut off; the old link shows the no-access page, the new one works
- Archive/restore moves the event between tabs; „Usuń trwale” only for the owner; PL/EN texts everywhere

---

## Phase 3: Smoke and demo

### Overview

HTTP proof of the access matrix for the new routes and a demo restaurant that shows every list.

### Changes Required:

#### 1. Smoke section 27

**File**: `scripts/smoke.mjs`

**Intent**: New section 27 „Restaurant events (restaurant-events, S-11)” after 26, using its sessions plus a manager of A created here (`ensureStaffAccount` + `addMembership(…, "manager")` + redeemed invitation):
- owner A: list contains event A (upcoming, today); create (future date, 80 guests) → 201 with three fresh keys; card GET and `/panel/wydarzenia/<id>` page (auth headers, the client URL in the HTML); the restaurant page shows it under „Nadchodzące”; the new client link opens and has the starter base (90 questions); a past-dated event lands in `?lista=minione`
- validation: empty / 121-character name, `2026-02-30`, `12.12.2026`, guests 0 / 1001 / 2.5, an extra field, an empty PATCH → 400 with a message
- edit: PATCH name, date, guests → card updated
- each link kind, on an event created in this section (never event A or B, which earlier sections compare): rotate → new key; the old `/o/` + `/api/o/…/guests`, `/tv/` + `/api/tv/…/seating`, `/r/` + `/api/r/…/orders` → the identical 404 (page or JSON); the new ones 200; `/links/guest` → identical 404
- archive → in `archived` only, its client link still opens; restore → back in upcoming
- manager A: list, create, rotate, archive → OK; DELETE → identical 404 and the event still exists
- waiter A, owner B (outsider), admin: list, create in A, card, PATCH, rotate, DELETE on A's event → the identical 404 body of an unknown id (`2000000000`); pages → the no-access page identical to an unknown id; malformed/huge ids identical; nothing changed (A's card read again by owner A equal)
- no session: every route → the identical 401 of `/api/panel/me`
- Origin: create, PATCH, rotate, DELETE without Origin / with a foreign Origin → 403, nothing changed
- delete by owner A of another event created in this section, with a guest → 200; card, list, its three links → gone (identical 404); event A's guests API and event B read the same as before

#### 2. Demo

**Files**: `scripts/demo.mjs`, `scripts/lib/platform.mjs` (only if the `createEvent` comment needs the new defaults)

**Intent**: Keep the main demo event (today → „Dziś” under upcoming). The `request` helper gets a cookie option; the owner's session comes from the invitation redeem; through the panel API the owner creates „Wigilia firmowa (demo)” (+32 days, 80 guests), „Urodziny Ani (demo)” (−10 days, 30 guests) and „Komunia Zosi (demo)” (−60 days, archived by PATCH). The summary prints the restaurant panel address.

### Success Criteria:

#### Automated Verification:

- `npm run build`, then on `AI_PROVIDER=mock npm run preview`: `npm run smoke` passes (twice in a row on the same DB)
- `npm run demo` passes and the owner's list API shows ≥ 1 upcoming, ≥ 1 past, ≥ 1 archived event in the demo restaurant
- `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check` pass

#### Manual Verification:

- Demo owner's restaurant page shows the three tabs filled and the cards open

---

## Phase 4: Documentation

### Overview

CLAUDE.md and README describe the events of a restaurant; the overnight log has the decisions.

### Changes Required:

#### 1. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: A „Restaurant events (restaurant-events, S-11)” block under Data access (columns, date semantics and the time-zone constant, roles, routes, pages, delete = cascade within the restaurant, archive keeps links, rotation, S-15 must filter templates in `listRestaurantEvents` and counters, S-21 reuses `eventTiming`); `findPanelEvent` in the panel guard paragraph; `src/lib/event.ts` no longer "nothing creates events"; smoke and demo command descriptions; deploy note (the migration before the code: the panel reads the new columns).

#### 2. README

**File**: `README.md`

**Intent**: The restaurant panel section: create an event, copy the client link, replace links, archive, delete (owner).

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check` pass; `git diff --stat` touches only docs in this phase

#### Manual Verification:

- CLAUDE.md read-through: the new routes, roles and date rule are findable

---

## Testing Strategy

### Unit Tests:

- Rules (name, date, expected guests), roles and link kinds; `eventTiming` (Warsaw midnight, the noon rollover, DST), `partitionEvents` ordering, `formatEventDate` PL/EN.

### Integration Tests:

- `tests/integration/restaurant-events.test.ts`: create/list/card/edit/archive/rotate/delete scoped by restaurant; the cascade of a populated event and the untouched neighbours.

### Manual Testing Steps:

1. Demo owner: „Nowe wydarzenie” → card → copy the client link → open it (time it).
2. Replace the TV link with the TV page open: it stops updating; the new link works.
3. Archive and restore; delete as owner; as a manager (DB-added) there is no delete button.

## Performance Considerations

One list query per restaurant page (index `(restaurant_id, event_date)`), one card read + one head count. Rotation and delete are single statements.

## Migration Notes

Additive and backfilled; the code reads the new columns, so the migration goes to the platform DB before the code (`db push` before `deploy:aws`, the user's step). Never to the old dinner project.

## References

- Roadmap: `context/foundation/roadmap.md` (### S-11)
- PRD: `context/foundation/prd-v2.md` (FR-024, FR-025, US-06, US-09, US-10, Access Control Changes)
- Similar implementation: `src/components/orders/RestaurantLinkCard.tsx`, `src/pages/api/panel/platform/restaurants/index.ts`, `context/archive/2026-11-09-platform-restaurants/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, rules and services

#### Automated

- [x] 1.1 Migration applies from scratch: `npx supabase db reset` — 4262d15
- [x] 1.2 Migration applies on the populated local DB with every existing row and key unchanged — 4262d15
- [x] 1.3 Unit and integration tests pass: `AI_PROVIDER=mock npm test` — 4262d15
- [x] 1.4 Lint and type check pass: `npm run lint`, `npx astro check` — 4262d15

#### Manual

- [x] 1.5 After `migration up`, pre-existing events have their creation day as date, no archive mark, and show in their restaurant's list — 4262d15

### Phase 2: Guard, API routes, pages and islands

#### Automated

- [x] 2.1 Tests, lint, type check and build pass — e020e1a
- [x] 2.2 Existing smoke (updated section-25 assertion) passes on the preview — e020e1a

#### Manual

- [ ] 2.3 Browser: create → card → copy the client link → organizer view in < 3 minutes
- [ ] 2.4 Replace each link: confirm names who is cut off; old link dead, new works
- [ ] 2.5 Archive/restore between tabs; delete only for the owner; PL/EN everywhere

### Phase 3: Smoke and demo

#### Automated

- [x] 3.1 `npm run smoke` passes twice in a row on the preview — 3cd5951
- [x] 3.2 `npm run demo` passes with upcoming, past and archived events in the demo restaurant — 3cd5951
- [x] 3.3 Tests, lint and type check pass — 3cd5951

#### Manual

- [ ] 3.4 Demo owner's restaurant page shows the three tabs filled and the cards open

### Phase 4: Documentation

#### Automated

- [x] 4.1 Lint and type check pass; only docs touched — 3dcb0df

#### Manual

- [ ] 4.2 CLAUDE.md read-through: routes, roles and the date rule are findable
