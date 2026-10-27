# Personal guest links, QR cards and the live seat view Implementation Plan

## Overview

Roadmap S-05 (`guest-links-and-seat-view`, PRD US-03, FR-011, FR-012, FR-013, NFR-003, NFR-008, NFR-009). Every guest gets an unguessable personal key. The organizer gets a "Linki gości i karteczki" page (copy each guest's link, turn guest access on/off, revoke a link and issue a new one) and an A4 print view of cards (display name + personal QR + a short Polish instruction). A guest opening `/g/<key>` on the phone sees their display name, table, room and seat in the latest PUBLISHED arrangement, refreshed by polling within ≤ 5 s after a publish. The page is structured so S-06 (guesses), S-07 (question draw) and S-08 (AI topics) add their own sections below without rework.

## Current State Analysis

- Access (F-01): `src/lib/access/` — `generateAccessKey` / `isWellFormedAccessKey` (18 bytes, base64url, 24 chars), `parseAccessPath` already maps `/g/<key>` and `/api/g/<key>/…` to role `"guest"`, `guestPath(key)` exists. `resolveAccess(db, "guest", key)` returns `null` (`src/lib/access/resolve.ts:66-67`), so every guest path is denied today. `Access = OrganizerAccess | TvAccess`; `accessFor(locals, role)` narrows. `src/middleware.ts` handles every role the same way (no change needed beyond the resolver).
- Denials: `NoAccess.astro` (also `404.astro`); smoke §7 asserts the bodies of all `/o/`, `/tv/`, `/g/` denials are identical (`deniedBodies.size === 1`, `scripts/smoke.mjs:156`).
- Guests (S-01): `public.guest(id, event_id, display_name, is_absent, group_id, created_at)`; inserted by `addGuests` and directly by test helpers (`tests/integration/helpers.ts:createTestSeating`). `getGuestList` selects explicit columns (`GUEST_COLUMNS`), so a new column never leaks into `GuestListDto`.
- Event (F-01): singleton `public.event(id=1, name, organizer_key, tv_key, created_at)`; no guest-access flag yet.
- Published seating (S-03): `seating_snapshot` (id = version), `seating_snapshot_table` (`name`, `room_name`, `seat_count`, `shape`, `pos_x`, `pos_y`), `seating_snapshot_seat` (`snapshot_id`, `snapshot_table_id`, `seat`, `guest_id`, `guest_name`); absent guests are never in a snapshot. `getSeatingVersion(db)` = two tiny queries (`latestSnapshotRow`, `planVersion`), token `"<snapshot id>.<plan version>"` (`seatingVersion` in `src/lib/seating/published.ts`). The TV endpoint `src/pages/api/tv/[key]/seating.ts` is the polling pattern (`?since` → 204 / 200, `MAX_VERSION_LENGTH = 64`); `useTvSeating` is the client pattern (2.5 s `setTimeout` chain, 4 s abort, keep last state on errors).
- Plan image: `planImageResponse(db)` (`src/lib/venue/image-response.ts`), `planImagePath(apiBase, version)` and `fractionStyle` (`src/lib/venue/pin.ts`); pins are fractions of the rendered `<img>` (wrapper `relative`, img `block w-full h-auto`).
- Organizer shell `src/pages/o/[key].astro` lists "Linki gości i karteczki" under `upcomingSections` ("Wkrótce"); it builds absolute links with `new URL(path, Astro.url).href`.
- Patterns: `organizerApi(locals)` (`src/lib/organizer-api.ts`), `jsonResponse` / `jsonError` / `readJsonBody` (`astro/zod` `strictObject`) / `parseId` (`src/lib/http.ts`), islands with a hook that replaces state with every answer (`src/components/hooks/useGuestList.ts`, `api-failure.ts`), integration tests touching only their own rows (`tests/integration/helpers.ts`), HTTP smoke on the production preview.
- Local DB: `pgcrypto` is installed in schema `extensions` (`extensions.gen_random_bytes` works); the DB currently has no event (smoke precondition).
- Runtime: Cloudflare Workers free plan ≈ 10 ms CPU per request; up to 60 phones polling (NFR-002).

## Desired End State

- `public.guest.access_key` — every guest (existing ones backfilled, every new row) has a unique 24-char base64url key; `public.event.guest_access_enabled` (default `false`).
- `/g/<guestKey>` with guest access ON: a mobile-first Polish page — event name, "Cześć, <name>!", a big seat card "Twój stolik: <table> · Sala: <room> · Miejsce: <n>" (or a friendly message when nothing is published yet or the guest has no seat in the published arrangement), an optional "Pokaż na planie" that loads the plan image on demand with the guest's table highlighted. It polls `GET /api/g/<key>/state?since=<version>` every 2.5 s (immediately when the tab becomes visible again) and shows a new publish within ≤ 5 s; on 404 (access turned off, link revoked) it clears the data and shows the no-access message.
- With access OFF, a revoked/unknown/malformed key or another role's key: the same 404 no-access page (or JSON 404 `{"error":"Brak dostępu"}`), no data. A guest key never opens `/o/…`, `/tv/…`, `/api/o/…`, `/api/tv/…`.
- `/o/<organizerKey>/linki`: guest-access switch (confirmation before turning it off), every guest with their personal link, "Kopiuj" (clipboard with a select-the-field fallback), "Unieważnij link" (confirmation naming the guest), "Drukuj karteczkę" (one card) and "Drukuj karteczki" (all); a warning when the page origin is localhost/127.0.0.1.
- `/o/<organizerKey>/karteczki` (optionally `?guest=<id>`): A4 print view, 2 × 4 cards per page with cut lines — display name, a working QR code of the personal link (generated in the browser), a short instruction and the link as text.
- The organizer shell card "Linki gości i karteczki" links to `/o/<key>/linki` with a summary ("Dostęp gości: włączony · 38 linków").
- APIs: organizer `GET|PATCH /api/o/<key>/guest-links` (`PATCH { enabled }`), `POST /api/o/<key>/guest-links/<id>/revoke` (all answer with the whole `GuestLinksDto`); guest `GET /api/g/<key>/state?since=` (204 / 200 `GuestStateDto`), `GET /api/g/<key>/plan/image`.

Verify: `npm test` (unit + integration on the local DB), `npm run lint`, `npx astro check`, `npm run build` green; `npm run smoke` passes against `npm run preview` on a DB without an event (server stopped and `delete from public.event` afterwards); `qrcode` does not appear in `dist/server`.

### Guest access contract (for S-06, S-07, S-08)

- **Identity** = the key in the path. `resolveAccess(db, "guest", key)` returns `GuestAccess { role: "guest"; event: { id, name }; guest: { id, displayName } }` only when the key belongs to a guest AND `event.guest_access_enabled` is true; it carries no organizer/TV key and no guest key.
- **API routes** live under `src/pages/api/g/[key]/…` and start with `const api = guestApi(locals); if (api instanceof Response) return api;` (`src/lib/guest-api.ts`, mirrors `organizerApi`). The current guest is `api.access.guest.id` — never take a guest id from the body, query or params.
- **Page**: `src/pages/g/[key].astro` renders `<main>` with stacked `<section>`s; S-05's seat island is the first. Later slices add their own island (under `src/components/guest/`) as a new `<section>` below, with `apiBase = /api/g/<key>`.
- **Live state**: `GET /api/g/<key>/state?since=<version>` → 204 when unchanged, else 200 `GuestStateDto { version, name, seat }`. The version token is opaque (`guestStateVersion(seatingVersion, name)`); a later slice that needs live guest state (e.g. S-06 "strzały zamknięte") may add a field to `GuestStateDto` and a part to the token rather than starting a second poll.
- A 404 from any guest API means access is gone (off or revoked): sections hide their data.

### Key Discoveries:

- `src/lib/access/paths.ts:15-28` already parses `/g/<key>` and `/api/g/<key>/…`; `src/middleware.ts` needs no change once `resolveAccess` resolves guests.
- `src/db/database.types.ts` has `guest_event_id_fkey` and the snapshot relationships, so supabase-js can embed `event(...)` into a guest query and `seating_snapshot_table(...)` into a seat query — the middleware lookup stays ONE round trip.
- `tests/integration/helpers.ts:createTestSeating` inserts guests directly; a DB column default keeps that (and `addGuests`) working without code changes.
- Smoke §7 compares denial bodies across roles: any guest-specific wording must go into the shared `NoAccess` text.
- `client:load` islands are also rendered on the server: QR generation must never run during render (only in the browser), or 40 codes would run on the Worker and pull `qrcode` into the server bundle.
- `navigator.clipboard` is undefined on non-secure origins (`http://192.168.x.x:4321` during phone tests): copy needs a fallback.

## What We're NOT Doing

- Showing seatmates or the whole plan with names on the guest page (the TV shows them); the guest sees only their own seat (+ their table highlighted on the plan image, on demand).
- Distinguishing "absent" from "not seated" on the guest page (both are "no seat in the published arrangement"; the snapshot does not carry absences).
- Sending links from the app (PRD Non-Goal), "copy all links", bulk revoke, a QR on the TV.
- Guesses (S-06), question draw (S-07), AI topics (S-08), offline (S-09) — only the page structure for them.
- An organizer guest link ("to ja") — PRD: the organizer does not need a guest link.
- Server-side QR rendering, PNG/PDF export of cards (the browser's print dialog does PDF).
- Browser/E2E tests (no Playwright overnight), Supabase Realtime.

## Implementation Approach

Schema first (key column with a pgcrypto default, access flag), then the access layer (guest resolver in one embedded query, `guestApi`, shared NoAccess hint) with integration tests of the access matrix. A service module `src/lib/guest-links/` owns the organizer side (links list, switch, revoke) and the guest side (cheap state read from the latest snapshot, version token); pure helpers are unit-tested. Thin routes map statuses to HTTP; smoke covers the whole guest access matrix. The organizer pages reuse the island + hook pattern; the card sheet is server-rendered Astro with QR SVGs filled in by a client-only script. The guest page is SSR + one polling island.

## Critical Implementation Details

- **One lookup per guest request.** The guest resolver selects the guest by `access_key` with `event(id, name, guest_access_enabled)` embedded and denies in TS when the flag is false. The 204 poll path then costs only `getSeatingVersion` (two tiny queries). The 200 path reads the guest's own `seating_snapshot_seat` row of the latest snapshot (filtered by `snapshot_id` and `guest_id`, `seating_snapshot_table` embedded) — never `getLatestSnapshot`, which loads every table and seat.
- **QR stays in the browser.** The card sheet HTML (names, instruction, link text) is rendered by Astro; a client-only script (an Astro `<script>`, or a `client:only="react"` island) fills each `[data-qr]` placeholder with an SVG built from `QRCode.create(url, { errorCorrectionLevel: "M" })`. Nothing imported by a server-rendered module may import `qrcode`. Check after build: `grep -rl "qrcode" dist/server` finds nothing.
- **Identical denials.** Access off, revoked, unknown, malformed and cross-role keys all go through the middleware's single `denied` branch; the guest page and guest APIs re-check `accessFor(locals, "guest")` and render `<NoAccess />` / JSON 404 the same way.
- **Polling on phones.** Mobile browsers freeze background timers: the hook pauses while `document.hidden` and polls immediately on `visibilitychange` → visible (cancelling the pending timer, one request at a time). A 404 clears the shown state (PRD: no data); network errors and timeouts keep the last state.

## Phase 1: Schema and guest access

### Overview

Personal keys and the guest-access switch in the DB; guest keys resolved by the middleware; the `guestApi` prelude; the shared no-access hint; integration tests of the guest access matrix.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261027040000_guest_links.sql`

**Intent**: Give every guest a unique personal key (backfilled for existing rows, defaulted for new ones) and add the guest-access switch to the event (off by default).

**Contract**:
- `create extension if not exists pgcrypto with schema extensions;` (idempotent).
- `public.guest.access_key text not null default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')` — 24 chars, 144 bits; adding the column with a volatile default fills existing rows with distinct values. Constraint `guest_access_key_format check (access_key ~ '^[A-Za-z0-9_-]{24}$')`, unique index `guest_access_key_key on public.guest (access_key)`.
- `public.event.guest_access_enabled boolean not null default false`.
- Header comment explaining the contract (revoke = new key written by the app, old link dead immediately; denial reasons are indistinguishable). Privileges are already revoked from `anon`/`authenticated` on both tables.

#### 2. DB types and DTO types

**File**: `src/db/database.types.ts`, `src/types.ts`

**Intent**: Mirror the new columns; add the guest-facing and organizer-facing DTOs.

**Contract**:
- `guest`: `Row.access_key: string`, `Insert.access_key?: string`, `Update.access_key?: string`; `event`: `Row.guest_access_enabled: boolean`, optional in `Insert`/`Update`.
- `src/types.ts`: `GuestLinkDto { id; displayName; key }`, `GuestLinksDto { enabled: boolean; guests: GuestLinkDto[] }` (Polish alphabetical order, organizer only); `GuestSeatDto { table: string; room: string; seat: number; shape: TableShape; seatCount: number; x: number; y: number }`; `GuestStateDto { version: string; name: string; status: "unpublished" | "unseated" | "seated"; seat: GuestSeatDto | null; planVersion: number | null }` (no ids, no keys).

#### 3. Guest resolver

**File**: `src/lib/access/resolve.ts`, `src/lib/access/index.ts`

**Intent**: Grant guest paths for a well-formed key of an existing guest while guest access is on.

**Contract**: new `GuestAccess { role: "guest"; event: { id: number; name: string }; guest: { id: number; displayName: string } }`; `Access = OrganizerAccess | TvAccess | GuestAccess`. `case "guest"`: one query `from("guest").select("id, display_name, event(id, name, guest_access_enabled)").eq("access_key", key).maybeSingle()`; error → `AccessLookupError`; no row or flag false → `null`. Update the header comment. Export `GuestAccess`.

#### 4. Guest API prelude

**File**: `src/lib/guest-api.ts`

**Intent**: The second, role-specific check of guest API routes and the documented way to get the current guest.

**Contract**: `guestApi(locals: App.Locals): { access: GuestAccess; db: DbClient } | Response` — 404 `{"error":"Brak dostępu"}` when `accessFor(locals, "guest")` is null, 503 when the DB is not configured (same as `organizerApi`).

#### 5. Shared no-access hint

**File**: `src/components/NoAccess.astro`

**Intent**: Help a guest whose card does not work (access still off, link replaced) without telling denials apart.

**Contract**: keep the existing sentence (smoke `NO_ACCESS_TEXT`); add one sentence for everyone, e.g. „Masz karteczkę lub link od organizatora? Dostęp gości może być jeszcze wyłączony albo link został wymieniony — zapytaj organizatora.” No event data.

#### 6. Integration tests

**File**: `tests/integration/guest-access.test.ts` (and the shared helpers in `tests/integration/helpers.ts`)

**Intent**: Prove keys exist and the access matrix holds against the local DB.

**Contract**: (a) a guest inserted without a key gets a well-formed key, two guests get different keys, a duplicate key and a malformed key are refused by the DB; (b) `resolveAccess(db, "guest", key)` → `null` while access is off, `GuestAccess` with the guest's id/name when on, `null` for an unknown key, a malformed key, the organizer key and the TV key; `decideAccess` grants `/g/<key>` and `/api/g/<key>/state` only when on; the guest key on `/o/<key>` and `/tv/<key>` is denied; (c) anon REST cannot read `guest.access_key` or `event.guest_access_enabled`. Helpers `getGuestAccessEnabled` / `setGuestAccessEnabledForTest` restore the original flag in `afterEach`; tests delete only their own guests.

### Success Criteria:

#### Automated Verification:

- Migration applies on the local DB: `npx supabase migration up`
- Unit and integration tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 2: Guest link and guest state services

### Overview

The organizer side (links list, access switch, revoke) and the guest side (the guest's own published seat, the polling token) as services over `DbClient`, plus pure helpers (state mapping, version token, links, shell summary, QR path) with unit tests.

### Changes Required:

#### 1. Dependencies

**File**: `package.json`, `package-lock.json`, `context/foundation/overnight-log.md`

**Intent**: QR encoding for the cards and an automated "the QR really decodes" check.

**Contract**: `qrcode` (dependency) + `@types/qrcode` (dev) + `jsqr` (dev, round-trip test only). Log each under "## Dodane zależności".

#### 2. Pure helpers

**File**: `src/lib/guest-links/state.ts`, `src/lib/guest-links/links.ts`, `src/lib/guest-links/summary.ts`, `src/lib/guest-links/qr.ts` (+ `*.test.ts`)

**Intent**: Everything decidable without the DB.

**Contract**:
- `state.ts`: `guestStateVersion(seatingVersion: string, name: string): string` — `"<seating version>.<FNV-1a 32-bit of the name, base36>"`, ≤ 64 chars; `toGuestState({ snapshotId, planVersion, name, seatRow })` → `GuestStateDto` (`unpublished` when no snapshot, `unseated` when the guest has no row in it, `seated` with the snapshot table's name/room/shape/seat count/pin); Polish texts `guestSeatHeadline`/messages for the three states (e.g. „Organizator jeszcze nie opublikował rozsadzenia.”, „Nie masz miejsca w aktualnym rozkładzie — zapytaj organizatora.”).
- `links.ts`: `guestUrl(origin: string, key: string)` (uses `guestPath`), `isLocalOrigin(origin)` (localhost, 127.0.0.1, `[::1]`).
- `summary.ts`: `formatGuestLinksSummary({ enabled, guestCount })` → „Dostęp gości: włączony · 38 linków” / „Dostęp gości: wyłączony · …” / no guests (uses `pluralPl`).
- `qr.ts` (browser-only consumer, but pure): `qrMatrix(text)` → `{ size, isDark(x, y) }` from `QRCode.create(text, { errorCorrectionLevel: "M" })`; `qrSvgPath(matrix, quietZone = 4)` → one `d` string of unit squares; `qrViewBox(matrix, quietZone)`. Test: rasterize the path for a real guest URL into RGBA and decode it with `jsqr` → the same URL; quiet zone and module count checks.

#### 3. Services

**File**: `src/lib/guest-links/service.ts`, `src/lib/guest-links/index.ts`

**Intent**: DB reads/writes for the links page and the guest state.

**Contract**:
- `getGuestLinks(db)` → `GuestLinksDto` (event flag + guests `id, display_name, access_key`, Polish alphabetical order like `getGuestList`).
- `setGuestAccess(db, enabled)` → `GuestLinksDto`.
- `revokeGuestKey(db, guestId)` → `{ status: "revoked"; key } | { status: "not-found" }`: update with a fresh `generateAccessKey()`; on unique violation (23505) retry once with a new key.
- `getGuestState(db, guest: { id; displayName })` → `GuestStateDto`: latest snapshot row (one row) + plan version + the guest's own `seating_snapshot_seat` row of that snapshot with `seating_snapshot_table(name, room_name, seat_count, shape, pos_x, pos_y)` embedded.
- `getGuestStateVersion(db, name)` → `guestStateVersion(await getSeatingVersion(db), name)`.
- `index.ts` exports services and the server-safe pure helpers; it must NOT re-export `qr.ts` (keeps `qrcode` out of the server bundle).

#### 4. Integration tests

**File**: `tests/integration/guest-links.test.ts`

**Intent**: Services against the local DB.

**Contract**: links list contains the test's guests with their keys, sorted; `setGuestAccess` flips the flag (restored afterwards); revoke returns a new key, the old key no longer resolves, unknown id → `not-found`; guest state: with a test-published snapshot the seated guest gets `seated` with table/room/seat, an unseated test guest gets `unseated`, the version token changes after a new publish and after a rename and stays equal otherwise (test snapshots deleted afterwards, as in `tests/integration/seating.test.ts`); `unpublished` is covered by the unit tests (the shared DB may already hold snapshots).

### Success Criteria:

#### Automated Verification:

- Unit and integration tests pass (incl. the QR decode round trip): `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 3: Organizer links API, guest state API and HTTP smoke

### Overview

Thin routes over the services and the guest access matrix in the HTTP smoke.

### Changes Required:

#### 1. Organizer routes

**File**: `src/pages/api/o/[key]/guest-links.ts`, `src/pages/api/o/[key]/guest-links/[id]/revoke.ts`

**Intent**: Links list, access switch and revoke for the organizer.

**Contract**: `GET` → 200 `GuestLinksDto`; `PATCH { enabled: boolean }` (`z.strictObject`) → 200 `GuestLinksDto`, bad body 400 „Nieprawidłowe dane.”; `POST …/<id>/revoke` → 200 `GuestLinksDto`, unknown/malformed id 404 „Nie znaleziono gościa.”. All start with `organizerApi(locals)`.

#### 2. Guest routes

**File**: `src/pages/api/g/[key]/state.ts`, `src/pages/api/g/[key]/plan/image.ts`

**Intent**: The guest polling endpoint and the plan image for the on-demand highlight.

**Contract**: `GET /state?since=<version>` — `guestApi(locals)`; `since` (≤ 64 chars) equal to `getGuestStateVersion(db, name)` → 204 with no body, else 200 `GuestStateDto`. `GET /plan/image` → `planImageResponse(db)`.

#### 3. HTTP smoke

**File**: `scripts/smoke.mjs`

**Intent**: The guest access matrix at HTTP level on the production preview.

**Contract**: new §17 (after §16; state at that point: Ania Smoke and Ola Smoke both seated in the latest snapshot at "Okno Smoke"): `GET /api/o/<org>/guest-links` → `enabled: false`, both guests with well-formed distinct keys, no-store; the TV key on `guest-links` GET/PATCH/revoke → 404; guest key with access OFF → `/g/<key>` 404 with the identical no-access body (added to the §7 body set comparison or compared to a stored §7 body) and `/api/g/<key>/state` JSON 404; `PATCH { enabled: true }` → `enabled: true`; `/api/g/<ania>/state` → 200 `seated` at "Okno Smoke" with her seat, no-store, no ids/keys of anyone (`organizerKey`, `tvKey`, the other guest's key and name, `"id"`, `"guestId"`, `"tableId"`); `?since=<version>` → 204; organizer moves Ania and publishes → the old version gives 200 with the new seat; unpublished move → still 204; revoke Ania → old key page 404 / API 404, new key 200; `PATCH { enabled: "yes" }` → 400; unknown guest revoke → 404; guest key on `/o/<g>`, `/tv/<g>`, `/api/o/<g>/guests`, `/api/tv/<g>/seating` → 404; organizer and TV keys on `/api/g/<…>/state` → 404; `/api/g/<g>/plan/image` follows the plan (200 image when a plan exists, else 404 JSON); `PATCH { enabled: false }` → `/g/<g>` 404 again. Leaves guest access OFF at the end.

### Success Criteria:

#### Automated Verification:

- Lint and type check pass: `npm run lint`, `npx astro check`
- Tests pass: `npm test`
- Production build succeeds: `npm run build`
- HTTP smoke passes on a DB without an event: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

---

## Phase 4: Organizer links page, card sheet and shell card

### Overview

The organizer UI: the links page (switch, copy, revoke), the A4 card sheet with QR codes generated in the browser, and the shell card.

### Changes Required:

#### 1. Links page

**File**: `src/pages/o/[key]/linki.astro`, `src/components/guest-links/GuestLinksManager.tsx`, `src/components/hooks/useGuestLinks.ts`

**Intent**: Copy each guest's link, switch guest access, revoke a link, open the print view.

**Contract**: SSR with `getGuestLinks` and `origin = Astro.url.origin`; the island shows the access switch (state in words + button „Włącz dostęp gości” / „Wyłącz dostęp gości”; turning off asks `window.confirm` that open phones lose access), a localhost warning (`isLocalOrigin`), „Drukuj karteczki” → `/o/<key>/karteczki`, and per guest: name, read-only link field, „Kopiuj” (Clipboard API; without it or on failure select the field and say „Zaznaczono link — skopiuj go ręcznie.”; visible „Skopiowano”), „Unieważnij link” (confirm „<name> dostanie nowy link; stara karteczka przestanie działać.”), „Drukuj karteczkę” → `/o/<key>/karteczki?guest=<id>`. The hook replaces state with every `GuestLinksDto` answer (pattern `useGuestList`), uses `api-failure.ts`. Empty list → link to the guest page.

#### 2. Card sheet

**File**: `src/pages/o/[key]/karteczki.astro`, `src/components/guest-links/qr-cards.ts` (client script module)

**Intent**: A4 print view of personal cards with working QR codes.

**Contract**: SSR renders the cards (Polish alphabetical; `?guest=<id>` → that guest only, unknown id → message + link back), each with the display name, an empty `[data-qr="<url>"]` element, „Zeskanuj kod aparatem telefonu, żeby zobaczyć swoje miejsce przy stole.” and the link as small text; screen-only toolbar („Drukuj” → `window.print()`, back link, localhost warning, a note that access must be ON for the codes to work). Print CSS: `@page { size: A4; margin: 10mm }`, 2 columns × 4 rows of ~90 × 65 mm cards with dashed cut borders, `break-inside: avoid`, toolbar hidden under `print`. A client `<script>` imports `qr-cards.ts`, which fills each placeholder with an `<svg>` built from `qrMatrix`/`qrSvgPath`/`qrViewBox` (~40 mm square, `shape-rendering="crispEdges"`).

#### 3. Shell card

**File**: `src/pages/o/[key].astro`

**Intent**: Replace the "Wkrótce" entry with a real card.

**Contract**: card „Linki gości i karteczki” → `/o/<key>/linki`, description „Osobiste linki, kody QR do druku i włącznik dostępu gości.”, summary `formatGuestLinksSummary` (one extra light query: `getGuestLinks` or the flag + guest count already on the board).

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Page-level checks.

**Contract**: `/o/<org>/linki` 200, no-store, contains both guest names and their `/g/<key>` links; TV key → 404 without names; `/o/<org>/karteczki` 200 with names, `data-qr` placeholders carrying the full `/g/<key>` URLs and no inline QR SVG computed on the server; `?guest=<id>` shows one name only; shell shows the card with the summary and no longer lists it as "Wkrótce".

### Success Criteria:

#### Automated Verification:

- Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- Build succeeds and `qrcode` is not in the server bundle: `npm run build` then `grep -rl "qrcode" dist/server` finds nothing
- HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

#### Manual Verification:

- On a laptop: `/o/<key>/linki` — turn guest access on/off (confirmation when turning off), copy a link (works on https/localhost; on `http://<LAN IP>` the field gets selected), revoke a link (confirmation, new link appears); `/o/<key>/karteczki` → print preview: A4, 8 cards per page, cut lines, names readable, QR codes scan with a phone camera and open the guest page; a single-card print after a revoke works.

---

## Phase 5: Guest page with live seat view, and docs

### Overview

The guest's phone page with the polling seat card and the on-demand plan highlight; documentation of the guest contract for S-06..S-08.

### Changes Required:

#### 1. Guest page

**File**: `src/pages/g/[key].astro`

**Intent**: Mobile-first page shell whose sections later slices extend.

**Contract**: `accessFor(Astro.locals, "guest")` (+ DB) else 404 `<NoAccess />`; SSR `getGuestState(db, access.guest)`; `<Layout title={event name}>`, `<main class="mx-auto flex max-w-md flex-col gap-6 p-4">` with a header (event name) and `<section aria-labelledby="seat-heading">` holding `<GuestSeatView client:load apiBase="/api/g/<key>" initial=… />`; a comment marks where S-06/S-07/S-08 add their `<section>`s. Only the guest's own state reaches the HTML.

#### 2. Seat island and polling hook

**File**: `src/components/guest/GuestSeatView.tsx`, `src/components/hooks/useGuestState.ts`

**Intent**: Show the guest's published seat and refresh it live.

**Contract**: `useGuestState(apiBase, initial)` polls `GET <apiBase>/state?since=<version>` every 2.5 s (setTimeout chain, 4 s abort, `cache: "no-store"`), pauses while `document.hidden`, polls immediately on becoming visible; 204 keeps state, 200 replaces it, 404 → `{ noAccess: true }` with the state cleared, other errors keep state and flag `offline` after 3 failures. `GuestSeatView`: „Cześć, <name>!”; seated → large „Twój stolik: <table>”, „Sala: <room>”, „Miejsce: <n>” (aria-live polite announcement on change; brief highlight after an update); unpublished/unseated → friendly message; „Pokaż na planie” (only when seated and a plan exists) toggles the plan image (`planImagePath(apiBase, planVersion)`, loaded only when opened) with a pulsing dot at the table pin (`fractionStyle`, wrapper `relative`, img `block w-full h-auto`); no-access → the same texts as `NoAccess`; offline badge „Brak połączenia — ponawiam…”.

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Guest page checks.

**Contract**: with access ON, `/g/<ania>` 200, no-store, contains her name, table, seat and `/api/g/<ania>`; contains no organizer/TV key, no other guest's name or key, no `guestId`/`tableId`/`"id"`; with access OFF → identical 404 no-access body.

#### 4. Docs

**File**: `CLAUDE.md`

**Intent**: Record the guest access contract and the S-05 modules for later slices.

**Contract**: Access model (guest resolver, `GuestAccess`, `guestApi`, denial rules, guest-access switch), a "Guest links and seat view (S-05)" data-access entry (columns, services, APIs, pages, polling contract, page structure for S-06..S-08, QR client-only rule).

### Success Criteria:

#### Automated Verification:

- Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- Build succeeds: `npm run build`
- HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

#### Manual Verification:

- On a real phone (iOS Safari and Android Chrome, ~360 px) with guest access ON: scan a card QR → the page shows name, table, room and seat, large and readable without zooming; organizer publishes a new arrangement → the phone shows it within 5 s without touching it (also after unlocking a locked phone); „Pokaż na planie” shows the plan with the table highlighted; the organizer turns access off → the page switches to the no-access message; a revoked link stops working, the new card works.

---

## Testing Strategy

### Unit Tests:

- `guestStateVersion` (equal inputs → equal token; snapshot/plan/name change → different token; ≤ 64 chars), `toGuestState` (unpublished / unseated / seated mapping, no ids), messages.
- `guestUrl`, `isLocalOrigin` (localhost, 127.0.0.1, `[::1]`, LAN IP, public host).
- `formatGuestLinksSummary` (on/off, 0/1/2/5/22 guests — Polish plurals).
- QR: decode round trip with `jsqr` for a realistic URL (`https://example.pl/g/<24 chars>`), matrix size, quiet zone in the view box.

### Integration Tests:

- Key column: default key, distinct keys, DB refuses duplicate/malformed keys; anon REST cannot read keys or the flag.
- Access matrix via `resolveAccess`/`decideAccess`: off/on, unknown, malformed, revoked, organizer/TV key as guest, guest key as organizer/TV.
- Services: links list, switch (restored), revoke (old key dead), guest state seated/unseated, version token changes on publish and rename.

### Manual Testing Steps:

1. Print the cards from `/o/<key>/karteczki` (A4) and scan two codes with different phones.
2. Publish a new arrangement while both phones show the guest page; both update within 5 s.
3. Turn guest access off and on; revoke one link and reprint that card.

## Performance Considerations

- Guest poll: middleware lookup (one query with an embedded event) + 204 check (two tiny queries); the 200 path adds one single-row seat query. No snapshot-wide reads, no JSON beyond ~300 bytes: 60 phones at 2.5 s ≈ 24 req/s, well within budget. Background tabs do not poll.
- QR generation (~40 codes) runs only in the organizer's browser.
- The plan image is fetched by a phone only when the guest taps „Pokaż na planie”.

## Migration Notes

- Adding `access_key` with a volatile default fills every existing guest with a distinct key in one statement; no app downtime concerns (local only). `guest_access_enabled` starts `false` everywhere, including an existing event: the organizer turns it on.
- Rollback: drop the column, the index and the constraint (no other table depends on them).

## References

- PRD: `context/foundation/prd.md` (US-03, FR-011..FR-013, NFR-003, NFR-008, NFR-009, Access Control)
- Polling pattern: `src/pages/api/tv/[key]/seating.ts`, `src/components/hooks/useTvSeating.ts`
- Access layer: `src/lib/access/resolve.ts`, `src/middleware.ts`, `src/lib/organizer-api.ts`
- Snapshot schema: `supabase/migrations/20261027014210_create_seating.sql`
- Prior plan: `context/archive/2026-10-27-manual-seating-on-tv/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema and guest access

#### Automated

- [x] 1.1 Migration applies on the local DB: `npx supabase migration up`
- [x] 1.2 Unit and integration tests pass: `npm test`
- [x] 1.3 Lint passes: `npm run lint`
- [x] 1.4 Type check passes: `npx astro check`

### Phase 2: Guest link and guest state services

#### Automated

- [ ] 2.1 Unit and integration tests pass (incl. the QR decode round trip): `npm test`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Type check passes: `npx astro check`

### Phase 3: Organizer links API, guest state API and HTTP smoke

#### Automated

- [ ] 3.1 Lint and type check pass: `npm run lint`, `npx astro check`
- [ ] 3.2 Tests pass: `npm test`
- [ ] 3.3 Production build succeeds: `npm run build`
- [ ] 3.4 HTTP smoke passes on a DB without an event: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

### Phase 4: Organizer links page, card sheet and shell card

#### Automated

- [ ] 4.1 Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- [ ] 4.2 Build succeeds and `qrcode` is not in the server bundle: `npm run build` then `grep -rl "qrcode" dist/server` finds nothing
- [ ] 4.3 HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

#### Manual

- [ ] 4.4 On a laptop: links page (switch with confirmation, copy with fallback, revoke with confirmation) and the A4 card print preview; QR codes scan with a phone and open the guest page; single-card print after a revoke

### Phase 5: Guest page with live seat view, and docs

#### Automated

- [ ] 5.1 Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- [ ] 5.2 Build succeeds: `npm run build`
- [ ] 5.3 HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

#### Manual

- [ ] 5.4 On real phones (iOS Safari, Android Chrome, ~360 px): scan a card → name, table, room, seat readable; a publish shows within 5 s without touching (also after unlocking); „Pokaż na planie” highlights the table; access off → no-access message; revoked link dead, new card works
