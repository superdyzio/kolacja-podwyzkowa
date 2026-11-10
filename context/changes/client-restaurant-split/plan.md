# Client / venue split, the „lokal prowadzi” switch and the client's trial reset (S-14 client-restaurant-split) Implementation Plan

## Overview

Staff (owners and managers) get a preview of the client's work in the restaurant panel — guests and groups, the venue, seating, guest links, guesses, questions, orders with drinks and the bill — through the SAME organizer islands, fed by a panel API that reuses the organizer route handlers. A per-event switch „Lokal prowadzi” decides who edits: OFF (default) the client edits through `/o/<key>` as in v1 and staff only preview; ON the staff edit through the panel and the client link is view-only (its writes get a clear 409, its pages render read-only with a banner). Never both at once: every write checks the one column. The client keeps orders, drinks and the bill but no longer types prices: a new line takes the event's price for that dish (newest line of the same name) and only staff change prices in the panel's „Cennik wydarzenia”. The client gets „Reset prób” (seating and its history, guesses; the quiz plugs in later) without guests, venue or orders; the full reset and the AI costs move to the panel, and the client link's routes for them answer the identical denial. The client no longer sees or rotates the staff tablet `/r/` link. PRD v2 FR-026, FR-027, FR-028, US-07 (AC: prices read-only, „lokal prowadzi” → client preview, trial reset vs full reset), Access Control table (Klient, Menedżer, Właściciel) and the rule „Personel a praca klienta”, Business Logic „Kto prowadzi wydarzenie”.

## Current State Analysis

- Client = organizer link `/o/<key>`: shell `src/pages/o/[key].astro` (links incl. the tablet `/r/` link, section cards, full „Reset danych” via `ResetPanel` → `/api/o/<key>/reset`), pages `goscie`, `sale`, `rozsadzenie`, `linki`, `strzaly`, `pytania`, `zamowienia` (+ `RestaurantLinkCard` with „Wymień link” → `POST /api/o/<key>/restaurant-link`), `karteczki`, `odczyt`. 47 route files under `src/pages/api/o/[key]/`; every handler destructures only `{ locals, params, request }` and starts with `organizerApi(locals)` (`src/lib/organizer-api.ts` → `accessFor(locals, "organizer")` + `getDb()`), then works on `api.access.event.id` only (no route reads a key from the access).
- Middleware (`src/middleware.ts`): `decideAccess` → `locals.access` for `/o/`, `/api/o/` …; staff areas `/panel/**`, `/api/panel/**` with the Origin check on mutations and `locals.staffRequest`. `resolveAccess` organizer branch selects `id, name, organizer_key, tv_key, restaurant_key` (`src/lib/access/resolve.ts`).
- Panel: guards `findPanelEvent` / `panelEventApi` (`src/lib/panel-api.ts`; support mode = admin read-only, one log row per guarded read). Event card page `/panel/wydarzenia/<id>` (`EventCard` island, `useEventCard`, `PATCH /api/panel/events/<id>` with `UpdateEventBody` in `src/lib/events/api.ts`, `updateEvent` in `src/lib/events/service.ts`, `EventCardDto` in `src/types.ts`). No view of guests, seating or orders exists in the panel.
- Islands take `apiBase` and build `${apiBase}/<sub>` URLs (`GuestManager`, `VenueEditor`, `SeatingEditor`, `GuestLinksManager`, `GuessManager`, `QuestionManager`, `OrderManager`, `ResetPanel`/`useEventReset`). `SeatingEditor` and `GuessManager` call `useOfflineSync(apiBase)` themselves, which registers the organizer service worker with scope `apiBase` minus `/api` and saves the offline memory.
- Prices: `AddOrderItemBody` / `UpdateOrderItemBody` / `AddDrinkBody` / `UpdateDrinkBody` (`src/lib/orders/api.ts`) carry `price`; `toOrderItemInput` / `toDrinkInput` (`src/lib/orders/input.ts`) require it; the forms (`OrderItemForm`, `OrderLineRow`, `DrinkPanel`) have a price field prefilled from a known dish (`findDish`).
- AI spend: `GET /api/o/<key>/ai-topics` → `AiTopicBoardDto { usage (with inputTokens, outputTokens, costNanoUsd, lastFailureHint), provider }`; `POST` answers `{ topic, usage }` / `{ error, hint, usage }`; `OrganizerAiTopics` shows provider, hint and cost; the shell card uses `formatAiTopicSummary` (cost and provider).
- Reset: `src/lib/reset/` (`RESET_PARTS`, `RESET_IMPLIES`, `resetEvent(db, eventId, parts, locale)` — also deletes the TV spotlight after any reset; DB `reset_event`). `seating` and `guesses` imply nothing.

