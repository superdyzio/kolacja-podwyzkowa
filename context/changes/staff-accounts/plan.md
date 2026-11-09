# Staff accounts and sessions (F-03 staff-accounts) Implementation Plan

## Overview

Staff of the platform (platform admin, restaurant owners, managers, waiters) get their own accounts: an invited person opens a one-time, expiring link, sets a password, and logs in with e-mail + password for 30 days on that device. They can log out (this device or everywhere) and change the password, which ends their other sessions. Mass password guessing is refused before the password is even checked; a few typos never lock a worker out. The first platform admin is created from the CLI, which prints the one-time link (the app never sends e-mail). `/panel/**` needs a session (else → login page), `/api/panel/**` needs a session (else one fixed JSON denial), and a central membership guard answers routes that carry a restaurant or event id with the same 404 for foreign and unknown ids. The panel itself is a single proof-of-session page; the real panels come with S-10/S-11 (PRD v2 FR-022, US-05, NFR-013, NFR-020, NFR-022).

## Current State Analysis

- Access is link keys only (`src/lib/access/`, `src/middleware.ts`): `parseAccessPath` knows `/(api/)?(o|tv|g|r)/<key>`; anything else under those prefixes gets the identical 404 (`NoAccess` page or `{"error":"Brak dostępu"}`), with `PRIVATE_HEADERS` (`no-store`, `no-referrer`, `X-Robots-Tag`). No accounts, sessions or cookies except the locale cookie (`kp-lang`, HttpOnly, SameSite=Lax, `secure` on https — `src/middleware.ts:35-41`).
- F-02 (`20261109120000_multi_tenant_events.sql`) added `public.restaurant (id integer identity, name, created_at)` with many `public.event (id integer identity, restaurant_id → restaurant)`. Scripts create restaurants/events over PostgREST with the service-role key (`scripts/lib/platform.mjs`: `readDbEnv({ requireLocal })`, `createRestaurant`, `createEvent`); smoke and demo create their own restaurants (`scripts/smoke.mjs` section 3, `scripts/demo.mjs`).
- Astro: `output: "server"`, `session: false` (comment says "the app keeps no sessions"), `security.allowedDomains: [{ protocol: "https" }]` (behind the Lambda proxy `context.url` is the public https URL). Astro's built-in origin check covers only form/body-less requests and does not refuse a missing `Origin`.
- `src/lib/http.ts`: `jsonResponse`, `jsonError`, `readJsonBody`, `readBodyBytes(request, limit)`, `parseId`. API guards `organizerApi`/`guestApi`/`restaurantApi` return `{ access, db } | Response`.
- Smoke (`scripts/smoke.mjs`): `request(path, { method, json, rawBody, extraHeaders })` always sends `Origin: BASE_URL` (spread first, so it cannot be omitted today), `redirect: "manual"`, captures `set-cookie`/`location`; proxy simulation via `viaProxy` headers (`X-Forwarded-Proto: https`, `X-Forwarded-Host`, `Origin: https://kolacja.example`); section 7 asserts `/dashboard` and `/auth/signin` are the 404 no-access page (new routes must not live there); section 23d compares foreign-id denials byte for byte with id 2 000 000 000.
- `tests/scripts/` holds pure tests of `.mjs` helpers (`aws-deploy.test.ts`); integration tests use `describe.skipIf(!hasLocalDb)` and create/delete their own rows (`tests/integration/helpers.ts`).
- `tech-stack.md` has `has_auth: false`; CLAUDE.md heading "Access model (no accounts)".

## Desired End State

- Migration `supabase/migrations/20261109140000_staff_accounts.sql` (additive) applies on the current populated local DB (`npx supabase migration up`, every existing row and link unchanged) and from scratch (`npx supabase db reset`).
- `npm run platform:admin -- <email> [--name "<name>"] [--remote]` prints the DB host, creates (or finds) the account, sets the platform-admin flag and prints a one-time link `<BASE_URL>/haslo/<token>` (invite while the account has no password, else a password reset). A non-local DB needs `--remote`.
- `/haslo/<token>` (invite or reset) → set password → logged in → `/panel`. `/logowanie` → e-mail + password → `/panel`. `/panel` shows the person (name, e-mail), the platform-admin marker, their restaurants with roles, a change-password form and „Wyloguj” / „Wyloguj ze wszystkich urządzeń”. All texts PL/EN.
- `/panel/**` without a valid session → 303 `/logowanie`; `/api/panel/**` without one → 401 with one fixed body; every mutation under `/api/panel/**` and `/api/auth/**` without a same-origin `Origin` → 403 (also JSON bodies, also a missing header). `GET /api/panel/restaurants/<id>` and `GET /api/panel/events/<id>` answer through the central guard: a member gets 200, a non-member, an unknown id and a role without the right get the identical 404 `{"error":"Brak dostępu"}`.
- Session cookie `kp-session`: HttpOnly, SameSite=Lax, Path=/, Max-Age 30 days, Secure on https. Only the SHA-256 of the session and link tokens is stored; passwords are scrypt (`node:crypto`).
- 10 failed logins for one e-mail within 15 min → the next attempts are refused (even with the right password) with the same answer whether the account exists or not; a success clears the counter.
- Smoke covers the above; demo creates a demo owner of the demo restaurant and prints how to log in; `/o/ /tv/ /g/ /r/` behave exactly as before. CLAUDE.md and `tech-stack.md` describe the accounts.

