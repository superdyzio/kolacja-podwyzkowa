# Demo restaurant (S-29) Implementation Plan

## Overview

FR-042 (US-05..US-09): the platform administrator prepares a demo restaurant — owner account, team, venue template, menu and a sample corporate party with fictional guests, seating and orders — so PRD v2's flow 1–7 can be walked through live. `npm run demo` already builds all of that, but as a NEW „Restauracja demo” on every run, with per-restaurant e-mails, the venue drawn through the client's API and saved as a template afterwards, and modules set straight in the database. This slice turns it into ONE stable, re-runnable demo restaurant prepared through the app's own API as the platform administrator (flow 1–4 in the order of the PRD: restaurant → team → template → events from the template), makes the generated plan and the sample menu swappable for the restaurant's real ones (files or the app), and adds the written demo script (scenariusz pokazu) in Polish.

## Current State Analysis

- `scripts/demo.mjs` (1290 lines) runs against a running server (`BASE_URL`) and the LOCAL database (`readDbEnv({ requireLocal: true })`). Every run: `createRestaurant` + `createEvent(…, { allModules: true, unlocked: ["aiTopics"] })` over PostgREST, an owner `wlasciciel-<id>@demo.stolik` invited over PostgREST and redeemed over HTTP, the venue (generated 1600×900 PNG, 3 rooms, 7 tables / 45 seats) built through the client's `/api/o/<key>/…`, 40 guests (30 pasted, 10 from a CSV with diets), a hand-placed seating, 30 guesses, 9 order lines from a reduced menu, then through the panel: menu catalog, 3 more events, a template saved from the main event and an event from it, RSVP, team (`menedzer-<id>@…`, `kelner-<id>@…`), floor refill, per-event waiter, readouts, prints, one support visit with two module unlocks, pub quiz, branding, retention/export. It prints a long link list.
- Nothing else runs it: the smoke creates its own data (`scripts/smoke.mjs`), tests never call it, CI does not run it. README („Narzędzia”) and CLAUDE.md („Commands”) describe it; earlier slices' manual checks use its data and links.
- Every step the demo needs exists as an HTTP route a person in the app would use: the platform admin creates a restaurant with its owner (`POST /api/panel/platform/restaurants` → `owner.link` = an invitation `/haslo/<token>`), re-enables it (`PATCH …/<id> { disabled }`), issues an owner's „Nowy link” (`POST …/<id>/owners/<accountId>/link`); the owner invites and re-links the team (`/api/panel/restaurants/<id>/team…`), renames the restaurant (`PATCH …/branding { name }`), deletes events (`DELETE /api/panel/events/<id>`); owners and managers build a template through the template dispatcher (`/api/panel/templates/<id>/sala/{plan,rooms,rooms/:id,tables,venue}`), manage the menu (`/api/panel/restaurants/<id>/menu…`) and create events from a template (`POST …/events { templateId }` → the card with `links.organizer|tv|restaurant`); the client switches free modules (`PUT /api/o/<key>/modules`), the admin unlocks paid ones inside a support visit. Only the FIRST platform admin needs the database (PRD Success Criteria: „poza pierwszym kontem administratora platformy”).
- A new panel event gets the database module defaults: everything offered; questions, draw and TV screen on; AI topics, guessing and pub quiz off; nothing unlocked. Its starter questions load on creation.
- `validateDraft` (`src/lib/seating/draft.ts:36`) checks: every present non-pinned guest seated once on an existing free seat, groups on consecutive seats (`areConsecutiveSeats`: an arc of a round table, a run on ONE side of a rectangular one — side A = seats 1..ceil(n/2)). The „nobody alone” rule is the browser draw's own and is not re-checked.
- Venue rules: room outline fractions inside the plan (`isValidOutline`, `src/lib/venue/rules.ts:184`); plan ≤ 4 MiB PNG/JPEG/WebP by magic bytes (`MAX_PLAN_BYTES`, `src/lib/venue/image.ts:15`); tables 2–30 seats, ≤ 60 tables, ≤ 10 rooms, names unique per event.
- Scripts are plain Node `.mjs` linted by `scriptsConfig` (`eslint.config.js:73`); their pure parts are unit-tested from `tests/scripts/*.test.ts` importing the `.mjs` directly (`tests/scripts/aws-deploy.test.ts`).

## Desired End State