## Desired End State

- Migration `supabase/migrations/20261110180000_client_restaurant_split.sql`: `event.venue_leads boolean not null default false` (additive; every existing event, event 1 included, stays client-led).
- `/panel/wydarzenia/<id>` (owners, managers): the card with the switch „Lokal prowadzi” (confirm names who loses editing), „Praca klienta” (seven section cards with the same summaries as the client shell, linking to `/panel/wydarzenia/<id>/<goscie|sale|rozsadzenie|linki|strzaly|pytania|zamowienia>`), „Koszty AI” (usage, provider, cost estimate, last failure hint, console link), full „Reset danych”. Support mode: the read-only summary, the switch state as text, the section cards without „Linki gości”, AI costs; no reset.
- `/panel/wydarzenia/<id>/<sekcja>`: the client's island for that section with `apiBase=/api/panel/events/<id>/klient`; editable only while „Lokal prowadzi” is ON (else wrapped read-only with the banner „Wydarzenie prowadzi klient — masz podgląd”); support mode renders it statically (no hydration, no polling), without `linki`. The orders page also has „Cennik wydarzenia” (owners and managers, not support): one row per dish and per drink with its price, saved for every line of that name, whoever leads.
- `/api/panel/events/<id>/klient/<sub>` runs the organizer handler of `/api/o/<key>/<sub>` for that event: reads always (support too, except `guest-links` which carry keys), writes only while ON (else 409 `{ error, code: "client-leads" }`); sub-paths outside the table → the identical 404.
- Client link while ON: every non-GET/HEAD request under `/api/o/<key>/` → 409 `{ error, code: "venue-leads" }` (PL/EN); pages show the banner „Wydarzenie prowadzi teraz lokal — masz podgląd” and render their islands read-only; reads, the offline readout and its worker keep working.
- Client always: `/api/o/<key>/reset`, `GET /api/o/<key>/ai-topics` and `/api/o/<key>/restaurant-link` → the identical 404 `{"error":"Brak dostępu"}` for every method; `POST /api/o/<key>/ai-topics` answers usage without tokens, cost or hint; the shell has no tablet link, no full reset, an AI card without cost; new card „Reset prób” → `/api/o/<key>/trial-reset` (GET counts, POST `{ parts ⊆ [seating, guesses] }`); order and drink bodies have no `price` (strict → 400 when sent); the forms show the price read-only („Cena z cennika lokalu: …” / „Cenę ustali lokal”).
- Panel-only routes (owners, managers; support reads where noted): `GET|POST /api/panel/events/<id>/reset` (GET also support), `GET /api/panel/events/<id>/ai-topics` (also support), `PUT /api/panel/events/<id>/prices { kind: "dish" | "drink", name, price }` (→ the whole `OrderBoardDto`), `PATCH /api/panel/events/<id> { venueLeads }`.
- Guest writes (`/api/g/`) keep working while the venue leads (smoke 30).
- Smoke section 30 and `npm run demo` (main event client-led; „Wigilia firmowa (demo)” led by the venue with guests entered by the owner through the panel; dish prices set through the price list) prove it; CLAUDE.md and README describe it.

### Key Discoveries:

- Importing a page module from another route works in this Astro build (spike 2026-11-10: a catch-all `[...path].ts` importing `@/pages/api/o/[key]/guests` passes `astro check` and `astro build`), so the panel reuses the 47 handlers without moving their bodies.
- Every organizer handler needs only `locals.access` (an `OrganizerAccess`), `params.id` and `request`; the dispatcher can hand them a synthesized access built from one `event` row of the guarded event.
- The middleware is the one place every `/api/o/` request passes with its method: a single check there refuses all client writes while ON, including routes added later.
- `inert` on a wrapper blocks pointer, focus and keyboard for everything inside (forms, buttons, SVG drag in `DrawingCanvas`, the window-level arrow handlers act only on a selected table, which cannot be selected) — one read-only mode for all islands without a prop per island.
- `resetEvent` with `["seating", "guesses"]` already does the trial reset in one transaction (no DB change); it also hides the TV spotlight (kept: no stale question or name on the TV after a reset).

