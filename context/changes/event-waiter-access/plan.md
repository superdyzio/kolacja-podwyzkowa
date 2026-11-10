# Per-event waiter („kelner na imprezę”, S-21b) Implementation Plan

## Overview

Roadmap S-21b (PRD v2 FR-023 per-event part, FR-029, US-08): an owner or a manager adds a waiter „na imprezę” on the
panel's event card — a display name; the server answers ONCE with a one-time link and a short code, valid until noon
Europe/Warsaw of the day after the event. The waiter opens the link (or types the code on `/kelner`), gets a session
cookie of its own that opens ONLY the floor of that ONE event (the same work as S-21's `/panel/obsluga/<id>`: the
board with prices and the bill, served pieces, refills, drinks), never the panel, never another event, never a link
area. Revoking = deleting the row: every session of it dies at once. Unattended run: every planning question answered
with the recommended option (logged in `overnight-log.md`).

## Current State Analysis

- S-21 (waiter-day-and-refills) built the floor for staff ACCOUNTS: `findFloorEvent` / `panelFloorApi`
  (`src/lib/panel-api.ts`), the dispatcher `src/pages/api/panel/events/[id]/obsluga/[...path].ts` (allowlist
  `FLOOR_ROUTES` in `src/lib/floor/rules.ts`, `PATCH orders/:id` `{ delivered }` handled in place, the rest runs the
  client's organizer route modules with `getClientAccess`), the page `src/pages/panel/obsluga/[id].astro`
  (`OrderManager floor`), the window `isFloorOpen(event_date, archived_at, now)`. Its plan CUT the per-event waiter and
  wrote the design into CLAUDE.md („The floor”, CUT bullet) — this plan implements exactly that design.
- Staff sessions (F-03): `kp-session` cookie, `staff_session.token_hash` (SHA-256 of a 43-char base64url token),
  `generateSecretToken` / `hashSecretToken` (`src/lib/auth/tokens.ts`), `readSessionToken` hard-wired to `kp-session`
  (`src/lib/auth/cookie.ts`), the DB throttle `begin_login_attempt(p_key_hash, p_limit, p_window_seconds)` +
  `login_attempt` (generic key hash; login keys are `sha256("login:<typed e-mail>")`).
- The middleware (`src/middleware.ts`) classifies staff areas with `classifyAuthPath` (`src/lib/auth/paths.ts`), checks
  `Origin` on API mutations BEFORE any DB read, reads only `kp-session` there, answers with `AUTH_AREA_HEADERS`
  (`Referrer-Policy: same-origin` so plain form posts carry a real Origin).
- One-time links: `/haslo/<token>` — opening the page uses nothing up, only the form post does; one 404 page for
  unknown / used / expired / malformed.
- `event(id, restaurant_id)` is unique (`event_id_restaurant_id_key`, menu migration): composite FKs to it cascade with
  the event.

## Desired End State

- Event card `/panel/wydarzenia/<id>` (owners and managers, not in support mode): „Kelnerzy na imprezę”
  (`data-event-waiters`) — the list (name, status unused / on the floor / expired, valid until), „Dodaj kelnera” (name)
  → a card shown ONCE with the full link `/kelner/<token>` and the code `<id>-XXXX-XXXX`, copy buttons, the expiry;
  „Cofnij dostęp” per row after a confirm.
- `/kelner` — the code entry page (PL default, EN switch); `/kelner/<token>` — the link page (event, waiter name,
  „Wejdź na salę” button; identical 404 page for unknown / used / expired / malformed / outside the window);
  `/kelner/sala/<eventId>` — the floor page (OrderManager floor mode, the waiter's name, valid until, „Wyloguj”).
- Waiter API `/api/kelner/sala/<eventId>/<sub-path>` = the S-21 floor routes behind the waiter guard; `/api/kelner/
  wejscie` (form: `link` or `kod`) and `/api/kelner/wyloguj` (form).
- The waiter cookie `kp-waiter` opens nothing under `/panel`, `/api/panel`, `/o/ /tv/ /g/ /r/`; a staff cookie opens
  nothing under `/kelner/sala`, `/api/kelner/sala`.
- Verified by unit tests, integration tests (`tests/integration/event-waiters.test.ts`) and smoke section 37.

### Key Discoveries:

- `src/pages/api/panel/events/[id]/obsluga/[...path].ts` — the body to extract into a shared `runFloorRoute`.
- `src/lib/auth/service.ts` `beginAttempt` — the throttle call to reuse with a waiter key.
- `src/lib/auth/cookie.ts` `readSessionToken` — generalise to a cookie name.
- `src/pages/haslo/[token].astro` + `src/pages/api/auth/password-link.ts` — the one-time-link page / form-post pattern.
- `src/components/hooks/useOrderBoard.ts` — a 404/409 shows the failure text and re-reads; nothing links to `/panel`,
  so OrderManager works unchanged under another `apiBase`.
- Smoke: owner A is also an owner of B after section 28 (tests of „owner A → B” are meaningless; use owner B → A).

## What We're NOT Doing

- No „new link” for an existing per-event waiter: a lost cookie or a logout means revoke + add again (logged).
- No support-mode view of the waiters on the event page (the API GET in support mode lists names, status and expiry
  only — it never carries a credential); the platform administrator never redeems or works the floor.
- No staff marker on `order_piece` (marks stay `marked_by = 'organizer'`, like S-21); no offline readout (S-27).
- No per-IP throttle (no trusted client IP behind the Function URL); no e-mail / SMS delivery of the link.
- No automatic extension when the event's date changes: `expires_at` is fixed at creation; the guard ALSO requires the
  live window (`isFloorOpen` on the current date), so a moved event only ever shortens access (logged; add a new one).
- No cleanup job for expired rows (they stay listed as expired until revoked or the event is deleted).

## Implementation Approach

Reuse S-21's floor wholesale; add a second, password-less door to it.

Decisions (answered with the recommended option, logged):
- Storage: one table `event_waiter` (event + restaurant via the composite FK → `event(id, restaurant_id)` on delete
  cascade, `display_name`, `created_by` → `staff_account` on delete set null, `created_at`, `expires_at`, `link_hash`,
  `code_hash`, `session_hash` unique, `redeemed_at`). A redeemed waiter has exactly one session (one-time), so the
  session hash lives on the row; logout nulls it; revoke deletes the row. RLS on, revoked from anon / authenticated.
- `expires_at` computed in SQL inside `add_event_waiter`: `((event_date + 1) + time '12:00') at time zone
  'Europe/Warsaw'` (DST-correct) — never longer than the floor window.
- Adding: today's and upcoming non-archived events (managers prepare the night before); archived or window over →
  409 `closed`; at most `MAX_EVENT_WAITERS` = 30 rows per event → 409 `too-many` (checked under the event row lock).
- Redeeming (link or code) only while the floor is open (`isFloorOpen`, TS single source) and the row is unused and
  unexpired; the restaurant enabled; never a template. Link AND code are consumed together by ONE conditional UPDATE
  (`… where id and hash and redeemed_at is null and expires_at > now()` returning the row) — exactly one winner under
  concurrent taps. Outside the window nothing is consumed (the identical denial).
- Link `/kelner/<43-char token>`: a GET never consumes (messenger previews prefetch links); the page posts a form.
- Code `<waiter id>-XXXX-XXXX`: 8 characters from the 31-character alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0, O,
  1, I, L) ≈ 39.6 bits, scoped by the waiter-id prefix and throttled per waiter id in the DB (`begin_login_attempt`,
  key `sha256("waiter-code:<id>")`, 10 tries per 15 minutes) → ≤ ~1 400 guesses over a ≤ 36 h window: ~2·10⁻⁹. Typed
  case-insensitively, spaces or dashes between groups. Malformed input (no parseable id) gets the identical denial with
  no DB call (the format is public). A throttle keyed on the whole typed code would not throttle at all — keyed on the
  prefix instead. Known offline caveat (a leaked row's code hash is brute-forceable) accepted: bounded by the ≤ 36 h
  validity, the online threat model is the requirement.
- Session cookie `kp-waiter`: 32 random bytes base64url, stored as SHA-256; `HttpOnly; SameSite=Lax; Path=/`, `Secure`
  on https, `Max-Age` = seconds until `expires_at` (≥ 1).
- Middleware: a SEPARATE `guardWaiterArea` that reads only `kp-waiter` → `locals.waiter` (`locals.staff` stays null);
  `guardStaffArea` keeps reading only `kp-session`. Areas (order matters): `/kelner/sala/**` page (no session → 303
  `/kelner`), `/api/kelner/sala/**` (no session → 401 fixed body), `/api/kelner/**` (Origin 403 on mutations before
  any DB read), `/kelner` and `/kelner/<token>` public. `/kelner` never redirects: with a live session it shows „Wróć na
  salę” and „Wyloguj” above the code form (a redirect would loop into the floor's 404 once that event is archived or
  over, leaving no way to type a new code); redeeming while a waiter session exists ends the old session first. All with
  `AUTH_AREA_HEADERS`; a stale waiter cookie is cleared on the guard's own answers.
- The waiter guard re-reads the event on every request: id = the session's event, not a template, not archived, the
  restaurant enabled, `isFloorOpen`, `expires_at > now` → else the identical 404. No support branch.
- Panel API under `panelEventApi(…, EVENT_STAFF_ROLES)` — a waiter account, another restaurant, the admin outside
  support and unknown / malformed ids → the identical 404; support mode reads the list only (logged like every read).

## Critical Implementation Details

- **Timing & lifecycle:** the redeem route checks the window BEFORE the conditional UPDATE (nothing consumed outside it);
  the UPDATE's own filters make the consumption atomic. The middleware clears the waiter cookie only when the ROW is
  gone or expired — an archived (then restored) event or a disabled restaurant gives 404s, never a lost cookie.
- **State sequencing:** the code throttle runs before any lookup of the code (like the login), and a success clears
  that waiter's attempts. `beginAttempt` in `src/lib/auth/service.ts` is private and keyed by e-mail: the waiter
  service calls the `begin_login_attempt` RPC itself with `hashSecretToken("waiter-code:<id>")` (and deletes that
  key's `login_attempt` rows on success).
- **Module boundaries:** `src/lib/floor/dispatch.ts` imports route modules and `getDb` — never re-export it from
  `src/lib/floor/index.ts` (islands import the floor's pure modules). The link page and the redeem share ONE
  „redeemable” check (unused, unexpired, not a template, restaurant enabled, `isFloorOpen`).

## Phase 1: Data, service, panel management

### Overview

The table and DB function, the pure rules and texts, the service, the panel API and the event card island.

### Changes Required:

#### 1. Migration
**File**: `supabase/migrations/20261111020000_event_waiters.sql`
**Intent**: the `event_waiter` table and `add_event_waiter`; additive only.
**Contract**: table as in Approach (checks: name 1–40 code points, hashes `^[0-9a-f]{64}$`, `(redeemed_at is null) =
(link_hash is not null and code_hash is not null)`; unique `link_hash`, unique `session_hash`, index `(event_id)`); RLS +
`revoke all … from anon, authenticated`. `add_event_waiter(p_event_id integer, p_restaurant_id integer,
p_display_name text, p_created_by bigint, p_link_hash text, p_code_hash text, p_max integer)` → `table (waiter_id
bigint, expires_at timestamptz)`: locks the event row `for update` (same restaurant, `is_template = false`), raises
`EVENT_NOT_FOUND`, `EVENT_CLOSED` (archived or computed expiry ≤ now()), `TOO_MANY`; `set search_path = ''`, revoke
execute from public, anon, authenticated.

#### 2. Pure rules, cookie, paths, texts, zod
**Files**: `src/lib/event-waiters/{rules,cookie,paths,messages,api,index}.ts`
**Intent**: everything the server, the islands and the tests share.
**Contract**: `MAX_EVENT_WAITERS = 30`, `WAITER_CODE_ALPHABET`, `formatWaiterCode(id, secret)`, `parseWaiterCode(raw)`
→ `{ waiterId, secret } | null`, `parseWaiterName` (guest-name normalization, 1–40), `waiterStatus(row, now)` →
`unused | redeemed | expired`, `canAddWaiter(eventDate, archivedAt, now)` (today or upcoming, not archived — mirrors the
SQL rule), paths `WAITER_ENTRY_PATH` `/kelner`, `waiterLinkPath(token)`, `waiterFloorPath(id)`,
`waiterFloorApiBase(id)`, `WAITER_ENTER_API`, `WAITER_LOGOUT_API`; `classifyWaiterPath(pathname)` →
`waiter-floor | waiter-floor-api | waiter-api | waiter-entry | null`; cookie `WAITER_COOKIE = "kp-waiter"`,
`waiterCookie(token, maxAgeSeconds, { secure })`, `clearedWaiterCookie`, `readWaiterToken`; `eventWaiterMessages`
(PL/EN); zod `AddEventWaiterBody` strict `{ name }`. `src/lib/auth/cookie.ts` gains `readCookieToken(header, name)`
(`readSessionToken` delegates).

#### 3. Service
**File**: `src/lib/event-waiters/service.ts`
**Intent**: DB access; secrets leave only as return values for a cookie or the once-shown link and code.
**Contract**: `listEventWaiters(db, eventId, now)` → `EventWaiterDto[]` (`{ id, name, status, createdAt, expiresAt }`,
no hashes), `addEventWaiter(db, { restaurantId, eventId, name, createdBy })` → `added { waiter, link: path, code,
expiresAt } | closed | too-many | not-found`, `deleteEventWaiter(db, eventId, waiterId)` → `deleted | not-found`,
`findWaiterLink(db, token, now)` (link page: name + event when redeemable, else null), `redeemWaiterLink(db, token,
now)` / `redeemWaiterCode(db, typed, now)` → `ok { session: { token, expiresAt }, eventId } | invalid | throttled
{ retryAfterSeconds }`, `getWaiterSession(db, token)` → `WaiterSession | null`, `logoutWaiter(db, token)`.

#### 4. Panel API
**Files**: `src/pages/api/panel/events/[id]/waiters.ts` (GET, POST), `src/pages/api/panel/events/[id]/waiters/[waiterId].ts`
(DELETE)
**Intent**: owners and managers manage the event's per-event waiters.
**Contract**: `panelEventApi(locals, params.id, EVENT_STAFF_ROLES)`; GET → `EventWaitersDto { eventId, canAdd,
waiters }`; POST `{ name }` → 201 `EventWaiterAnswerDto { waiters: EventWaitersDto, issued: EventWaiterIssuedDto
{ id, name, path, code, expiresAt } }`, 400 name message, 409 closed / too-many; DELETE → `EventWaitersDto`; a waiter
id of another event, unknown or malformed → the identical 404. Types in `src/types.ts`, `database.types.ts` extended.

#### 5. Event card island
**Files**: `src/components/event-waiters/EventWaitersManager.tsx` (+ hook `src/components/hooks/useEventWaiters.ts`),
`src/pages/panel/wydarzenia/[id].astro`
**Intent**: the „Kelnerzy na imprezę” section for members (not in support mode); the list loaded in the page's one
`Promise.all`.
**Contract**: `data-event-waiters`, rows `data-event-waiter="<id>"` with `data-waiter-status`, the issued card
`data-waiter-issued` (full link from the `origin` prop, the code, copy with a select fallback, expiry, „shown only
now”), revoke after `window.confirm`.

#### 6. Tests
**Files**: `src/lib/event-waiters/event-waiters.test.ts`, `tests/integration/event-waiters.test.ts`
**Intent**: unit — code format/parse (case, spaces, dashes, ambiguous characters refused), path classes, cookies, name
rule, `canAddWaiter`; integration — expiry = noon Warsaw of the next day (FUTURE dates in CET and CEST, e.g. 2026-12-15 and
2027-07-15 — past dates are refused; `eventTiming` is `today` 1 ms before, `past` at it), add refused for archived / past / template / other restaurant / the limit, link redeem
consumes link and code together (second redeem and the code fail), code redeem, an upcoming event's link is not
redeemable and stays unused, throttle after 10 wrong codes (then even the right one is refused), session lookup,
logout, revoke kills the session, event delete cascades, the list never carries hashes.

### Success Criteria:

#### Automated Verification:

- Migration applies: `npx supabase migration up` on the populated local DB (demo data of the previous commit intact)
- `AI_PROVIDER=mock npm test` passes (unit + integration incl. `event-waiters`)
- `npm run lint` and `npx astro check` pass

#### Manual Verification:

- The event card's „Kelnerzy na imprezę” adds a waiter and shows the link and code once (PL and EN)

---

## Phase 2: The waiter's door — middleware, redeem, floor

### Overview

The waiter areas in the middleware, the entry and link pages, the redeem and logout endpoints, the waiter guard and
the waiter floor page / API reusing S-21's dispatch.

### Changes Required:

#### 1. Locals and middleware
**Files**: `src/env.d.ts`, `src/middleware.ts`
**Intent**: `App.Locals.waiter: WaiterSession | null` (null everywhere else); `guardWaiterArea` as in Approach.

#### 2. Shared floor dispatch
**Files**: `src/lib/floor/dispatch.ts`, `src/pages/api/panel/events/[id]/obsluga/[...path].ts`
**Intent**: extract the S-21 dispatcher body into `runFloorRoute({ db, event: { id, restaurantId }, locals, path,
request })`; the panel dispatcher calls it unchanged in behaviour.

#### 3. Waiter guard
**File**: `src/lib/waiter-api.ts`
**Intent**: `findWaiterFloorEvent(locals, idParam, now)` → `{ db, waiter, event: { id, name, restaurantId }, date } |
null` and `waiterFloorApi(locals, idParam)` (401 without a session, 503 without a DB, else the identical 404).

#### 4. Pages and endpoints
**Files**: `src/pages/kelner/index.astro`, `src/pages/kelner/[token].astro`, `src/pages/kelner/sala/[id].astro`,
`src/pages/api/kelner/wejscie.ts`, `src/pages/api/kelner/wyloguj.ts`, `src/pages/api/kelner/sala/[id]/[...path].ts`
**Intent**: entry (code form, `?blad=niewazny|limit|baza`, `?wylogowano=1`; with a live session „Wróć na salę” +
„Wyloguj”), link page (form with the hidden token),
floor page (`data-waiter-floor="<id>"`, OrderManager floor with `waiterFloorApiBase(id)`, the waiter's name and
validity, logout; no link to `/panel`); `wejscie` → 303 to the floor + `Set-Cookie`, or 303 `/kelner?blad=…` (+
`Retry-After` when throttled); `wyloguj` → 303 `/kelner?wylogowano=1` + cleared cookie.

### Success Criteria:

#### Automated Verification:

- `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check` pass
- `npm run build` passes

#### Manual Verification:

- On a phone: open the link, „Wejdź na salę”, mark a piece and add a refill; then the code path on another browser

---

## Phase 3: Smoke, demo, documentation

### Overview

Smoke section 37, the demo's per-event waiter, CLAUDE.md, migration verification.

### Changes Required:

#### 1. Smoke section 37
**Files**: `scripts/smoke.mjs`, `scripts/lib/platform.mjs` (`expireEventWaiter(env, waiterId)` — a test seam that moves
`expires_at` into the past)
**Intent**: management (owner and manager add; waiter account, owner B, admin outside support, malformed / unknown /
template ids → the identical 404; no session 401; foreign Origin 403; name 400; tomorrow 201; past and archived 409;
support mode lists without credentials and cannot write), the link page (200 without consuming; unknown / malformed /
tomorrow's → the identical 404), redeem by link (303 + cookie attributes; second use and the consumed code refused),
redeem by code (lowercase with spaces), the floor through the waiter cookie (board with prices, refill, piece as the
venue's mark, body price 400, other routes / event B / tomorrow / malformed → identical 404, foreign Origin 403, the
floor page), cookie crossing (waiter cookie → `/panel` 303 login, `/api/panel/…` 401; staff cookie → `/kelner/sala/…`
303 `/kelner`, `/api/kelner/sala/…` 401), throttle (10 wrong codes → the right one refused with `limit`), revoke (the
session gets 401, B's waiter through A's event path → 404), expired (link and session), logout, archive → 404 then
restore → 200 with the same cookie, event delete → 401.

#### 2. Demo
**File**: `scripts/demo.mjs`
**Intent**: the owner adds a per-event waiter to the main event (today); the demo checks the link page answers 200
(nothing consumed) and prints the link, the code and `/kelner` under „Obsługa sali”.

#### 3. Documentation
**File**: `CLAUDE.md`
**Intent**: „The floor”: replace the CUT bullet with the per-event waiter's description (table, door, cookie, guard,
throttle, routes, decisions); Commands: smoke section 37 and the demo line; `npm run links` unaffected.

### Success Criteria:

#### Automated Verification:

- `npm run build`; `npm run smoke` passes against `AI_PROVIDER=mock npm run preview`; `npm run demo` passes
- `npx supabase db reset` applies every migration from zero; `npm test` still passes afterwards

#### Manual Verification:

- The demo's printed link and code each open the floor once on a phone; revoking on the event card logs the phone out

---

## Testing Strategy

### Unit Tests:

- Code alphabet and parsing; path classification order; cookie strings and reading; name rule; `canAddWaiter` at the
  noon edge with fixed clocks.

### Integration Tests:

- Expiry instant (CET and CEST), add refusals, one-time consumption (link and code together), the window gate without
  consumption, throttle, session lifecycle, revoke, cascade, no hashes in DTOs.

### Manual Testing Steps:

1. Owner adds „Kuba” on the event card, copies the link to a phone, opens it, „Wejdź na salę”, marks a piece.
2. Second waiter by code on `/kelner`; revoke it on the card → the phone's next action needs a new link.

## Migration Notes

Additive (one table, one function). Deploy: the migration before the code (the code reads the table on the event card
and in the waiter areas; old code ignores it).

## References

- `context/archive/2026-11-10-waiter-day-and-refills/plan.md`
- `src/pages/api/panel/events/[id]/obsluga/[...path].ts`, `src/lib/panel-api.ts:findFloorEvent`
- `src/pages/haslo/[token].astro`, `src/lib/auth/service.ts:beginAttempt`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data, service, panel management

#### Automated

- [x] 1.1 Migration applies: `npx supabase migration up` on the populated local DB (demo data of the previous commit intact) — 306a01e
- [x] 1.2 `AI_PROVIDER=mock npm test` passes (unit + integration incl. `event-waiters`) — 306a01e
- [x] 1.3 `npm run lint` and `npx astro check` pass — 306a01e

#### Manual

- [ ] 1.4 The event card's „Kelnerzy na imprezę” adds a waiter and shows the link and code once (PL and EN)

### Phase 2: The waiter's door — middleware, redeem, floor

#### Automated

- [x] 2.1 `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check` pass — e1a3ee9
- [x] 2.2 `npm run build` passes — e1a3ee9

#### Manual

- [ ] 2.3 On a phone: open the link, „Wejdź na salę”, mark a piece and add a refill; then the code path on another browser

### Phase 3: Smoke, demo, documentation

#### Automated

- [x] 3.1 `npm run build`; `npm run smoke` passes against `AI_PROVIDER=mock npm run preview`; `npm run demo` passes — fcf4988
- [x] 3.2 `npx supabase db reset` applies every migration from zero; `npm test` still passes afterwards — fcf4988

#### Manual

- [ ] 3.3 The demo's printed link and code each open the floor once on a phone; revoking on the event card logs the phone out
