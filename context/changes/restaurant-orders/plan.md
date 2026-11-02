# Restaurant orders and the restaurant link — Implementation Plan

## Overview

The organizer keeps the evening's food order in the panel (`/o/<key>/zamowienia`): one line per dish with the unit
price, quantity, an optional note and who it is for — a guest, a table (a loose line placed on the table) or nobody
yet. The panel shows line totals, the grand total and a „wydane” checkbox per line. A new read-only role, the
restaurant (`/r/<key>`), sees the prep list (dish × quantity, notes, what is still to serve) and the placement for
serving: the venue drawn like on the TV and, per table, every seat with its guest and dishes plus the table's own
dishes. No prices, ids or keys ever reach the restaurant.

## Current State Analysis

- Access: three roles keyed by the URL (`src/lib/access/paths.ts` `ROLE_BY_PREFIX`, `resolve.ts`), the middleware
  guards `/o|tv|g` and `/api/o|tv|g`. Event keys live on the singleton `public.event` (`organizer_key`, `tv_key`);
  guest keys use the column default `translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')`.
- The TV draws the latest published snapshot (`getTvSeating` → `toTvSeating`, `VenueDrawing` variant `tv`), the
  plan image only for its aspect ratio (`/api/tv/<key>/plan/image`).
- Money: `src/lib/guesses/amount.ts` (`parseAmount`, `formatAmount`, integer grosze, hand-rolled formatting).
- Reset: DB functions `reset_counts` / `reset_event` with a fixed part list (`c_order`), mirrored by
  `src/lib/reset/parts.ts`.
- Saves in an island: `useVenue` runs saves one after another (serial queue) — the pattern for quick checkbox ticks.

## Desired End State

- `/o/<key>/zamowienia`: the restaurant link (copy, „Wymień link”), an add form (dish with autocomplete, price
  prefilled from the last line with that dish, quantity, note, assignment), totals („12 pozycji · 1 840,00 zł ·
  wydane 3 z 12”), the prep list with sums, and every line grouped by placement with edit, delete and a „Wydane”
  checkbox. Shell card „Zamówienia i restauracja”; the shell's „Twoje linki” shows the restaurant link too.
- `/r/<key>`: „Do przygotowania” (prep), „Plan sali” (the published drawing with names), „Wydawanie” per table
  (seat · guest · dishes, then „Na stół”), „Do rozstawienia” and „Nieprzypisane”; delivered lines struck through
  („wydane”); refreshed by polling every 15 s (204 when unchanged).
- A restaurant key never opens organizer, TV or guest paths and vice versa; „Wymień link” kills the old link at once.
- „Reset danych” has a part „Zamówienia”.

### Key Discoveries:

- `OrganizerAccess` carries the keys the organizer pages show; TV/guest accesses carry none — the restaurant access
  carries none either.
- Snapshot tables keep `table_id` (`on delete set null`) and seats keep `guest_id`: enough to place person lines by
  the published seat and table lines by the published table.
- `normalizeDisplayName` (NFC, format chars removed, whitespace runs collapsed, trimmed) fits dish names and notes.

## What We're NOT Doing

- No menu catalog, no paste import, no per-guest bill splitting, no link from the order total to the guess game.
- No restaurant on/off switch (the link is always on; rotation is the revoke).
- No offline copy of the orders (S-09 readout unchanged), no changes to the TV or guest views.
- The restaurant never writes anything (no ticking „wydane” from its side).

## Implementation Approach

Pure modules first (`src/lib/orders/`: rules, placement, prep, summary, zod bodies), then the DB service, organizer
API and island; then the access role, the restaurant service, API and page; then reset, demo data and docs. One
migration for the whole change (additive only; the reset functions are replaced with `create or replace`).

## Critical Implementation Details

- **Deploy order**: the organizer branch of `resolveAccess` selects `restaurant_key`; without the migration every
  `/o/` page answers 500. Dump → `supabase db push` (both pending migrations) → `deploy:aws`.