## What We're NOT Doing

- A menu catalog, courses or per-event menu (S-16): prices live on the lines; „Cennik wydarzenia” only sets the price of every line of one dish/drink name.
- Event modules (S-17): AI topics and games stay as today; the client keeps generating AI topics while it leads.
- Staff printing cards or the offline readout in the panel (FR-038 is S-24; staff can open the client link from the card); `karteczki`, `odczyt` stay client pages.
- A per-island `readOnly` prop, hiding individual controls, or live switching of an open page when the switch flips (the next write gets the 409 with the message; a reload shows the banner).
- An allow-list of „harmless” client writes while ON (question draw, AI topics, TV spotlight, trial reset are refused too: „klient ma tylko podgląd”).
- Making the in-island offline fallback of `SeatingEditor` / `GuessManager` reachable while the venue leads (the shell, the other pages and `/odczyt` keep offering the saved readout).
- Unpriced lines as a separate state: a new dish without a price gets 0 zł until staff set it (the form says so).
- Changing the guest phone, TV or `/r/` views, the guest API, or the event list badges.

## Implementation Approach

One column, three enforcement points: the middleware (client writes), the dispatcher (staff writes), and the switch route. The panel reuses the organizer handlers through a pure route table (`src/lib/client-routes/table.ts`: sub-path pattern → handler module, `keys` flag) with a unit test that globs `src/pages/api/o/[key]/**` so no future organizer route escapes the table or the explicit exclusions. Panel pages reuse the islands with a panel `apiBase` and an `inert` frame. Prices move to a small panel route and island; the client's bodies lose `price`. Phases: (1) data + lead rule + dispatcher; (2) panel pages, switch UI, read-only frames; (3) reset/AI/tablet split + trial reset (+ migrate smoke 22–23 that used the removed client routes); (4) prices; (5) smoke 30, demo, docs.

## Critical Implementation Details

- **State sequencing:** the dispatcher must build `locals` for the handler as a NEW object (`{ ...locals, access }`) — never mutate the request's `locals`, which the middleware already decorated with staff headers; it passes `params: { key: "", id }` and the original `request` (body unread).
- **Deploy order:** `resolveAccess` selects `venue_leads`, so the migration must reach the database BEFORE the code (else every `/o/` page and organizer API call is a 500). It is additive, so the old code runs on the migrated database.
- **Support mode:** each guarded read is one log row; previews in support mode render without `client:` directives (no polling through the dispatcher), and `guest-links` (keys) is refused there like any key.

## Phase 1: Data, the lead rule and the panel dispatcher

### Overview

The switch column, the client refusal, the event card field and the panel API that reuses the organizer handlers.

### Changes Required:

#### 1. Migration and types

**File**: `supabase/migrations/20261110180000_client_restaurant_split.sql`, `src/db/database.types.ts`

**Intent**: Add the switch.

**Contract**: `alter table public.event add column venue_leads boolean not null default false;` + comment. Types: `event.Row/Insert/Update.venue_leads`.

#### 2. Lead rule and texts

**File**: `src/lib/lead/rules.ts`, `src/lib/lead/messages.ts`, `src/lib/lead/index.ts` (pure)

**Intent**: One place for who may write and the PL/EN texts (client refusal, staff refusal, banners, switch labels/confirms).

**Contract**: `LEAD_CODES = { venueLeads: "venue-leads", clientLeads: "client-leads" }`; `clientMayWrite(venueLeads)`, `staffMayWrite(venueLeads)`; `leadMessages(locale)` with `clientReadOnly`, `staffPreviewOnly`, `clientBanner`, `staffBanner`, `switch…` texts.

#### 3. Access and middleware

**File**: `src/lib/access/resolve.ts`, `src/middleware.ts`

**Intent**: The organizer access carries `venueLeads`; while it is true every mutation under `/api/o/<key>/` is refused before the route runs.

**Contract**: `OrganizerAccess.event.venueLeads: boolean`. Middleware `granted` branch: organizer + path under `/api/o/` + `isMutation(method)` + `venueLeads` → 409 `{ error: leadMessages(locale).clientReadOnly, code: "venue-leads" }` with the private headers. Guest (`/api/g/`), TV and tablet routes are never affected (guests keep their v1 actions whoever leads).

#### 4. Event card and the switch route