### Key Discoveries:

- `src/middleware.ts:44-50`: the `?lang=` redirect and locale resolution run first for every path; panel handling slots in after the locale is set and before `parseAccessPath` (which never matches the new prefixes).
- `src/middleware.ts:22-28`: `withPrivateHeaders` rebuilds the Response; Set-Cookie headers written by routes survive it (they are plain headers), so routes build `Set-Cookie` explicitly with a pure helper instead of relying on `Astro.cookies` attachment through a rebuilt Response.
- `scripts/smoke.mjs:29-31`: `{ Origin: BASE_URL, ...extraHeaders }` — needs an explicit "no Origin" option and a `Cookie` option for the new section.
- `scripts/lib/platform.mjs:15`: `readDbEnv({ requireLocal })` is the local guard to reuse in smoke/demo; the CLI uses `readDbEnv()` plus its own `--remote` confirmation for non-local hosts.
- Node `crypto.scrypt` throws when `128 * N * r` exceeds `maxmem` (default 32 MiB): N = 2^15, r = 8 needs an explicit `maxmem` (64 MiB).

## What We're NOT Doing

- No restaurant creation, owner invitation UI, team management, role changes, reset links issued from the panel, restaurant disable flag (S-10, S-12). F-03 creates the `restaurant_member` table and reads it; only tests, smoke, demo and later slices write it.
- No platform-admin bypass of the membership guard: the admin gets the same 404 for restaurants they are not a member of until S-13 adds the logged support mode.
- No per-event waiter access or „kelner na imprezę” (S-21); the data model leaves room for a separate table.
- No e-mail sending, no self-registration, no 2FA, no "remember me" choice (always 30 days), no sliding expiry, no `next=` return address after login (always `/panel`).
- No per-IP throttle: behind the Lambda Function URL the client address is not verified tonight, and a shared bucket would let one attacker lock out the whole platform. Throttling is per e-mail (logged as a risk).
- No React islands: login, set-password, change-password and logout are plain HTML forms posting to API routes that answer 303 (no client JS needed; errors come back as a code in the query, never the e-mail).
- No Astro sessions (`session: false` stays; only its comment changes).

## Implementation Approach

Four phases, each green on its own. Phase 1 adds the schema, DB functions, types and the `src/lib/auth/` library with unit and integration tests — the app's behaviour is unchanged. Phase 2 wires the middleware, the central guard, the routes, pages and the CLI. Phase 3 extends smoke and demo. Phase 4 updates the docs.

Rules every phase follows:
- Tokens (session, invite/reset): 32 random bytes, base64url (43 chars); the DB stores only `sha256(token)` hex. Lookups go by hash (no secret comparison in JS); the password check uses `timingSafeEqual`.
- One hashing source in TS (`src/lib/auth/tokens.ts`) and one in `scripts/lib/platform.mjs` (dependency-free), pinned equal by `tests/scripts/platform-tokens.test.ts`.
- Every failure of login answers identically (unknown e-mail, account without password, wrong password); unknown/used/expired link tokens answer identically; no-session answers identically whatever the cookie was.

## Critical Implementation Details

- **Origin check order:** in the middleware, for any non-GET/HEAD request under `/api/panel/**` or `/api/auth/**`, compare `request.headers.get("origin")` with `context.url.origin` BEFORE any DB read; missing or different → 403 JSON. Behind the proxy both are `https://<public host>`.
- **Throttle is pessimistic:** `begin_login_attempt` counts and inserts the attempt row in one transaction under an advisory lock on the key, so parallel requests cannot exceed the limit; a successful login deletes the key's rows. A refused attempt never reaches the password check.
- **Timing:** when no account or no password hash exists, verify against a fixed dummy scrypt hash so every login failure costs the same.
- **Referrer policy of the auth areas (plan review F1):** a plain HTML form POST is a navigation request, and for those the Fetch spec sends `Origin: null` when the page's referrer policy is `no-referrer`; Astro's own check (`node_modules/astro/dist/core/app/origin-check.js`) and ours would then refuse every login. So `/panel/**`, `/api/panel/**`, `/logowanie`, `/haslo/**` and `/api/auth/**` get `Referrer-Policy: same-origin` (never a referrer to another site, so never the `/haslo/<token>` path), not the key routes' `no-referrer`; the other private headers stay.
- **PostgREST embeds (plan review F2):** `staff_token` has two foreign keys to `staff_account` (`account_id`, `created_by`), so an embed from `staff_token` must name `staff_account!staff_token_account_id_fkey` (or read the account in a second query).

