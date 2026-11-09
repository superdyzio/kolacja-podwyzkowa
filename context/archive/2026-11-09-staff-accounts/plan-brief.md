# Staff accounts and sessions (F-03) — Plan Brief

> Full plan: `context/changes/staff-accounts/plan.md`

## What & Why

PRD v2 adds restaurant staff and a platform admin who work in a panel, not through link keys. F-03 is the enabler: an invited person sets a password from a one-time link, logs in with e-mail + password for 30 days, logs out, changes the password (ending other sessions), and mass guessing is refused (FR-022, US-05, NFR-013, NFR-020, NFR-022). S-10..S-13 build their panels on it.

## Starting Point

Only link keys exist (`/o/ /tv/ /g/ /r/`, `src/middleware.ts`); no accounts, sessions or auth cookies. F-02 added `restaurant` → many `event`; scripts create them over PostgREST (`scripts/lib/platform.mjs`).

## Desired End State

`npm run platform:admin -- <email>` prints a one-time `/haslo/<token>` link; the person sets a password and lands on `/panel` (name, e-mail, admin marker, restaurants with roles, change password, log out / log out everywhere). `/panel/**` without a session → `/logowanie`; `/api/panel/**` → one fixed 401; foreign or unknown restaurant/event ids → the same 404 through one central guard. Smoke and demo prove it; key links work as before.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Data model | `staff_account` (+ `is_platform_admin`), `restaurant_member` (owner/manager/waiter), `staff_session`, `staff_token` (invite/reset), `login_attempt` | Fits S-10..S-13 directly; per-event waiter access (S-21) can be a separate table later |
| Account creation time | At invite (password null until the link is used) | Later slices only add who may invite; acceptance has no membership logic |
| Secrets | 32-byte base64url tokens, DB stores SHA-256 only; scrypt N=2^15 r=8 p=1 (`node:crypto`, params in the hash string) | No new dependency; stolen DB rows give no working token or password |
| Session | Fixed 30 days, cookie `kp-session` HttpOnly + SameSite=Lax + Secure on https; password change keeps this device, ends others | Simplest reading of NFR-022 / FR-022 |
| Throttle | Per typed e-mail (hashed): 10 failures / 15 min, pessimistic count in one DB function; refused before the password check | Same answer for existing and unknown e-mails; per-IP not trustworthy behind the Function URL tonight |
| Routes | `/panel/**` guarded; `/logowanie`, `/haslo/<token>`, `/api/auth/*` public; `/api/panel/**` guarded | No exemption list inside the guarded prefix; avoids smoke's `/dashboard`, `/auth/signin` denials |
| UI | Plain HTML forms → API routes answering 303 with `?blad=` codes; no islands | Minimal enabler, works without client JS, the e-mail never goes into a URL |
| CSRF | Middleware refuses every mutation under `/api/panel/**` and `/api/auth/**` without a same-origin `Origin` (also JSON, also missing) | Astro's own check covers only forms and lets a missing Origin through |
| Referrer policy of auth areas | `same-origin` (not the key routes' `no-referrer`) — plan review F1 | A form POST from a `no-referrer` page sends `Origin: null`, which Astro and our check refuse |
| Central guard | `panelApi`, `panelRestaurantApi(locals, id, roles)`, `panelEventApi(locals, id, roles)`; no admin bypass until S-13 | One place for IDOR checks; admin support access must be logged (S-13) |
| First admin | `npm run platform:admin -- <email> [--name] [--remote]`, prints the host first, non-local DB needs `--remote` | Usable on the platform DB, guarded against accidents |
| Hashing in scripts | Duplicate one-liner in `platform.mjs`, pinned by a parity test | Smoke/demo stay dependency-free plain Node |

## Scope

**In scope:** migration + types; `src/lib/auth/` (pure + service); middleware areas; `src/lib/panel-api.ts`; `/api/auth/{login,logout,password-link}`, `/api/panel/{password,me,restaurants/[id],events/[id]}`; pages `/logowanie`, `/haslo/[token]`, `/panel`; home-page login link; `platform:admin` CLI; smoke section 25; demo owner; CLAUDE.md, tech-stack.md, README.

**Out of scope:** restaurant creation and owner invites in the UI (S-10), team management and reset links from the panel (S-12), admin support access (S-13), waiter per-event access (S-21), e-mail, 2FA, per-IP throttle, `next=` redirects, islands.

## Architecture / Approach

Middleware: locale → `classifyAuthPath` → Origin check for mutations → `getSession(kp-session)` → 303/401 or `locals.staff`. Routes use `panelApi`/`panelRestaurantApi`/`panelEventApi`. Atomic DB functions: `issue_staff_token`, `redeem_staff_token`, `change_staff_password`, `begin_login_attempt`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema and auth library | Migration, types, `src/lib/auth/`, unit + integration tests | Throttle race / timing leaks |
| 2. Guard, routes, pages, CLI | Middleware areas, central guard, 7 routes, 3 pages, `platform:admin` | Cookie headers through the rebuilt Response; Origin check gaps |
| 3. Smoke and demo | Section 25 + demo owner | Repeated runs inheriting throttle state |
| 4. Docs | CLAUDE.md, tech-stack.md, README | — |

**Prerequisites:** F-02 done; local Supabase running, `.env` → 127.0.0.1; servers with `AI_PROVIDER=mock`.
**Estimated effort:** one night session, Phase 2 the largest.

## Open Risks & Assumptions

- Password spraying (one common password across many e-mails) is limited only by the 10-character minimum; a per-IP bucket needs a trusted client address (later).
- One attacker can lock a known e-mail for 15 minutes (accepted DoS trade-off of per-account throttling).
- Deploy: the migration goes to the new platform DB before the code (user's step), never to the old dinner project.

## Success Criteria (Summary)

- An invited person sets a password, logs in for 30 days, logs out and changes the password with the other sessions ended.
- Guessing is refused after 10 failures per e-mail; a few typos never block; nothing reveals whether an e-mail exists.
- Foreign, unknown and role-forbidden ids get the identical denial; key links are unaffected; all checks green.