**File**: `src/lib/events/api.ts`, `src/lib/events/service.ts`, `src/types.ts`, `src/pages/api/panel/events/[id].ts`

**Intent**: Owners and managers flip the switch; the card says who leads.

**Contract**: `UpdateEventBody.venueLeads?: boolean`; `updateEvent` patch `venueLeads`; `EventCardDto.venueLeads: boolean` (also in `SupportEventSummaryDto`, it is not a key). Waiter / support / foreign → the identical 404 (existing guard).

#### 5. Client access for the panel, route table, dispatcher

**File**: `src/lib/client-routes/table.ts` (pure), `src/lib/client-routes/access.ts` (DB), `src/pages/api/panel/events/[id]/klient/[...path].ts`

**Intent**: Staff call the client's API for one event through the panel guard.

**Contract**: table entries `{ pattern: readonly string[] (":id" = a numeric segment), module, keys: boolean }` for every organizer route except `reset`, `restaurant-link`, `trial-reset` (client-only) — `ai-topics` is in the table (its GET denies in the handler, phase 3); `matchClientRoute(segments)` → `{ entry, id } | null`. `getClientAccess(db, restaurantId, eventId)` → `OrganizerAccess | null` (one `event` select filtered by both ids). Dispatcher: `panelEventApi(locals, params.id, EVENT_STAFF_ROLES)` → no match → identical 404; `entry.keys && api.support` → identical 404; method not exported → identical 404; mutation and not `venueLeads` → 409 `{ error: staffPreviewOnly, code: "client-leads" }`; else `handler({ locals: { ...locals, access }, params: { key: "", id }, request })`.

#### 6. Tests

**File**: `src/lib/lead/lead.test.ts`, `src/lib/client-routes/table.test.ts`, `tests/integration/client-restaurant-split.test.ts`

**Intent**: The rules; `tests/integration/access.test.ts` expects `venueLeads: false` in the organizer access; the table covers every exported method of every `src/pages/api/o/[key]/**` file except the listed exclusions (glob with `node:fs`); matching (`guests/12`, `seating/guests/3`, `orders/5/pieces`, `plan/image`, non-numeric id → null); `getClientAccess` and `updateEvent` with `venueLeads` against the local DB, another restaurant's event → null.

### Success Criteria:

#### Automated Verification:

- Migration applies on the filled local DB: `npx supabase migration up` (event rows kept, `venue_leads` false)
- Unit and integration tests pass: `AI_PROVIDER=mock npm test`
- Lint and types: `npm run lint`, `npx astro check`
- Build: `npm run build`

#### Manual Verification:

- None beyond phase 5 (HTTP behaviour is checked by the smoke).

---

## Phase 2: Panel preview pages, the switch UI and read-only frames

### Overview

Staff see and (when leading) edit the client's work; the client sees the banner and read-only islands while the venue leads.

### Changes Required:

#### 1. Read-only frame and banners

**File**: `src/components/lead/ReadOnlyFrame.astro`, `src/components/lead/LeadBanner.astro`

**Intent**: One read-only mode for every island: a wrapper with `inert` (and `aria-disabled`), and a banner explaining who leads.

**Contract**: `<ReadOnlyFrame readOnly={bool}><slot/></ReadOnlyFrame>` renders `<div inert>` only when `readOnly`; `<LeadBanner kind="client" | "staff" eventPath? />`.

#### 2. Client pages

**File**: `src/pages/o/[key].astro`, `src/pages/o/[key]/{goscie,sale,rozsadzenie,linki,strzaly,pytania,zamowienia}.astro`

**Intent**: While the venue leads, the banner on top and the islands inside the frame; nothing else changes on these pages in this phase.

**Contract**: `access.event.venueLeads` drives `<LeadBanner kind="client">` and `<ReadOnlyFrame>`; `OfflineSync` stays outside the frame.

#### 3. Offline sync only for client links

**File**: `src/components/hooks/useOfflineSync.ts`, `src/components/hooks/offline-cache-store.ts`, `src/components/hooks/offline-worker.ts`

**Intent**: Islands reused in the panel never register the organizer worker or write the offline memory.

**Contract**: `isOrganizerApiBase(apiBase)` (`/^\/api\/o\/[^/]+$/`); `useOfflineSync` does nothing (status stays "unknown") and the save functions return early for other bases.

#### 4. Event page and switch

