# Staff offline readout (S-27) Implementation Plan

## Overview

Without network, the kitchen tablet `/r/<key>`, the staff floor `/panel/obsluga/<id>` (owner, manager, waiter accounts) and the per-event waiter's floor `/kelner/sala/<id>` show the LAST state of orders (with what is delivered) and the published seating of their event — also after a page reload — read-only (PRD v2 FR-047 extended by NFR-017, US-08). The v1 organizer readout (S-09) is the pattern: a device-local envelope in localStorage, a data-free readout page, and a service worker that serves that page's copy when a page cannot load.

## Current State Analysis

- v1 (S-09) exists for the client link only: `src/lib/offline/` (`cache.ts` envelopes `{ v, owner, savedAt, data }`, `offlineOwner`, deep validation; `sync.ts` `readOfflineState` with the app-denial test 404 + `X-Robots-Tag`), `src/components/hooks/offline-cache-store.ts` (two fixed localStorage keys through `createLocalStore`), `useOfflineSync.ts` (own reads every 30 s), `offline-worker.ts` (`registerOrganizerWorker`, scope `/o/<key>`, production + secure origins only), `public/organizer-sw.js` (copies `<scope>/odczyt` + its `/_astro/` closure, network-first navigations, copy on network error / 8 s / 5xx, never `/api/`), tests `tests/sw/organizer-sw.test.ts` (node:vm).
- Staff views already poll: the tablet `useRestaurantView` (`GET /api/r/<key>/orders?since=` every 15 s, 204/200, `gone` on 404, `offline` after 3 failures); both floors run `OrderManager floor` on `useOrderBoard` (`GET <base>/orders` every 5 s while idle; failures and denials are swallowed — no offline or denial state at all).
- The tablet's `RestaurantViewDto` (seating = published `TvSeatingDto`, prep, placement of `RestaurantItemDto` with delivered pieces, totals, diets) is exactly "orders with what is delivered + published seating" without prices, ids or keys. `toRestaurantItem` (`src/lib/orders/restaurant.ts`) projects an `OrderItemDto` onto it.
- Guards: `/r/<key>/**` by the middleware key guard (`PRIVATE_HEADERS`: `X-Robots-Tag`), `/panel/obsluga/<id>` by `findFloorEvent` (members in the floor window; admin never), `/kelner/sala/<id>` by `findWaiterFloorEvent` (own event, window, `waiter.expiresAt`). Without a session `/panel/**` → 303 `/logowanie`, `/api/panel/**` → 401; `/kelner/sala/**` → 303 `/kelner`, `/api/kelner/sala/**` → 401 — all with `AUTH_AREA_HEADERS` (`X-Robots-Tag`).
- `RestaurantAccess.event` has no date, although `resolveAccess` already selects `event_date` (retention).
- `ServingPlan` loads the plan photo (an API answer, never cached by any worker) only for its aspect ratio; offline it falls back to a 16:9 stage.
- Floor window = `isFloorOpen` (`eventTiming === "today"`, noon rule); `localInputToInstant` / `addDays` (`src/lib/events/dates.ts`) give the DST-correct instant of noon Warsaw.

## Desired End State

- Each of the three live pages saves (on every successful read of its existing poll and at mount) a price-free, id-free copy in this browser, owner-tagged to ITS scope and expiring at the floor window end; an app denial (404/401 with `X-Robots-Tag`) clears that copy and unregisters that scope's worker.
- `/r/<key>/odczyt`, `/panel/obsluga/<id>/odczyt`, `/kelner/sala/<id>/odczyt` exist behind the same guards as their live pages, carry no saved data in their HTML, and show the saved copy with the same board as the tablet (plan with map search and diets, prep by course, serving per seat with delivered pieces), „Stan z HH:MM” and the expiry.
- On https / localhost production builds the generalised readout worker (one file, four scope kinds) serves the readout copy when a live page cannot load; on plain-http LAN only the open page keeps its last state (documented).
- `/logowanie` clears the panel floors' copies and workers; `/kelner` without a waiter session clears the waiter floor's.
- Smoke section 42, demo links, CLAUDE.md updated.