- `npm run demo` (local only, refuses any other `SUPABASE_URL`, needs a running server) prepares ONE demo restaurant and refreshes its sample data; running it again converges to the same state (same restaurant, same accounts, events replaced, nothing piling up):
  - the platform admin `admin@demo.stolik` / `demo-admin-1` (bootstrapped in the DB as before) finds the restaurant by its fixed owner `wlasciciel@demo.stolik`, or creates it through the platform API (flow 1); the owner sets / keeps `demo-wlasciciel-1`; the team `menedzer@demo.stolik` / `demo-menedzer-1` and `kelner@demo.stolik` / `demo-kelner-1` (flow 2);
  - the manager's venue template „Cały lokal (szablon demo)” (flow 3) — 3 rooms with outlines, 14 tables, 98 seats on the generated plan by default — and the restaurant's menu (13 items, 5 courses) are built when missing (or with `--plan` / `--venue` / `--menu` / `--reset`) and KEPT on later runs, so a real plan arranged or a real menu typed in the app survives a refresh;
  - every event of the restaurant (and every other template) is deleted and recreated from the template: the sample corporate party „Impreza firmowa Acme (demo)” (today, 80 guests: 30 pasted + 50 from a CSV with diets, groups, an absent and a pinned guest, a published seating, guesses, orders from the reduced menu, RSVP, pub quiz results, a refill on the floor, a per-event waiter), „Wigilia firmowa (demo)” (+32 days, venue leads), „Rocznica firmy (demo)” (+20), „Urodziny Ani (demo)” (−10), „Komunia Zosi (demo)” (−60, archived, guests' data purged);
  - the paid modules are unlocked by the admin inside the logged support visit on every run;
  - the output lists the logins and the links grouped by flow step 1–7 and points to the demo script.
- Options: `--name "<restaurant name>"`, `--plan <image>`, `--venue <json>`, `--menu <csv>`, `--reset`; defaults in `scripts/demo-data/` (`sala.json`, `menu.csv`).
- `docs/scenariusz-pokazu.md` (Polish): preparation, devices, logins, flow 1–7 step by step with the pages and what to show, where the restaurant's real plan and menu go (marked), optional extras, rehearsal reset, and how to prepare the demo restaurant on the hosted platform by hand (the script never targets it).
- README and CLAUDE.md describe the new `npm run demo`; smoke stays green.

### Key Discoveries:

- `scripts/demo.mjs:233-283` — `request` / `step` helpers (Origin header, manual redirects, fail with what is left behind) to keep.
- `scripts/demo.mjs:286-378` — the PNG encoder (`rgbPng`, `planPng`, `logoPng`) moves to the pure module.
- `scripts/lib/platform.mjs` — `readDbEnv`, `ensureStaffAccount`, `issueStaffLink` stay the admin bootstrap; `createRestaurant` / `createEvent` / `addMembership` are no longer used by the demo (the smoke and `event:create` keep them).
- `src/pages/api/panel/restaurants/[id]/events.ts` — `POST { name, date, expectedGuests?, templateId? }` → 201 `{ event: EventCardDto, role }`; `EventCardDto.links` carries `/o/<key>`, `/tv/<key>`, `/r/<key>`.
- `src/lib/templates/rules.ts:11` — the template dispatcher runs `plan`, `rooms(/:id)`, `tables(/:id)`, `venue` with any method of the module.
- `src/lib/platform/api.ts:8` — `CreateRestaurantBody { name, ownerEmail, ownerName? }` strict.

## What We're NOT Doing

- No migration, no new route, no app code change: the demo uses existing APIs only.
- No hosted / `--remote` mode: the demo's fixed passwords must never exist on a public platform; the demo script describes preparing the demo restaurant on the hosted platform by hand (flow 1–7 in the app plus a ready guest list to paste). Never run anything against a hosted database.
- No in-app „prepare demo” button for the admin (FR-042 is satisfied by the admin preparing it through the app's API with the script, and by hand on the platform).
- No `--date` option: the sample party is dated today (its floor, waiter and tablet work until noon the next day, so run the demo the evening before or the morning of the show).
- No cleanup of the per-run demo restaurants of earlier versions in an existing local database (the script never deletes restaurants; `npx supabase db reset` gives a clean local database — documented).
- No AI calls (mock only), no browser automation, no change to the smoke.
- The guests stay fictional and built in (no `--guests` file: the guesses, groups, RSVP, quiz and print checks name them).

## Implementation Approach

Two layers, like `deploy:aws`: a pure module `scripts/lib/demo-data.mjs` (argument parsing, the data files' parsers and validation, the plan and logo PNGs, a generic seating of the guests on any venue, picking order lines from any menu) unit-tested with fixtures, and `scripts/demo.mjs` as the HTTP choreography. The choreography follows PRD flow 1–7: admin → restaurant and owner → team → (refresh) → menu and template by the manager → events from the template → the client's work on the main event → the day of the event → support visit, quiz, branding, retention. Everything after the admin bootstrap goes through the HTTP API of the running server, as staff or as the client would. Where the old script relied on fixed table or dish names (group seats, table lines, refill, RSVP options), the new one derives them from the venue and the menu it reads back, so a real plan and menu work without code changes.

## Critical Implementation Details

- **Refresh order.** Delete the events BEFORE rebuilding the menu or the template (event menus reference catalog items; nothing breaks either way, but a template rebuilt first would leave events built from the old one). Events are listed through `GET /api/panel/restaurants/<id>/events` (today, upcoming, past, archived) and deleted by the OWNER (`EVENT_DELETE_ROLES`); templates through `GET …/templates` and `DELETE /api/panel/templates/<id>`.
- **Accounts that drift.** A demo account whose password no longer matches (changed by hand) is recovered through the app, never the database: the owner through the admin's „Nowy link”, the manager and the waiter through the owner's team „Nowy link”; an account missing from the team is invited again; a wrong role is corrected with `PATCH team/<accountId>`.
- **Module unlocks need the support visit before the client switches them on**: the client's `PUT /modules` for a paid module answers 409 `module-locked` until the admin's unlock. Guessing (free) is switched on by the client before the guesses are entered.
- **Imported guests are named explicitly** (not `GUESTS.slice(-10)`): appending new names must not change who comes from the CSV.

## Phase 1: Demo data module and files

### Overview

Everything the demo decides without a server, testable with fixtures: CLI options, the default venue and menu as files, their parsers, the PNGs, the seating and the choice of dishes.

### Changes Required:

#### 1. Pure module

**File**: `scripts/lib/demo-data.mjs`

**Intent**: Move and generalise the demo's data logic so the choreography works on the default data and on the restaurant's real plan and menu.

**Contract**:
- `parseDemoArgs(argv)` → `{ name, plan, venue, menu, reset }` or throws `DemoDataError` (Polish message) on an unknown flag or a missing value; flags `--name <text>`, `--plan <file>`, `--venue <file>`, `--menu <file>`, `--reset`.
- `parseVenue(json)` → `{ planSize: [w, h], rooms: [{ name, outline | null }], tables: [{ room, name, shape, seats, x, y, rotation }] }`, validated like the app (room names 1–40 unique in any case, ≤ 10 rooms; tables 1–24 chars unique in any case, 2–30 seats, `round | rectangular`, ≤ 60, fractions in [0, 1], outline inside the plan, every table in a known room) — throws `DemoDataError` naming the problem.
- `parseMenuCsv(text)` → `[{ name, course, price, inEvent }]`: BOM stripped, separator `;` / tab / `,` by the first line, optional header recognised by its words, course by key or Polish / English word (przystawka, zupa, danie główne, deser, napoje …), price as typed in Polish formats (validated like `parseUnitPrice`: up to 2 decimals, 0…100 000 zł), the 4th column „w menu imprezy” (tak / nie / yes / no / 1 / 0; empty = tak); duplicates in any case, an empty file or > 300 items → `DemoDataError`.
- `sniffImageType(bytes)` → `image/png | image/jpeg | image/webp | null`; `MAX_PLAN_BYTES` = 4 194 304.
- `rgbPng(width, height, pixels)`, `planPng(venue)` (rooms from their outlines, tables at their pins with a size derived from shape and seat count), `logoPng(width, height, background, foreground)`.
- `seatGuests({ tables, guests, groups, absent })` with tables `[{ id, name, shape, seatCount }]` in venue order → `[{ name, tableId, seat }]`: groups first (largest first), each at the first table WITHOUT a group that has a free run of its size on one block (round: 1..n; rectangular: side A 1..ceil(n/2), side B the rest), else any table with such a run; then every other present guest at the table with the most free seats (venue order on a tie), lowest free seat. Absent guests get nothing. Throws `DemoDataError` when the seats do not suffice or a group fits nowhere.
- `pickMenuItem(items, courses, pick)` → the `pick`-th (modulo) available item of the first listed course that has any, else of any course, else null; it sorts the available items itself (the app's course order, then Polish name order), so it never depends on the API's order.

#### 2. Default data files

**Files**: `scripts/demo-data/sala.json`, `scripts/demo-data/menu.csv`

**Intent**: The demo restaurant's default venue and menu as data the user can replace with the restaurant's real ones.

**Contract**: `sala.json` — `planSize` [1600, 900], rooms „Sala Główna” (7 tables: Buk, Dąb, Grab, Jesion, Klon, Lipa round 8 each; Długi stół rectangular 12), „Sala Kominkowa” (Kominek round 8, Okno and Regał rectangular 6), „Ogród zimowy” (Palma round 6, Paproć round 4, Fontanna and Storczyk rectangular 4), each room with an outline; 14 tables, 98 seats. `menu.csv` — header `Nazwa;Kurs;Cena;W menu imprezy`, the 13 items of today's `MENU` with the same prices and reduced-menu marks.

#### 3. Unit tests

**File**: `tests/scripts/demo-data.test.ts`

**Intent**: Pin the module's rules and the default files.

**Contract**: arguments (every flag, unknown flag, missing value); venue validation (each problem, a valid file); menu CSV (separators, header or none, BOM, Polish and English course words, prices „18”, „18,5”, „1 499,99 zł”, bad price, duplicate, „nie”); `sniffImageType`; `planPng` gives a PNG with the plan size in IHDR; `seatGuests` — every present guest once, no seat twice, groups on consecutive seats of one block (checked with the side rule), groups at different tables when possible, absent guest unseated, too few seats and an unplaceable group throw; `pickMenuItem` fallbacks; the default files parse, the venue seats the demo's 79 present guests with its groups, the menu has at least 2 main courses and a drink in the event menu.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npx vitest run tests/scripts/demo-data.test.ts`
- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`

#### Manual Verification:

- `scripts/demo-data/sala.json` and `menu.csv` read clearly enough for the user to replace them with the restaurant's real plan and menu

---

## Phase 2: Stable demo restaurant through the app's API

### Overview

Rewrite the choreography of `scripts/demo.mjs` on top of the module: one stable restaurant prepared by the admin, the team, the refresh, the template and menu by the manager, the events from the template, the client's work, the day of the event, then the existing extras; the output grouped by flow step.

### Changes Required:

#### 1. Demo choreography

**File**: `scripts/demo.mjs`

**Intent**: Prepare the stable demo restaurant in PRD flow order through the HTTP API, keep every check the earlier slices added (diets on the tablet, RSVP counts, floor refill price, readouts without data, prints, support log, quiz standings, export, purge, pinned TV room), and make it converge on re-runs.

**Contract**:
- Order: options and data files (fail before any write) → admin bootstrap (DB, as today) and login → find the restaurant whose owners include `wlasciciel@demo.stolik` in `GET /api/panel/platform/restaurants` (lowest id) or create it (`POST`, name „Restauracja demo” or `--name`); `PATCH { disabled: false }` when switched off → owner: redeem the invitation, else log in with `demo-wlasciciel-1`, else the admin's „Nowy link” and redeem → `--name` differing from the current name → owner `PATCH …/branding { name }` → team: manager and waiter invited / re-linked / role-fixed, each logged in → restaurant settings the stable restaurant may have drifted on (owner): guest data term back to 30 days, brand colour and logo → refresh: the owner deletes every event and every template except the kept demo template → menu: kept when the catalog is non-empty and neither `--menu` nor `--reset`, else every item deleted and the file's items added (manager) → template „Cały lokal (szablon demo)”: kept when it exists and none of `--plan` / `--venue` / `--reset`, else created by the manager (plan PUT, rooms POST + outline PATCH, tables POST) → events by the manager from the template: the main party (today, 80), „Wigilia firmowa (demo)” (+32, 80), „Rocznica firmy (demo)” (+20, 60), „Urodziny Ani (demo)” (−10, 30), „Komunia Zosi (demo)” (−60, archived by the owner, purged) → the main event's reduced menu (the items marked „w menu imprezy” that exist in the catalog; none → `full`).
- Main event as the client (`/api/o/<key>` from the card's link): 30 guests pasted, 50 imported from a CSV with diets after a preview (the 10 diet guests of today plus 40 new fictional full names, some with diets), Bartek's and Kasia's diets patched, groups (4, 2, 2 and a new 3), Weronika absent; guessing switched on (`PUT /modules`); `seatGuests` draft → pin Pani Halinka → publish; the tablet's diet counts checked; 30 guesses; 9 order lines chosen with `pickMenuItem` by course (table lines at the tables of the first two groups), each line's price = its menu item's price; first line delivered; RSVP with the event menu's main courses (fallback: any available items) — counts checked.
- „Wigilia firmowa (demo)”: venue leads, 4 guests through the dispatcher. „Rocznica firmy (demo)”: rooms and tables equal the template's.
- Floor: the waiter sees the main event under „Dziś na sali”, adds a refill of the event menu's first drink (`pickMenuItem` drinks first) at the first group's table at the menu price and serves it; the per-event waiter „Kuba (na imprezę)”; readouts and prints checks as today (names Justyna, Gosia Kowalska).
- Support visit: enter, the restaurant page and the main event's card, unlock AI topics for „Wigilia firmowa (demo)” and AI topics + pub quiz for the main event, exit; the owner's log must read `exit,unlock,unlock,unlock,access,access,enter` (newest first, the latest seven entries); then the owner switches AI topics and guessing on for „Wigilia firmowa (demo)” and the client switches AI topics and pub quiz on for the main event (all six modules on, like before).
- Pub quiz, the client's brand („Acme Polska sp. z o.o.” and logo), the purged event's export and the manager's export, the pinned-room TV (the second room with tables), as today (the restaurant's term and brand were set before the events, so a term shortened by hand never purges „Urodziny Ani (demo)”).
- Output: what was kept or rebuilt, the logins (four fixed accounts), then the links grouped „Krok 1” … „Krok 7” plus „Dodatki”, and `docs/scenariusz-pokazu.md`; the header comment rewritten for the new behaviour.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`
- `npm run demo` succeeds against `AI_PROVIDER=mock npm run preview` on the local database
- A second `npm run demo` succeeds and converges: the same restaurant id, one restaurant with owner `wlasciciel@demo.stolik`, its event lists hold exactly the five demo events, the template and the 13 menu items were kept
- `npm run demo -- --reset` rebuilds the template and the menu and succeeds
- Smoke passes: `npm run smoke`

#### Manual Verification:

- The panel of the demo restaurant (owner, manager, waiter logins) shows the five events, the template, the menu and the team as described
- The TV of the main party rotates through the three rooms with 79 names readable

---

## Phase 3: Demo script and documentation

### Overview

The written scenariusz pokazu and the documentation of the new demo.

### Changes Required:

#### 1. Demo script

**File**: `docs/scenariusz-pokazu.md`

**Intent**: A Polish runbook for the live demo with the restaurant that walks PRD flow 1–7 in the app.

**Contract**: sections — Przed pokazem (local run: Supabase, `AI_PROVIDER=mock npm run build && npm run preview`, `npm run demo`, when to run it, LAN address via `BASE_URL`), Urządzenia (laptop = panel, TV, tablet `/r/`, phones: a guest, the waiter), Konta demo (the four logins), Prawdziwy plan i menu restauracji (clearly marked: the `--plan` / `--venue` / `--menu` files or the template editor and „Menu lokalu” in the app, kept on refresh), Kroki 1–7 (each: who, page, what to click, what to show, what to say, expected result; step 4 timed < 3 min, step 7 „następne z szablonu w minutę”), Dodatki (diets and import, RSVP, quiz, prints, offline readout, support log, retention and export, per-event waiter, map search, room rotation), Między próbami (re-run, `--reset`, `npx supabase db reset`), Na platformie (hosted, the user's step later: never the script; prepare by hand through flow 1–7 with the ready guest list block to paste into „Import gości z dietami” and the menu table), Otwarte (demo date, real plan and menu, product name).

#### 2. README and CLAUDE.md

**Files**: `README.md`, `CLAUDE.md`

**Intent**: Describe the new `npm run demo` (stable restaurant, fixed logins, options, refresh semantics, the demo script) and replace the per-run description; CLAUDE.md „Commands” keeps the details a future agent needs (what the demo checks and fails on), the white-label note names the new main event.

**Contract**: README „Narzędzia” bullet and the staff-accounts paragraph (line ~48); CLAUDE.md `npm run demo` bullet; the white-label „Kept on purpose” list.

### Success Criteria:

#### Automated Verification:

- `docs/scenariusz-pokazu.md` exists and every repository path it names exists: `test -f docs/scenariusz-pokazu.md` plus an `ls` of the paths it mentions
- Full test suite: `AI_PROVIDER=mock npm test`
- Linting: `npm run lint`; types: `npx astro check`; build: `npm run build`
- Smoke: `npm run smoke`; demo: `npm run demo`

#### Manual Verification:

- Walk flow 1–7 with the demo script on the local app (laptop, a phone on the LAN) and note anything the script says that the app does differently
- Replace the plan and menu with the restaurant's real ones when the user has them (PRD Open Question 2)

---

## Testing Strategy

### Unit Tests:

- `tests/scripts/demo-data.test.ts` (Phase 1): arguments, venue and menu parsing, PNG, seating rules, dish choice, default files.

### Integration Tests:

- None new: the demo itself is the end-to-end run (it fails on any unexpected answer and checks counts, prices, diets, logs, standings); the smoke is unchanged and must stay green.

### Manual Testing Steps:

1. `npm run demo` twice; log in as owner, manager, waiter and admin with the printed passwords.
2. Follow `docs/scenariusz-pokazu.md` steps 1–7 on the local app.
3. `npm run demo -- --plan <photo> --menu <file>` with a sample photo and a hand-written CSV; arrange the tables in the template editor; re-run without options — the arrangement stays.

## Performance Considerations

The demo makes a few hundred sequential HTTP calls (80 guests, 30 guesses, ~14 tables); expect well under a minute locally. No app performance change.

## Migration Notes

None. Existing local databases keep the per-run demo restaurants of earlier versions; the first run creates the stable one beside them.

## References

- Roadmap: `context/foundation/roadmap.md` (S-29); PRD: `context/foundation/prd-v2.md` (FR-042, flow 1–7, Success Criteria)
- Similar pattern: `scripts/lib/aws-deploy.mjs` + `tests/scripts/aws-deploy.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Demo data module and files

#### Automated

- [x] 1.1 Unit tests pass: `npx vitest run tests/scripts/demo-data.test.ts` — 98315a0
- [x] 1.2 Linting passes: `npm run lint` — 98315a0
- [x] 1.3 Type checking passes: `npx astro check` — 98315a0

#### Manual

- [ ] 1.4 `scripts/demo-data/sala.json` and `menu.csv` read clearly enough for the user to replace them with the restaurant's real plan and menu

### Phase 2: Stable demo restaurant through the app's API

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 0909b61
- [x] 2.2 Build passes: `npm run build` — 0909b61
- [x] 2.3 `npm run demo` succeeds against `AI_PROVIDER=mock npm run preview` on the local database — 0909b61
- [x] 2.4 A second `npm run demo` succeeds and converges (same restaurant, five demo events, template and menu kept) — 0909b61
- [x] 2.5 `npm run demo -- --reset` rebuilds the template and the menu and succeeds — 0909b61
- [x] 2.6 Smoke passes: `npm run smoke` — 0909b61

#### Manual

- [ ] 2.7 The panel of the demo restaurant (owner, manager, waiter logins) shows the five events, the template, the menu and the team as described
- [ ] 2.8 The TV of the main party rotates through the three rooms with 79 names readable

### Phase 3: Demo script and documentation

#### Automated

- [x] 3.1 `docs/scenariusz-pokazu.md` exists and every repository path it names exists — c2d079a
- [x] 3.2 Full test suite: `AI_PROVIDER=mock npm test` — c2d079a
- [x] 3.3 Linting, types and build: `npm run lint`, `npx astro check`, `npm run build` — c2d079a
- [x] 3.4 Smoke and demo: `npm run smoke`, `npm run demo` — c2d079a

#### Manual

- [ ] 3.5 Walk flow 1–7 with the demo script on the local app (laptop, a phone on the LAN)
- [ ] 3.6 Replace the plan and menu with the restaurant's real ones when the user has them (PRD Open Question 2)