**File**: `src/components/events/EventCard.tsx`, `src/components/hooks/useEventCard.ts` (if the request type needs `venueLeads`), `src/pages/panel/wydarzenia/[id].astro`, `src/lib/events/messages.ts` (or `src/lib/lead/messages.ts`)

**Intent**: The switch on the card (with a confirm naming who loses editing) and the „Praca klienta” section cards with summaries; support mode shows the state as text and the cards (without guest links).

**Contract**: PATCH `{ venueLeads }` through the card's existing queue; section cards reuse the shell's summary formatters (`formatGuestSummary`, `formatVenueSummary`, `formatSeatingSummary`, `formatGuestLinksSummary`, `formatGuessSummary`, `formatQuestionSummary`, `formatOrderSummary`) from one `getSeatingBoard` + the other reads.

#### 5. Preview page

**File**: `src/pages/panel/wydarzenia/[id]/[sekcja].astro`, `src/lib/client-routes/sections.ts` (pure: the slugs and titles)

**Intent**: One page per section with ONE guard call, the same server reads as the client page, and the same island with the panel `apiBase`.

**Contract**: `CLIENT_SECTIONS = ["goscie","sale","rozsadzenie","linki","strzaly","pytania","zamowienia"]`; unknown slug, waiter, foreign or support + `linki` → 404 no-access page; `readOnly = support || !venueLeads`; support → islands without `client:load`; members → `client:load` inside `ReadOnlyFrame`; panel paths for `panelPath`/`guestsPath`; `cardsPath` = the client's `/o/<key>/karteczki` (members only).

### Success Criteria:

#### Automated Verification:

- `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build`
- Existing smoke still green against the preview: `npm run smoke`

#### Manual Verification:

- In a browser: the owner flips „Lokal prowadzi”, edits guests on the panel page, the client page shows the banner and cannot click anything; flipped back, the reverse.

---

## Phase 3: Full reset, AI costs and the tablet link move to the panel; the client's trial reset

### Overview

What the client may not do any more answers the identical denial; what it gains is „Reset prób”.

### Changes Required:

#### 1. Trial reset

**File**: `src/lib/reset/parts.ts`, `src/lib/reset/api.ts`, `src/lib/reset/messages.ts`, `src/pages/api/o/[key]/trial-reset.ts`, `src/components/reset/ResetPanel.tsx`, `src/components/hooks/useEventReset.ts`

**Intent**: The client resets seating (with pins and all snapshots) and guesses; the quiz part is added by its slice.

**Contract**: `TRIAL_RESET_PARTS = ["guesses", "seating"]` (comment: the quiz slice adds `quiz`); `TrialResetRequestBody` strict `{ parts: TrialPart[] min 1 }`; GET → `ResetPreviewDto`, POST → `ResetResultDto`; `ResetPanel` props `parts` (default `RESET_PARTS`), `endpoint` (default `${apiBase}/reset`) and `variant: "full" | "trial"` (texts); „select all” over the offered parts.

#### 2. Client denials

**File**: `src/pages/api/o/[key]/reset.ts`, `src/pages/api/o/[key]/restaurant-link.ts`, `src/pages/api/o/[key]/ai-topics.ts`, `src/lib/ai-topics/limits.ts`

**Intent**: The full reset, the tablet link rotation and the AI board (spend) answer the identical denial on the client link; generation answers usage without spend.

**Contract**: every exported method → `jsonError(404, noAccessMessages(locale).title)`; `ai-topics` GET → the same, POST answers `clientAiUsage(usage)` (tokens 0, cost 0, hint null) and no `hint`; `formatClientAiTopicSummary(usage, locale)` (usage only).

#### 3. Panel routes

**File**: `src/pages/api/panel/events/[id]/reset.ts`, `src/pages/api/panel/events/[id]/ai-topics.ts`

**Intent**: Owners and managers reset everything and read the AI costs, whoever leads.

**Contract**: `panelEventApi(…, EVENT_STAFF_ROLES)`; reset GET/POST like the old organizer route; ai-topics GET → `AiTopicBoardDto` (support reads allowed by the guard).

#### 4. UI

**File**: `src/pages/o/[key].astro`, `src/pages/o/[key]/zamowienia.astro`, `src/pages/o/[key]/pytania.astro`, `src/components/questions/OrganizerAiTopics.tsx`, `src/pages/panel/wydarzenia/[id].astro`, `src/lib/shell/messages.ts`

