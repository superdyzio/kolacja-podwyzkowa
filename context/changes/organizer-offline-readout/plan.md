# Organizer offline readout (last published seating and the guess ranking) Implementation Plan

## Overview

Roadmap S-09 (`organizer-offline-readout`, PRD US-04, FR-020, NFR-004, Guardrail „Awaria sieci w lokalu nie odbiera organizatorowi wglądu w ostatni rozkład ani w ranking zebranych strzałów”). When the venue network fails, the organizer's own device keeps showing the last PUBLISHED seating arrangement (table, room, seat → name, with a name search) and the guesses with the ranking (table, „Czytaj od końca” readout, who is missing) as last confirmed with the server, labelled „Stan z HH:MM” — also after a page refresh. The recovery path is the user's choice „Ostatni stan + hotspot”: the pages say so and reconnect by themselves once the device is on a phone hotspot. Read-only: nothing is written to the server offline and there is no sync queue (PRD Non-Goal).

## Current State Analysis

- Organizer pages are SSR behind the middleware key guard (`src/middleware.ts`), every guarded response is `Cache-Control: no-store`. Without network a refresh or navigation shows the browser's own error page — nothing in the app can serve a page offline today.
- `/o/<key>/strzaly` (`GuessManager.tsx` + `useGuessBoard.ts`) keeps the whole `GuessBoardDto` in memory, re-reads it every 5 s while visible and sets `offline` after 3 failed reads (banner „Brak połączenia z serwerem — lista może być nieaktualna…”, `GuessManager.tsx:79-83`). The ranking (`GuessRankingDto`) is self-contained, `rankGuesses` (`src/lib/guesses/ranking.ts:25`) and `placesFromLast` are pure, `RankingReadout.tsx` takes a frozen `GuessRankingDto` and `RankingTable.tsx` takes entries — both reusable as is.
- `/o/<key>/rozsadzenie` (`SeatingEditor.tsx` + `useSeatingBoard.ts`) holds the WORKING arrangement (`SeatingBoardDto`); its `published` field is only `{ snapshotId, publishedAt }` (`src/types.ts:88-102`). The published seats live in `seating_snapshot*` and are read by `getLatestSnapshot(db)` (`src/lib/seating/service.ts:209`) → `SeatingSnapshot { tables (roomName, name, seatCount, shape…), seats (snapshotTableId, seat, guestName) }`; `toTvSeating` (`src/lib/seating/published.ts:103`) shows how a snapshot is projected. No organizer route returns the published seats.
- Browser memory pattern: `createLocalStore` (`src/components/hooks/local-store.ts`) — `useSyncExternalStore`-friendly, untrusted storage parsed by a `parse` function, blocked storage → in-page fallback; fixed keys `kolacja-podwyzkowa:<area>:<role>` (`src/lib/questions/draw-memory.ts:10-11`).
- Build output: rolldown chunks in `/_astro/` import each other as `import{…}from"./x.<hash>.js"`; `/_astro/*` is served `immutable` (`dist/client/_headers`); islands are `<astro-island component-url="/_astro/…" renderer-url="/_astro/…">`. `public/` holds only `favicon.png`; nothing registers a service worker.
- Lint: the base ESLint config is type-checked for every file (`eslint.config.js:17-40`, no `files` filter; `tsconfig.json` includes `**/*`), so a plain service-worker script in `public/` needs its own override like `scriptsConfig`.

## Desired End State

- Every organizer page except the print sheet keeps two localStorage entries fresh on the organizer's device: the latest published seating (`PublishedSeatingDto`) and the whole guess board (`GuessBoardDto`), each with the time of the last successful server read. They are refreshed on load, every 30 s while visible, when the page becomes visible or the browser reports `online`, after every board answer on `/strzaly` and after a publish on `/rozsadzenie`.
- When the server cannot be reached (network error, 8 s timeout, 5xx, browser `offline` event), organizer pages show „Brak połączenia z serwerem. Możesz przełączyć się na hotspot w telefonie — strona połączy się sama.” with „Pokaż ostatni zapisany stan” → a full-screen overlay with the readout; retries every 5 s and the notice disappears by itself once a read succeeds (e.g. on the hotspot).
- The readout (overlay and page): banner „Brak połączenia — pokazuję ostatni zapisany stan. Możesz przełączyć się na hotspot w telefonie.” when offline; „Rozsadzenie” — „Stan z 21:34” (date added when not today), when it was published, „Gdzie siedzi…?” search (case/diacritics-insensitive) → „Ania — Okno, miejsce 4 · Sala duża”, then rooms → tables → every seat in order with the name or „—”; „Strzały i ranking” — „Stan z …”, intake state and „Strzały: 32 z 40” at that time, the correct amount, „Czytaj od końca” (`RankingReadout`) + `RankingTable`, „Brakuje strzałów (N)”; without a cached correct amount a local „Prawidłowa kwota (tylko na tym urządzeniu)” field computes the ranking with `rankGuesses` in memory (never sent).
- `/o/<key>/odczyt` is a data-free organizer page (no guest names or amounts in its HTML) whose island renders the readout from localStorage. On https (and localhost) production builds, organizer pages register `/organizer-sw.js` with scope `/o/<key>`; the worker keeps a complete copy of `/o/<key>/odczyt` and its `/_astro/` files and, when a navigation inside the scope fails (network error, 8 s timeout, 5xx), answers with that copy — so a refresh, a reopened tab or the panel bookmark still shows the last state. API requests are never cached or answered by the worker; a 404 for the readout page drops the cache and unregisters the worker.
- `GET /api/o/<key>/seating/published` → 200 `{ published: PublishedSeatingDto | null }` (organizer only).
- The shell has a card „Odczyt bez sieci” → `/o/<key>/odczyt`.

