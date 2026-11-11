# Review 6 — integrity of the unattended run (tests, smoke, scripts, deploy tooling, CLAUDE.md honesty)

Target: PR #4, `overnight/m2` at `163803b` against `origin/main`. Read-only review.

Question answered: do the green checks prove what they claim, and can any script or tool hurt production?
Short answer: the checks are honest (no vacuous assertions, no swallowed failures, no skipped tests, no new
dependencies, every test-data script refuses a hosted database), with ONE real defect — the deploy tool prints a
post-deploy instruction that would wipe every restaurant's events on the hosted database.

## Findings

### 1. [high] `npm run deploy:aws` prints stale next steps that end in `delete from public.event;` on the hosted DB

- Location: `scripts/deploy-aws.mjs:196-200` (at 163803b; the file is byte-identical to `origin/main` — the PR made
  the text wrong without touching it).
- Failure scenario: the operator deploys (the one path CLAUDE.md reserves for the user) and follows the script's own
  printed checklist:
  1. `BASE_URL=<function url> npm run smoke` — since multi-tenant-events the smoke refuses a non-local `SUPABASE_URL`
     (`scripts/lib/platform.mjs:32`); with the usual local `.env` it would instead create its restaurants, events and
     staff accounts in the LOCAL database and fire every request at production, where none of those keys or sessions
     exist, so every section fails — noise, not harm.
  2. `Wyczyść dane smoke w Supabase (SQL Editor): delete from public.event;` — in M-2 `public.event` is the
     multi-tenant table of EVERY restaurant. Running the printed statement deletes every event of the platform and,
     through the cascades the PR added, every guest, link key, snapshot, order line, drink, question, quiz, logo and
     per-event waiter (the owner's `support_log` survives: it has no FK to `event`). The v1 meaning of the line („the smoke's rows in a fresh DB")
     no longer exists; the README was updated for this (`README.md:264` at 163803b: the smoke runs only locally,
     clean a hand-made test event by hand) but the script's output was not.
  4. `Otwórz <url>/, „Utwórz wydarzenie"` — gone: smoke section 1 asserts the home page no longer offers it
     (`scripts/smoke.mjs:118-129`).
- Evidence (`scripts/deploy-aws.mjs:196-200`):
  ```
  Dalej (README, „Wdrożenie na AWS"):
    1. Pierwsze wdrożenie na AI_PROVIDER=mock i pustej bazie: BASE_URL=${base} npm run smoke
    2. Wyczyść dane smoke w Supabase (SQL Editor): delete from public.event;
    3. AI: ...
    4. Otwórz ${base}/, „Utwórz wydarzenie", link organizatora do zakładek.
  ```
  vs `scripts/lib/platform.mjs:32-35` (`requireLocal` refusal) and `README.md:264-267` (hand check, `event:create`,
  `platform:admin --remote`).
- Fix sketch: drop steps 1, 2 and 4 from the printed text and point at README „Pierwsze uruchomienie" (hand check with
  `npm run event:create`, delete that one test event by id, `npm run platform:admin -- <email> --remote`). Never print
  an unscoped `delete` for the hosted database.
- Confidence: high (that the text is printed and what the statement does); the damage needs a human to paste it.

### 2. [low] `purge_event_guest_data` re-checks the term with the CALLER's clock, so `npm run retention --remote` trusts the operator's machine