**Intent**: The client shell loses the tablet link and the full reset and gains „Reset prób” (in the frame while the venue leads); the orders page loses `RestaurantLinkCard`; `OrganizerAiTopics` shows usage only; the event page gets „Koszty AI” (server-rendered) and „Reset danych” (`ResetPanel` with `apiBase=/api/panel/events/<id>`, members only).

**Contract**: `pytania.astro` passes `clientAiUsage(...)`; `RestaurantLinkCard` deleted if unused.

#### 5. Smoke migration

**File**: `scripts/smoke.mjs`

**Intent**: Sections that used the client's full reset, tablet rotation or AI GET now use the panel or expect the denial, so the smoke stays green in this phase. Staff sessions start only in section 25 and sections 26/28 assert exact member counts of restaurant A, so section 3 creates an extra „ops” owner account of A (platform.mjs helpers, invitation redeemed over HTTP → session) used by sections 20–24 for the panel routes, and its membership is removed before section 25 with a new `removeMembership(env, restaurantId, accountId)` in `scripts/lib/platform.mjs`.

### Success Criteria:

#### Automated Verification:

- `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build`
- `npm run smoke` green

#### Manual Verification:

- Client shell: „Reset prób” removes seating and guesses only; panel „Reset danych” lists every part.

---

## Phase 4: Prices — read-only for the client, „Cennik wydarzenia” for staff

### Overview

The client keeps entering lines; prices come from the venue.

### Changes Required:

#### 1. Rules and service

**File**: `src/lib/orders/prices.ts` (pure), `src/lib/orders/prices-service.ts`, `src/lib/orders/api.ts`, `src/lib/orders/input.ts`, `src/types.ts`

**Intent**: A new order or drink line takes the newest price of the same name in the event (else 0); staff set the price of every line of one name.

**Contract**: `priceList(items, drinks)` → `PriceListRowDto[] { kind, name, priceGrosze, mixed, lines }` (dishes then drinks, Polish order); `newestPriceFor(lines, name)`; `priceForNewLine(db, eventId, kind, name)`; `setEventPrice(db, eventId, kind, name, grosze)` → `updated | not-found`. Bodies lose `price` (strict); `toOrderItemInput` / `toDrinkInput` return the input without the price; routes add `unitPriceGrosze` from `priceForNewLine`. `SetPriceBody` strict `{ kind, name, price }`.

#### 2. Routes

**File**: `src/pages/api/o/[key]/orders.ts`, `orders/[id].ts`, `drinks.ts`, `drinks/[id].ts`, `src/pages/api/panel/events/[id]/prices.ts`

**Intent**: Client and dispatcher add lines without prices; staff PUT prices (owners, managers; any lead; support 404 by the guard).

**Contract**: `PUT /api/panel/events/<id>/prices` → 200 `OrderBoardDto`; 400 bad price; 404 unknown name.

#### 3. UI

**File**: `src/components/orders/OrderItemForm.tsx`, `OrderLineRow.tsx`, `DrinkPanel.tsx`, `src/components/orders/PriceListEditor.tsx`, `src/components/hooks/usePriceList.ts`, `src/lib/orders/messages.ts`, `src/pages/panel/wydarzenia/[id]/[sekcja].astro`

**Intent**: The forms show the price read-only (known dish → its price, else „Cenę ustali lokal”); the panel orders page shows „Cennik wydarzenia” outside the frame for members.

#### 4. Smoke and tests

**File**: `scripts/smoke.mjs`, `src/lib/orders/*.test.ts`, `tests/integration/client-restaurant-split.test.ts`

**Intent**: The smoke stops sending prices on the client link and sets them through `PUT /api/panel/events/<A>/prices` with the „ops” session where totals are checked (event B's lines in 23d through B's own owner or PostgREST); tests for `priceList`, `newestPriceFor`, `setEventPrice` (event scoping, case-insensitive names).

### Success Criteria:

#### Automated Verification:

- `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build`, `npm run smoke`

#### Manual Verification:

- Client adds „Pierogi” → price from the list or „Cenę ustali lokal”; the owner sets 36 zł in the panel, the client's line shows 36,00 zł.

---

## Phase 5: Smoke section 30, demo and documentation

### Overview

Prove the access matrix over HTTP and show both modes in the demo.

### Changes Required:

#### 1. Smoke section 30

**File**: `scripts/smoke.mjs`