Verify: `npm test` (unit + integration on the local DB), `npm run lint`, `npx astro check`, `npm run build` green; `npm run smoke` passes against `npm run preview` on a DB without an event (then the server is stopped and `delete from public.event`).

### Key Discoveries:

- `src/lib/seating/published.ts:103-122` — `toTvSeating` sorts tables with `compareTableNames` and seats by number; the organizer projection adds the room name (snapshot `roomName`) and keeps no ids.
- `src/components/hooks/local-store.ts:22` — `createLocalStore(parse, serialize)` gives stable snapshots and the blocked-storage fallback; owner filtering happens after parsing.
- `src/components/hooks/useGuessBoard.ts:72-78` — every successful poll calls `setBoard(data)`, so an effect on `board` sees each confirmed read (the right moment for „Stan z”).
- `src/components/seating/SeatingEditor.tsx:162-170` — `handlePublish` → `publish()` resolves true on 201/200; the place to re-sync the published seating.
- `src/components/guesses/RankingReadout.tsx:66-70` — the readout overlay is `fixed inset-0 z-50`; an offline dialog must sit below it (`z-40`) so „Czytaj od końca” opens on top. Both lock body scroll and restore the previous value, so nesting is safe.
- `dist/client/_astro/GuessManager.*.js` — rolldown chunks start with `import{…}from"./react.<hash>.js"`; the crawler must follow `from"./…"`, `import"./…"` and `import("./…")`.

## What We're NOT Doing

- Any write offline: no queued guesses, no saving the correct amount, no seating edits, no background sync later (PRD Non-Goal). The local correct amount lives only in the page's memory.
- Caching the working (unpublished) arrangement, the neighbour history or pins: the readout shows what the TV and phones show.
- Caching the plan image (up to 5 MB base64 does not fit localStorage) — the seating readout is a text list.
- Offline pages for guests or the TV, offline questions or AI topics (NFR-004: guest and AI features come back with the network).
- Caching any other organizer page or any API response in the service worker; a PWA manifest / installable app; push or background sync.
- A service worker in `npm run dev` or on plain-http LAN addresses (browsers refuse it outside a secure context) — there only the in-page fallback works.
- Browser/E2E tests (no Playwright overnight).

## Implementation Approach

Pure first: the published-seating projection, the cache envelope with deep validation and an owner tag, the readout helpers (grouping, search, local ranking, „Stan z” label) — all unit-tested. Then the one new organizer route with its smoke checks. Then the browser side without a service worker: the cache store, a sync hook that is also the connectivity detector, the readout components and the in-page fallback wired into `/strzaly`, `/rozsadzenie`, the shell and the other organizer pages — this alone covers "the page is open and the network drops". Last, the after-refresh guarantee: the data-free `/o/<key>/odczyt` page, the minimal service worker that serves its cached copy for failed navigations, tested in Node by running the shipped file in `node:vm` with fake `caches`/`fetch`, plus the shell card, smoke and docs.

## Critical Implementation Details