- Location: `supabase/migrations/20261111050000_privacy_retention.sql:100-142` (`p_now` used for both checks),
  `scripts/retention.mjs:59-60` (`now = new Date()` of the operator's machine), `scripts/lib/platform.mjs:313-333`.
- Failure scenario: a laptop with a wrong date (or an explicit future clock) running
  `npm run retention -- --remote` lists and purges events that are still inside their term; the DB does not compare
  against `now()`. The app's callers pass Lambda's UTC clock, so the guards and the lazy sweep are unaffected; the
  smoke and the integration tests rely on the parameter as a seam.
- Evidence: `select p_event_date + p_retention_days < (p_now at time zone 'Europe/Warsaw')::date;` (line 65) — only
  `p_now`, never `now()`; CLAUDE.md says „the DB re-checks the term" without saying it is the caller's clock.
- Fix sketch: in `retention.mjs` refuse (or warn) when `--remote` and no `--dry-run`, or make the SQL use
  `least(p_now, now())` for the purge decision (keeps the seam for moving dates, never purges early).
- Confidence: medium (the behaviour is certain; whether it counts as a defect is a judgement call).

### 3. [low] `load:local` ignores the result of its own cleanup DELETEs

- Location: `scripts/load-local.mjs:264-271`.
- Failure scenario: a failed `DELETE` (FK, network) leaves the 150-guest restaurant/event in the local database while
  the script prints „Usunięto N wydarzenie(a) skryptu." Local-only (`readDbEnv({ requireLocal: true })`, line 136, and
  the `BASE_URL` host check, line 133), so no production impact.
- Fix sketch: check `response.ok` of both fetches and print the ids left behind.
- Confidence: high.