- **Placement** (`placeOrders`, generic over the line type): a person line goes to the guest's seat in the LATEST
  snapshot (by `guest_id`); a table line to the snapshot table with that `table_id`. A person who is not in the
  snapshot (unpublished, unseated or absent at publish time) or a table not in it (added after the publish) → „Do
  rozstawienia” with the live name. No person and no table (never assigned, or the guest/table was deleted: FKs
  `on delete set null`) → „Nieprzypisane”. Tables in snapshot order (room, then name), seats ascending, lines by id.
- **Prep**: grouped by `lower(normalized name)` (Polish locale), the first-seen spelling shown; quantity sum,
  `toServe` = undelivered quantity, notes with their quantities; sorted by Polish name.
- **Restaurant token**: FNV-1a over the JSON of the DTO without `version` (`?since=` equal → 204). About a hundred
  rows read by one or two devices every 15 s.
- **Line limits**: dish 1–80 code points, note ≤ 120 (empty → null), quantity 1–99, unit price 0…100 000 zł
  (`MAX_UNIT_PRICE_GROSZE` = 10 000 000), at most `MAX_ORDER_ITEMS` = 400 lines. A guest or table id that does not
  exist → 409 „Nie ma już takiego gościa albo stolika.” (FK violation `23503`).

## Phase 1: Orders for the organizer

### Overview

Data model, pure rules, DB service, organizer API, the page `/o/<key>/zamowienia` (without the restaurant link card
yet) and the shell card.

### Changes Required:

- Migration `supabase/migrations/20261102120000_restaurant_orders.sql`: `event.restaurant_key` (default as guest
  keys, format check, unique, distinct from the other two keys); `public.order_item` (`id` identity, `event_id`,
  `name`, `note`, `quantity`, `unit_price_grosze`, `guest_id` → guest `on delete set null`, `table_id` → venue_table
  `on delete set null`, `delivered`, `created_at`, `updated_at`; checks for lengths, ranges and
  `num_nonnulls(guest_id, table_id) <= 1`; RLS on, revoked); `reset_counts` / `reset_event` replaced with the
  `orders` part (count `orders`, delete order items; no implications).
- `src/db/database.types.ts`, `src/types.ts` (`OrderItemDto`, `OrderBoardDto`, `OrderPlacementDto<T>`,
  `PrepLineDto`, `OrderTotalsDto`, restaurant DTOs).
- `src/lib/orders/`: `rules.ts` (limits, normalization, messages, `lineTotal`, `orderTotals`), `placement.ts`,
  `prep.ts`, `summary.ts` (`formatOrderSummary`), `api.ts` (zod bodies), `service.ts` (`getOrderBoard`,
  `addOrderItem`, `updateOrderItem`, `deleteOrderItem`), `index.ts`; unit tests for rules/placement/prep/summary.
- API: `/api/o/<key>/orders` (GET, POST → 201), `/api/o/<key>/orders/<id>` (PATCH, DELETE); answers = the board.
- UI: `src/components/hooks/useOrderBoard.ts` (serial saves), `src/components/orders/OrderManager.tsx` (+ form and
  line components), page `src/pages/o/[key]/zamowienia.astro`, shell card.
- Integration test `tests/integration/orders.test.ts`; smoke section for the organizer orders API.

### Success Criteria:

#### Automated Verification:

- Lint, `astro check`, unit + integration tests pass.
- Smoke passes on a fresh DB with the new orders section.

#### Manual Verification:

- Adding, editing, ticking and deleting lines on `/zamowienia` in Chrome; totals and grouping update.

## Phase 2: The restaurant link and view

### Overview

New access role `restaurant`, link rotation, the restaurant service/API/page and the link in the panel.

### Changes Required:

- `src/lib/access/`: role `restaurant` (`/r/`), `RestaurantAccess` (no keys), `OrganizerAccess.event.restaurantKey`,
  `restaurantPath`; `src/lib/restaurant-api.ts` prelude; middleware comment; tests.
- `src/lib/orders/service.ts`: `getRestaurantView`, `getRestaurantViewVersion`… (one read), `rotateRestaurantKey`.
- API: `GET /api/r/<key>/orders?since=` (204/200), `GET /api/r/<key>/plan/image`, `POST /api/o/<key>/restaurant-link`
  (→ `{ path }`).
- UI: `src/pages/r/[key].astro`, `src/components/restaurant/RestaurantView.tsx`, hook `useRestaurantView` (15 s poll,
  8 s abort, paused while hidden, offline note after 3 failures); restaurant link card on `/zamowienia`; the shell's
  „Twoje linki”; `scripts/links.mjs` prints it.
- Smoke: denial matrix with `/r/`, restaurant section (no prices/keys/ids, delivered visible, rotation).

### Success Criteria:

#### Automated Verification:

- Lint, `astro check`, tests, smoke pass.

#### Manual Verification:

- The restaurant page on a phone-sized window and a tablet: prep list, plan, per-table serving, struck „wydane”.

## Phase 3: Reset, demo data and docs

### Changes Required:

- `src/lib/reset/` (part `orders`, labels, counts, summary), `ResetCountsDto.orders`, reset tests and smoke.
- `scripts/demo.mjs`: a handful of order lines (persons, a table, one unassigned, one delivered).
- `CLAUDE.md` (Access model, Data access section „Restaurant orders”, commands), `README.md` (feature + deploy order).
- `npm run package:lambda` passes.

### Success Criteria:

#### Automated Verification:

- Lint, `astro check`, tests, smoke on a fresh DB, `package:lambda`.

#### Manual Verification:

- Reset with „Zamówienia” clears the lines; the demo shows orders on both pages.

## Migration Notes

Additive: one new column with a default (the existing event row gets a fresh restaurant key), one new table, two
functions replaced with the same signatures. Hosted DB: dump → `db push` (also applies `20261101120000_venue_drawing`)
→ `deploy:aws`.

## Progress

### Phase 1: Orders for the organizer

#### Automated

- [x] 1.1 Migration, DB types and DTOs — d92ec17
- [x] 1.2 Pure order modules with unit tests — d92ec17
- [x] 1.3 Service, organizer API and integration tests — d92ec17
- [x] 1.4 Organizer page, island and shell card — d92ec17
- [x] 1.5 Smoke section for the orders API — d92ec17

#### Manual

- [x] 1.6 Lines added, edited, ticked and deleted in Chrome — d92ec17

### Phase 2: The restaurant link and view

#### Automated

- [x] 2.1 Access role, rotation and restaurant API — d92ec17
- [x] 2.2 Restaurant page and polling — d92ec17
- [x] 2.3 Restaurant link in the panel and links script — d92ec17
- [x] 2.4 Smoke: denial matrix and restaurant section — d92ec17

#### Manual

- [ ] 2.5 Restaurant page checked on phone and tablet widths

### Phase 3: Reset, demo data and docs

#### Automated

- [x] 3.1 Reset part „Zamówienia” — d92ec17
- [x] 3.2 Demo orders — b474123
- [x] 3.3 CLAUDE.md and README — b474123
- [x] 3.4 Full checks (lint, check, tests, smoke, package:lambda) — b474123

#### Manual

- [ ] 3.5 Reset and demo checked in Chrome

## Deviations

- The reset part „Zamówienia” (3.1) landed in phase 1: the migration replaces `reset_counts`, and the strict zod
  schema of the counts (`src/lib/reset/api.ts`) rejected the new `orders` key until the part existed.
- Phases 1 and 2 were committed together (`d92ec17`); the smoke's denial matrix needed the restaurant role to pass.
- The add form keeps a known dish's stored spelling (`findDish`), so the prep list never splits one dish by case.