### Key Discoveries:

- `src/lib/orders/restaurant.ts:13` `toRestaurantItem` — the projection for floor lines.
- `src/components/hooks/useOrderBoard.ts:85-104` — the poll swallows everything; needs `syncedAt`, `failures`, `denied`.
- `src/components/hooks/useRestaurantView.ts:48-66` — 204 leaves `view` untouched, so "time of the last successful read" needs its own state.
- `public/organizer-sw.js:111` — `copyReadout` follows redirects: a staff readout fetched without a session would store the login page. Must use `redirect: "manual"`.
- Service-worker scopes match by string prefix: `/kelner/sala/1` also covers `/kelner/sala/12` unless the worker checks path segments.
- `src/lib/access/resolve.ts:156` — the restaurant branch already reads `event_date`.

## What We're NOT Doing

- No writes offline, no sync queue, no offline marking of pieces (read-only, like v1).
- No prices, drinks or bill in the floors' copy (FR-047/NFR-017 ask for orders + delivered + seating; the copy is the tablet's projection).
- No caching of any `/api/` answer (the plan photo included) in a worker; the offline drawing uses the saved aspect ratio instead.
- No new API route, no migration, no new dependency.
- No several events per area on one device: one slot per area (a second event's floor replaces the first one's copy).
- No offline readout for the client's preview in the panel (`/panel/wydarzenia/<id>/zamowienia`) or the TV.
- No real-device offline test (manual, the user's).
- No remote wipe: after „Wyloguj wszędzie” or a password change on another device, a device that stays offline keeps its copy until the window end (its next online read gets the 401 and clears it).

## Implementation Approach

One pure core shared by the three areas (`src/lib/offline/staff.ts`): the projection `StaffReadoutDto` (= `RestaurantViewDto` without `version`, plus `planAspect`), the scope (`area`, `owner`, `expiresAt`, `apiBase`, `livePath`, `readoutPath` — computed on the server, passed as a prop), the envelope `{ v, area, owner, savedAt, expiresAt, data }` with deep validation, the app-denial test and a one-shot read for the readout page. The live islands save through their existing polls (no extra requests); the readout page probes `/orders` once per interval like v1's sync. The worker stays one file (`public/organizer-sw.js`) registered with four scope kinds; it gains a segment-exact scope check, an explicit `/api/` bypass, and redirect/401 denials.

## Critical Implementation Details

- **Worker copy must not follow redirects.** `copyReadout` fetches with `redirect: "manual"`; an `opaqueredirect` / 3xx / `redirected` answer is a denial (forget + unregister), never a page to store. A navigation answered with `opaqueredirect` (session gone) forces `refresh(true)`.
- **Owner and expiry come from the server.** The page computes the scope (owner hash of area + event + account / waiter / key path, `expiresAt` = noon Warsaw the day after the event date, waiter: the earlier of that and `waiter.expiresAt`) and passes it to the island; the readout page computes the SAME scope, so a copy saved by another account, waiter or link never shows.
- **Expiry is checked on every read and on save.** `createLocalStore` caches parsed values per raw text, so `parse` validates structure only; the store's reader filters by owner and `expiresAt > now` and removes an expired slot. A save whose `savedAt ≥ expiresAt` writes nothing (a tablet opened after the window keeps no copy).
- **Only the three live API bases may save or register.** A regex guard admits `/api/r/<24 chars>`, `/api/panel/events/<n>/obsluga`, `/api/kelner/sala/<n>`; the client's page and the panel preview reuse `OrderManager` without a scope.

## Phase 1: Core, scopes and the generalised worker

### Overview

Pure logic, the scope data the pages need, and the worker — all unit-tested before any UI uses them.

### Changes Required:

#### 1. Staff readout core

**File**: `src/lib/offline/staff.ts` (new), `src/lib/offline/index.ts`, `src/types.ts`

**Intent**: The one model of the staff copies: projection, validation, envelope, scope builders, denial test, one-shot read.

**Contract**:
- `StaffReadoutArea = "tablet" | "floor" | "waiter"`; `STAFF_READOUT_STORAGE_KEYS` = `kolacja-podwyzkowa:odczyt:tablet|sala|kelner` (fixed, no key in names); `StaffReadoutDto` in `src/types.ts` = `Omit<RestaurantViewDto, "version"> & { planAspect: { planVersion: number; aspect: number } | null }`.
- `staffReadoutFromView(view, planAspect)`, `staffReadoutFromBoard(board, planAspect)` (items via `toRestaurantItem`, prep without `totalGrosze`, totals `{ quantity, toServe = quantity − deliveredQuantity }`; no ids, prices, marks, guests or tables lists).
- `isStaffReadout(value)` deep validation (seating tables/seats/rooms, prep with course and notes, placement tables/seats/items/unplaced/unassigned, totals, diets tables/seats/tags/counts, planAspect).
- `StaffReadoutScope { area, owner, expiresAt, apiBase, livePath, readoutPath }`; builders `tabletReadoutScope(key, eventDate)`, `floorReadoutScope(eventId, accountId, eventDate)`, `waiterReadoutScope(eventId, waiterId, eventDate, waiterExpiresAt)`; `staffReadoutOwner(...parts)` = `offlineOwner` of `area|parts`.
- `StaffOfflineEntry { v: 1, area, owner, savedAt, expiresAt, data }`; `staffOfflineEntry(scope, data, savedAt)` → entry | null (null when `savedAt ≥ expiresAt`); `parseStaffOfflineEntry(raw)` (structure only); `liveStaffEntry(entry, scope, now)` → the entry when area, owner match and `now < expiresAt`, else null.
- `isStaffReadoutApiBase(area, apiBase)` (the regex guard above).
- `isAppDenial(response)` = status 404 or 401 with `X-Robots-Tag` containing `noindex`.
- `readStaffReadoutOnce(scope, fetchFn, signal)` → `{ status: "ok", data } | { status: "offline" } | { status: "gone" }` (GET `<apiBase>/orders`, tablet body → view, floors → board; anything odd → offline).

#### 2. Floor window end

**File**: `src/lib/floor/rules.ts`

**Intent**: The instant the floor window closes, for the copies' expiry.

**Contract**: `floorWindowEnd(eventDate: string): string` = `localInputToInstant(\`${addDays(eventDate, 1)}T12:00\`)` (ISO). `isFloorOpen` is true one millisecond before it and false at it (test, CET and CEST).

#### 3. Event date on the tablet's access

**File**: `src/lib/access/resolve.ts`

**Intent**: The tablet's readout scope needs the event date without a new query.

**Contract**: `RestaurantAccess.event.date: string` from the already selected `event_date`. `tests/integration/access.test.ts:100` compares the restaurant access with `toEqual` — add the field there.

#### 4. Texts

**File**: `src/lib/offline/staff-messages.ts` (new; exported from `src/lib/offline/index.ts`)

**Intent**: PL + EN texts of the staff readout (page title/heading/intro, back link, „Stan z”, expiry line, nothing saved, gone, offline note on the live pages, the readout link, fallback/retry/reconnected).

**Contract**: `staffOfflineMessages(locale)` via `defineMessages`; dates through `formatSavedAt` and `formatDateTime`.

#### 5. Generalised readout worker

**File**: `public/organizer-sw.js`, `tests/sw/organizer-sw.test.ts`

**Intent**: One worker for the organizer and the three staff scopes: answers navigations only inside its own path segment, never `/api/`, treats a redirect or a guarded 401 as a denial and never stores a login page.

**Contract**: `inScope(url)` = `pathname === scopePath || pathname.startsWith(scopePath + "/")` gates navigations and the post-navigation refresh; `/api/` GETs are never answered; `copyReadout` fetches `{ cache: "no-store", redirect: "manual" }`; `isDenial` = `opaqueredirect`, a 3xx, `redirected`, or 401/404 with `X-Robots-Tag`; a navigation `opaqueredirect` or 404 → `refresh(true)`. Cache names unchanged (`kolacja-odczyt|<scope>|<ms>`). New vm tests: staff scopes copy their readout; `/kelner/sala/1` neither answers nor refreshes `/kelner/sala/12`; a redirected copy fetch stores nothing and unregisters; a guarded 401 forgets; a navigation `opaqueredirect` forgets; `/api/…` navigations and GETs untouched. The fake fetch passes `init` to routes.

### Success Criteria:

#### Automated Verification:

- Unit tests of the core and the floor window end pass: `npx vitest run src/lib/offline src/lib/floor`
- Worker tests pass (old and new): `npx vitest run tests/sw`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- Review: the projection carries no id, price, key or mark (read `staffReadoutFromBoard`)

**Implementation Note**: Unattended run — manual rows are recorded for the user; continue after the automated checks pass.

---

## Phase 2: Saving on the live pages, the readout pages and the clears

### Overview

Wire the core into the tablet and both floors, add the three readout pages and the logout clears.

### Changes Required:

#### 1. Poll state for saving

**File**: `src/components/hooks/useRestaurantView.ts`, `src/components/hooks/useOrderBoard.ts`

**Intent**: Tell the saver when the last successful read happened and whether the app denied access; give the floor an offline signal.

**Contract**: `useRestaurantView` also returns `syncedAt` (ms; mount, every 200 and 204) and `denied` (`isAppDenial`). `useOrderBoard` also returns `syncedAt` (mount, every applied read or answer with a board), `offline` (3 failed polls in a row: network, timeout, 5xx) and `denied` (`isAppDenial` on a poll). Existing behaviour unchanged.

#### 2. Store, saver and worker registration

**File**: `src/components/hooks/staff-offline-store.ts` (new), `src/components/hooks/useStaffReadout.ts` (new), `src/components/hooks/offline-worker.ts`

**Intent**: localStorage slots through `createLocalStore`; one hook that saves the projection, sweeps expired slots, registers the scope's worker and forgets on denial; worker helpers to register any scope and to forget a scope or a whole area.

**Contract**: `saveStaffReadout(scope, data, savedAt)` (only for `isStaffReadoutApiBase`), `clearStaffReadout(area, owner?)`, `sweepExpiredStaffReadouts(now)`, `useStaffReadoutEntry(scope)` (undefined in SSR/hydration); `useStaffReadout(scope | null, data, syncedAt, denied)`; `registerReadoutWorker(scopePath)` (PROD + secure context; `registerOrganizerWorker` delegates), `forgetReadoutWorker(scopePath)` (exact scope only, via `getRegistrations()`; its caches), `forgetReadoutArea(pathPrefix)` (every registration and cache under `/panel/obsluga/` or `/kelner/sala/`). Store tests with a stubbed window like `offline-cache-store.test.ts` (owner, area, expiry, sweep, blocked storage).

#### 3. Shared board and the plan's aspect

**File**: `src/components/restaurant/RestaurantBoard.tsx` (new, from `RestaurantView`), `src/components/restaurant/RestaurantView.tsx`, `src/components/orders/ServingPlan.tsx`, `src/components/orders/OrderManager.tsx`

**Intent**: The tablet's grid (plan with map search, diets, prep by course, serving per seat) as one presentational component used by the tablet and every readout page; the plan's aspect ratio kept with the copy.

**Contract**: `RestaurantBoard { view: Omit<StaffReadoutDto, "planAspect">, apiBase, locale, fallbackAspect?, onAspect? }`; `ServingPlan` gains `fallbackAspect?: number` and `onAspect?(planVersion, aspect)`; `RestaurantView` and `OrderManager` take `readout?: StaffReadoutScope`, keep the measured aspect, build the projection, call `useStaffReadout`, and show the offline note with „Stan z …” and the readout link (`data-staff-readout-note`) when offline or denied.

#### 4. Live pages and readout pages

**File**: `src/pages/r/[key].astro`, `src/pages/panel/obsluga/[id].astro`, `src/pages/kelner/sala/[id].astro`, new `src/pages/r/[key]/odczyt.astro`, `src/pages/panel/obsluga/[id]/odczyt.astro`, `src/pages/kelner/sala/[id]/odczyt.astro`, new island `src/components/offline/StaffReadoutPage.tsx`

**Intent**: Live pages pass their scope and link to the readout (`data-staff-readout-link`); readout pages run the same guard as their live page (identical 404 / 303), read no data, and render the island.

**Contract**: readout page `<main data-staff-readout="<area>">`; island props `{ scope, eventName, locale }`; it shows the saved copy through `RestaurantBoard` (fallback aspect from the copy), „Stan z …”, the expiry, nothing-saved / gone texts, the fallback banner when served under another address (retry; „Połączenie wróciło” + reload), probes `readStaffReadoutOnce` at mount, every 30 s visible, 5 s offline, on `online`/visibility (ok → save, gone → clear + forget worker), and registers the scope's worker.

#### 5. Clears on logout

**File**: `src/pages/logowanie.astro`, `src/pages/kelner/index.astro`, `src/components/hooks/staff-offline-clear.ts` (new)

**Intent**: A browser without a staff session keeps no floor copy; without a waiter session no waiter-floor copy.

**Contract**: `/logowanie` always, `/kelner` only without `locals.waiter`, render `data-clear-staff-readout="floor|waiter"`; a bundled `<script>` clears that slot and calls `forgetReadoutArea` for its path prefix.

### Success Criteria:

#### Automated Verification:

- All tests pass: `AI_PROVIDER=mock npm test`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Tablet, floor and waiter floor in a browser (https or localhost preview): open the live page, then the readout page shows the same board with „Stan z …”
- DevTools „Offline” + reload of each live page shows the readout copy (localhost production preview)
- Logout on the panel, then `/logowanie`: the floor slot and the `/panel/obsluga/*` worker are gone (Application tab)

**Implementation Note**: Unattended run — manual rows are recorded for the user; continue after the automated checks pass.

---

## Phase 3: Smoke, demo and documentation

### Overview

HTTP-level proof of the guards and the data-free pages, demo links, CLAUDE.md.

### Changes Required:

#### 1. Smoke section 42

**File**: `scripts/smoke.mjs`

**Intent**: Prove the readout pages exist for the right actor, carry no saved data, deny identically, and that the signals the clients rely on carry the guard's header.

**Contract**: a today event of A (tablet readout 200 before the first publish), two guests published at one table, an order line served in part, a per-event waiter redeemed; a second today event of A with its own waiter. Checks: `/r/<key>/odczyt` 200 `data-staff-readout="tablet"` (EN default) with the scope's expiry day and no guest or dish name; TV key / unknown key → the identical 404; after „Wymień link” the old `/r/<key>/odczyt` and `/api/r/<key>/orders` → 404 with `X-Robots-Tag`. `/panel/obsluga/<id>/odczyt`: A's waiter 200 `data-staff-readout="floor"` without names or dishes; owner B, the admin, a malformed id, a tomorrow event → the identical 404; no session → 303 `/logowanie`; `/api/panel/events/<id>/obsluga/orders` without session → 401 with `X-Robots-Tag`. `/kelner/sala/<id>/odczyt`: its waiter 200 `data-staff-readout="waiter"` without names; the other event's waiter cookie → the identical 404; no cookie and a staff session → 303 `/kelner`; the waiter API without cookie → 401 with `X-Robots-Tag`. Live pages link their readout (`data-staff-readout-link`). `/logowanie` and `/kelner` (no session) carry `data-clear-staff-readout`. `/organizer-sw.js` 200 with a JavaScript content type and `redirect: "manual"`. Events deleted.

#### 2. Demo

**File**: `scripts/demo.mjs`

**Intent**: Print the three readout links and check the tablet's (200, no guest name).

**Contract**: lines under „Odczyt bez sieci (obsługa)”.

#### 3. Documentation

**File**: `CLAUDE.md`, `context/foundation/overnight-log.md`

**Intent**: Describe the staff readout (model, scopes, clears, worker, limits, plain-http note), the smoke section and demo lines; log the decisions.

**Contract**: a „Staff offline readout (staff-offline-readout, S-27)” bullet under Data access next to S-09; the S-09 worker text updated (four scope kinds, redirect/401 denial, segment check); smoke and demo command texts.

### Success Criteria:

#### Automated Verification:

- Smoke passes against the production preview: `AI_PROVIDER=mock npm run preview` + `npm run smoke`
- Demo passes: `npm run demo`
- Full suite, lint, check, build pass: `AI_PROVIDER=mock npm test && npm run lint && npx astro check && npm run build`

#### Manual Verification:

- A real tablet / phone over https: open the live pages, switch the Wi-Fi off, reload — the last saved state shows; after noon the next day nothing shows
- Plain-http LAN address: only the open page keeps its state (no worker) — as documented

**Implementation Note**: Unattended run — manual rows are recorded for the user.

---

## Testing Strategy

### Unit Tests:

- Projection: no `id`, `unitPriceGrosze`, `totalGrosze`, `guestId`, `marks` in the floor copy; tablet and floor copies of the same lines agree.
- Validation: odd shapes rejected (missing diets, a seat without a name, negative totals, wrong area).
- Envelope: owner per key / account / waiter differ; expired save writes nothing; reader rejects past expiry; area mismatch.
- `floorWindowEnd` CET and CEST; consistency with `isFloorOpen`.
- `readStaffReadoutOnce`: 200 → ok; 404 / 401 with header → gone; 404 without header → offline; network / 5xx / malformed → offline.
- Store: save/read/clear by owner, sweep of expired slots, blocked storage.
- Worker (node:vm): the cases listed in Phase 1.

### Integration Tests:

- None new (no DB change); smoke covers the HTTP guards.

### Manual Testing Steps:

1. `npm run build && AI_PROVIDER=mock npm run preview`, `npm run demo`, open the printed tablet link on `http://localhost:4321`, then `/odczyt`.
2. DevTools → Network „Offline”, reload `/r/<key>`: the readout copy with „Stan z …”.
3. Log in as the demo waiter, open „Obsługa sali”, go offline, reload: the floor copy. Log out: `/logowanie` clears it.

## Performance Considerations

No new requests on the live pages (saves piggyback the existing polls); a save is one `localStorage.setItem` of ~10–15 KB at full scale (150 guests, 60 tables) per successful read (tablet every 15 s, floor every 5 s while idle). The readout page reads `/orders` every 30 s while visible.

## Migration Notes

None (no schema change). Existing organizer workers keep working: the file name stays `/organizer-sw.js`.

## References

- v1 pattern: `src/lib/offline/`, `public/organizer-sw.js`, `tests/sw/organizer-sw.test.ts`
- Tablet view: `src/lib/orders/restaurant.ts`, `src/components/restaurant/RestaurantView.tsx`
- Floors: `src/lib/panel-api.ts:272` (`findFloorEvent`), `src/lib/waiter-api.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Core, scopes and the generalised worker

#### Automated

- [x] 1.1 Unit tests of the core and the floor window end pass — 78c3127
- [x] 1.2 Worker tests pass (old and new) — 78c3127
- [x] 1.3 Type check passes — 78c3127
- [x] 1.4 Lint passes — 78c3127

#### Manual

- [ ] 1.5 Review: the projection carries no id, price, key or mark

### Phase 2: Saving on the live pages, the readout pages and the clears

#### Automated

- [x] 2.1 All tests pass — 1c1304e
- [x] 2.2 Type check passes — 1c1304e
- [x] 2.3 Lint passes — 1c1304e
- [x] 2.4 Build passes — 1c1304e

#### Manual

- [ ] 2.5 Tablet, floor and waiter floor: the readout page shows the same board with „Stan z …”
- [ ] 2.6 DevTools „Offline” + reload of each live page shows the readout copy
- [ ] 2.7 Logout clears the floor slot and the `/panel/obsluga/*` worker

### Phase 3: Smoke, demo and documentation

#### Automated

- [x] 3.1 Smoke passes against the production preview
- [x] 3.2 Demo passes
- [x] 3.3 Full suite, lint, check, build pass

#### Manual

- [ ] 3.4 A real tablet / phone over https: offline reload shows the last state; nothing after noon the next day
- [ ] 3.5 Plain-http LAN address: only the open page keeps its state
