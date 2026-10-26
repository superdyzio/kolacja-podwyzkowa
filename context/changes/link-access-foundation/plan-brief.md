# Link-key access foundation — Plan Brief

> Full plan: `context/changes/link-access-foundation/plan.md`

## What & Why

Roadmap F-01 (NFR-009, PRD Access Control). The app has no accounts: every view opens only through a link with an unguessable key. This change builds that access model once, up front, so every later slice (guests, plan, seating, TV, guesses) sits behind the same guard and the ranking can never leak. It also removes the starter's e-mail login and adds the test runner and CI that later slices rely on.

## Starting Point

A fresh 10x-astro-starter: Supabase e-mail auth in the middleware (`PROTECTED_ROUTES`), auth pages/APIs/components, a dashboard example, no migrations, no tests, CI on `master`. Local Supabase runs with only db/rest/kong, and `supabase status` prints no API keys in that mode.

## Desired End State

On a fresh DB `/` offers "Utwórz wydarzenie". It creates the single event and redirects to `/o/<organizer key>`, which shows the organizer link (to bookmark) and the TV link. `/tv/<tv key>` shows a read-only TV shell. Any other key, a cross-role key, `/g/…`, unknown and removed routes get a Polish "Brak dostępu" page with HTTP 404 and no data. `npm test` runs unit and integration tests. CI runs on `main`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Event creation | One-time button on `/`, then redirect to `/o/<key>` | Simplest bootstrap with no CLI; `/` stops offering creation once an event exists. |
| Key format | 18 random bytes (144 bit), base64url, 24 chars, stored in plain text | ≥128 bits per NFR-009, URL/QR-friendly; the organizer must be able to redisplay links. |
| Enforcement | Central guard in middleware for `/o/ /tv/ /g/` + `/api/…`; pages re-check the role | Default-deny for every future route, with no per-page boilerplate. |
| Denial | Same Polish 404 page for malformed, unknown and cross-role keys; JSON 404 for API | No oracle; matches the PRD's "no data". |
| DB errors | Throw → 500 page, never "brak dostępu" | A wrong service key must not look like a missing link. |
| DB access | Service-role supabase-js client on the server only; RLS on, no policies, privileges revoked from anon/authenticated | The browser never reads the DB (brief's shared decision). |
| Lost organizer link | `npm run links` prints links from the DB | Recovery without adding an attack surface to the app. |
| Tests | Vitest; pure client-injected helpers; integration only against a local DB host; HTTP checked by `npm run smoke` on the preview | Vitest can't load `astro:*` modules; avoids touching non-local data. |
| Local keys | `npm run env:local` takes the key from status or signs the local service_role JWT, then verifies it | `supabase status` prints no keys with gotrue disabled. |

## Scope

**In scope:** event table + migration, key helpers, access resolution and guard, Polish no-access/500/home/organizer/TV pages, creation endpoint, links + env + smoke scripts, Vitest, CI on main, removal of starter auth, README/CLAUDE.md updates.

**Out of scope:** guest links and the guest toggle (S-05), any other data model, copy/QR UI, live refresh, browser E2E, deploy, a setup secret for first creation.

## Architecture / Approach

`src/lib/access/{keys,paths,resolve}.ts` and `src/lib/event.ts` are pure: they take a supabase client and never import `astro:*`. `src/lib/db.ts` is the only reader of `astro:env/server` and returns the service-role client. The middleware calls `decideAccess(getDb(), pathname)` and returns one of three things: pass-through, a 404 rewrite or a JSON 404. On a granted request it sets `locals.access` (`OrganizerAccess` carries both keys; `TvAccess` carries none). Pages and later API routes narrow it with `accessFor(locals, role)`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Vitest and key helpers | `npm test`, key generation/validation, path parsing (unit-tested) | Vitest/Vite 8 compatibility |
| 2. Remove starter auth; DB config | Clean app shell, service-role env + client, `env:local` | Missing a starter reference |
| 3. Event table and access resolution | Migration, event service, resolver, integration tests | Keeping DB errors distinct from denial |
| 4. Routes, pages, HTTP smoke | Guard in middleware, Polish pages, creation API, links + smoke | 404 status through rewrite on the Cloudflare preview |
| 5. CI on main and docs | CI with tests on `main`, README, CLAUDE.md project rules | CI can't be run overnight (no push) |

**Prerequisites:** local Supabase running (db/rest/kong).
**Estimated effort:** one session, 5 small phases.

## Open Risks & Assumptions

- Anyone who reaches a freshly deployed instance before the organizer could create the event. Accepted: the organizer creates it right after the first start.
- Hand-written DB types must be extended by each later slice.
- CI is verified only when the user pushes to `main`.

## Success Criteria (Summary)

- Only the organizer key opens `/o/…` and only the TV key opens `/tv/…`. Everything else gets a 404 no-access page with no data, verified by integration tests and the HTTP smoke.
- `npm test`, `npm run lint`, `npx astro check` and `npm run build` are green, and CI is configured for `main`.