**Intent**: Client: identical 404 on `reset` (GET/POST), `ai-topics` GET, `restaurant-link`; `trial-reset` leaves guests, rooms, tables and orders counts unchanged and removes guesses/seats; writes allowed while OFF, 409 `venue-leads` while ON (reads and pages still 200 with the banner). Staff: dispatcher reads 200, writes 409 `client-leads` while OFF and 200 while ON; waiter PATCH `venueLeads` → 404; manager can toggle; owner B → A's dispatcher / reset / ai-topics / prices → identical 404; event key A → `/api/panel/events/<B>/…` without session 401, Origin 403; support: dispatcher GET 200 except `guest-links` 404, every write 404; panel preview pages 200 / unknown section 404; price route sets prices and the client's line shows them; client body with `price` → 400.

#### 2. Demo

**File**: `scripts/demo.mjs`

**Intent**: The main event stays client-led with lines added without prices and prices set through `PUT …/prices`; „Wigilia firmowa (demo)” is switched to „Lokal prowadzi” and gets a few guests through the dispatcher; the printed panel links include both.

#### 3. Docs

**File**: `CLAUDE.md`, `README.md`

**Intent**: The client/venue split (switch, dispatcher, preview pages, read-only frame, prices, trial vs full reset, AI costs, tablet link) and the smoke/demo lines; deploy order note.

### Success Criteria:

#### Automated Verification:

- `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build`
- `npm run smoke` twice in a row against `AI_PROVIDER=mock npm run preview`
- `npm run demo`

#### Manual Verification:

- Browser pass of the panel previews (both modes) and the client pages in PL/EN.

## Testing Strategy

### Unit Tests:

- Lead rules; route table coverage and matching; `priceList` / `newestPriceFor` (case-insensitive, newest by id, mixed prices); trial parts and the `ResetPanel` selection over a subset (`isEveryResetPartSelected` with offered parts); `clientAiUsage`.

### Integration Tests:

- `getClientAccess` (own vs foreign restaurant), `updateEvent` with `venueLeads`, `setEventPrice` (only this event's lines of that name), `priceForNewLine`, trial reset keeps guests/venue/orders.

### Manual Testing Steps:

1. Owner: event card → „Lokal prowadzi” ON → panel guests page editable; client `/o/<key>/goscie` shows the banner and is inert.
2. OFF → panel page read-only with the staff banner; client edits again.
3. Client shell → „Reset prób” → guests, venue, orders untouched.
4. Panel orders page → set a price; client order page shows it.

## Performance Considerations

The middleware check adds no query (the column rides on the existing access lookup). The dispatcher adds one `event` select per staff request. Support previews do not poll.

## Migration Notes

Additive column, default false: all existing events stay client-led; the old code ignores the column. The new code reads it in `resolveAccess`, so the migration goes to the database before the code. No data rewritten; prices of existing lines unchanged.

## References

- PRD v2 FR-026..FR-028, US-07, Access Control table; roadmap S-14
- Guards: `src/lib/panel-api.ts`; support rule: CLAUDE.md „Platform admin's support access”
- Organizer handlers: `src/pages/api/o/[key]/**`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data, the lead rule and the panel dispatcher

#### Automated

- [x] 1.1 Migration applies on the filled local DB — d59a17a
- [x] 1.2 Unit and integration tests pass — d59a17a
- [x] 1.3 Lint and types — d59a17a
- [x] 1.4 Build — d59a17a

### Phase 2: Panel preview pages, the switch UI and read-only frames

#### Automated

- [x] 2.1 Tests, lint, types, build
- [x] 2.2 Existing smoke still green

#### Manual

- [ ] 2.3 Browser: switch flips editing between panel and client

### Phase 3: Full reset, AI costs and the tablet link move to the panel; the client's trial reset

#### Automated

- [ ] 3.1 Tests, lint, types, build
- [ ] 3.2 Smoke green

#### Manual

- [ ] 3.3 Trial reset vs full reset in the browser

### Phase 4: Prices — read-only for the client, „Cennik wydarzenia” for staff

#### Automated

- [ ] 4.1 Tests, lint, types, build, smoke

#### Manual

- [ ] 4.2 Price set in the panel shows on the client's line

### Phase 5: Smoke section 30, demo and documentation

#### Automated

- [ ] 5.1 Tests, lint, types, build
- [ ] 5.2 Smoke twice in a row
- [ ] 5.3 Demo

#### Manual

- [ ] 5.4 Browser pass of previews and client pages in PL/EN
