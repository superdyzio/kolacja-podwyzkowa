# Platform panel: restaurants and owner invitations (S-10 platform-restaurants) Implementation Plan

## Overview

The platform administrator gets a panel: create a restaurant together with its owner and get a one-time invitation link for that owner; see every restaurant with counters (events, team) and its owners' status; disable and enable a restaurant; give an owner a fresh one-time link (a password reset when they lost access, a new invitation when theirs expired). The owner, after accepting the invitation, opens their (still empty) restaurant panel. Staff of a disabled restaurant lose access to its data. The admin gets counters only — no access to a restaurant's data (that is S-13 with the access log). PRD v2 FR-021, US-05 (guardrail „Utrata hasła nie blokuje lokalu”).

## Current State Analysis

- F-02 (`20261109120000_multi_tenant_events.sql`): `public.restaurant (id integer identity, name 1–80 trimmed, created_at)`; `public.event.restaurant_id`. „Restauracja domyślna” exists only when the DB had event 1 before the migration. Nothing in the app creates restaurants or events: `scripts/lib/platform.mjs` (`createRestaurant`, `createEvent`) for `npm run event:create`, smoke and demo; `src/lib/event.ts` (`createRestaurant`, `createEvent`) for tests.
- F-03 (`20261109140000_staff_accounts.sql`, `src/lib/auth/`): `staff_account` (`is_platform_admin`, `password_hash` null until set), `restaurant_member (restaurant_id, account_id, role owner|manager|waiter)`, `staff_token` (`issue_staff_token` deletes the account's unused links, then stores the new one), sessions, throttle. Service: `createStaffAccount`, `addRestaurantMember`, `issueStaffToken(db, accountId, kind, createdBy)`, `getMemberships`, `findRestaurantMembership`, `findEventMembership` (`src/lib/auth/service.ts:326-393`).
- Central guard `src/lib/panel-api.ts`: `panelApi`, `panelRestaurantApi(locals, id, roles)`, `panelEventApi(locals, id, roles)`; one 404 `{"error":"Brak dostępu"}` (`noAccessMessages(locale).title`) for malformed/unknown/foreign ids and roles outside `roles`; no admin bypass.
- Middleware (`src/middleware.ts:53-87`): `/panel/**` without a session → 303 `/logowanie`; `/api/panel/**` without one → 401 `{ error: noSession }`; every mutation under `/api/panel/` and `/api/auth/` without the page's own `Origin` → 403 before any DB read; `AUTH_AREA_HEADERS`.
- Pages: `/panel` (`src/pages/panel/index.astro`) lists the person's restaurants with role labels (not linked), the admin marker, password change and logout; `panelComingSoon` text. `/logowanie`, `/haslo/[token]` (invite or reset; redeem → 303 `/panel`).
- Island patterns: `src/components/orders/RestaurantLinkCard.tsx` (copy with select-the-field fallback, page passes `origin = Astro.url.origin`), `src/components/hooks/useGuestLinks.ts` (every answer replaces the whole list), `api-failure.ts` (`toFailure`, `networkFailure`, `readJson`).
- Smoke (`scripts/smoke.mjs` section 25) creates restaurants A/B, accounts ownerA, waiterA, ownerB, admin (no memberships), throttled; `sessionAdmin`, `sessionB`, `sessionWaiter`, `sessionOwner` (ownerA) stay valid at the end of the section; helpers `request({ cookie, noOrigin, extraHeaders })`, `noAccessJson(res)`, `redirectsTo`, `authHeaders`, `sessionOf`, `asStaff`.
- Demo (`scripts/demo.mjs`) creates „Restauracja demo” and its owner `wlasciciel-<restaurant id>@demo.stolik` (password `demo-wlasciciel-1`) directly in the local DB.
- `tests/integration/staff-accounts.test.ts:274` expects `getMemberships` to equal `{ restaurantId, restaurantName, role }` exactly (changes with this slice).

## Desired End State

- Migration `supabase/migrations/20261109160000_platform_restaurants.sql` (additive: one column, three functions) applies on the populated local DB with every row unchanged and from scratch.
- `/panel/platforma` (platform admin only): „Nowa restauracja” form (restaurant name, owner's e-mail, optional owner name) → the restaurant exists with its owner, and the page shows the owner's one-time invitation link (copy button) — or, when that e-mail already has a password, says the person sees the restaurant after logging in; „Restauracje (N)” lists every restaurant (the default one too) with „Wydarzenia: N · Zespół: N”, active/disabled status, its owners (e-mail, name, „konto aktywne” / „czeka na ustawienie hasła”), per owner „Nowy link” (invite when the owner has no password, else a password-reset link; confirm first), „Dodaj właściciela” (e-mail + optional name), „Wyłącz” / „Włącz” (confirm says who loses what). Never a restaurant's events, guests or keys.
- A disabled restaurant: its staff get the identical 404 for every `/api/panel/restaurants/<id>…` and `/api/panel/events/<id>…` route and the restaurant panel page; `/panel` still lists it with „Wyłączona” and the PL/EN note that the platform administrator switched it off (no link). Its event links (client, TV, guests, tablet) keep working. Enabling restores staff access at once.
- `/panel/restauracje/<id>` (any member of an active restaurant): restaurant name, the person's role, „Wydarzenia: N” with the note that event management comes next, and for owners and managers the team (name/e-mail, role, account status). Everyone else: the 404 no-access page.
- `/panel` links each active restaurant to its panel and shows platform admins a „Panel platformy” card.
- Admin-only API under `/api/panel/platform/…`: other staff get the identical 404 `{"error":"Brak dostępu"}` (same body as an unknown restaurant id), anonymous callers the panel's identical 401, a mutation without the page's Origin 403.
- Smoke section 26 and the demo's platform admin login; CLAUDE.md and README describe the panel.

### Key Discoveries:

- `src/lib/auth/service.ts:348-367` — `findRestaurantMembership` is the single lookup behind both guards (`findEventMembership` calls it), so the disabled check lives there once.
- `supabase/migrations/20261109140000_staff_accounts.sql` — `staff_account_email_key` is a unique INDEX on `email` (usable as `on conflict (email)`); `restaurant_member` PK `(restaurant_id, account_id)`.
- `src/lib/panel-api.ts:24-35` — `panelApi` returns 401/503; a new `panelPlatformApi` follows it and adds the admin check with the identical 404 of `denied()`.
- `src/components/orders/RestaurantLinkCard.tsx` — the copy pattern to reuse for the one-time link card (`navigator.clipboard` only on secure origins; else select the field).
- `scripts/smoke.mjs:4128-4565` — section 25 sessions and helpers are in scope for section 26 (top-level module).

## What We're NOT Doing

- No admin access to a restaurant's data (events, guests, orders, team actions) and no access log — S-13. The admin sees counts and owners only.
- No event creation, event list or link management in the restaurant panel (S-11), no team invitations, role changes or member removal by owners/managers (S-12), no restaurant settings or branding (S-18).
- No restaurant rename or delete, no removing an owner, no restaurant search/paging (the list is small).
- Disabling does NOT cut the restaurant's event links (`/o/`, `/tv/`, `/g/`, `/r/`): an evening in progress keeps working and the v1 key paths stay untouched (decision logged; cutting links later is one embed in `resolveAccess`).
- Disabling does not end sessions (an account may belong to several restaurants; the guard checks on every request).
- No dates/times rendered in the island's server HTML (Node and the browser may be in different time zones → hydration mismatch); a link's expiry is shown only after an action, in the browser.

## Implementation Approach

Four phases, each green on its own: (1) schema, DB functions, types, services and pure rules with unit and integration tests — behaviour of existing routes unchanged except the disabled check; (2) the platform guard, admin API routes, the `/panel/platforma` island, the restaurant panel page and the `/panel` hub; (3) smoke section 26 and the demo's admin login; (4) docs. Creating a restaurant with its owner is one DB function (atomic: no restaurant without an owner); the one-time link is issued afterwards by the existing `issueStaffToken` (hashing stays in TS), only when the owner has no password — a failed link is recovered by „Nowy link”.

## Critical Implementation Details

- **plpgsql OUT-column names:** `returns table (…)` columns are variables inside a plpgsql body; names like `account_id` or `restaurant_id` clash with table columns in `insert … on conflict (restaurant_id, account_id)` and `where` clauses ("column reference is ambiguous"). Start the bodies with `#variable_conflict use_column` or give the OUT columns non-clashing names (`owner_account_id`, …).
- **`insert … on conflict (email) do nothing returning … into`** leaves `FOUND` false on a conflict; then read the existing row. The caller passes an already normalized e-mail (`normalizeEmail`); the table check rejects anything else.
- **One denial:** the admin guard must return exactly the `denied()` body of `panel-api.ts` (same status, same JSON), so the smoke can compare an owner's answer on an admin route with an unknown restaurant id byte for byte.

## Phase 1: Schema, services and rules

### Overview

The disabled flag, the three DB functions, DB types, the platform and restaurant-panel services, the disabled check in the membership lookups, pure rules/schemas/texts, and their tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261109160000_platform_restaurants.sql` (new)

**Intent**: Restaurant on/off flag and atomic owner management for the platform panel; header comment as earlier migrations (model, access, additive).

**Contract**:
- `alter table public.restaurant add column disabled_at timestamptz` (null = active; set = switched off by the platform admin at that time) + comment.
- `add_restaurant_owner(p_restaurant_id integer, p_email text, p_display_name text default null) returns table (owner_account_id bigint, owner_created boolean, owner_has_password boolean)` — locks the restaurant row `for share` (else `RESTAURANT_NOT_FOUND`); finds the account by e-mail or creates it without a password (display name only on creation); upserts `restaurant_member` with role `owner` (an existing member becomes owner).
- `create_restaurant_with_owner(p_name text, p_email text, p_display_name text default null) returns table (restaurant_id integer, owner_account_id bigint, owner_created boolean, owner_has_password boolean)` — inserts the restaurant and calls `add_restaurant_owner` in the same transaction.
- `platform_restaurant_list() returns table (id integer, name text, created_at timestamptz, disabled_at timestamptz, event_count integer, member_count integer, owners jsonb)` — `language sql stable`; `owners` = `[{ accountId, email, displayName, hasPassword }]` by e-mail (`'[]'` when none); never password hashes.
- All three: `set search_path = ''`, `revoke execute … from public, anon, authenticated`, comment.

#### 2. DB types

**File**: `src/db/database.types.ts`

**Intent**: `restaurant.disabled_at` in Row/Insert/Update; the three functions under `Functions`.

**Contract**: generated-types shape as existing entries.

#### 3. Membership lookups honour the flag

**Files**: `src/lib/auth/service.ts`, `src/lib/auth/types.ts`, `tests/integration/staff-accounts.test.ts`

**Intent**: A disabled restaurant opens nothing through the guards; the hub still lists it with its status.

**Contract**:
- `findRestaurantMembership` selects `restaurant(id, name, disabled_at)` and returns null when `disabled_at` is set (so `findEventMembership`, `panelRestaurantApi` and `panelEventApi` deny with the identical 404 unchanged).
- `StaffMembership` gains `disabled: boolean`; `getMemberships` fills it (all memberships, active and disabled).
- The F-03 integration test's exact `getMemberships` expectation gets `disabled: false`.

#### 4. Platform rules, schemas and texts (pure)

**Files**: `src/lib/platform/rules.ts`, `src/lib/platform/api.ts`, `src/lib/platform/messages.ts`, `src/lib/platform/summary.ts`, `src/lib/platform/index.ts`, `src/types.ts`

**Intent**: Validation and texts shared by the routes and the island; DTOs.

**Contract**:
- `rules.ts`: `RESTAURANT_NAME_MAX` 80, `OWNER_NAME_MAX` 80; `parseRestaurantName(raw)` → `{ ok: true, name } | { ok: false, reason: "empty" | "too-long" }` (normalized like `normalizeDisplayName`, code points); `parseOwnerInput({ email, name })` → `{ ok: true, email, displayName: string | null } | { ok: false, reason: "email" | "name-too-long" }` (`normalizeEmail` from `@/lib/auth/email`; empty name → null).
- `api.ts` (zod from `astro/zod`, all `.strict()`): `CreateRestaurantBody { name: string, ownerEmail: string, ownerName?: string | null }`, `AddOwnerBody { email: string, name?: string | null }`, `UpdateRestaurantBody { disabled: boolean }` (string lengths capped generously, e.g. 400, the rules give the real messages).
- `messages.ts`: `platformMessages = defineMessages(pl, en)` — page title/heading/intro, form labels and hints, buttons („Załóż restaurację”, „Nowy link”, „Dodaj właściciela”, „Wyłącz”, „Włącz”, „Kopiuj”), validation messages (empty name, name too long, bad e-mail, owner name too long), statuses („Aktywna”, „Wyłączona”, „konto aktywne”, „czeka na ustawienie hasła”, no owner yet), confirms (disable: staff lose access to the restaurant panel, event links keep working; enable; new link: the person's earlier unused link stops working, a reset link changes nothing until used), result texts (invitation link for X, valid until …; reset link; „to konto ma już hasło — restauracja pojawi się w jego panelu po zalogowaniu”), counters with plurals, copy statuses, the one-time hint („Link widać tylko teraz — po odświeżeniu strony wygeneruj nowy przyciskiem „Nowy link”.”), aria labels. `restaurantPanelMessages` lives in `src/lib/restaurants/messages.ts` (restaurant panel page); the hub's additions (platform card, „Otwórz panel lokalu”, „Wyłączona” badge and the note „Administrator platformy wyłączył tę restaurację. Skontaktuj się z nim, aby ją włączyć.”) go into `authMessages` (`src/lib/auth/messages.ts`, which owns `/panel`) — plan review F1.
- Islands and hooks import `@/lib/platform/rules`, `@/lib/platform/messages`, `@/lib/platform/summary` directly; `src/lib/platform/index.ts` re-exports the service too and is for server code only (the service imports `@/lib/auth/service` → `node:crypto`) — plan review F2.
- `summary.ts`: `formatRestaurantCounters({ eventCount, memberCount }, locale)` → „Wydarzenia: 3 · Zespół: 2” / „Events: 3 · Team: 2”.
- `src/types.ts`: `PlatformOwnerDto { accountId, email, displayName, hasPassword }`, `PlatformRestaurantDto { id, name, disabled, eventCount, memberCount, owners }`, `PlatformRestaurantListDto { restaurants }`, `StaffLinkDto { kind: "invite" | "reset", path, expiresAt }`, `OwnerResultDto { accountId, email, created, hasPassword, link: StaffLinkDto | null }`.

#### 5. Platform and restaurant-panel services (DB)

**Files**: `src/lib/platform/service.ts`, `src/lib/restaurants/service.ts`, `src/lib/restaurants/messages.ts`, `src/lib/restaurants/index.ts`

**Intent**: The DB side of the admin actions and of the restaurant panel overview; status unions, Supabase errors throw.

**Contract**:
- `listPlatformRestaurants(db)` → `PlatformRestaurantDto[]` sorted by name (`localeCompare(…, "pl")`) then id.
- `createRestaurantWithOwner(db, { name, email, displayName }, createdBy)` → `{ status: "created", restaurantId, owner: OwnerResultDto }`; issues an invite with `issueStaffToken(db, accountId, "invite", createdBy)` only when the owner has no password (`link` = `{ kind, path: setPasswordPath(token), expiresAt }`).
- `addRestaurantOwner(db, restaurantId, { email, displayName }, createdBy)` → `{ status: "added", owner } | { status: "not-found" }` (same link rule).
- `setRestaurantDisabled(db, restaurantId, disabled)` → `updated | not-found` (turning off keeps an earlier `disabled_at`; turning on clears it).
- `issueOwnerLink(db, restaurantId, accountId, createdBy)` → `{ status: "issued", link } | { status: "not-found" }` — only for an OWNER of that restaurant (anything else = not-found); kind `invite` when the account has no password, else `reset`.
- `getRestaurantOverview(db, restaurantId)` → `{ eventCount, team: [{ email, displayName, role, hasPassword }] }` (role order owner, manager, waiter, then e-mail; no ids, no hashes).

#### 6. Tests

**Files**: `src/lib/platform/platform.test.ts`, `tests/integration/platform-restaurants.test.ts`

**Intent**: Pure rules by unit tests; DB functions and services on the local DB (own restaurants and accounts, deleted afterwards).

**Contract**:
- Unit: name normalization and bounds (spaces, 80 vs 81 code points, emoji), owner input (bad e-mail, case/space normalization, empty name → null, 81-char name), zod strictness (extra field, wrong types), `formatRestaurantCounters` in both languages.
- Integration: create with a new e-mail → restaurant, owner membership, account without password, invite link valid (`getTokenInfo` kind invite); create with an e-mail that has a password → no link, `hasPassword`; `addRestaurantOwner` on an unknown restaurant → not-found, on an existing one → owner (a former waiter becomes owner); `listPlatformRestaurants` counts events and members and lists owners with `hasPassword`, and includes every restaurant in the DB (ids of `restaurant`); `issueOwnerLink` → invite before the password, reset after, not-found for a waiter or another restaurant's owner, and it supersedes the previous link; `setRestaurantDisabled` → `findRestaurantMembership` / `findEventMembership` null, `getMemberships` shows `disabled: true`, unknown id → not-found, enabling restores; `getRestaurantOverview` counts and orders the team.

### Success Criteria:

#### Automated Verification:

- Migration applies on the populated local DB with every existing table's row count unchanged: `npx supabase migration up`
- Tests pass: `AI_PROVIDER=mock npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`

---

## Phase 2: Guard, routes and pages

### Overview

The admin guard, the platform API, the platform panel island, the restaurant panel page and the `/panel` hub.

### Changes Required:

#### 1. Guards

**File**: `src/lib/panel-api.ts`

**Intent**: An admin-only guard with the identical denial, and a page-side lookup shared with the restaurant guard.

**Contract**:
- `panelPlatformApi(locals)` → `PanelApi | Response`: `panelApi` first (401/503), then a session without `isPlatformAdmin` → `denied(locals)` (the same 404 body as an unknown id).
- `findPanelRestaurant(locals, idParam, roles = STAFF_ROLES)` → `(PanelApi & RestaurantMembership) | null` (no session, no DB, malformed/unknown/foreign/disabled id, role outside `roles` → null); `panelRestaurantApi` uses it; pages use it.
- Export `parseIntId` for the platform routes' restaurant and account ids.

#### 2. Platform API routes

**Files**: `src/pages/api/panel/platform/restaurants/index.ts`, `src/pages/api/panel/platform/restaurants/[id].ts`, `src/pages/api/panel/platform/restaurants/[id]/owners/index.ts`, `src/pages/api/panel/platform/restaurants/[id]/owners/[accountId]/link.ts`

**Intent**: JSON API for the island; every route starts with `panelPlatformApi`; bodies via `readJsonBody(request, schema, locals.locale)`, then the pure rules for the field messages (400 `{ error }`); every success answer carries the whole list.

**Contract** (all `prerender = false`):
- `GET /api/panel/platform/restaurants` → 200 `PlatformRestaurantListDto`.
- `POST /api/panel/platform/restaurants` `{ name, ownerEmail, ownerName? }` → 201 `{ restaurants, restaurantId, owner: OwnerResultDto }`; 400 with the rule's message.
- `PATCH /api/panel/platform/restaurants/<id>` `{ disabled }` → 200 `{ restaurants }`; unknown/malformed id → the identical 404.
- `POST /api/panel/platform/restaurants/<id>/owners` `{ email, name? }` → 200 `{ restaurants, owner }`; 404 / 400 as above.
- `POST /api/panel/platform/restaurants/<id>/owners/<accountId>/link` (no body) → 200 `{ restaurants, link: StaffLinkDto }`; not an owner of that restaurant, unknown or malformed ids → the identical 404.
- `GET /api/panel/me` restaurants gain `disabled`.

#### 3. Platform panel page and island

**Files**: `src/pages/panel/platforma.astro`, `src/components/platform/PlatformRestaurantsManager.tsx`, `src/components/platform/NewRestaurantForm.tsx`, `src/components/platform/PlatformRestaurantCard.tsx`, `src/components/platform/StaffLinkCard.tsx`, `src/components/hooks/usePlatformRestaurants.ts`

**Intent**: The admin's page: create, list with counters and owners, links, disable/enable. `StaffLinkCard` (one-time link with copy, „przekaż tylko tej osobie”, expiry shown in the browser's locale, and the hint that the link is visible only now — after a reload „Nowy link” makes a fresh one; plan review F4) is generic so S-12's team invitations can reuse it.

**Contract**:
- Page: non-admin session → `Astro.response.status = 404` + `<NoAccess />` (no `return` from frontmatter); admin → `Layout` (title with `PRODUCT_NAME`), back link to `/panel`, heading/intro, island `client:load` with `initial = listPlatformRestaurants`, `origin = Astro.url.origin`, `locale`.
- Hook `usePlatformRestaurants(initial, locale)` → `{ restaurants, pending, failure, send(request) → answer | null, dismissFailure }`: fetch to `/api/panel/platform/restaurants…` with JSON, every success replaces the list (validated shape), failures via `toFailure`/`networkFailure`, a 404 re-reads the list.
- `NewRestaurantForm`: name, owner e-mail (`type="email"`), optional owner name; client-side checks with the same pure rules; on success clears the fields and shows the owner result (link card or the „already has a password” note).
- `PlatformRestaurantCard`: name, status badge, counters, owners with status and „Nowy link” (confirm → link card under the owner), „Dodaj właściciela” (small inline form), „Wyłącz”/„Włącz” (`window.confirm` with the restaurant name), a restaurant without an owner shows that state prominently.
- Never renders event names, keys or guest data (the DTO has none).

#### 4. Restaurant panel page

**File**: `src/pages/panel/restauracje/[id].astro`

**Intent**: The owner's (still empty) restaurant panel.

**Contract**: `findPanelRestaurant(Astro.locals, Astro.params.id)` → null → 404 + `<NoAccess />`; else `getRestaurantOverview`: heading = restaurant name, role badge, back link to `/panel`; „Wydarzenia” card (count + the note that creating and listing events comes next); „Zespół” card for owner and manager (name/e-mail, role label, „czeka na ustawienie hasła”) with the note that inviting the team comes next; waiters see no team list. All texts `restaurantPanelMessages`.

#### 5. Hub

**Files**: `src/pages/panel/index.astro`, `src/lib/auth/messages.ts`

**Intent**: Entry points to the new pages; the disabled state explained.

**Contract**: platform admins get a „Panel platformy” card linking `/panel/platforma`; each active restaurant links `/panel/restauracje/<id>` („Otwórz panel lokalu”); a disabled one shows the „Wyłączona” badge and the note, no link; `panelComingSoon` removed (its texts replaced).

### Success Criteria:

#### Automated Verification:

- Tests pass: `AI_PROVIDER=mock npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- On `AI_PROVIDER=mock npm run preview`, an admin session (CLI link redeemed over HTTP) gets 200 from `GET /api/panel/platform/restaurants` and an owner session the identical 404

#### Manual Verification:

- In a browser: admin creates a restaurant, copies the invitation link, opens it in a private window, sets the password and lands in the panel; the restaurant panel shows the name and „Właściciel”; disable → the owner sees „Wyłączona” and the restaurant page is the no-access page; enable → back; PL and EN

---

## Phase 3: Smoke and demo

### Overview

Smoke section 26 proves the platform panel's access rules and flows over HTTP; the demo prints a platform admin login.

### Changes Required:

#### 1. Script helper

**File**: `scripts/lib/platform.mjs`

**Intent**: The smoke compares the admin list with the database.

**Contract**: `listRestaurants(env)` → `[{ id, name }]` by id.

#### 2. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Section 26 „Platform panel” after section 25 (before `finish()`), reusing its sessions (admin, ownerA as `sessionOwner`, ownerB, waiterA) and restaurants A/B, e-mails tagged with `RUN_TAG`.

**Contract** (checks):
- Admin: `GET /api/panel/platform/restaurants` 200 lists every restaurant id of the DB (`listRestaurants`), A with `eventCount` 1, `memberCount` 2 and owner ownerA (`hasPassword` true); the body contains neither event A's name nor any of its keys; `/panel/platforma` 200 with the auth headers and A's name; `/panel` shows the „Panel platformy” link.
- Denials: ownerA, ownerB and waiterA on `GET /api/panel/platform/restaurants`, `PATCH …/<A>`, `POST …/<A>/owners`, `POST …/<A>/owners/<ownerA>/link` and `POST …/restaurants` → the identical 404 body (equal to `/api/panel/restaurants/2000000000`), and nothing was created (the admin's count unchanged); anonymous → the identical 401 body of `/api/panel/me`; `/panel/platforma` → owner 404 no-access page, anonymous 303 `/logowanie`.
- Origin: create, PATCH, add owner and link without Origin and with a foreign Origin → 403 (also as admin), nothing changed.
- Validation: create with an empty name, an 81-character name, a bad e-mail, an extra field → 400; PATCH with `disabled: "yes"` → 400; unknown/malformed restaurant id and an account that is not an owner of it → the identical 404.
- Flow: admin creates „Restauracja smoke C <tag>” with a new owner e-mail → 201 with an invite `path` `/haslo/<43 chars>`; the page shows the e-mail; redeeming logs the owner in; `/panel` lists C linked to `/panel/restauracje/<C>`; `/panel/restauracje/<C>` 200 with C's name and „Właściciel”; the owner of C on `/api/panel/restaurants/<A>` and `/panel/restauracje/<A>` → identical 404; the admin's list shows C with `hasPassword` true; „Nowy link” for the owner of C → kind `reset`, redeem with a new password → the old session gets 401 and only the new password logs in (US-05 AC); add owner to B with an existing e-mail that has a password (ownerA's) → `link` null, `hasPassword` true, and ownerA's `/api/panel/me` now lists B.
- Disable: admin disables A → ownerA (`sessionOwner`) and waiterA get the identical 404 on `/api/panel/restaurants/<A>` and `/api/panel/events/<eventA>`, `/panel/restauracje/<A>` is the no-access page, `/panel` shows „Wyłączona” for A; event A's organizer link `/o/<key>` and `/api/o/<key>/guests` still 200; enable → ownerA reads A again.

#### 3. Demo

**File**: `scripts/demo.mjs`

**Intent**: A platform admin login for the morning walk admin → new restaurant → owner invitation.

**Contract**: `ensureStaffAccount(env, { email: "admin@demo.stolik", displayName: "Administrator demo", isPlatformAdmin: true })`; a new account → invite link redeemed over HTTP with the fixed local password `demo-admin-1`; an existing account → login with that password, and only if it fails a reset link redeemed with it; the summary prints „Panel platformy: <BASE_URL>/logowanie — e-mail admin@demo.stolik, hasło demo-admin-1” under the owner's line.

### Success Criteria:

#### Automated Verification:

- From scratch: `npx supabase db reset`, then `AI_PROVIDER=mock npm test` passes
- Build succeeds: `npm run build`
- Smoke passes twice in a row against `AI_PROVIDER=mock npm run preview`: `npm run smoke`
- Demo prints the owner's and the admin's logins: `npm run demo` (twice in a row)
- Lint passes: `npm run lint`

#### Manual Verification:

- With the demo admin's login: `/panel/platforma` lists „Restauracja demo” with its counters; create a restaurant, open the owner's invitation in a private window, set the password, see the empty restaurant panel

---

## Phase 4: Docs

### Overview

CLAUDE.md and README describe the platform panel.

### Changes Required:

#### 1. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: The new guard, routes, pages, the disabled rule and the demo/smoke lines for later slices.

**Contract**: a „Platform panel (platform-restaurants, S-10)” block (migration, functions, `src/lib/platform/`, `src/lib/restaurants/`, routes and answers, pages, island, `StaffLinkCard` for reuse); the staff block notes `panelPlatformApi`, `findPanelRestaurant`, that a disabled restaurant opens nothing through the guards while its event links keep working, and that the admin still has no data access (S-13); commands: smoke (section 26) and demo (admin login) lines.

#### 2. README

**File**: `README.md`

**Intent**: How the platform admin creates a restaurant and hands over the owner's link; the demo admin login.

**Contract**: the staff-accounts section gains the platform panel steps.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- `grep -n "platform-restaurants" CLAUDE.md` finds the new block

---

## Testing Strategy

### Unit Tests:

- Restaurant name and owner input rules, zod strictness, counters text (PL/EN).

### Integration Tests:

- `tests/integration/platform-restaurants.test.ts`: atomic create with owner, existing accounts, add owner, list counters/owners/all restaurants, owner links (invite → reset, supersede, owner-only), disable/enable through the membership lookups, restaurant overview; the F-03 membership test updated.

### Manual Testing Steps:

1. Demo admin logs in → „Panel platformy” → creates a restaurant with a new owner e-mail → copies the link.
2. Private window: the link → password → `/panel` → „Otwórz panel lokalu” → empty restaurant panel with „Właściciel”.
3. Admin: „Nowy link” for that owner (reset) → the owner sets a new password; the old session ends.
4. Admin disables the restaurant → the owner's `/panel` says „Wyłączona”, the restaurant page is the no-access page; enable → back.
5. Switch PL/EN on `/panel`, `/panel/platforma`, `/panel/restauracje/<id>`.

## Performance Considerations

`platform_restaurant_list()` runs correlated counts per restaurant — fine for tens to hundreds of restaurants (admin-only page). Its set result goes through PostgREST and is capped at `max_rows = 1000` (`supabase/config.toml:18`): beyond 1000 restaurants the list would need paging (plan review F3; not needed in M-2). The membership lookup reads one more column; no new query on the key routes.

## Migration Notes

Additive (one nullable column, three functions); existing rows are active (`disabled_at` null). The new code reads `restaurant.disabled_at` in every panel guard, so the migration must reach the platform DB before the code (`db push` before `deploy:aws`, the user's decision, never the old dinner project). Rollback = previous code; the column and functions can stay.

## References

- PRD v2: FR-021, US-05, Access Control Changes (platform administrator row), Guardrails („Utrata hasła nie blokuje lokalu”)
- Roadmap S-10 (and S-11, S-12, S-13 for what stays out)
- F-03 plan: `context/archive/2026-11-09-staff-accounts/plan.md`; guard `src/lib/panel-api.ts`; copy pattern `src/components/orders/RestaurantLinkCard.tsx`; list hook `src/components/hooks/useGuestLinks.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, services and rules

#### Automated

- [x] 1.1 Migration applies on the populated local DB with every existing table's row count unchanged: `npx supabase migration up`
- [x] 1.2 Tests pass: `AI_PROVIDER=mock npm test`
- [x] 1.3 Lint passes: `npm run lint`
- [x] 1.4 Type check passes: `npx astro check`
- [x] 1.5 Build succeeds: `npm run build`

### Phase 2: Guard, routes and pages

#### Automated

- [ ] 2.1 Tests pass: `AI_PROVIDER=mock npm test`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Type check passes: `npx astro check`
- [ ] 2.4 Build succeeds: `npm run build`
- [ ] 2.5 On `AI_PROVIDER=mock npm run preview`, an admin session gets 200 from `GET /api/panel/platform/restaurants` and an owner session the identical 404

#### Manual

- [ ] 2.6 In a browser: admin creates a restaurant, copies the invitation link, opens it in a private window, sets the password and lands in the panel; the restaurant panel shows the name and „Właściciel”; disable → the owner sees „Wyłączona” and the restaurant page is the no-access page; enable → back; PL and EN

### Phase 3: Smoke and demo

#### Automated

- [ ] 3.1 From scratch: `npx supabase db reset`, then `AI_PROVIDER=mock npm test` passes
- [ ] 3.2 Build succeeds: `npm run build`
- [ ] 3.3 Smoke passes twice in a row against `AI_PROVIDER=mock npm run preview`: `npm run smoke`
- [ ] 3.4 Demo prints the owner's and the admin's logins: `npm run demo` (twice in a row)
- [ ] 3.5 Lint passes: `npm run lint`

#### Manual

- [ ] 3.6 With the demo admin's login: `/panel/platforma` lists „Restauracja demo” with its counters; create a restaurant, open the owner's invitation in a private window, set the password, see the empty restaurant panel

### Phase 4: Docs

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 `grep -n "platform-restaurants" CLAUDE.md` finds the new block