No other defects found on this angle. Specifically NOT reported (looked at, not defects): the 82 `.every(...)` checks
in the smoke (each is paired with a `.some`, a length equality or a fixed-list equality on the same array, so none is
vacuous on an empty array); the 27 un-assigned `await request(...)` lines (setup steps whose effect the next `check`
asserts); `expireEventWaiter` / `setEventDate` in `platform.mjs` not guarding locality themselves (only the smoke
imports them, after `readDbEnv({ requireLocal: true })`); the stale comment in `vitest.config.ts` („share the singleton
event row") — `fileParallelism: false` is still needed (the `retention_sweep` singleton, the login throttle).

## Checked and fine

Smoke (`scripts/smoke.mjs`, 11 499 lines, 634 `check(...)` calls, sections 1–45):
- `check(name, ok, detail)` prints PASS/FAIL from the boolean and counts failures; `finish()` exits 1 on any failure —
  no PASS before an assertion, no `process.exit(0)` shortcut. Every `try/catch` (lines 142, 164, 4354, 4384, 4828,
  5237, 9053, 10099, 10190, 10253, 10280) either registers a FAIL (`check(…, false)`, with `finish()` where the run
  cannot go on) or stores the error in a variable that a later `check` asserts empty (`expireError37`, `seam41`,
  `cliError41`).
- Section 3 creates its rows only after `readDbEnv({ requireLocal: true })`; `today` is taken from the server's own
  answer (`listA.data.today`, line 5257), not from the client's clock.
- Denials are compared by body: `noAccessJson` = status 404 AND body `{"error":"Brak dostępu"}` (line 1199), which
  equals `denied()` (`panel-api.ts:70-72`) and the middleware's `noAccessMessages(locale).title`; a missing route would
  answer Astro's HTML 404 and fail the check.
- Section 23d reads 11 B endpoints before and after A's attempts and compares bodies verbatim (lines 3781-3800, 3970).
- Section 29 asserts every support-mode write is the identical 404 AND that events, card, team and log bodies are
  byte-identical before/after, AND that the log holds exactly `1 + expectedAccess.length` rows in order (lines
  6350-6422). Section 36 proves „no log row" for the admin on the floor by `logAfter36.length === logBefore36 + 2`
  (enter + exit only, line 8544); section 41 by `logAfter41.id === logBefore41.id` around the refused export (10169).
- Section 38 pins the guest state's and tablet's key sets exactly (`fieldsOf38`, lines 9206-9222); section 40 pins the
  RSVP option fields and scans the body for `price|id|menuItemId|guestId` and other guests' names.
- Sections 44 and 45 exist in the smoke and in CLAUDE.md's description at 163803b.

Tests:
- No `it.skip` / `describe.skip` / `.only` / `todo` anywhere in `tests/**` or `src/**/*.test.ts`. The only
  `skipIf`s are `!hasLocalDb` (41 DB suites; `hasLocalDb` = `SUPABASE_URL` host is 127.0.0.1/localhost) and
  `!process.env.DRAW_BENCH` on the benchmark describe only (the clock-free describe in the same file always runs).
- Every test file has at least as many `expect(` as `it(`; the privacy guard test scans real sources (`src/lib/ai-topics`,
  `src/lib/venue-ai`) and asserts >5 files found; `match.test.ts` walks `src/pages/api/o/[key]/**` and asserts >30
  routes; `seed.test.ts` parses `question-seed.md`; `platform-tokens.test.ts` compares the script's hash/token/e-mail
  helpers with `src/lib/auth`; `tests/sw/organizer-sw.test.ts` runs the shipped `public/organizer-sw.js` in `node:vm`;
  `floor.test.ts` asserts `FLOOR_ROUTES ⊂ CLIENT_ROUTE_PATTERNS`; `event-waiters.test.ts` has the two-tap race.
- Cleanup deletes are all filtered by own ids/restaurant (`helpers.ts`, `staff-accounts.test.ts:88`,
  `venue-templates.test.ts:125-131`, `privacy-retention.test.ts:104-116`, `admin-support.test.ts`); the retention
  test uses a fixed `NOW`, never `sweepGuestRetention`, and restores `retention_sweep.last_run_at` in a `finally`.
- `tests/setup/no-ai-network.ts` rejects every fetch to `api.anthropic.com`; `vitest.config.ts` loads it as
  `setupFiles` and keeps `fileParallelism: false`.

Scripts and deploy tooling:
- `readDbEnv({ requireLocal: true })` in `smoke.mjs:143`, `demo.mjs:345`, `load-local.mjs:136` (+ `BASE_URL` host
  check, 133); `retention.mjs:56` and `platform-admin.mjs:55` refuse a non-local DB without `--remote` (and `fail()`
  exits synchronously before any write); `create-event.mjs` and `links.mjs` work on `.env`'s DB as CLAUDE.md says
  (insert/read only). `load-local` deletes only its own event and restaurant ids; the demo deletes only through the
  demo owner's own panel session (events/templates/menu of the one demo restaurant); nothing in `scripts/` can reach
  event 1 or any row it did not create, and nothing deletes without an id or restaurant filter.
- `create-event.mjs` under `--experimental-strip-types`: `seed.ts` has only `import type` (erased) and no
  non-erasable syntax.
- `package-lambda.mjs` keeps the checks CLAUDE.md lists: env files (`^\.env(\..*)?$|^\.dev\.vars$`), secret values
  from `.env`/`.env.aws`/`.dev.vars` in any packaged file, ELF e_machine ≠ aarch64, zip ≥ 50 MB, unpacked server
  load + HTTP smoke (`run.sh`, favicon 200, home contains „Stolik"). `aws-deploy.mjs` and `deploy-aws.mjs` never issue
  a delete to AWS (only the temp env file is removed).
- `package.json`: no new dependencies; only new scripts (`event:create`, `platform:admin`, `retention`, `load:local`,
  `--env-file-if-exists=.env` on the smoke). CI (`ci.yml`): the smoke job starts a fresh local Supabase, writes
  `.env` with `env:local`, runs tests + build + preview + smoke; no AWS credentials, no deploy job.
- Diff scan: 5 `eslint-disable-next-line` (3 `no-console` for logged best-effort failures, 1 benchmark output,
  1 `no-unnecessary-condition` in a test's `afterAll`), 2 `react-hooks/exhaustive-deps`; `as unknown as APIContext`
  in the three dispatchers (the synthesized context — no single-line destructuring of `url`, `cookies` or
  `redirect` in any organizer route, and smoke sections 30–43 exercise the dispatcher across those routes);
  `as unknown as` DTO casts in branding; no `@ts-ignore`, `@ts-expect-error`,
  `as any`, `TODO` or `FIXME` added.

CLAUDE.md claims spot-checked against code at 163803b (all hold):
1. Limits: `MAX_GUESTS` 150, `MAX_TABLES` 60, `MIN/MAX_SEATS` 2/30, `MAX_ROOMS` 10, `MAX_ORDER_ITEMS` 600,
   `MAX_DRINK_ITEMS` 200, `MAX_EVENT_WAITERS` 30, `SUPPORT_MINUTES` 60, `SUPPORT_LOG_LIMIT` 100,
   `RETENTION_SWEEP_LIMIT` 25, `RETENTION_SWEEP_INTERVAL_MS` 10 min, `DEFAULT_GUEST_RETENTION_DAYS` 30,
   `SESSION_DAYS` 30, `INVITE_TTL_DAYS` 7, `RESET_TTL_HOURS` 24, `LOGIN_FAILURE_LIMIT` 10 / 15 min,
   `MAX_QUIZ_QUESTIONS` 50, `TV_RESULTS_PLACES` 3, `TV_RESULTS_LIMIT` 10, `MAX_RSVP_OPTIONS` 12, `MAX_LOGO_BYTES`
   512 KiB, `MAX_MENU_ITEMS` 300, `MAX_QUESTIONS` 500, `MAX_GUEST_TOPICS` 25, `MAX_EVENT_TOPICS` 1000,
   `AI_PROVIDER_TIMEOUT_MS` 9 s, `MAX_PLAN_BYTES` 4 MiB, `MAP_SEARCH_LIMIT` 8, `MAX_DIET_NOTE_LENGTH` 120,
   `MAX_IMPORT_RECORDS` 1000, `MAX_IMPORT_TEXT_LENGTH` 200 000, `TV_ROOM_DWELL_MS` 12 s, `DEFAULT_DRAW_BUDGET_MS` 1200.
2. „`findFloorEvent` has NO support branch" — `panel-api.ts:272-304` goes through `findEventMembership` only.
3. Export „members only, NO support branch" — `export.ts` uses `panelMemberEventApi` → `findMemberEvent`
   (`panel-api.ts:194-213`), no `supportAccess` call.
4. „Every mutation under `/api/panel/` and `/api/auth/` without the page's own `Origin` → 403 before any DB read" —
   `middleware.ts:82-84` runs before `getSession`; `isSameOrigin` is strict equality (`origin.ts:13-15`); the waiter
   area does the same (`middleware.ts:122-131`).
5. `AUTH_AREA_HEADERS` = no-store, `Referrer-Policy: same-origin`, `X-Robots-Tag`, `X-Frame-Options: DENY`
   (`paths.ts:41-46`); key areas get `no-referrer` (`middleware.ts:59-63`). Session cookie
   `Path=/; Max-Age; HttpOnly; SameSite=Lax[; Secure]` (`cookie.ts:14`).
6. Module gate BEFORE the lead rule (`middleware.ts:215-238`); the dispatcher repeats both gates and refuses key
   routes in support mode (`klient/[...path].ts`).
7. `is_template = false` in all four `resolveAccess` branches (`resolve.ts:111,138,154,181`), `findEventMembership`
   (`auth/service.ts`), `findFloorEvent`, `findWaiterFloorEvent`, DB `record_support_access` and
   `platform_restaurant_list` (`venue_templates.sql:53,112`), `expired_guest_data_events` / `purge_event_guest_data`
   (`privacy_retention.sql:119,137,198`), `scripts/lib/platform.mjs listEvents`.
8. Retention: `guest_data_expired` = `event_date + N < Warsaw day of p_now` (sql:65); `enforceGuestRetention` makes no
   RPC inside the term and is called by `resolveAccess` (all roles) and `findEventMembership`; the support branch of
   `findPanelEvent` purges before the read; the lazy sweep runs only on `GET /panel/**` with a session, throttled in
   process and by `claim_retention_sweep`, errors logged and swallowed on purpose.
9. The waiter floor guard re-reads event, template flag, archive, restaurant `disabled_at`, `isFloorOpen` and
   `expires_at` on every request (`waiter-api.ts`).
10. „The smoke … refuses any other `SUPABASE_URL`", „`load:local` refuses a non-local `BASE_URL` or `SUPABASE_URL`",
    „`retention`/`platform:admin` need `--remote`" — all as described (above).
11. Guest denial after a purge is the identical denial: `resolveAccess` returns null when the purge ran
    (`resolve.ts:185-188`) and the purge switches `guest_access_enabled` off (`privacy_retention.sql:164`).
12. `tests/integration/isolation.test.ts` exists (489 lines) and exercises two restaurants' events through the
    services and DB functions as claimed.