- **Owner tag, not the key.** localStorage key names are fixed (`kolacja-podwyzkowa:odczyt:rozsadzenie`, `kolacja-podwyzkowa:odczyt:strzaly`); each value carries `owner` = an FNV-1a 32-bit hex hash of the organizer API base (`/api/o/<key>`), and readers ignore entries whose owner differs. So a stale entry from another event (e.g. the rehearsal database) never shows under a new organizer link, and the stored value never contains the key itself.
- **„Stan z” is the last confirmed read.** `savedAt` is written by the device clock at the moment a server answer was accepted (every poll and sync, even when nothing changed), not when the data last changed; the label adds the date when it is not today so rehearsal data on 08.11 cannot pass as current.
- **No cache text during SSR/hydration.** Readers use `useSyncExternalStore` with a server snapshot that means "not read yet" (render „Wczytuję zapisany stan…”), so server HTML never depends on storage and the `/odczyt` HTML stays data-free (it is the copy the worker stores).
- **Service worker safety.** Scope `/o/<key>` (no trailing slash, so the shell `/o/<key>` is covered); script at `/organizer-sw.js`, the key never in its URL; the readout URL is derived from `self.registration.scope`. Navigations: network first; fall back to the cached readout ONLY on network error, an 8 s timeout or a 5xx; a 404 is returned as is and triggers forget (delete own caches + `registration.unregister()`). Precache into a NEW cache name and delete the older ones of the same scope only after every file was stored; any failure deletes the new cache and keeps the old complete one. Fallback lookups use `{ ignoreVary: true }`. `/_astro/` GETs are cache-first (content-hashed, immutable), everything else (all `/api/…`, other origins, non-GET) is never answered by the worker. `skipWaiting()` + `clients.claim()` so the first visit is covered. Registration only when `import.meta.env.PROD`, `"serviceWorker" in navigator` and `window.isSecureContext`.
- **Nested overlays.** The offline dialog is `z-40`; `RankingReadout` (`z-50`) opens above it. The dialog does not handle Escape itself (the readout's Escape would close both); it has a visible „Zamknij” button and returns focus to its opener.

## Phase 1: Pure offline domain and types

### Overview

DTOs for the published seating, the projection from a snapshot, the cache envelope with validation, and every pure helper the readout needs — with unit tests.

### Changes Required:

#### 1. Types

**File**: `src/types.ts`

**Intent**: The organizer's view of the published arrangement and the route's answer.

**Contract**:
- `PublishedTableDto { name: string; room: string; shape: TableShape; seatCount: number; seats: TvSeatDto[] /* seated only, seat order */ }`.
- `PublishedSeatingDto { snapshotId: number; publishedAt: string; tables: PublishedTableDto[] /* room name, then table name (numeric-aware, Polish) */ }`.
- `PublishedSeatingResponseDto { published: PublishedSeatingDto | null }`.

#### 2. Snapshot projection

**File**: `src/lib/seating/published.ts` (+ `published.test.ts`), `src/lib/seating/index.ts`

**Intent**: Project the latest snapshot for the organizer's readout (names on seats with the room), next to `toTvSeating`.

**Contract**: `toPublishedSeating(snapshot: SeatingSnapshot | null): PublishedSeatingDto | null` — tables sorted by `compareTableNames(roomName)` then `compareTableNames(name)` then `snapshotTableId`; seats of each table by number; no ids. Tests: null → null; room/table ordering („Stolik 2” before „Stolik 10”); seats sorted; a table without seated guests keeps `seats: []`; deleted guests/tables (null ids) still render by name.

#### 3. Cache envelope

**File**: `src/lib/offline/cache.ts` (+ `cache.test.ts`)

**Intent**: Versioned, owner-tagged, validated localStorage values for the two cached parts.

**Contract**:
- `OFFLINE_SEATING_STORAGE_KEY = "kolacja-podwyzkowa:odczyt:rozsadzenie"`, `OFFLINE_GUESSES_STORAGE_KEY = "kolacja-podwyzkowa:odczyt:strzaly"`, `OFFLINE_CACHE_VERSION = 1`.
- `OfflineEntry<T> { v: 1; owner: string; savedAt: string /* ISO */; data: T }`; `OfflineSeatingEntry = OfflineEntry<PublishedSeatingDto | null>` (null data = nothing published yet), `OfflineGuessesEntry = OfflineEntry<GuessBoardDto>`.
- `offlineOwner(apiBase: string): string` — FNV-1a 32-bit over the UTF-16 code units, 8 lowercase hex chars.
- `serializeOfflineEntry(entry | null): string`; `parseOfflineSeating(raw: string | null): OfflineSeatingEntry | null`; `parseOfflineGuesses(raw: string | null): OfflineGuessesEntry | null` — never throw: bad JSON, other `v`, missing/invalid `owner`/`savedAt` (must parse as a date), or data failing deep validation → null.
- Deep validators (exported, reused for API answers): `isPublishedSeating(value)` (strings, finite integers ≥ 0 / ≥ 1 where meaningful, shape in `round|rectangular`, arrays of objects) and `isGuessBoardData(value)` (intake flag, nullable integer correct amount, `guests`/`missing` items, `ranking` null or `{ correctAmountGrosze, entries[] }` with every `RankingEntryDto` field typed).
- `ownEntry<T>(entry: OfflineEntry<T> | null, owner: string): OfflineEntry<T> | null` — the same object when the owner matches, else null.
- Tests: round trip for both kinds; owner hash deterministic, differs between keys, 8 hex chars; every rejection case above; a ranking entry with a string `place` or a guest with a non-integer amount rejected; `ownEntry` identity.

#### 4. Readout helpers

**File**: `src/lib/offline/readout.ts` (+ `readout.test.ts`), `src/lib/offline/index.ts`

**Intent**: Everything the readout shows, computed without React.

**Contract**:
- `seatingByRoom(seating: PublishedSeatingDto): { room: string; tables: { name; shape; seatCount; seats: { seat: number; name: string | null }[] /* 1..seatCount, null = empty */ }[] }[]` in the DTO's order.
- `normalizeSearch(text)` — lower case, NFD without combining marks, `ł`→`l`, collapsed spaces, trimmed. `findGuestSeats(seating, query): { name; table; room; seat }[]` — names containing the normalized query (empty query → []), sorted by Polish collator then table/seat.
- `offlineRanking(board: GuessBoardDto, localCorrectGrosze: number | null): GuessRankingDto | null` — with a local amount: `{ correctAmountGrosze: local, entries: rankGuesses(<guests with an amount>, local) }`; otherwise `board.ranking`.
- `formatSavedAt(iso: string, now: Date): string` — „Stan z 21:34” on the same local day, else „Stan z 6 listopada, 21:34” (genitive month names, zero-padded minutes, no `Intl`); `formatPublishedAt(iso, now)` — „Opublikowano o 21:05” / „Opublikowano 6 listopada o 21:05”.
- Texts: `OFFLINE_NOTICE` („Brak połączenia z serwerem. Możesz przełączyć się na hotspot w telefonie — strona połączy się sama.”), `OFFLINE_READOUT_BANNER` („Brak połączenia — pokazuję ostatni zapisany stan. Możesz przełączyć się na hotspot w telefonie.”), `LOCAL_AMOUNT_NOTE` („Kwota tylko na tym urządzeniu — nie zapisuje się na serwerze. Po powrocie sieci wpisz ją w „Strzały i ranking”.”), `NO_OFFLINE_STATE` („Na tym urządzeniu nie ma jeszcze zapisanego stanu. Otwórz panel organizatora przy działającej sieci — stan zapisze się sam.”).
- `index.ts` exports the pure modules (`cache`, `readout`).
- Tests: grouping keeps empty seats as null in order; search ignores case and Polish letters („zolc” finds „Żółć”, „lukasz” finds „Łukasz”), multiple matches ordered, empty query; `offlineRanking` equals `board.ranking` without a local amount, ranks only guests with an amount and marks ties (1, 2, 2, 4) with one, guest without a guess left out; `formatSavedAt` same day / other day / midnight padding (dates built with local-time constructors, no clock).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 2: Published seating API

### Overview

One organizer route that returns the latest published arrangement for the cache, with an integration check and HTTP smoke.

### Changes Required:

#### 1. Service

**File**: `src/lib/seating/service.ts`, `src/lib/seating/index.ts`

**Intent**: Read the latest snapshot and project it.

**Contract**: `getPublishedSeating(db: DbClient): Promise<PublishedSeatingDto | null>` = `toPublishedSeating(await getLatestSnapshot(db))`.

#### 2. Route

**File**: `src/pages/api/o/[key]/seating/published.ts`

**Intent**: The organizer's published seating for the offline cache.

**Contract**: `prerender = false`; `GET` starts with `organizerApi(locals)`; 200 `jsonResponse({ published })` (`PublishedSeatingResponseDto`). TV and guest keys get the middleware's JSON 404.

#### 3. Integration test

**File**: `tests/integration/published-seating.test.ts`

**Intent**: The service matches the stored latest snapshot, read-only (no publish, nothing deleted).

**Contract**: `describe.skipIf(!hasLocalDb)`; `getPublishedSeating(db)` deep-equals `toPublishedSeating(await getLatestSnapshot(db))`; when not null: every table has `room`, seats sorted and within `seatCount`, no `id`-like keys (`snapshotTableId`, `tableId`, `guestId`) anywhere in the JSON.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Prove the route and its access at HTTP level.

**Contract**: in section 13 (seating): before the first publish `GET /api/o/<org>/seating/published` → 200, `no-store`, `{ published: null }`; after the first publish → `published.snapshotId` equals the published id, the table „Okno Smoke” with its room and Ania Smoke at her seat, no ids in the body; TV key on `/api/o/<tv>/seating/published` → JSON 404. In a later section where guest keys exist (S-06 or a new S-09 section) a guest key → JSON 404 and the organizer key on `/api/tv/<org>/…`/`/api/g/<org>/…` stays denied (existing pattern).

### Success Criteria:

#### Automated Verification:

- Tests pass (unit + integration on the local DB): `npm test`
- Lint and type check pass: `npm run lint`, `npx astro check`
- Production build succeeds: `npm run build`
- HTTP smoke passes on a DB without an event: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

---

## Phase 3: Cache sync and the in-page offline readout

### Overview

The browser side without a service worker: the cache store, the sync step and hook (also the connectivity detector), the readout components, and the in-page notice + overlay on the organizer pages.

### Changes Required:

#### 1. Cache store

**File**: `src/components/hooks/offline-cache-store.ts` (+ `offline-cache-store.test.ts`)

**Intent**: Read and write the two entries through `createLocalStore`, filtered by owner.

**Contract**: `saveOfflineSeating(apiBase, published: PublishedSeatingDto | null, savedAt: string)`, `saveOfflineGuesses(apiBase, board: GuessBoardDto, savedAt: string)`, `clearOfflineCache(apiBase)` (writes `null` to entries of this owner only); `useOfflineCache(apiBase): { seating: OfflineSeatingEntry | null; guesses: OfflineGuessesEntry | null } | undefined` via `useSyncExternalStore` — `undefined` on the server and during hydration ("not read yet"), stable objects afterwards. Tests (stubbed `window.localStorage` as in `local-store.test.ts`): save → read back; another owner's entry is invisible; corrupted storage → null; blocked storage keeps the value in the page; clear leaves another owner's entry alone.

#### 2. Sync step

**File**: `src/lib/offline/sync.ts` (+ `sync.test.ts`)

**Intent**: One testable read of both parts from the server, with an injected `fetch`.

**Contract**: `readOfflineState(apiBase, fetchFn, signal): Promise<{ status: "ok"; published: PublishedSeatingDto | null; board: GuessBoardDto } | { status: "offline" } | { status: "gone" }>` — `GET <apiBase>/seating/published` and `GET <apiBase>/guesses` in parallel with `cache: "no-store"`; both 200 with valid bodies (`isPublishedSeating` / `isGuessBoardData`) → ok; any 404 → gone; network error, abort, 5xx or an invalid body → offline. Tests with a fake fetch for each branch.

#### 3. Sync hook

**File**: `src/components/hooks/useOfflineSync.ts`

**Intent**: Keep the cache fresh and say whether the server is reachable.

**Contract**: `useOfflineSync(apiBase): { offline: boolean; syncNow: () => void }`. A `setTimeout` chain: read at mount; then every 30 s while visible, every 5 s while offline; read at once on `visibilitychange` (visible) and `online`; `offline` event → offline at once. Each read has an 8 s abort; ok → `saveOfflineSeating` + `saveOfflineGuesses` with `new Date().toISOString()`, offline false; offline → true; gone → `clearOfflineCache`, offline false. One read in flight at a time; cleanup aborts and removes listeners.

#### 4. Readout components

**File**: `src/components/offline/OfflineReadout.tsx`, `OfflineSeating.tsx`, `OfflineRanking.tsx`, `OfflineNotice.tsx`, `OfflineReadoutDialog.tsx`, `OfflineSync.tsx`

**Intent**: Show the cached state; offer it from any organizer page when the server is unreachable.

**Contract**:
- `OfflineReadout { apiBase; offline: boolean }` — `useOfflineCache`; `undefined` → „Wczytuję zapisany stan…”; banner `OFFLINE_READOUT_BANNER` when `offline`; nav links „Rozsadzenie” / „Strzały i ranking” (ids from `useId`, no clash with host pages); both sections or `NO_OFFLINE_STATE` when neither entry exists.
- `OfflineSeating { entry }` — „Rozsadzenie (opublikowane)”, `formatSavedAt`, `formatPublishedAt`; data null → „Nic jeszcze nie opublikowano.”; search field „Gdzie siedzi…?” (label, `type="search"`) with `findGuestSeats` results („<name> — <seatLabel> · <room>”, „Nie znaleziono.” for no match); then `seatingByRoom`: room heading, a card per table („okrągły/prostokątny, N miejsc”) with an ordered list „1. Ania”, empty seats „—”.
- `OfflineRanking { entry }` — „Strzały i ranking”, `formatSavedAt`, „Przyjmowanie było otwarte/zamknięte”, „Strzały: X z Y”; correct amount from the entry, or a local `AmountForm` („Prawidłowa kwota (tylko na tym urządzeniu)”, `LOCAL_AMOUNT_NOTE`); with a cached amount a small „Policz z inną kwotą” toggle opens the same local form, „Wróć do zapisanej kwoty” clears it; `offlineRanking` → „Czytaj od końca” (`RankingReadout` on a frozen copy) + `RankingTable`, or „Brak strzałów do rankingu.”; „Brakuje strzałów (N)” chips with „nieobecny”.
- `OfflineNotice { offline; savedAtLabel: string | null; onOpen }` — nothing when online; else `role="status"` amber box with `OFFLINE_NOTICE`, the newer „Stan z …” and the button „Pokaż ostatni zapisany stan”.
- `OfflineReadoutDialog { apiBase; offline; onClose }` — `role="dialog"`, `aria-modal`, `fixed inset-0 z-40 overflow-y-auto bg-background`, header „Ostatni zapisany stan” + „Zamknij” (focused on open), body scroll locked and restored, focus returned to the opener by the host.
- `OfflineSync { apiBase }` — island for pages without their own integration: `useOfflineSync` + `OfflineNotice` + dialog.

#### 5. Host pages

**File**: `src/components/guesses/GuessManager.tsx`, `src/components/seating/SeatingEditor.tsx`, `src/pages/o/[key].astro`, `src/pages/o/[key]/goscie.astro`, `sale.astro`, `linki.astro`, `pytania.astro`

**Intent**: Write the cache from the pages' own data and show one offline notice per page.

**Contract**:
- `GuessManager`: effect on `[apiBase, board]` → `saveOfflineGuesses(apiBase, board, now)` (every confirmed read or saved answer); `useOfflineSync(apiBase)`; the old offline banner is replaced by `OfflineNotice` with `offline = syncOffline || pollOffline`; the dialog.
- `SeatingEditor`: `useOfflineSync(apiBase)`; after a successful publish `syncNow()`; `OfflineNotice` at the top + the dialog.
- Shell and the other organizer pages (not `karteczki` — print): `<OfflineSync client:load apiBase=… />` right after the header.

#### 6. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: The pages still render and stay data-correct.

**Contract**: existing page checks keep passing; the shell, `/strzaly` and `/rozsadzenie` 200 bodies contain the island (`OfflineSync` or the host island) and no text of `OFFLINE_NOTICE` in SSR (online at render).

### Success Criteria:

#### Automated Verification:

- Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- Build succeeds: `npm run build`
- HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

---

## Phase 4: Readout page, service worker, shell card and docs

### Overview

The after-refresh guarantee: a data-free readout page and a minimal service worker serving its cached copy for failed organizer navigations, tested in Node; the shell card, smoke and docs.

### Changes Required:

#### 1. Readout page

**File**: `src/pages/o/[key]/odczyt.astro`, `src/components/offline/OfflineReadoutPage.tsx`

**Intent**: The page the worker keeps and serves offline; also a way to look at the cached state on purpose.

**Contract**: organizer re-check (`accessFor`, 404 + `NoAccess` otherwise, no `return` in frontmatter); `<main>` with „← Panel organizatora”, `<h1>Odczyt bez sieci</h1>`, one line „Ostatni opublikowany rozkład i ranking zapisane na tym urządzeniu.”; island `OfflineReadoutPage client:load` with `apiBase`, `panelPath`, `readoutPath` only — no DB reads beyond the middleware, no names or amounts in the HTML. The island: `useOfflineSync(apiBase)`; served as a fallback (`location.pathname !== readoutPath`) → offline from the start plus „Spróbuj ponownie” (`location.reload()`); a fallback page whose sync later succeeds → „Połączenie wróciło.” + „Odśwież stronę”; renders `OfflineReadout`.

#### 2. Service worker

**File**: `public/organizer-sw.js`, `eslint.config.js`

**Intent**: Keep a complete copy of the readout page and serve it when an organizer navigation fails.

**Contract** (plain JS, no imports, every handler wrapped so a bug falls back to the network):
- `install` → `skipWaiting()`, `waitUntil(refresh())` (a failed refresh never fails the install); `activate` → `clients.claim()`; `message` `{ type: "refresh" }` → `waitUntil(refresh())` throttled to once per 10 min (in-memory).
- `fetch`: ignore non-GET and other origins; `request.mode === "navigate"` → `respondWith(navigate())`; `pathname` starts with `/_astro/` → `respondWith(caches.match(request, { ignoreVary: true }) || fetch(request))`; everything else not answered (all `/api/…`).
- `navigate()`: `fetch(request)` raced against 8 s; ok/3xx/4xx except 404 → returned (+ throttled `refresh()` in `waitUntil` after a 2xx); 404 → returned + `forget()`; error, timeout or 5xx → the cached readout (`caches.match(readoutUrl, { ignoreVary: true })`) or, when none, the original error/response.
- `readoutUrl = <registration.scope without trailing slash> + "/odczyt"`; cache names `"kolacja-odczyt|" + scope + "|" + Date.now()`.
- `refresh()`: fetch the readout with `cache: "no-store"`; 404 → `forget()`; not ok → keep the old cache; else open a new cache, store the page, collect `/_astro/` URLs from `src|href|component-url|renderer-url|before-hydration-url` attributes, then each file (reuse an existing cached copy, else fetch — must be ok) is stored and, for `.js`, its `from"./…"`, `import"./…"`, `import("./…")` specifiers are queued (resolved against `/_astro/`, at most 200 files); any failure → delete the new cache, keep the old; success → delete the scope's other caches.
- `forget()`: delete this scope's caches and `self.registration.unregister()`.
- ESLint: an override for `public/**/*.js` like `scriptsConfig` — `tseslint.configs.disableTypeChecked`, `sourceType: "script"`, service-worker globals (`self`, `caches`, `fetch`, `Response`, `URL`, `setTimeout`, `clearTimeout`, `Promise`).

#### 3. Registration

**File**: `src/components/hooks/offline-worker.ts`, `src/components/hooks/useOfflineSync.ts`

**Intent**: Register the worker for the organizer's own scope from every page that syncs.

**Contract**: `registerOrganizerWorker(apiBase)` — once per page (module flag); only when `import.meta.env.PROD`, `"serviceWorker" in navigator` and `window.isSecureContext`; `register("/organizer-sw.js", { scope: "/o/<key>" })` (scope derived from `apiBase` by dropping `/api`); then `navigator.serviceWorker.ready` → `active.postMessage({ type: "refresh" })`; every error swallowed. `useOfflineSync` calls it on mount.

#### 4. Service worker tests

**File**: `tests/sw/organizer-sw.test.ts`, `tests/sw/fixtures/` (readout HTML with an `<astro-island>`, a stylesheet link, and three chunks shaped like the real rolldown output, including `import"./…"` and `import("./…")`)

**Intent**: Run the shipped `public/organizer-sw.js` in `node:vm` with a fake `self` (captured listeners, `registration.scope`, `skipWaiting`, `clients.claim`, `registration.unregister`), a Map-backed `caches` (`open`, `keys`, `delete`, `match` across caches with `ignoreVary`), a scripted `fetch`, and Node's `Request`/`Response`/`URL`; dispatch synthetic install, message and fetch events.

**Contract** (cases): install precaches the readout and the whole `/_astro/` closure (all three import forms, CSS, renderer); non-GET, cross-origin and `/api/…` requests get no `respondWith`; a navigation answered 200 passes through untouched; network error, timeout (fake timers, 8 s) and 503 serve the cached readout; with no cached readout a failed navigation rejects/returns the network result; a 404 navigation is returned and drops the caches + unregisters; `/_astro/` served from cache without network; a refresh that fails midway (one chunk 500) keeps the previous complete cache and leaves no partial cache; a successful refresh replaces the old cache; message refresh is throttled; another scope's caches are never touched.

#### 5. Shell card

**File**: `src/pages/o/[key].astro`

**Intent**: Make the readout discoverable before the evening.

**Contract**: card „Odczyt bez sieci” → `/o/<key>/odczyt`, description „Ostatni opublikowany rozkład i ranking strzałów zapisane na tym urządzeniu — działa także bez internetu.”

#### 6. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Page, worker file and shell card at HTTP level.

**Contract**: a new S-09 section with guesses and a publish already present: `/o/<org>/odczyt` 200, `no-store`, contains „Odczyt bez sieci” and the island, and none of the guest names or amounts used earlier; TV key and a guest key → the identical 404 denial body; `/organizer-sw.js` 200 with a JavaScript content type and neither the organizer nor TV key in it; the shell links `/o/<org>/odczyt`; guest key on `/api/o/<g>/seating/published` → JSON 404.

#### 7. Docs

**File**: `CLAUDE.md`

**Intent**: Record the S-09 contracts.

**Contract**: an "Offline readout (S-09)" data-access entry: storage keys and the owner-tagged envelope, `PublishedSeatingDto` + route, who writes the cache and when, `useOfflineSync` (connectivity + cadence), the readout components, `/o/<key>/odczyt` (data-free), the worker (scope, what it caches, fallback rules, secure-context only, prod only, `tests/sw/`), and the lint override.

### Success Criteria:

#### Automated Verification:

- Lint, type check and tests pass (incl. `tests/sw/`): `npm run lint`, `npx astro check`, `npm test`
- Build succeeds and ships the worker: `npm run build` and `dist/client/organizer-sw.js` exists
- HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

#### Manual Verification:

- On the organizer's phone and laptop over https (or `http://localhost` with `npm run preview`), with demo data (40 guests, published seating, guesses, correct amount): open the panel, `/rozsadzenie` and `/strzaly` online; turn Wi-Fi off (or block the network in dev tools): within ~10 s the notice with the hotspot hint appears; „Pokaż ostatni zapisany stan” shows the published seating (search „ania” finds her seat) and the ranking; „Czytaj od końca” works; REFRESH the page and reopen the panel bookmark → the readout appears with „Stan z HH:MM”; without a correct amount typed before the outage, type one locally → ranking appears; turn the network back (or switch to a phone hotspot) → the notice disappears and pages work again. Over plain-http LAN addresses only the in-page fallback works (no worker) — expected.

---

## Testing Strategy

### Unit Tests:

- Projection: ordering, seats, empty tables, deleted ids.
- Cache envelope: round trip, owner tag, every rejection (JSON, version, owner, date, deep shape).
- Readout helpers: grouping with empty seats, diacritics-insensitive search, local ranking with ties, „Stan z” labels.
- Store: owner filtering, corruption, blocked storage, clear scope.
- Sync step: ok, offline (error, abort, 5xx, invalid body), gone (404).
- Service worker in `node:vm`: precache closure, pass-through rules, fallback triggers, 404 forget, atomic refresh, throttle, scope isolation.

### Integration Tests:

- `getPublishedSeating` equals the projection of the latest snapshot; no ids in the JSON.

### Manual Testing Steps:

1. Online: open the panel, „Rozsadzenie” and „Strzały i ranking”; open „Odczyt bez sieci” — it shows the same state with „Stan z <now>”.
2. Network off: notice → overlay → seating search, ranking, readout from the last place.
3. Network off + refresh / bookmark: the readout page is served by the worker.
4. Network back (hotspot): the notice disappears without reloading.

## Performance Considerations

- Sync: two small GETs every 30 s from one organizer device (≈ 6 tiny queries); `/strzaly` additionally writes ~15 KB to localStorage per 5 s poll — negligible.
- Worker: one extra HTML GET of the readout page per 10 min at most (plus only new hashed files after a deploy); navigations go to the network first, so online behaviour and latency are unchanged.

## Migration Notes

- No schema change. Removing the feature: delete the files; browsers drop the worker on the next 404 of the readout page (or when the user clears site data).

## References

- PRD: `context/foundation/prd.md` (NFR-004, US-04, FR-020, Guardrails, Non-Goals)
- Ranking contract for S-09: `context/archive/2026-10-27-guesses-and-ranking/plan.md` (Desired End State, `GuessRankingDto`)
- Snapshots: `context/archive/2026-10-27-manual-seating-on-tv/plan.md`, `src/lib/seating/published.ts`
- Local store pattern: `src/components/hooks/local-store.ts`, `src/lib/questions/draw-memory.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pure offline domain and types

#### Automated

- [x] 1.1 Unit tests pass: `npm test`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Type check passes: `npx astro check`

### Phase 2: Published seating API

#### Automated

- [ ] 2.1 Tests pass (unit + integration on the local DB): `npm test`
- [ ] 2.2 Lint and type check pass: `npm run lint`, `npx astro check`
- [ ] 2.3 Production build succeeds: `npm run build`
- [ ] 2.4 HTTP smoke passes on a DB without an event: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

### Phase 3: Cache sync and the in-page offline readout

#### Automated

- [ ] 3.1 Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- [ ] 3.2 Build succeeds: `npm run build`
- [ ] 3.3 HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

### Phase 4: Readout page, service worker, shell card and docs

#### Automated

- [ ] 4.1 Lint, type check and tests pass (incl. `tests/sw/`): `npm run lint`, `npx astro check`, `npm test`
- [ ] 4.2 Build succeeds and ships the worker: `npm run build` and `dist/client/organizer-sw.js` exists
- [ ] 4.3 HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

#### Manual

- [ ] 4.4 On the organizer's phone and laptop (https or localhost preview): network off → notice, overlay readout (search, ranking, „Czytaj od końca”), refresh and bookmark serve the readout page, local correct amount, network back → notice disappears
