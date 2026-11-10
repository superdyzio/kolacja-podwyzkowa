# Platform admin's support access with an access log for the owner (S-13 admin-support-log) Implementation Plan

## Overview

The platform administrator opens any restaurant's data in a support mode: an explicit „Wejdź jako wsparcie” with a reason, read-only, bound to the admin's login session and limited to 60 minutes. Every entry, every page or API read in that mode and every exit lands in an append-only log that the restaurant's OWNER sees on the restaurant page. Outside the mode, a foreign restaurant stays the identical denial of an unknown one. This is the only exception to data isolation (NFR-012), so the check and the log write are one database call inside the central panel guards: no log row, no data. PRD v2 FR-021 („wejść w dane każdej restauracji (wsparcie); każde jego wejście w dane lokalu jest zapisane i widoczne dla właściciela lokalu”), US-05 AC („Właściciel widzi w dzienniku każde wejście administratora platformy w dane lokalu”), US-10 AC („Wyjątkiem jest tylko administrator platformy, a jego wejście trafia do dziennika”), NFR-012, the Access Control table (admin: „pełny wgląd w dane każdej restauracji (wsparcie)”).

## Current State Analysis

- Central guards (`src/lib/panel-api.ts`): `findPanelRestaurant(locals, id, roles)` / `panelRestaurantApi` and `findPanelEvent(locals, id, roles)` / `panelEventApi` decide every panel page and route from `findRestaurantMembership` / `findEventMembership` (`src/lib/auth/service.ts:352`, `:378`): not a member, unknown, malformed, out-of-int4, disabled restaurant and a role outside `roles` → null → the identical 404 `{"error":"Brak dostępu"}` / no-access page. The comment there reserves the admin's bypass for S-13. The guards get `locals` only — they do not know the request's method or path today.
- Middleware (`src/middleware.ts` `guardStaffArea`): staff areas `/panel/**`, `/api/panel/**` (session required), Origin check on every mutation under `/api/panel/` and `/api/auth/` (403 before any DB read), `locals.staff: StaffSession` (`sessionId`, `accountId`, `email`, `displayName`, `isPlatformAdmin`, `expiresAt`).
- Sessions (`staff_session`, F-03): per account, 30 days fixed; logout deletes this row (or all of the account's), a password change deletes the account's other rows, a redeemed reset link deletes all.
- Platform panel (S-10): `panelPlatformApi(locals)` (admin only, else the identical 404), routes under `/api/panel/platform/restaurants[/<id>[/owners…]]`, page `/panel/platforma` with island `PlatformRestaurantsManager` → `PlatformRestaurantCard` (hook `usePlatformRestaurants`, `PlatformRequest.method` `"POST" | "PATCH"`, every answer `{ restaurants, … }`). The admin sees counters and owners only.
- Restaurant data in the panel today: `/panel/restauracje/<id>` (name, role, „Nowe wydarzenie” island, event tabs from `listRestaurantEvents`, owners/managers: „Zespół” island `TeamManager` from `getTeam`), `/panel/wydarzenia/<id>` (island `EventCard` with the client / TV / tablet LINKS, edit, archive, delete), GET routes `/api/panel/restaurants/<id>` (any role), `/restaurants/<id>/events`, `/restaurants/<id>/team` (owner, manager), `/api/panel/events/<id>` (owner, manager; the card WITH link paths = link keys). Guests, seating and orders are reachable only through the client link `/o/<key>` (staff preview of the client's work is S-14).
- Smoke (`scripts/smoke.mjs`): sections 25–28 create the run's accounts and check that the admin without membership gets the identical 404 on restaurant, event and team routes; section 28 ends with `finish()`. Sessions after 28: `sessionAdmin`, `sessionOwner` (owner of A and B), `sessionB`, `sessionC` (owner of C, created in 26), `sessionManager` (manager A, section 27), `sessionWaiter`, `sessionMgr` / `sessionW1` (section 28); helpers `staffCall`, `noAccessJson`, `isNoAccessPage`, `platformCall`, `FOREIGN`, `restaurantPageOf`, `eventPage`, `eventApi`, `eventsApiOf`, `teamApiOf`.
- Demo (`scripts/demo.mjs`): keeps one admin `admin@demo.stolik` / `demo-admin-1` (login answers 303 + cookie; `adminReady` is a boolean today and the cookie is dropped), owner cookie `ownerCookie`, the main event `event.id`.

## Desired End State

- Migration `supabase/migrations/20261110160000_admin_support_log.sql` (additive: two tables, three functions, one trigger function with its triggers).
- On `/panel/platforma` every restaurant card (also a disabled one) has „Wejdź jako wsparcie”: a required reason (3–300 characters, shown to the owner) → the browser lands on `/panel/restauracje/<id>` in support mode. A card whose support is active in THIS login shows „Wsparcie aktywne do HH:MM” with „Otwórz” and „Zakończ wsparcie”.
- In support mode the admin sees the restaurant page as its owner does, read-only: a banner (restaurant, reason, until when, „Zakończ wsparcie”; for a disabled restaurant a note), the event tabs, the team as a plain list, the support log; every event card as a read-only summary WITHOUT the client / TV / tablet links. No create, edit, archive, delete, link replacement, invitation, role change or removal: every mutation of the admin on a restaurant or event route gets the identical 404 and changes nothing.
- The owner (and only owners — managers and waiters get no section and the identical 404 on the API) sees on `/panel/restauracje/<id>` the section „Dziennik wejść administratora”: newest first, each row when (Warsaw time), who (name and e-mail), what — „wszedł w tryb wsparcia do HH:MM, powód: „…””, „otworzył: <area / event name> (<path>)”, „zakończył tryb wsparcia”. `GET /api/panel/restaurants/<id>/support-log` → `SupportLogDto`. No route edits or deletes a row, and the database refuses `update`, `delete` and `truncate` on the log (except the cascade when a restaurant is deleted).
- Support ends at „Zakończ wsparcie” (logged), after 60 minutes, at logout, when the login session ends any other way (password change, „Wyloguj wszędzie”, a used reset link), or when the account loses the admin flag. Another login of the same admin (another device) is not in support mode.
- Smoke section 29 and `npm run demo` (one logged support visit in the demo restaurant: enter, restaurant page, the main event's card, exit) prove it; CLAUDE.md and README describe it.

### Key Discoveries:

- `src/lib/panel-api.ts` is the one place where pages and routes take a restaurant or an event (CLAUDE.md: „take restaurant and event ids only through these guards”) — adding the support path there covers every current and future panel view (S-14's previews included) with no per-route code.
- The guards only receive `locals`; read-only enforcement and the logged path need the request's method and path, which only the middleware has (`guardStaffArea` in `src/middleware.ts`).
- `GET /api/panel/events/<id>` and the event card page hand out the three link keys (`getEventCard` → `links`); the client link `/o/<key>` writes the event's data with no session and no log, and outlives any time box until rotated — it must not reach the admin in support mode.
- `staff_session` rows are deleted on logout / password change (`supabase/migrations/20261109140000_staff_accounts.sql`), so a grant with `session_id … on delete cascade` ends with the login for free; the log must therefore never reference the grant or the session with a cascading or nulling FK.
- `findRestaurantMembership` returns null for a disabled restaurant; the support path must not go through it (the admin may enter a disabled restaurant).
- An append-only trigger also fires for rows deleted by an `on delete cascade` of the parent; it lets a delete through only when the parent restaurant row no longer exists.

## What We're NOT Doing

- Writes in support mode (create / edit / archive / delete events, links, team changes) — read-only (decision below); the admin's own platform actions (restaurants, owners, links, switch) stay on the platform routes unchanged.
- Showing the event's client, TV or tablet links (keys) in support mode, and opening `/o/`, `/tv/`, `/g/`, `/r/` key routes on the admin's behalf; key routes are unchanged.
- Support access to anything other than the restaurant panel's pages and GET routes (no guest data views exist in the panel before S-14; S-14's views inherit support through the guards).
- Managers or waiters seeing the log; notifications to the owner (no e-mail in the app, NFR-020); exporting the log; pagination beyond the newest 100 entries; log retention rules (S-26).
- Extending a support session (enter again with a new reason instead), several restaurants' banners at once, a support marker in `/panel` (the platform page lists the active ones).
- Logging the IP or browser (no trusted client IP behind the Function URL, F-03).
- The legal text about the log for the restaurant (Open question 6, owner: user + lawyer) — the section's intro states the facts only.

## Implementation Approach

Two tables: `support_grant` (operational: who, which login session, which restaurant, reason, until; deleted with the session or the restaurant; replaced on re-entry) and `support_log` (append-only record: `enter`, `access`, `exit`, with snapshots of the admin's e-mail and name and of the event's name, no FK to the grant, session, account or event). Three service-role functions do all writes, each in one transaction: `begin_support_access` (checks the session is live and its account is a platform admin, the restaurant exists — disabled or not —, replaces this session's grant for that restaurant, writes `enter`), `record_support_access` (finds the live grant for the session and the restaurant — or the event's restaurant —, re-checks the admin flag and the session, writes `access` with method, path and event snapshot, and only then returns the restaurant and event; nothing found → empty result, no row), `end_support_access` (deletes the grant; a live one writes `exit`).

The guards: membership first, exactly as today. Only when there is no membership, the person is a platform admin, the request is a read (GET/HEAD/OPTIONS) and the route's `roles` admit the owner role, `record_support_access` runs; its row comes back as a membership with `role: "owner"` and `support: SupportAccess`. Anything else → the same null / 404 as today, byte for byte. A failed log write is a database error and throws (→ 500, no data), never a silent pass.

Pages branch on `panel.support`: the banner, no islands that write, a static team list, the event summary without links; the GET event route strips the links. The platform card gets the enter form and the active-state line; enter and exit are platform routes behind `panelPlatformApi` (Origin check from the middleware).

Decisions (unattended run, recommended options; logged as `2026-11-10 — S-13 …`):

| Decision | Choice |
| --- | --- |
| Support scope | read-only through the existing panel pages and GET routes (PRD: „pełny wgląd” = full VIEW; no PRD flow needs the admin to write a restaurant's data; writes would make the log a liability) |
| Keys | never shown in support mode (the client link writes with no log and outlives the time box) |
| Entry | explicit action with a required reason (3–300 characters), 60 minutes fixed, bound to the login session; re-entry = new reason, new `enter`, new 60 minutes |
| End | „Zakończ wsparcie” (logged `exit`), expiry, logout / session end, loss of the admin flag |
| Log granularity | `enter` + one `access` row per guarded request (method, path, event snapshot) + `exit`; rows are never merged |
| Log readers | owners only (the owner section and API); the admin in support mode sees what the owner sees, read-only — the log included |
| Disabled restaurant | the admin may enter (logged like any entry; the banner notes it is switched off) |
| Admin who is a member | the membership decides; no support row (they act as restaurant staff, not as a foreign admin) |
| Log write fails | the guard throws → 500 without data (project rule: DB errors are never a 404) |

## Critical Implementation Details

- **Order inside the guard**: membership → (no membership) admin flag → read request → `roles` admit `"owner"` → only then `record_support_access`. Checking the roles before the RPC keeps a denied request from writing an `access` row; checking the method before it keeps a mutation from ever being logged as an access. The non-admin path must not run any extra query (the identical denial stays identical in timing class too).
- **Check and write are one statement**: `record_support_access` inserts the `access` row and returns the restaurant/event from the same function; the TS service returns null only on an empty result and lets every error throw. Never call a separate "is there a grant" read followed by a log write.
- **Append-only trigger and cascades**: the `before update or delete` row trigger raises unless it is a delete whose restaurant row is already gone (the `on delete cascade` from `restaurant`); `before truncate` (statement) always raises. Integration tests that create a restaurant clean up by deleting the restaurant first, then their accounts.
- **Re-entry under concurrency**: `begin_support_access` locks the `staff_session` row `for update` before replacing the grant, so two parallel entries of one login cannot collide on `unique (session_id, restaurant_id)`.

## Phase 1: Schema, rules and service

### Overview

The two tables, the three functions and the trigger; the pure support module (rules, texts, formats, zod body) and the DB service, with unit and integration tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261110160000_admin_support_log.sql`

**Intent**: The support grant and the append-only log, written only through service-role functions. Header comment in the style of S-10/S-12 (what, why, the read-only rule lives in the app guard, the append-only rule here, access model unchanged, additive). New tables: RLS on, no policies, `revoke all … from anon, authenticated`; new functions: `set search_path = ''`, `revoke execute … from public, anon, authenticated`, a comment each.

**Contract**:
- `support_grant (id bigint identity pk, session_id bigint not null → staff_session on delete cascade, account_id bigint not null → staff_account on delete cascade, restaurant_id integer not null → restaurant on delete cascade, reason text not null (3–300 code points, trimmed), started_at timestamptz default now(), expires_at timestamptz not null, unique (session_id, restaurant_id))`.
- `support_log (id bigint identity pk, restaurant_id integer not null → restaurant on delete cascade, grant_id bigint not null (no FK), account_id bigint not null (no FK), admin_email text not null, admin_name text null, kind text check in ('enter','access','exit'), reason text null, expires_at timestamptz null, method text null, path text null, event_id integer null (no FK), event_name text null, created_at timestamptz not null default now())`; checks: `enter` ⇒ reason and expires_at set; `access` ⇒ method and path set (path starts with `/`, ≤ 300); `event_name` set iff `event_id` set; index `(restaurant_id, id desc)`.
- Trigger function `support_log_append_only()` + `before update or delete … for each row` (allow only a delete whose `restaurant` row no longer exists) + `before truncate … for each statement` (always raise `SUPPORT_LOG_APPEND_ONLY`).
- `begin_support_access(p_session_id bigint, p_restaurant_id integer, p_reason text, p_minutes integer)` → `table (grant_id bigint, started_at timestamptz, expires_at timestamptz)`: lock the session row (`NOT_ADMIN` when missing, expired or its account is not a platform admin); `RESTAURANT_NOT_FOUND`; `p_minutes` 1–240; delete this session's grant for the restaurant and its expired grants; insert the grant; insert `enter` (admin e-mail/name snapshot, reason, expires_at).
- `record_support_access(p_session_id bigint, p_restaurant_id integer, p_event_id integer, p_method text, p_path text)` → `table (restaurant_id integer, restaurant_name text, restaurant_disabled boolean, event_id integer, event_name text, grant_id bigint, reason text, started_at timestamptz, expires_at timestamptz)`: exactly one of restaurant / event (else empty); the event's restaurant; a grant of this session for that restaurant with `expires_at > now()`, the session not expired and its account still a platform admin — else empty, nothing written; insert `access` (method, path, event snapshot); return the row.
- `end_support_access(p_session_id bigint, p_restaurant_id integer)` → `boolean`: delete the session's grant for the restaurant; when it was live, insert `exit` and return true; else false.

#### 2. DB types

**File**: `src/db/database.types.ts`

**Intent**: `support_grant` and `support_log` under `Tables` (Row / Insert / Update / Relationships), the three functions under `Functions` (bigint → number).

#### 3. Pure support module

**Files**: `src/lib/support/rules.ts`, `src/lib/support/messages.ts`, `src/lib/support/format.ts`, `src/lib/support/api.ts`, `src/lib/support/index.ts`

**Intent**: Everything routes, pages and islands share, without DB / `node:crypto` / `astro:*`.

**Contract**:
- `rules.ts`: `SUPPORT_MINUTES = 60`, `SUPPORT_REASON_MIN = 3`, `SUPPORT_REASON_MAX = 300`, `SUPPORT_LOG_LIMIT = 100`, `SUPPORT_LOG_ROLES: readonly StaffRole[] = ["owner"]`, `SUPPORT_ROLE: StaffRole = "owner"` (what support mode sees), `parseSupportReason(raw)` → `{ ok, reason } | { ok: false, problem: "short" | "long" }` (whitespace collapsed and trimmed like guest names, code points), `isReadMethod(method)` (GET, HEAD, OPTIONS), `supportArea(path)` → `"restaurant" | "events" | "team" | "log" | "event" | "other"` from the panel paths.
- `messages.ts`: `supportMessages` (`defineMessages`, PL + EN): enter (button, reason label and hint „widzi go właściciel lokalu”, submit, cancel, the 60-minute and read-only note, problems short / long), active line („Wsparcie aktywne do {time}”, „Otwórz”, „Zakończ wsparcie”, confirm-free), banner (heading „Tryb wsparcia (tylko podgląd)”, reason, until, disabled note, end button, ending failure), read-only notes (team, event card „Linki wydarzenia widzi tylko personel lokalu”), log section (heading, intro: what is recorded and that entries cannot be changed or deleted, empty text, row texts for enter / access / exit, area labels, „starsze wpisy nie są pokazane” when the limit is hit).
- `format.ts`: `formatSupportTime(iso, locale)` → „10.11.2026, 01:45” / „10 Nov 2026, 01:45” and `formatSupportClock(iso)` → „01:45”, both in `PLATFORM_TIME_ZONE` (hand-assembled from `formatToParts`, like `localDateTime`); `describeSupportEntry(entry, locale)` → the row's „what” text.
- `api.ts`: `EnterSupportBody = { reason: string }` strict.
- `index.ts`: server-side re-exports (with the service); islands import the pure modules directly.

#### 4. Service and DTOs

**Files**: `src/lib/support/service.ts`, `src/types.ts`

**Intent**: The DB side of support access; the only callers of the three functions and the only reader of `support_log`.

**Contract**:
- `src/types.ts`: `SupportAccessDto { restaurantId, restaurantName, restaurantDisabled, reason, startedAt, expiresAt }` (what pages and the banner need — no grant or session id), `SupportGrantDto { restaurantId, path, startedAt, expiresAt }` (the platform page's active line), `SupportLogEntryDto { id, kind: "enter" | "access" | "exit", at, admin: { email, name }, reason, expiresAt, method, path, event: { id, name } | null }`, `SupportLogDto { restaurantId, entries, truncated }`, `SupportEventSummaryDto` = `Omit<EventCardDto, "links">`.
- `beginSupport(db, session, restaurantId, reason)` → `{ status: "entered", grant: SupportGrantDto } | { status: "not-found" }` (`NOT_ADMIN`, `RESTAURANT_NOT_FOUND` → not-found).
- `recordSupportAccess(db, sessionId, target: { restaurantId } | { eventId }, request: { method, path })` → `{ restaurant: { id, name }, event: { id, name, restaurantId } | null, support: SupportAccessDto } | null` — throws on any DB error; cuts the path to 300 characters before the call (the column's check must never turn an odd URL into a 500).
- `endSupport(db, sessionId, restaurantId)` → `boolean`.
- `listActiveSupport(db, sessionId)` → `SupportGrantDto[]` (live grants of this login, for the platform page).
- `getSupportLog(db, restaurantId)` → `SupportLogDto` (newest first, `SUPPORT_LOG_LIMIT`, `truncated` when more exist).

#### 5. Tests

**Files**: `src/lib/support/support.test.ts`, `tests/integration/admin-support.test.ts`

**Intent**: Unit: reason parsing (trim, collapse, 3 / 300 code-point bounds incl. emoji), `isReadMethod`, `supportArea` for every panel path, `formatSupportTime` / `formatSupportClock` across the DST change (fixed instants), `describeSupportEntry` in PL and EN. Integration (own restaurants via `createRestaurant` + `createEvent`, own accounts and sessions through the auth service, all cleaned up — restaurants first): begin with a non-admin session, an expired session and an unknown restaurant → not-found and no rows; begin → `enter` row with the reason and the admin's e-mail/name snapshot; record without a grant, for another restaurant, from another session of the same admin, after expiry (grant `expires_at` set in the past by the test), after the admin flag is removed → null and no row; record for the restaurant and for its event → data + `access` row with method, path and event name; an event of another restaurant → null; a disabled restaurant → allowed; re-entry replaces the grant (one grant, two `enter` rows); end → true + `exit`, again → false and no row; logout (`logout(db, session)`) removes the grant and keeps every log row; `update` and `delete` on `support_log` raise (PostgREST cannot send `truncate`: the truncate trigger is checked once by hand with `docker exec supabase_db_10x-astro-starter psql … -c "begin; truncate public.support_log; rollback;"` and the result noted in the overnight log); deleting the restaurant removes its log rows; `getSupportLog` order, limit and `truncated`; `listActiveSupport` lists only live grants of that session.

### Success Criteria:

#### Automated Verification:

- Migration applies from zero and on the current local data: `npx supabase db reset` and `npx supabase migration up` (row counts of existing tables unchanged)
- Unit and integration tests pass: `AI_PROVIDER=mock npm test`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`

---

## Phase 2: Guards, routes, pages and islands

### Overview

The support path in the central guards, the enter / exit / log routes, the read-only rendering of the restaurant and event pages, the platform card's support controls, and the owner's log section.

### Changes Required:

#### 1. Request facts for the guards

**Files**: `src/env.d.ts`, `src/middleware.ts`

**Intent**: The guards learn the request's method and path without changing any call site.

**Contract**: `App.Locals.staffRequest: { method: string; path: string } | null` — set in `guardStaffArea` (method upper-case, `url.pathname`), null on every other path (reset at the top of `onRequest` with `access` and `staff`).

#### 2. Central guards

**File**: `src/lib/panel-api.ts`

**Intent**: Support access in one place: after the membership lookup comes back null, an admin's read on a route that admits owners goes through `recordSupportAccess`; everything else is decided exactly as today.

**Contract**: `findPanelRestaurant` / `panelRestaurantApi` → `PanelRestaurant = PanelApi & RestaurantMembership & { support: SupportAccessDto | null }`; `findPanelEvent` / `panelEventApi` → `PanelEvent = PanelApi & EventMembership & { support: SupportAccessDto | null }` (members: `support: null`). Support path conditions in order: no membership, `staff.isPlatformAdmin`, `staffRequest` present and `isReadMethod`, `roles.includes(SUPPORT_ROLE)`, a well-formed id, then `recordSupportAccess(db, staff.sessionId, { restaurantId | eventId }, staffRequest)`; its null → null / `denied`. Update the file's header comment (the bypass is now this logged, read-only support path).

#### 3. Platform routes: enter and exit

**File**: `src/pages/api/panel/platform/restaurants/[id]/support.ts`

**Intent**: The admin enters and leaves support mode for one restaurant (any restaurant, disabled too).

**Contract**: `POST { reason }` (`EnterSupportBody`, strict; `parseSupportReason` → 400 with the message) → 201 `{ restaurants, support: SupportGrantDto }`; `DELETE` → 200 `{ restaurants, ended }`; both through `panelPlatformApi` and `parseIntId`; unknown / malformed id → the identical 404; other staff → the identical 404; no session → 401; foreign or missing Origin → 403 (middleware).

#### 4. Owner's log route

**File**: `src/pages/api/panel/restaurants/[id]/support-log.ts`

**Intent**: The owner reads the log as JSON (also the smoke's view of it).

**Contract**: `GET` → `SupportLogDto` through `panelRestaurantApi(locals, params.id, SUPPORT_LOG_ROLES)`; manager, waiter, other restaurants, unknown / malformed ids → the identical 404. No other method exported.

#### 5. Event route in support mode

**File**: `src/pages/api/panel/events/[id].ts`

**Intent**: In support mode the card goes out without its links.

**Contract**: `GET` with `api.support` → `{ event: SupportEventSummaryDto, support: SupportAccessDto }` (no `links`, no key anywhere in the body); members unchanged. PATCH / DELETE need no change (the guard never admits a mutation in support mode). Also `GET /api/panel/restaurants/<id>` adds `support` when set. Answers in support mode carry `role: "owner"` where they name a role (the view's role — e.g. `TeamDto.you` with the admin's account id); `support` is what marks them, and no answer ever carries a grant or session id.

#### 6. Pages in support mode

**Files**: `src/pages/panel/restauracje/[id].astro`, `src/pages/panel/wydarzenia/[id].astro`, `src/components/support/SupportBanner.astro`, `src/components/support/EndSupportButton.tsx`, `src/components/support/SupportTeamList.astro`, `src/components/support/SupportEventSummary.astro`, `src/components/support/SupportLogSection.astro`, `src/lib/restaurants/messages.ts`

**Intent**: Support mode renders what the owner sees, read-only; the owner (and support) sees the log section.

**Contract**:
- Restaurant page with `panel.support`: `SupportBanner` instead of the role line (restaurant, reason, until `formatSupportClock`, disabled note, `EndSupportButton` → `DELETE /api/panel/platform/restaurants/<id>/support` → `window.location.assign("/panel/platforma")`, failure shown in the banner); no `NewEventForm`; event tabs as today; the team as `SupportTeamList` (from `getTeam`, no actions) instead of `TeamManager`.
- Restaurant page for `panel.role === "owner"` (members and support): `SupportLogSection` (`data-support-log`, from `getSupportLog`, rows with `data-support-entry` and the kind) after the team.
- Event card page with `panel.support`: banner + `SupportEventSummary` (name, date `formatEventDate`, timing / archived badge, expected guests, guest count, the note that links are hidden) instead of `EventCard`; back link to the restaurant page.

#### 7. Platform card

**Files**: `src/components/platform/PlatformRestaurantCard.tsx`, `src/components/platform/SupportEntry.tsx`, `src/components/platform/PlatformRestaurantsManager.tsx`, `src/components/hooks/usePlatformRestaurants.ts`, `src/pages/panel/platforma.astro`

**Intent**: Enter from the card; see and end this login's active support.

**Contract**: the page passes `initialSupport = await listActiveSupport(db, staff.sessionId)`; the hook gains `DELETE` in `PlatformRequest.method` and `support?` / `ended?` in `PlatformAnswer`, and keeps `active: SupportGrantDto[]` (enter → navigate to `support.path`; end → remove the restaurant's entry; an entry whose `expiresAt` has passed in the browser renders as not active). `SupportEntry` per card: when active — „Wsparcie aktywne do HH:MM” (browser time of `expiresAt`, like `StaffLinkCard`), link „Otwórz” (`/panel/restauracje/<id>`), „Zakończ wsparcie”; else a `<details>` „Wejdź jako wsparcie” with the reason textarea (client-side `parseSupportReason`, the read-only and 60-minute note) and the submit button.

#### 8. Texts touched elsewhere

**Files**: `src/lib/platform/messages.ts`

**Intent**: S-10's „counters only” intro on the platform page (`platformMessages().intro`) mentions „Wejdź jako wsparcie” (read-only, logged for the owner); the comments of `PlatformRestaurantCard`, `platforma.astro` and both panel pages are updated. Every new text PL + EN; all support texts live in `supportMessages`.

### Success Criteria:

#### Automated Verification:

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Tests pass: `AI_PROVIDER=mock npm test`
- Build passes: `npm run build`
- The existing smoke (sections 1–28) still passes against `AI_PROVIDER=mock npm run preview`: `npm run smoke`

#### Manual Verification:

- In a browser as the demo admin: „Wejdź jako wsparcie” with a reason → the restaurant page with the banner, tabs, team list and log; an event card without links; „Zakończ wsparcie” → back on the platform page; then the restaurant page is „Brak dostępu”; PL and EN

---

## Phase 3: Smoke section 29 and demo

### Overview

HTTP proof of the access matrix of support mode, and a logged support visit in the demo restaurant.

### Changes Required:

#### 1. Smoke section 29

**File**: `scripts/smoke.mjs`

**Intent**: A new section after 28 (before `finish()`), using the sessions of 25–28; changes only its own grants and log rows (restaurant C's switch is restored).

**Contract** (checks):
- Before entering: the admin → the identical 404 JSON on `/api/panel/restaurants/<A>`, `/events`, `/team`, `/support-log`, `/api/panel/events/<event A>` and the no-access page on `/panel/restauracje/<A>` and `/panel/wydarzenia/<event A>` (bodies equal to an unknown id's); owner A's log has no entry of this run.
- Enter: no Origin and a foreign Origin → 403; owner A, manager A, waiter → the identical 404; unknown, malformed and out-of-int4 ids → the identical 404; empty / too short / too long reason and an extra field → 400; valid → 201 with `support.path` and `expiresAt` ≈ now + 60 min; no session → 401.
- In support mode: the restaurant page 200 with the banner, the reason, the team list, no `NewEventForm` / `TeamManager` island markers, no event key of A; `/api/panel/restaurants/<A>` / `events` / `team` / `support-log` → 200; event A's card page and `GET /api/panel/events/<A>` → 200 without `links` and without any of A's keys; restaurant B and its event → the identical 404 (support is per restaurant).
- Read-only: POST event, PATCH / DELETE event A, a link rotation, POST team, PATCH / DELETE a team member, PATCH / DELETE / POST on `support-log` — each → the identical 404 (or 404/405 for the methods the log route does not export), and A's events, team and log entry count are unchanged by them (no `access` row for a mutation).
- Log: owner A's `support-log` lists, newest first, `enter` with the reason and the admin's e-mail, `access` rows for every GET above with method and path (the event's with its name), nothing for the denied ones; the owner's restaurant page shows the section with the reason; manager A and the waiter → the identical 404 on the log route and no `data-support-log` on their page; another login of the admin (fresh `logIn`) → the identical 404 on A.
- Exit: `DELETE` without Origin → 403; with → 200 `ended: true`; again → `ended: false`; afterwards the admin → the identical 404 on A again; the log ends with `exit`.
- Disabled: switch C off, enter C → 201, C's page 200 with the disabled note, end, switch C on; owner C's log shows the entry.
- Logout ends support: enter A with the second admin login, log it out, a fresh login → 404 on A; the `enter` row of that login stays in A's log.

#### 2. Demo

**File**: `scripts/demo.mjs`

**Intent**: The demo restaurant's owner has a non-empty log.

**Contract**: keep the admin's session cookie from the 303 (login or redeem), `POST …/platform/restaurants/<demo id>/support { reason: "Pokaz trybu wsparcia: sprawdzenie listy wydarzeń (demo)" }`, GET `/panel/restauracje/<id>` and `/panel/wydarzenia/<main event id>`, `DELETE …/support`; read the owner's `support-log` and fail unless it has `enter`, two `access` and `exit`; the summary line „dziennik wejść administratora: N wpisów (właściciel widzi go na stronie restauracji)”.

### Success Criteria:

#### Automated Verification:

- Smoke passes twice in a row on the same database against `AI_PROVIDER=mock npm run preview`: `npm run smoke`
- Demo runs on the same database: `AI_PROVIDER=mock`-preview + `npm run demo`
- Deliberate break: removing the `recordSupportAccess` call's log insert (or making the guard skip it) makes smoke section 29 fail

#### Manual Verification:

- As the demo owner in a browser: the restaurant page shows „Dziennik wejść administratora” with the demo visit (enter with the reason, two pages, exit), PL and EN

---

## Phase 4: Documentation

### Overview

CLAUDE.md and README describe support mode and its log.

### Changes Required:

#### 1. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Architecture and conventions for later slices.

**Contract**: a block „Platform admin's support access (admin-support-log, S-13)” under the access model: tables, functions, append-only rule, the guard order, read-only and no keys in support mode, `PanelRestaurant.support` / `PanelEvent.support` for pages, the routes, the owner-only log, deploy order (the guards call the new RPC for admins and the owner's page reads the log → migration before code); update the `panelRestaurantApi` paragraph („no bypass … S-13” → the support path) and the platform panel's „counters only” line; a rule for later slices: a panel GET route that returns keys or other secrets strips them when `api.support` is set, and a page with write islands renders read-only when `panel.support` is set. Commands: the smoke's section 29 and the demo's support visit.

#### 2. README

**File**: `README.md`

**Intent**: Polish user docs.

**Contract**: under „Panel platformy”: „Wejdź jako wsparcie” (reason, 60 minutes, read-only, no links, ends how), and under the restaurant panel: the owner's „Dziennik wejść administratora”; the migration-before-code note; the demo line mentions the logged visit.

### Success Criteria:

#### Automated Verification:

- Lint and format pass on the docs: `npm run lint` and `npx prettier --check CLAUDE.md README.md`
- Type check still passes: `npx astro check`

#### Manual Verification:

- CLAUDE.md read-through: the support block matches the code (guard order, routes, tables)

---

## Testing Strategy

### Unit Tests:

- `parseSupportReason`, `isReadMethod`, `supportArea`, `formatSupportTime` / `formatSupportClock` (DST, both locales), `describeSupportEntry`.

### Integration Tests:

- `tests/integration/admin-support.test.ts` as in Phase 1 (grant lifecycle, every refusal writes nothing, append-only trigger and cascade, logout, disabled restaurant, event of another restaurant).

### Manual Testing Steps:

1. `npm run demo`, log in as `admin@demo.stolik`, open „Panel platformy”, „Wejdź jako wsparcie” on „Restauracja demo” with a reason.
2. Check the banner, tabs, team list, log; open an event: no links; try nothing writes (no buttons).
3. „Zakończ wsparcie”; open the restaurant URL again → „Brak dostępu”.
4. Log in as the demo owner: the log lists the visit (demo's and yours); as the demo manager: no log section.

## Performance Considerations

Members pay nothing extra (the support path runs only for admins without membership). Each support request costs one RPC with one insert; the owner's page reads at most 101 log rows by an index.

## Migration Notes

Additive (two tables, three functions, triggers); no existing row or function changes. Deploy: the migration must reach the platform database BEFORE the code — admins' foreign reads call `record_support_access` and owners' restaurant pages read `support_log` (else a 500 for them). Code from before keeps working on the migrated database.

## References

- PRD: `context/foundation/prd-v2.md` FR-021, US-05, US-10, NFR-012, Access Control table
- Roadmap: `context/foundation/roadmap.md` S-13 (Risk: „Musi być niemożliwy bez wpisu w dzienniku”)
- Guards: `src/lib/panel-api.ts`; membership lookups `src/lib/auth/service.ts:326-395`; middleware `src/middleware.ts`
- Similar slices: `context/archive/2026-11-10-restaurant-team/plan.md`, `context/archive/2026-11-09-platform-restaurants/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, rules and service

#### Automated

- [x] 1.1 Migration applies from zero and on the current local data
- [x] 1.2 Unit and integration tests pass
- [x] 1.3 Type check passes
- [x] 1.4 Lint passes

### Phase 2: Guards, routes, pages and islands

#### Automated

- [ ] 2.1 Type check passes
- [ ] 2.2 Lint passes
- [ ] 2.3 Tests pass
- [ ] 2.4 Build passes
- [ ] 2.5 The existing smoke (sections 1–28) still passes

#### Manual

- [ ] 2.6 Browser check of support mode as the demo admin (enter, banner, read-only pages, end, PL/EN)

### Phase 3: Smoke section 29 and demo

#### Automated

- [ ] 3.1 Smoke passes twice in a row on the same database
- [ ] 3.2 Demo runs on the same database
- [ ] 3.3 Deliberate break makes smoke section 29 fail

#### Manual

- [ ] 3.4 Demo owner sees the support log in a browser (PL/EN)

### Phase 4: Documentation

#### Automated

- [ ] 4.1 Lint and format pass on the docs
- [ ] 4.2 Type check still passes

#### Manual

- [ ] 4.3 CLAUDE.md read-through matches the code