## Phase 1: Schema and auth library

### Overview

The migration, DB types, the pure and DB parts of `src/lib/auth/`, the membership lookups, and their tests. Nothing user-visible changes.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261109140000_staff_accounts.sql` (new)

**Intent**: Accounts, memberships, sessions, one-time links and login attempts, plus the DB functions that must be atomic. Additive only; header comment describes the model and the access rules (as earlier migrations).

**Contract**:
- `public.staff_account (id bigint identity pk, email text not null, display_name text null, password_hash text null, is_platform_admin boolean not null default false, created_at timestamptz not null default now(), password_changed_at timestamptz null)`; checks: `email = lower(btrim(email))`, length 3–254, contains `@`; `display_name` null or 1–80 chars trimmed; `password_hash` null or starts with `scrypt$`; unique index on `email`.
- `public.restaurant_member (restaurant_id integer → restaurant on delete cascade, account_id bigint → staff_account on delete cascade, role text not null check in ('owner','manager','waiter'), created_at, primary key (restaurant_id, account_id))` + index on `account_id`.
- `public.staff_session (id bigint identity pk, account_id → staff_account on delete cascade, token_hash text not null unique, created_at, expires_at timestamptz not null)` + index on `account_id`; check `token_hash ~ '^[0-9a-f]{64}$'`.
- `public.staff_token (id bigint identity pk, account_id → staff_account on delete cascade, kind text check in ('invite','reset'), token_hash text not null unique (same hex check), created_at, expires_at timestamptz not null, used_at timestamptz null, created_by bigint null → staff_account on delete set null)` + index on `account_id`.
- `public.login_attempt (id bigint identity pk, key_hash text not null (hex check), created_at timestamptz not null default now())` + index `(key_hash, created_at)` and on `created_at`.
- Every table: RLS on, `revoke all … from anon, authenticated`, comment.
- Functions (all `set search_path = ''`, `revoke execute … from public, anon, authenticated`, `grant execute … to service_role`, comment):
  - `issue_staff_token(p_account_id bigint, p_kind text, p_token_hash text, p_expires_at timestamptz, p_created_by bigint default null) → bigint` — `ACCOUNT_NOT_FOUND`; deletes the account's unused tokens, inserts the new one (a new link supersedes the old).
  - `redeem_staff_token(p_token_hash text, p_password_hash text, p_session_hash text, p_session_expires_at timestamptz) → bigint` (account id) — locks the token row `for update` where unused and `expires_at > now()`, else `TOKEN_INVALID` (unknown, used and expired alike); marks it used, deletes the account's other unused tokens, sets `password_hash` and `password_changed_at`, deletes every session of the account, inserts the new session.
  - `change_staff_password(p_account_id bigint, p_keep_session_id bigint, p_password_hash text) → void` — `ACCOUNT_NOT_FOUND`; sets the hash and `password_changed_at`, deletes every session of the account except `p_keep_session_id`.
  - `begin_login_attempt(p_key_hash text, p_limit integer, p_window_seconds integer) → table (allowed boolean, retry_after_seconds integer)` — `pg_advisory_xact_lock(3010, hashtext(p_key_hash))`; deletes `login_attempt` rows older than one day (all keys); counts the key's rows within the window; below the limit → insert a row, `(true, 0)`; else `(false, seconds until the oldest row in the window leaves it, at least 1)`.

#### 2. DB types

**File**: `src/db/database.types.ts`

**Intent**: Mirror the five tables (Row/Insert/Update/Relationships) and four functions so every query is typed.

**Contract**: generated-types shape as the existing entries.

#### 3. Auth library (pure)

**Files**: `src/lib/auth/tokens.ts`, `password.ts`, `email.ts`, `cookie.ts`, `paths.ts`, `origin.ts`, `limits.ts`, `messages.ts`, `forms.ts`, `index.ts`

**Intent**: Everything testable without a DB; `tokens.ts` and `password.ts` use only `node:crypto` (server only — islands never import `@/lib/auth`).

**Contract**:
- `tokens.ts`: `generateSecretToken()` (32 random bytes base64url), `isWellFormedSecretToken(s)` (`^[A-Za-z0-9_-]{43}$`), `hashSecretToken(token)` → sha256 hex.
- `password.ts`: `hashPassword(password, params?)` → `scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>` (defaults N 32768, r 8, p 1, 16-byte salt, 64-byte key, `maxmem` 64 MiB; params overridable for tests), `verifyPassword(password, stored | null)` → boolean (malformed or null stored → compares against `DUMMY_PASSWORD_HASH` and returns false; `timingSafeEqual`), `PASSWORD_MIN_LENGTH` 10, `PASSWORD_MAX_LENGTH` 200, `checkNewPassword(password, repeat)` → `ok | too-short | too-long | mismatch` (code points).
- `email.ts`: `normalizeEmail(raw)` → trimmed lowercase or null when not `^[^\s@]+@[^\s@]+\.[^\s@]+$` or > 254 chars; `loginKeyHash(raw)` → `hashSecretToken("login:" + trimmed lowercase raw)` (keyed on what was typed, so it never depends on whether the account exists).
- `limits.ts`: `SESSION_DAYS` 30, `SESSION_MAX_AGE_SECONDS`, `INVITE_TTL_DAYS` 7, `RESET_TTL_HOURS` 24, `LOGIN_FAILURE_LIMIT` 10, `LOGIN_WINDOW_SECONDS` 900.
- `cookie.ts`: `SESSION_COOKIE` = `kp-session`; `sessionCookie(token, { secure })` and `clearedSessionCookie({ secure })` → Set-Cookie strings (`Path=/; HttpOnly; SameSite=Lax; Max-Age=…`, `; Secure` when secure); `readSessionToken(cookieHeader)` → well-formed token or null.
- `paths.ts`: `classifyAuthPath(pathname)` → `null` | `{ area: "panel" | "panel-api" | "auth-page" | "auth-api" }` for `/panel`, `/panel/…`, `/api/panel`, `/api/panel/…`, `/logowanie`, `/haslo/…`, `/api/auth/…` (not `/panelx`); `LOGIN_PATH` `/logowanie`, `PANEL_PATH` `/panel`, `setPasswordPath(token)` `/haslo/<token>`.
- `origin.ts`: `isMutation(method)`, `isSameOrigin(originHeader, urlOrigin)` (missing → false).
- `messages.ts`: `authMessages = defineMessages({…}, {…})` — login, set password (invite/reset variants), invalid link, panel page, change password, logout, role labels (owner/manager/waiter), platform-admin marker, error codes (`dane`, `limit`, `baza`, `krotkie`, `dlugie`, `rozne`, `obecne`; an unknown code shows nothing), success notes, no-session and forbidden-origin API texts, aria labels; `PRODUCT_NAME` = „Stolik” lives in `src/lib/i18n/product.ts` (one constant, used by the panel pages' titles).
- `forms.ts`: `readFormBody(request, limit = 16 KiB)` → `URLSearchParams | "too-large"` (reuses `readBodyBytes`); field readers with length caps.

#### 4. Auth service (DB)

**File**: `src/lib/auth/service.ts`

**Intent**: The DB side of accounts, sessions, links, throttle and memberships; status unions as elsewhere; Supabase errors throw.

**Contract**:
- `createStaffAccount(db, { email, displayName?, isPlatformAdmin? })` → `created { id } | exists { id } | invalid-email` (used by tests now, S-10/S-12 later).
- `issueStaffToken(db, accountId, kind, createdBy?)` → `{ token, expiresAt }` (TTL by kind) | `not-found`.
- `getTokenInfo(db, token)` → `{ kind, email } | null` (unused and unexpired only; malformed → null without a query).
- `redeemStaffToken(db, token, password)` → `{ status: "ok", session: { token, expiresAt } } | invalid-token | too-short | too-long | mismatch` (the repeat is checked by the caller via `checkNewPassword`, the service re-checks length).
- `login(db, { email, password })` → `ok { session } | invalid | throttled { retryAfterSeconds }`: `begin_login_attempt(loginKeyHash(email))` → refused → `throttled` (no password check); else find the account by normalized e-mail, `verifyPassword` (dummy when missing), success → delete the key's `login_attempt` rows and the account's expired sessions, insert a session; failure → `invalid`.
- `getSession(db, token)` → `StaffSession { sessionId, accountId, email, displayName, isPlatformAdmin, expiresAt } | null` (one query, `expires_at > now()`, account embedded).
- `logout(db, sessionId, { everywhere })`; `changePassword(db, session, { current, next, repeat })` → `ok | wrong-current | throttled | too-short | too-long | mismatch` (the current-password check goes through the same throttle key as login).
- `getMemberships(db, accountId)` → `[{ restaurantId, restaurantName, role }]` by restaurant name; `findRestaurantMembership(db, accountId, restaurantId)` → `{ restaurant: { id, name }, role } | null`; `findEventMembership(db, accountId, eventId)` → `{ event: { id, name, restaurantId }, restaurant: { id, name }, role } | null`.
- Types `StaffSession`, `StaffRole`, `StaffMembership` in `src/types.ts` or `src/lib/auth/types.ts` (re-exported from the index).

#### 5. Tests

**Files**: `src/lib/auth/*.test.ts`, `tests/integration/staff-accounts.test.ts`, `tests/scripts/platform-tokens.test.ts` (added in Phase 2 with the mjs helper — listed there)

**Intent**: Pure rules by unit tests; DB functions and the service on the local DB (own accounts and restaurants, deleted afterwards).

**Contract**:
- Unit: token format and hash; scrypt round trip, wrong password, malformed/null stored hash → false, params read from the hash string (tests pass small N); `checkNewPassword` bounds and mismatch; e-mail normalization; `loginKeyHash` case/whitespace-insensitive; cookie strings (flags, Secure only when asked, cleared cookie `Max-Age=0`), `readSessionToken` on garbage; `classifyAuthPath` table (incl. `/panelx`, `/api/panelx`, `/logowaniex`); origin helpers; every `authMessages` key present in both languages (type-checked).
- Integration (each test deletes its own accounts and restaurants AND the `login_attempt` rows of its own e-mail keys, which no cascade removes): invite → `getTokenInfo` → redeem → session resolves; second redeem, expired token (row with past `expires_at`) and garbage → `invalid-token`; a new token supersedes the old; reset redeem ends every earlier session; login ok / wrong password / unknown e-mail / account without password → `ok`/`invalid` (same status for the three failures); 10 failures → `throttled` even with the right password, for an unknown e-mail too; success after 3 failures clears the counter; expired session → `getSession` null; `changePassword` keeps the current session and ends the others, wrong current → `wrong-current`; logout one / everywhere; memberships: own restaurant role, foreign → null, unknown → null, event of a foreign restaurant → null; deleting an account cascades its sessions, tokens and memberships; deleting a restaurant cascades memberships.

### Success Criteria:

#### Automated Verification:

- Migration applies on the current populated local DB with every existing table's row count unchanged: `npx supabase migration up`
- Tests pass: `AI_PROVIDER=mock npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`

---

## Phase 2: Guard, routes, pages and the admin CLI

### Overview

The middleware area guard, the central membership guard, the auth and panel API routes, the three pages, the home-page link and `npm run platform:admin`.

### Changes Required:

#### 1. Middleware

**File**: `src/middleware.ts`, `src/env.d.ts`

**Intent**: Resolve the session for the auth areas and enforce the rules before routing; key routes untouched.

**Contract**:
- `App.Locals.staff: StaffSession | null` (null everywhere else).
- After the locale step: `classifyAuthPath(pathname)`; for a match: mutation under `panel-api`/`auth-api` without a same-origin `Origin` → 403 `{ error: authMessages.forbiddenOrigin }`; then read `kp-session` and `getSession` (DB not configured → null). `panel` without a session → 303 `/logowanie`; `panel-api` without a session → 401 `{ error: authMessages.noSession }` (identical body for missing, malformed, unknown and expired cookies); a cookie that did not resolve → the answer also clears it. Every answer in these areas gets `Cache-Control: no-store`, `X-Robots-Tag`, `X-Frame-Options: DENY` and `Referrer-Policy: same-origin` (NOT `no-referrer`: see Critical Implementation Details, F1) — one exported header set (`AUTH_AREA_HEADERS` in `src/lib/auth/paths.ts`, unit-tested).

#### 2. Central guard

**File**: `src/lib/panel-api.ts`

**Intent**: The analog of `organizerApi` that every later panel route starts with.

**Contract**:
- `panelApi(locals)` → `{ staff, db } | Response` (401 no session, 503 no DB).
- `panelRestaurantApi(locals, idParam, roles = ALL_ROLES)` and `panelEventApi(locals, idParam, roles = ALL_ROLES)` (async) → `{ staff, db, restaurant, role[, event] } | Response`; malformed id, unknown id, not a member, a role outside `roles` → the identical 404 `{ error: noAccessMessages(locale).title }`. No platform-admin bypass (S-13).

#### 3. API routes

**Files**: `src/pages/api/auth/login.ts`, `src/pages/api/auth/logout.ts`, `src/pages/api/auth/password-link.ts`, `src/pages/api/panel/password.ts`, `src/pages/api/panel/me.ts`, `src/pages/api/panel/restaurants/[id].ts`, `src/pages/api/panel/events/[id].ts`

**Intent**: Form posts answering 303, plus three JSON reads that prove the session and the guard.

**Contract** (all `prerender = false`; form bodies via `readFormBody`, > 16 KiB → 413):
- `POST /api/auth/login` (`email`, `password`) → ok: 303 `/panel` + session cookie; `invalid` → 303 `/logowanie?blad=dane`; `throttled` → 303 `/logowanie?blad=limit` + `Retry-After`. No DB → 303 `/logowanie?blad=baza`.
- `POST /api/auth/logout` (optional `wszedzie=1`) → deletes this session (or all of the account's), clears the cookie, 303 `/logowanie?wylogowano=1`; without a session the same redirect (idempotent).
- `POST /api/auth/password-link` (`token`, `password`, `repeat`) → ok: 303 `/panel` + cookie; `too-short`/`too-long`/`mismatch` → 303 `/haslo/<token>?blad=krotkie|dlugie|rozne`; invalid token → 303 `/haslo/<token>` (the page shows the invalid-link text).
- `POST /api/panel/password` (`current`, `password`, `repeat`) → ok: 303 `/panel?haslo=zmienione`; errors → 303 `/panel?blad=obecne|limit|krotkie|dlugie|rozne#haslo`.
- `GET /api/panel/me` → `{ email, displayName, isPlatformAdmin, restaurants: [{ id, name, role }] }`.
- `GET /api/panel/restaurants/<id>` (any role) → `{ restaurant: { id, name }, role }`; `GET /api/panel/events/<id>` (owner, manager) → `{ event: { id, name, restaurantId }, role }`. Through the central guard only.

#### 4. Pages

**Files**: `src/pages/logowanie.astro`, `src/pages/haslo/[token].astro`, `src/pages/panel/index.astro`, `src/pages/index.astro`, `src/lib/shell/messages.ts`, `astro.config.mjs` (comment only)

**Intent**: Minimal server-rendered forms (no islands), PL/EN, product name in the titles.

**Contract**:
- `/logowanie`: with a valid session → 303 `/panel`; else a form (e-mail `autocomplete="username"`, password `current-password`), the error for `?blad=` in a `role="alert"` box, the note for `?wylogowano=1`, the hint „Nie pamiętasz hasła? Poproś właściciela lub menedżera lokalu o link do ustawienia nowego.”
- `/haslo/<token>`: `getTokenInfo` → valid: heading by kind (invite / reset), the account's e-mail, password + repeat (`new-password`, min length hint), hidden token, error for `?blad=`; invalid/used/expired/malformed → 404 with one invalid-link text.
- `/panel`: the person (display name or e-mail, e-mail), „Administrator platformy” marker when set, „Twoje restauracje” (name + role label) or the empty text, change-password form (`id="haslo"`), logout and logout-everywhere forms, success/error notes from the query.
- `/`: a small link „Logowanie dla personelu” → `/logowanie` (texts in `shellMessages`).
- `astro.config.mjs`: `session: false` comment states that staff sessions live in Postgres (`staff_session`), not in Astro sessions.

#### 5. Script helpers and the admin CLI

**Files**: `scripts/lib/platform.mjs`, `scripts/platform-admin.mjs` (new), `package.json`, `tests/scripts/platform-tokens.test.ts` (new)

**Intent**: Create staff accounts, memberships and one-time links over PostgREST from scripts (CLI, smoke, demo) with the same hashing as the app.

**Contract**:
- `platform.mjs`: `generateSecretToken()`, `hashSecretToken(token)` (identical to `src/lib/auth/tokens.ts`), `ensureStaffAccount(env, { email, displayName?, isPlatformAdmin? })` → `{ id, email, hasPassword, created }` (lowercased e-mail; sets the admin flag when asked), `addMembership(env, restaurantId, accountId, role)`, `issueStaffLink(env, accountId, kind, baseUrl)` → `{ url, expiresAt }` via `rpc/issue_staff_token` (TTL as `limits.ts`).
- `npm run platform:admin` = `node --env-file-if-exists=.env scripts/platform-admin.mjs`; args `<email> [--name "<name>"] [--remote]`; prints `Baza: <host>` first; refuses a non-local host without `--remote`; invalid e-mail → error; prints whether the account was created, the link kind (invite when no password yet, else reset), its expiry and `BASE_URL` + `/haslo/<token>` (`BASE_URL` default `http://localhost:4321`). Polish CLI output like `event:create`.
- `tests/scripts/platform-tokens.test.ts`: `hashSecretToken` of `platform.mjs` equals the TS one for several inputs; both token generators match the well-formed pattern.

### Success Criteria:

#### Automated Verification:

- Tests pass: `AI_PROVIDER=mock npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- `npm run platform:admin -- admin@example.test` on the local DB prints a `/haslo/<token>` link; a second run prints a new link (the first one stops working)

#### Manual Verification:

- In a browser on the preview: the CLI link sets a password and lands on `/panel`; log out, log in again, change the password; the pages look right in PL and EN

---

## Phase 3: Smoke and demo

### Overview

The smoke proves the session, cookie, throttle, Origin and guard rules over HTTP; the demo creates a demo owner.

### Changes Required:

#### 1. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: A new section 25 „Staff accounts” (before `finish()`), with its own RUN_TAG e-mails so repeated runs never inherit a throttle; uses restaurants A and B from section 3 (keep their ids in scope).

**Contract**:
- `request()` gains `cookie` and `noOrigin` options; a small cookie-jar helper reads `kp-session` from `setCookie`.
- Setup in the local DB via `platform.mjs`: owner of A (invite link), waiter of A, owner of B, a platform admin without memberships; a reset link for one of them.
- Checks: `/logowanie`, `/haslo/<token>` and `/panel` (with a session) carry `Referrer-Policy: same-origin` and `X-Frame-Options: DENY` (plan review F1), the key routes still `no-referrer`; `/panel` and `/panel/x` without a cookie → 303 `/logowanie`, `no-store`; `/api/panel/me` without a cookie, with a garbage cookie and `/api/panel/nie-ma` → 401, identical bodies; `/logowanie` 200 with the form; `/haslo/<garbage>` and later a used token → 404 with the identical invalid-link page; a valid invite page shows the e-mail; too-short and mismatched passwords → 303 with `blad=krotkie`/`blad=rozne` and the token still valid; redeem → 303 `/panel` + cookie with `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=2592000`, no `Secure` on http; the same via `viaProxy` headers → `Secure`; `/panel` with the cookie shows the e-mail, restaurant A and „Właściciel”; `/api/panel/me` JSON; login wrong password and unknown e-mail → the identical 303 `blad=dane`; correct → 303 `/panel` + a new cookie; 3 typos then the right password → ok; 10 failures → the right password gets 303 `blad=limit` (+ `Retry-After`), an unknown e-mail after 10 failures gets the identical answer; Origin: login, logout and `/api/panel/password` with no Origin and with a foreign Origin (form and JSON content types) → 403, and the session still works afterwards; password change from session 1 → session 2 gets 401, session 1 still 200, the old password no longer logs in, the new one does; logout → old cookie 401, cleared cookie `Max-Age=0`; logout everywhere ends both sessions; guard: owner A → `/api/panel/restaurants/<A>` 200 and `/events/<eventA>` 200, `/restaurants/<B>`, `/events/<eventB>`, id 2000000000 and `abc` → identical 404 `{"error":"Brak dostępu"}`; waiter A → restaurant A 200, event A 404 identical; platform admin → restaurant A 404 identical, `/api/panel/me` shows `isPlatformAdmin: true`; key routes unchanged: `/o/<key>` 200 with a session cookie too, `/o/garbage` still the 404 no-access page with a session cookie, an organizer key in `/panel/<key>` still 303 to login without a session.

#### 2. Demo

**File**: `scripts/demo.mjs`

**Intent**: Show what F-03 added: a demo owner of the demo restaurant who can log in.

**Contract**: after the restaurant is created: `ensureStaffAccount` (`wlasciciel-<tag>@demo.stolik`), `addMembership(owner)`, `issueStaffLink(invite)`, then accept it over HTTP (`POST /api/auth/password-link` with a fixed local demo password) and print „Panel lokalu: <BASE_URL>/logowanie — e-mail …, hasło …”.

### Success Criteria:

#### Automated Verification:

- From scratch: `npx supabase db reset`, then `AI_PROVIDER=mock npm test` passes
- Build succeeds: `npm run build`
- Smoke passes twice in a row against `AI_PROVIDER=mock npm run preview`: `npm run smoke`
- Demo prints the panel login and the event links: `npm run demo`
- Lint passes: `npm run lint`

#### Manual Verification:

- With the demo's e-mail and password the panel shows „Restauracja demo” with the role „Właściciel”

---

## Phase 4: Docs

### Overview

CLAUDE.md, `tech-stack.md` and README describe the accounts.

### Changes Required:

#### 1. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: The new access model and conventions for later slices.

**Contract**: heading "Access model (link keys and staff accounts)"; a "Staff accounts (staff-accounts, F-03)" block: tables, functions, token/session/password rules, cookie, throttle numbers, areas and their answers (303 / 401 / 403 / 404), `panelApi` / `panelRestaurantApi` / `panelEventApi` usage for new routes under `src/pages/api/panel/…`, no admin bypass until S-13, forms answer 303 with `?blad=` codes; commands `npm run platform:admin`; smoke and demo lines updated; `App.Locals.staff`.

#### 2. tech-stack.md and README

**Files**: `context/foundation/tech-stack.md`, `README.md`

**Intent**: `has_auth: true` with a note (own accounts, no auth provider, no e-mail); README: first platform admin (`npm run platform:admin`, on production with the `.env.aws` variables and `--remote` after the migration is pushed), login, the demo owner.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- `grep -n "has_auth: true" context/foundation/tech-stack.md` finds the line

---

## Testing Strategy

### Unit Tests:

- Token generation/hash, scrypt round trip and malformed hashes, password rules, e-mail normalization and login key, cookie strings, path classification, origin helpers; mjs/TS hash parity.

### Integration Tests:

- `tests/integration/staff-accounts.test.ts` on the local DB: links (single use, expiry, supersede), login outcomes and throttle, sessions (expiry, logout, password change), memberships and cascades.

### Manual Testing Steps:

1. `npm run platform:admin -- ja@example.test` → open the link → set a password → `/panel` shows the admin marker.
2. Log out, try a wrong password, log in, change the password (a second browser's session ends).
3. Demo owner logs in and sees „Restauracja demo”.
4. Switch PL/EN on `/logowanie`, `/haslo/…`, `/panel`.

## Performance Considerations

scrypt N = 2^15, r = 8 costs ~50–150 ms and 32 MiB per login/redeem/password change (Lambda 1024 MB, one request per instance); each panel request adds one indexed session lookup. `login_attempt` stays small (rows older than a day are deleted on every attempt).

## Migration Notes

Additive (five new tables, four functions); no existing row or function changes, so the deploy order matters only for the new code (the platform DB gets `db push` before `deploy:aws` — the user's decision, never the old dinner project). Rollback = deploy the previous code; the tables can stay.

## References

- PRD v2: FR-022, US-05, NFR-013, NFR-020, NFR-022, Access Control Changes
- Roadmap F-03 and S-10..S-13, S-21; `shape-notes.md` Forward blocks; `m2-product-notes.md` item 2
- Similar guard: `src/lib/organizer-api.ts`; locale cookie: `src/middleware.ts:35-41`; script helpers: `scripts/lib/platform.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema and auth library

#### Automated

- [x] 1.1 Migration applies on the current populated local DB with every existing table's row count unchanged: `npx supabase migration up` — b2e305a
- [x] 1.2 Tests pass: `AI_PROVIDER=mock npm test` — b2e305a
- [x] 1.3 Lint passes: `npm run lint` — b2e305a
- [x] 1.4 Type check passes: `npx astro check` — b2e305a
- [x] 1.5 Build succeeds: `npm run build` — b2e305a

### Phase 2: Guard, routes, pages and the admin CLI

#### Automated

- [x] 2.1 Tests pass: `AI_PROVIDER=mock npm test` — 4587602
- [x] 2.2 Lint passes: `npm run lint` — 4587602
- [x] 2.3 Type check passes: `npx astro check` — 4587602
- [x] 2.4 Build succeeds: `npm run build` — 4587602
- [x] 2.5 `npm run platform:admin -- admin@example.test` on the local DB prints a `/haslo/<token>` link; a second run prints a new link (the first one stops working) — 4587602

#### Manual

- [ ] 2.6 In a browser on the preview: the CLI link sets a password and lands on `/panel`; log out, log in again, change the password; the pages look right in PL and EN

### Phase 3: Smoke and demo

#### Automated

- [x] 3.1 From scratch: `npx supabase db reset`, then `AI_PROVIDER=mock npm test` passes
- [x] 3.2 Build succeeds: `npm run build`
- [x] 3.3 Smoke passes twice in a row against `AI_PROVIDER=mock npm run preview`: `npm run smoke`
- [x] 3.4 Demo prints the panel login and the event links: `npm run demo`
- [x] 3.5 Lint passes: `npm run lint`

#### Manual

- [ ] 3.6 With the demo's e-mail and password the panel shows „Restauracja demo” with the role „Właściciel”

### Phase 4: Docs

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 `grep -n "has_auth: true" context/foundation/tech-stack.md` finds the line
