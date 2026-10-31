# Link-key access foundation Implementation Plan

## Overview

Roadmap F-01 (`link-access-foundation`, PRD NFR-009 + Access Control). Replace the starter's e-mail login with link-key access: one singleton event with a secret organizer key (`/o/<key>`) and a separate read-only TV key (`/tv/<key>`). Anything without a valid key gets a Polish no-access page with HTTP 404 and no data. Add Vitest (`npm test`) with unit tests for key helpers and integration tests for the access matrix against the local Supabase DB, and point CI at `main`.

## Current State Analysis

- Starter auth is wired through `src/middleware.ts` (Supabase `auth.getUser()` + `PROTECTED_ROUTES = ["/dashboard"]`), `src/lib/supabase.ts` (`@supabase/ssr` cookie client with anon `SUPABASE_KEY`), auth pages `src/pages/auth/*`, API `src/pages/api/auth/*`, components `src/components/auth/*`, `src/pages/dashboard.astro`, `src/components/{Welcome,Topbar}.astro`, `src/components/ui/LibBadge.astro`, `src/env.d.ts` (`locals.user`).
- `astro.config.mjs` env schema has `SUPABASE_URL` and `SUPABASE_KEY` (server secrets, optional). `src/lib/config-status.ts` drives a banner in `src/layouts/Layout.astro` (`lang="en"`, title "10x Astro Starter").
- No migrations (`supabase/migrations/` absent), no tests, no test runner. `scripts/smoke.mjs` smoke-tests the e-mail auth flow over HTTP.
- `.github/workflows/ci.yml` runs on `master`; jobs `ci` (lint, astro check, build) and `smoke` (local Supabase with gotrue, anon key from `supabase status`, preview + smoke).
- Local Supabase runs with only db/rest/kong. `npx supabase status -o env` prints **no keys** in this mode. The DB's `app.settings.jwt_secret` is the default local secret; a self-signed HS256 `service_role` JWT is accepted by PostgREST (200), the commonly quoted demo token is not (401). Kong answers requests with a missing/garbage apikey as the `anon` role (200 on `/rest/v1/`).
- Vite 8.3.0 (via Astro 7.3.2), `@types/node` 24 present transitively. Vitest 5.0.5 supports Vite 8 and Node 22/24.

## Desired End State

- `/` with no event: Polish page with a one-time "Utwórz wydarzenie" button (POST `/api/event`) → redirect to `/o/<organizerKey>`. With an event: only "Dostęp tylko przez link od organizatora".
- `/o/<organizerKey>`: organizer shell (Polish) showing the event name, the organizer link (bookmark it) and the TV link, plus placeholder sections for later slices.
- `/tv/<tvKey>`: read-only TV shell (no organizer key anywhere in the response).
- `/o/<anything else>`, `/tv/<anything else>`, `/g/<anything>`, `/api/o|tv|g/<bad>`, unknown routes, removed starter routes (`/dashboard`, `/auth/*`): HTTP 404, Polish no-access page (JSON `{ "error": "Brak dostępu" }` for `/api/*`), no event data.
- DB errors surface as 500 (Polish error page), never as "brak dostępu".
- `npm test` runs unit + integration tests; integration tests run only against a local DB (`127.0.0.1`/`localhost`) and skip otherwise.
- CI on `main`: `ci` job runs lint, astro check, `npm test`, build; `smoke` job runs local Supabase, `npm test` (with DB), build, preview and the access-matrix smoke.

Verify: `npm test`, `npm run lint`, `npx astro check`, `npm run build` green; `npm run smoke` passes against `npm run preview` on a fresh local DB.

### Key Discoveries:

- `src/middleware.ts:1-25` is the single choke point; the new guard replaces the auth logic there.
- `astro:env/server` is a virtual module (`src/lib/supabase.ts:3`) — anything Vitest imports must not import it.
- `eslint.config.js` `scriptsConfig` lints `scripts/**/*.mjs` with limited globals (`console`, `process`, `fetch`, `URLSearchParams`).
- `.husky/pre-commit` runs lint-staged (`eslint --fix` on ts/tsx/astro, prettier on json/css/md).
- `supabase/config.toml` `project_id` = `10x-astro-starter` determines container names — do not rename.

## What We're NOT Doing

- Guest links, guest table, guest-access toggle, key rotation/revocation (S-05). `/g/<key>` is recognised by the guard but always denied in F-01.
- Any data model beyond the `event` row (guests, rooms, tables, seating — later slices).
- Copy-to-clipboard buttons, QR codes, live refresh, offline cache.
- Browser/E2E tests (no Playwright overnight); generated Supabase types (`supabase gen types` would start extra containers) — types are hand-written.
- Deploy; changing the starter, DB or platform; renaming the Supabase `project_id`.
- Protecting first-time event creation with a setup secret (accepted risk: the organizer creates the event right after first start).

## Implementation Approach

Pure, client-injected helpers in `src/lib/access/` and `src/lib/event.ts` (no `astro:*` imports) carry all logic and are tested directly with Vitest against the local DB. A thin `src/lib/db.ts` reads `astro:env/server` and builds the service-role client; the middleware maps the access decision to a response (pass-through, 404 page rewrite, JSON 404) and stores the granted access in `locals.access`. Pages read `locals.access` and re-check the role. HTTP-level behaviour (status codes, body, headers) is verified by a rewritten dependency-free `scripts/smoke.mjs` against the production preview.

## Critical Implementation Details

- **DB error vs no row:** resolvers must throw on a supabase-js `error` and return `null` only when there is no matching row. Otherwise a misconfigured service key looks like "brak dostępu" everywhere.
- **No-oracle denial:** malformed keys, unknown well-formed keys and cross-role keys must produce byte-identical denial responses (same page, same 404), and the denial path must not query anything that reveals event existence.
- **Event creation must leak nothing when an event exists:** `POST /api/event` answers a bare `303 Location: /` with no key; a unique-violation (`23505`) from a concurrent insert is treated as "already exists", not a 500.
- **Rewrite status:** `context.rewrite("/404")` from middleware may not carry status 404 on the Cloudflare preview; wrap the rewritten response in a new `Response` with `status: 404`, and verify on the built preview (smoke), not only in dev.
- **Test isolation:** integration tests use the existing event if one exists; only an event the test itself created may be deleted (in `afterAll`). Never delete or modify a pre-existing event.

## Phase 1: Vitest and key helpers

### Overview

Add the test runner and the pure helpers for generating, validating and routing keys, fully unit-tested.

### Changes Required:

#### 1. Test runner

**File**: `package.json`, `vitest.config.ts`

**Intent**: Add `vitest` as a devDependency and `npm test` → `vitest run` (plus `test:watch` → `vitest`). Config loads `.env` into `process.env` for tests (Vite `loadEnv(mode, cwd, "")`), aliases `@` → `src`, includes `src/**/*.test.ts` and `tests/**/*.test.ts`, runs files sequentially (`fileParallelism: false`).

**Contract**: `npm test` exits 0 with all tests passing; no `astro:*` modules are resolved by Vitest.

#### 2. Key helpers

**File**: `src/lib/access/keys.ts` (+ `keys.test.ts`)

**Intent**: Generate unguessable access keys and validate their shape before any DB lookup.

**Contract**: `ACCESS_KEY_BYTES = 18`; `generateAccessKey(): string` — 18 bytes from `crypto.getRandomValues`, base64url without padding (24 chars, `[A-Za-z0-9_-]`), no `Buffer`; `isWellFormedAccessKey(value: unknown): value is string` — `/^[A-Za-z0-9_-]{24}$/`.

#### 3. Access path parsing

**File**: `src/lib/access/paths.ts` (+ `paths.test.ts`)

**Intent**: Map a URL pathname to the role it requires and the key it carries; reusable by later guest routes.

**Contract**: `type AccessRole = "organizer" | "tv" | "guest"`; `parseAccessPath(pathname: string): { role: AccessRole; key: string; isApi: boolean } | null` — matches `^/(api/)?(o|tv|g)/([^/]+)(/.*)?$` (`o`→organizer, `tv`→tv, `g`→guest); returns the raw key segment (validation is separate); `null` for every other path (`/`, `/o`, `/tvx/…`, `/_astro/…`). Also `organizerPath(key)`, `tvPath(key)` builders.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test` (keys: length 24, alphabet, ≥128 bits, 1000 generated keys unique, validator rejects wrong length/characters/non-strings; paths: organizer/tv/guest page + API variants, trailing segments, non-matching paths)
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 2: Remove starter e-mail auth; server-only DB access config

### Overview

Delete the starter's e-mail login example and switch configuration to a single server-only service-role client.

### Changes Required:

#### 1. Delete starter auth and examples

**Files (delete)**: `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/pages/api/auth/{signin,signup,signout}.ts`, `src/components/auth/*`, `src/pages/dashboard.astro`, `src/components/{Welcome,Topbar}.astro`, `src/components/ui/LibBadge.astro`, `public/template.png`, `src/lib/supabase.ts`; remove the `bg-cosmic` utility from `src/styles/global.css`.

**Intent**: No e-mail auth, protected-route or Supabase Auth usage remains. Keep shadcn `button`, Tailwind, `Layout`, `Banner`.

**Contract**: `grep -rE "auth\.getUser|PROTECTED_ROUTES|@supabase/ssr|/auth/" src` returns nothing.

#### 2. Env schema and DB client

**Files**: `astro.config.mjs`, `src/lib/db.ts`, `src/lib/supabase-client.ts`, `.env.example`, `src/lib/config-status.ts`, `src/env.d.ts`

**Intent**: Env schema = `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server, secret, optional); drop `SUPABASE_KEY`. A pure factory builds the service-role client; a thin getter reads `astro:env/server`.

**Contract**: `createServiceClient(url, serviceRoleKey): SupabaseClient<Database>` in `src/lib/supabase-client.ts` (no `astro:*`; `auth: { persistSession: false, autoRefreshToken: false }`); `getDb(): SupabaseClient<Database> | null` in `src/lib/db.ts` (null when env missing). `config-status.ts` banner message in Polish names the two variables. `App.Locals` = `{ access: Access | null }` (type defined in Phase 3; placeholder `null`-only type is acceptable until then). `.env.example` lists both variables.

#### 3. Middleware placeholder and home

**Files**: `src/middleware.ts`, `src/pages/index.astro`, `src/layouts/Layout.astro`

**Intent**: Middleware becomes a pass-through that sets `locals.access = null` (guard arrives in Phase 4). Home renders a minimal Polish page. Layout: `lang="pl"`, default title "Kolacja podwyżkowa", `<meta name="robots" content="noindex, nofollow">`.

#### 4. Dependencies, names, local env script

**Files**: `package.json`, `package-lock.json`, `wrangler.jsonc`, `scripts/local-env.mjs`, `eslint.config.js` (script globals only if needed)

**Intent**: `npm uninstall @supabase/ssr`; `name` → `kolacja-podwyzkowa` in `package.json` and `wrangler.jsonc`. `npm run env:local` → `node scripts/local-env.mjs`: takes `SERVICE_ROLE_KEY` from `npx supabase status -o env` when present, otherwise signs an HS256 `service_role` JWT with the default local secret (`SUPABASE_JWT_SECRET` override); verifies the key with one REST call (`GET /rest/v1/` with apikey + Bearer → 200) and exits non-zero on failure; upserts `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into `.env` and `.dev.vars`, keeping other lines.

### Success Criteria:

#### Automated Verification:

- No starter auth left: `grep -rE "auth\.getUser|PROTECTED_ROUTES|@supabase/ssr|/auth/|SUPABASE_KEY\b" src astro.config.mjs .env.example` prints nothing
- Local env written and key verified: `npm run env:local` exits 0
- Lint passes: `npm run lint`
- Type check passes: `npx astro sync && npx astro check`
- Build passes: `npm run build`
- Unit tests still pass: `npm test`

---

## Phase 3: Event table and access resolution

### Overview

Create the singleton `event` table and the DB-backed access logic, covered by integration tests against the local DB.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_event.sql`

**Intent**: Singleton event with two distinct, well-formed keys; browser roles cannot read it.

**Contract**: `public.event(id smallint primary key default 1 check (id = 1), name text not null default 'Kolacja podwyżkowa', organizer_key text not null unique, tv_key text not null unique, created_at timestamptz not null default now(), check (organizer_key <> tv_key), check (organizer_key ~ '^[A-Za-z0-9_-]{24}$'), check (tv_key ~ '^[A-Za-z0-9_-]{24}$'))`; `enable row level security`; no policies; `revoke all on public.event from anon, authenticated`.

#### 2. DB types

**File**: `src/db/database.types.ts`, `src/types.ts`

**Intent**: Hand-written `Database` type in the supabase-js shape (`public.Tables.event.{Row,Insert,Update,Relationships}`, empty `Views/Functions/Enums/CompositeTypes`) so queries are typed; shared entity types in `src/types.ts`.

**Contract**: `EventRow`; later slices extend `Database` with their tables.

#### 3. Event service

**File**: `src/lib/event.ts`

**Intent**: Read/create the singleton event with a client passed in.

**Contract**: `hasEvent(db): Promise<boolean>`; `createEvent(db): Promise<{ status: "created"; organizerKey: string; tvKey: string } | { status: "already-exists" }>` — generates two keys (regenerate if equal), inserts `id = 1`; Postgres `23505` → `already-exists`; any other error throws. Supabase errors always throw (`hasEvent` too).

#### 4. Access resolution

**File**: `src/lib/access/resolve.ts`, `src/lib/access/index.ts`

**Intent**: Turn (role, key) into a typed access object or a denial, and a pathname into a decision; the organizer access carries the TV key for display, the TV access carries no keys at all.

**Contract**:
- `type OrganizerAccess = { role: "organizer"; event: { id: number; name: string; organizerKey: string; tvKey: string } }`; `type TvAccess = { role: "tv"; event: { id: number; name: string } }`; `type Access = OrganizerAccess | TvAccess` (guest added in S-05).
- `resolveAccess(db, role, key): Promise<Access | null>` — malformed key → `null` without a query; organizer → match `organizer_key`; tv → match `tv_key` selecting only `id, name`; guest → `null` (no resolver yet); supabase `error` → throw.
- `decideAccess(db: SupabaseClient | null, pathname): Promise<{ kind: "public" } | { kind: "granted"; access: Access } | { kind: "denied"; status: 404; isApi: boolean }>` — non-access path → public; `db === null` → denied.
- `accessFor(locals, role)` — narrows `locals.access` to the given role or returns `null` (for pages and later API routes).

#### 5. Integration tests

**File**: `tests/integration/access.test.ts` (+ `tests/integration/helpers.ts`)

**Intent**: Prove the access matrix and data guarantees against the local DB.

**Contract**: `describe.skipIf` unless `SUPABASE_URL` host is `127.0.0.1`/`localhost` and `SUPABASE_SERVICE_ROLE_KEY` is set. `beforeAll`: use the existing event (read keys with the service client) or create one and remember to delete it in `afterAll`. Cases: organizer key on `/o/<k>` and `/api/o/<k>/x` granted as organizer with the TV key in the event; TV key on `/tv/<k>` granted as tv and the access object contains no organizer key; TV key on `/o/` and `/api/o/` denied 404; organizer key on `/tv/` denied; garbage and well-formed-unknown keys denied; any key on `/g/` denied; `/` public; `db = null` denied; second `createEvent` → `already-exists` with no key in the result; a client with a bad service key makes `resolveAccess` reject (throws, not `null`); anonymous `GET /rest/v1/event` (no Authorization) returns a denial or zero rows and never the organizer key.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase migration up`
- Unit + integration tests pass (integration not skipped): `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 4: Routes, pages and HTTP smoke

### Overview

Wire the guard into the middleware and add the Polish pages, the event-creation endpoint, the links script and the HTTP smoke test.

### Changes Required:

#### 1. Middleware guard

**File**: `src/middleware.ts`

**Intent**: Run `decideAccess(getDb(), pathname)` on every request. Public → `next()`. Granted → set `locals.access`, call `next()`, add `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow` to the response. Denied page → `context.rewrite("/404")` re-wrapped with status 404 (plus the same headers). Denied API → `Response.json({ error: "Brak dostępu" }, { status: 404 })`.

**Contract**: Identical denial response for malformed, unknown and cross-role keys.

#### 2. Pages

**Files**: `src/pages/404.astro`, `src/pages/500.astro`, `src/pages/index.astro`, `src/pages/o/[key].astro`, `src/pages/tv/[key].astro`

**Intent**: Polish UI.
- `404`: "Brak dostępu" + "Ta strona jest dostępna tylko przez link od organizatora." No data.
- `500`: "Coś poszło nie tak. Spróbuj odświeżyć stronę za chwilę." No details.
- `/`: DB not configured → short Polish note; no event → explanation + form POST `/api/event` with button "Utwórz wydarzenie"; event exists → only "Dostęp tylko przez link od organizatora."
- `/o/[key]`: `accessFor(Astro.locals, "organizer")` else rewrite 404; event name; "Twoje linki": organizer link (absolute URL, "dodaj do zakładek, nie udostępniaj") and TV link ("otwórz na urządzeniu przy telewizorze"); placeholder cards "Goście i grupy", "Sale i stoliki", "Rozsadzenie", "Linki gości i karteczki", "Pytania i tematy AI", "Strzały i ranking" marked "Wkrótce".
- `/tv/[key]`: `accessFor(…, "tv")` else 404; full-screen dark shell with the event name and "Rozsadzenie pojawi się tutaj po publikacji."

#### 3. Event creation endpoint

**File**: `src/pages/api/event.ts`

**Intent**: One-time creation from the home page form.

**Contract**: `export const prerender = false`; `POST`: `getDb()` null → 503 JSON; `createEvent` created → `303 Location: /o/<organizerKey>`; already-exists → bare `303 Location: /` (no body, no key).

#### 4. Scripts

**Files**: `scripts/links.mjs`, `scripts/smoke.mjs`, `package.json`

**Intent**: `npm run links` → `node --env-file-if-exists=.env scripts/links.mjs`: reads the event via REST with the service key and prints the organizer and TV URLs (`BASE_URL`, default `http://localhost:4321`), or a Polish note when no event exists. Rewrite `scripts/smoke.mjs` (dependency-free) for the access matrix on a fresh DB: `/` 200 with the create button; POST `/api/event` → 303 to `/o/<key>`; `/o/<orgKey>` 200 with no-store + no-referrer headers, TV key extracted from the page; `/tv/<tvKey>` 200 and body without the organizer key; second POST → 303 `/` with no key; `/` 200 with the no-access message; garbage, well-formed-unknown and cross-role keys on `/o/` and `/tv/`, `/g/<orgKey>`, `/api/o/<tvKey>/x`, `/dashboard`, `/auth/signin` → 404 whose body has the Polish no-access text and contains neither the event name nor any key.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Tests pass: `npm test`
- HTTP smoke passes against the production preview on an empty local event table: `npm run preview` + `BASE_URL=http://localhost:4321 npm run smoke` (server stopped afterwards, smoke-created event removed)

#### Manual Verification:

- Open `/` in a browser on a fresh DB, create the event, bookmark the organizer link, open the TV link on a second device; pages look right in Polish on phone and TV

---

## Phase 5: CI on main and project docs

### Overview

Point CI at `main` with tests, and update the project docs.

### Changes Required:

#### 1. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Triggers `push`/`pull_request` on `main`. Job `ci`: `npm ci`, `astro sync`, lint, astro check, `npm test` (DB tests skip without `.env`), build (secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Job `smoke`: `supabase/setup-cli@v1` pinned to `2.117.0`; `supabase start -x gotrue,realtime,storage-api,imgproxy,studio,postgres-meta,mailpit,edge-runtime,logflare,vector,supavisor`; `npm run env:local`; `npm test`; build; preview; `npm run smoke`; `supabase stop --no-backup` always.

#### 2. Docs and cleanup

**Files**: `README.md`, `README.md.scaffold` (delete), `CLAUDE.md`

**Intent**: README in Polish, short: what the app is, stack, how to run locally (`npm install`, `npx supabase start -x …`, `npx supabase migration up`, `npm run env:local`, `npm run dev`, create the event on `/`, `npm run links`), tests and scripts. CLAUDE.md: replace "Auth flow" with the access model (helpers, env vars, DB access rule, RLS rule), update commands, env and CI sections, and add "## Project rules" (commit format `[<model>] <message>` without a Co-Authored-By trailer; source-of-truth docs in `context/foundation/`; overnight brief pointer; UI language Polish).

### Success Criteria:

#### Automated Verification:

- CI targets main and runs tests: `grep -E "branches: \[main\]" .github/workflows/ci.yml` (2 matches) and `grep -c "npm test" .github/workflows/ci.yml` ≥ 2
- Workflow YAML parses: `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml")'` exits 0
- `README.md.scaffold` gone: `test ! -e README.md.scaffold`
- Formatting passes for docs: `npx prettier --check README.md CLAUDE.md .github/workflows/ci.yml`
- Full gate: `npm test && npm run lint && npx astro check && npm run build`

#### Manual Verification:

- First CI run on GitHub after the user pushes to `main` is green (both jobs)

---

## Testing Strategy

### Unit Tests:

- Key generation: length, alphabet, entropy (18 bytes), uniqueness over 1000 keys; validator edge cases (23/25 chars, `+`/`/`/`=`, non-string).
- Path parsing: every role prefix, API variants, nested segments, non-matching paths.

### Integration Tests:

- Access matrix on the local DB through `decideAccess`/`resolveAccess` (granted, cross-role denied, garbage denied, guest denied, null DB denied).
- Data guarantees: singleton (`already-exists` with no key), TV access has no organizer key, bad service key throws, anonymous REST cannot read the event.

### Manual Testing Steps:

1. On a fresh DB open `/`, click "Utwórz wydarzenie", land on `/o/<key>`, see both links.
2. Reload `/` → only the no-access message.
3. Open the TV link → TV shell; change one character of either key → no-access page.

## Performance Considerations

One indexed equality lookup per keyed request (unique index on each key column). Malformed keys short-circuit without a query.

## Migration Notes

First migration in the repo. Locally: `npx supabase migration up` (or `npx supabase db reset`). In CI `supabase start` applies it.

## References

- PRD Access Control and NFR-009: `context/foundation/prd.md`
- Roadmap F-01: `context/foundation/roadmap.md`
- Binding run rules: `context/foundation/overnight-brief.md`
- Starter middleware being replaced: `src/middleware.ts:1-25`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest and key helpers

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — aa66b34
- [x] 1.2 Lint passes: `npm run lint` — aa66b34
- [x] 1.3 Type check passes: `npx astro check` — aa66b34

### Phase 2: Remove starter e-mail auth; server-only DB access config

#### Automated

- [x] 2.1 No starter auth left (grep prints nothing) — 72ac896
- [x] 2.2 Local env written and key verified: `npm run env:local` — 72ac896
- [x] 2.3 Lint passes: `npm run lint` — 72ac896
- [x] 2.4 Type check passes: `npx astro sync && npx astro check` — 72ac896
- [x] 2.5 Build passes: `npm run build` — 72ac896
- [x] 2.6 Unit tests still pass: `npm test` — 72ac896

### Phase 3: Event table and access resolution

#### Automated

- [x] 3.1 Migration applies cleanly: `npx supabase migration up` — fbc6c2e
- [x] 3.2 Unit + integration tests pass (integration not skipped): `npm test` — fbc6c2e
- [x] 3.3 Lint passes: `npm run lint` — fbc6c2e
- [x] 3.4 Type check passes: `npx astro check` — fbc6c2e

### Phase 4: Routes, pages and HTTP smoke

#### Automated

- [x] 4.1 Lint passes: `npm run lint` — f740174
- [x] 4.2 Type check passes: `npx astro check` — f740174
- [x] 4.3 Build passes: `npm run build` — f740174
- [x] 4.4 Tests pass: `npm test` — f740174
- [x] 4.5 HTTP smoke passes against the production preview on an empty event table — f740174

#### Manual

- [ ] 4.6 Create the event on `/` in a browser, bookmark the organizer link, open the TV link on a second device; Polish pages look right on phone and TV

### Phase 5: CI on main and project docs

#### Automated

- [x] 5.1 CI targets main and runs tests (grep) — a8e0b2e
- [x] 5.2 Workflow YAML parses (`ruby -ryaml`) — a8e0b2e
- [x] 5.3 `README.md.scaffold` gone — a8e0b2e
- [x] 5.4 Formatting passes for docs: `npx prettier --check README.md CLAUDE.md .github/workflows/ci.yml` — a8e0b2e
- [x] 5.5 Full gate: `npm test && npm run lint && npx astro check && npm run build` — a8e0b2e

#### Manual

- [ ] 5.6 First CI run on GitHub after the user pushes to `main` is green (both jobs)
