# Menu catalog with courses (S-16) Implementation Plan

## Overview

Owners and managers keep a restaurant-level catalog of dishes and drinks with a price and a course (przystawka, zupa,
danie główne, deser, napoje). Per event the venue picks the menu: none (free text as in v1), the full catalog or a
reduced subset. While an event has an active menu, every new order line (client and staff alike) must be a menu item:
it takes the item's spelling, course and the event's price for that name (seeded from the catalog). The prep list on
the organizer's order page and on the tablet `/r/<key>` is grouped by course in a fixed order (PRD v2 FR-037, FR-027,
US-07).

## Current State Analysis

- `order_item` has free-text `name`, `unit_price_grosze`, pieces in `order_piece`; `drink_item` is the client's own
  list of drinks on the bill (bill-drinks). No course anywhere.
- S-14 (`client-restaurant-split`): bodies carry no price; a new line takes the newest price of its name in the event,
  else 0 (`src/lib/orders/prices.ts` `newestPriceFor`, `prices-service.ts` `priceForNewLine` /
  `priceForRenamedLine`); staff re-price every line of a name with `PUT /api/panel/events/<id>/prices` („Cennik
  wydarzenia”). Staff edit client data through the panel dispatcher, which runs the SAME organizer handlers.
- Prep list: `organizerPrepList` / `prepList` (`src/lib/orders/prep.ts`) group by `dishKey`, Polish order;
  `RestaurantViewDto.version` is a fingerprint of the whole content (`restaurant.ts`).
- Panel guards: `panelRestaurantApi`, `panelEventApi`, `findPanelRestaurant`, `findPanelEvent` (templates never
  open as events — `findEventMembership` filters `is_template = false`).

## Desired End State

- `/panel/restauracje/<id>` has a „Menu lokalu” section (counts per course, link) and `/panel/restauracje/<id>/menu`
  manages the catalog (owners, managers; support mode = read-only list).
- `/panel/wydarzenia/<id>` has „Menu wydarzenia”: Bez menu / Pełne menu / Okrojone menu (+ item checkboxes).
- The client's order form offers a select of the available menu grouped by course with prices (read-only) when the
  menu is active; free text otherwise. The bill of existing lines never changes through the catalog.
- Prep lists (organizer, tablet) grouped by course, free-text lines in one „Bez kursu / Other” group last.
- Smoke section 32 proves the routes, the cross-tenant denials and the price snapshot; the demo shows a catalog with
  all five courses and a main event with a reduced menu and catalog-based orders.

### Key Discoveries:

- Order routes: `src/pages/api/o/[key]/orders.ts`, `orders/[id].ts`, `drinks.ts`, `drinks/[id].ts` call
  `priceForNewLine` / `priceForRenamedLine` — the single place to plug the catalog in.
- Dispatcher (`/api/panel/events/<id>/klient/…`) reuses those handlers, so staff obey the same menu rule.
- No new `/api/o/` route file is added → `CLIENT_ROUTE_PATTERNS` / `match.test.ts` untouched.
- `serving.ts` numbers dish pieces in placement order, not prep order — the prep regrouping does not shift it.

## What We're NOT Doing

- No „apply new catalog prices to this event” action (cut for the time box): a catalog price change affects only
  names the event has not priced yet; `PUT …/prices` stays the explicit re-pricing.
- No change to `drink_item` (no menu gate, no course column); catalog drinks only seed its price and suggestions.
- No course on the guest phone, the TV or `RestaurantItemDto`; no new poll; the guest token is unchanged.
- No menu for templates; no per-event price overrides beyond the existing „Cennik wydarzenia”; no dietary flags (S-23),
  no RSVP menu choice (S-25).

## Implementation Approach

Event-first price rule, one source of truth per event: a new line takes the newest price of its name in the event
(as S-14), else the price of the available menu item of that name, else 0. The catalog therefore seeds an event's
price for a name once; afterwards the event's lines are the truth and only „Cennik wydarzenia” changes them.

Menu active rule: `event.menu_mode <> 'off'` AND at least one item available (full = the whole catalog, reduced = the
chosen subset). Existing events get `off` (v1 free text kept exactly); new events default to `full`, which behaves
like `off` until the restaurant has a catalog (smoke restaurants A/B, `event:create`).

## Phase 1: Data, catalog and event menu

### Changes Required:

#### 1. Migration `supabase/migrations/20261110220000_menu_catalog.sql`

**Intent**: catalog, per-event menu and course/menu reference on order lines, data preserved.

**Contract**:
- `menu_item` (`id` identity, `restaurant_id` → restaurant on delete cascade, `name` 1–80, `course` CHECK in
  `starter | soup | main | dessert | drinks`, `price_grosze` 0…10 000 000, `created_at`, `updated_at`; unique
  `(restaurant_id, lower(name))`, unique `(restaurant_id, id)`); RLS + revoke.
- `event.menu_mode text not null default 'off'` CHECK `off | full | reduced`, then `alter … set default 'full'`;
  unique `(id, restaurant_id)` on `event` for the composite FK.
- `event_menu_item (event_id, restaurant_id, menu_item_id)`, PK `(event_id, menu_item_id)`, FKs
  `(event_id, restaurant_id) → event(id, restaurant_id)` and `(restaurant_id, menu_item_id) → menu_item(restaurant_id,
  id)`, both on delete cascade; RLS + revoke.
- `order_item.course` (null or the CHECK) and `order_item.menu_item_id` → `menu_item(id)` on delete set null.
- `set_event_menu(p_event_id, p_mode, p_item_ids int[])`: locks the event row, `EVENT_NOT_FOUND` (also templates),
  `INVALID_MODE`, `ITEM_NOT_FOUND` when any id is not of the event's restaurant; sets the mode and replaces the subset
  (reduced only; other modes clear it) in one transaction. `search_path = ''`, revoke execute.
- `src/db/database.types.ts` extended.

#### 2. `src/lib/menu/` (pure `rules.ts`, `messages.ts`, `api.ts`; DB `service.ts`; `index.ts`)

**Intent**: course list and labels, input rules, catalog and event-menu service.

**Contract**: `MENU_COURSES`, `courseLabel(course, locale)`, `OTHER_COURSE_LABEL`, `compareMenuItems`,
`parseMenuItemInput` (name like dish names, price via `parseUnitPrice`), `MAX_MENU_ITEMS = 300`, `groupByCourse`,
`menuMessages`. Service: `getMenuCatalog(db, restaurantId)` → `MenuCatalogDto { restaurantId, items }`,
`addMenuItem` (→ `added | duplicate | too-many`), `updateMenuItem` (→ `updated | not-found | duplicate`),
`deleteMenuItem` (→ `deleted | not-found`), `getEventMenu(db, restaurantId, eventId)` → `EventMenuDto { mode, items:
[{ …item, available }] }`, `setEventMenu` (→ `updated | not-found`), `getAvailableMenu(db, eventId)` →
`{ active, items }`. Every query filtered by the restaurant id the guard opened.

#### 3. Panel API

**Contract**: `GET|POST /api/panel/restaurants/<id>/menu` (POST `{ name, course, price }` strict → 201),
`PATCH|DELETE /api/panel/restaurants/<id>/menu/<itemId>` (PATCH ≥1 of name/course/price), both
`panelRestaurantApi(…, EVENT_STAFF_ROLES)`; `GET|PUT /api/panel/events/<id>/menu` (`PUT { mode, itemIds? }` strict)
via `panelEventApi(…, EVENT_STAFF_ROLES)`. 400 rule message, 409 duplicate/limit, unknown/foreign item ids → the
identical 404 (`denied(locals)`).

### Success Criteria:

#### Automated Verification:

- `npx supabase migration up` applies on the current local data; `order_item`, `order_piece`, `drink_item` counts equal before and after
- `npx supabase db reset` applies every migration from zero
- Unit tests for `src/lib/menu` and integration test `tests/integration/menu-catalog.test.ts` (catalog CRUD, duplicate, foreign item in `set_event_menu`, available menu, cross-restaurant isolation) pass
- `npm run lint`, `npx astro check` pass

---

## Phase 2: Orders from the menu, course grouping, UI

### Changes Required:

#### 1. Orders

**Intent**: menu gate and price seed in the order routes, course on lines, grouped prep.

**Contract**: `resolveMenuDish(menu, name)`; POST and PATCH-with-a-new-name on `/api/o/<key>/orders` → 400
`notOnMenu` when the menu is active and the name is not available; otherwise the item's spelling, `course`,
`menu_item_id`, price = `newestPriceFor` ?? item price ?? 0. Free-text mode: `course`/`menu_item_id` null. The gate and re-pricing run only when the new name's `dishKey` differs
from the line's (quantity, note, assignment, „Wydane” and spelling fixes on legacy lines always work). A free-text and
a menu line of the same name form two prep lines (different course); serving chips stay keyed by `dishKey`. The board
validators (`useOrderBoard`, `useRestaurantView`) accept the new fields. Drinks:
price fallback from an available `drinks` item of that name. `OrderItemDto.course`, `PrepLineDto.course` (group key
`course|dishKey`, fixed course order, null last); `OrderBoardDto.menu { active, items: [{ name, course,
priceGrosze }] }` (no ids).

#### 2. UI

**Contract**: `OrderItemForm` select grouped by course when `menu.active`; prep in `OrderManager` and
`RestaurantView` with course headings; `DrinkPanel` suggestions include menu drinks; `/panel/restauracje/[id]/menu.astro`
+ island `src/components/menu/MenuCatalogManager.tsx`; „Menu lokalu” section on the restaurant page; island
`src/components/menu/EventMenuEditor.tsx` on the event page (support mode: static summaries). Texts PL/EN.

### Success Criteria:

#### Automated Verification:

- `npm test` (unit + DB integration incl. price snapshot: a catalog price change leaves existing lines and the event's price unchanged)
- `npm run lint`, `npx astro check`, `npm run build`

#### Manual Verification:

- Client form shows the reduced menu with prices; tablet groups by course

---

## Phase 3: Smoke, demo, docs

### Changes Required:

- `scripts/smoke.mjs` section 32: catalog CRUD and validation in A, waiter/owner B/no session/foreign Origin, B's
  session on A's catalog and A's event menu → identical 404, foreign item id → 404, reduced menu, client board menu
  without ids, free text 400, menu line 201 with catalog price and course, catalog price change keeps the line's
  price, tablet prep with courses and no prices, support mode reads and cannot write, A's event back to `off`.
- `scripts/demo.mjs`: catalog with all five courses, main event reduced menu set before the orders, orders by menu
  names (no price PUTs needed).
- CLAUDE.md section „Menu catalog (menu-catalog-courses, S-16)”; README if commands change.

### Success Criteria:

#### Automated Verification:

- `npm run smoke` against `AI_PROVIDER=mock npm run preview` passes
- `npm run demo` passes

## Testing Strategy

Unit: rules (courses, input), grouping, `resolveMenuDish`, price seed. Integration: catalog service, `set_event_menu`
cross-restaurant refusal, menu gate through the service, price snapshot. Smoke: HTTP access matrix.

## Migration Notes

Additive; existing events get `menu_mode = 'off'`, so v1 event 1, the demo's older events and every free-text line
keep working. Deploy: the order board and the order routes read the new columns, so the migration must reach the
database BEFORE the code.

## Progress

### Phase 1: Data, catalog and event menu

#### Automated

- [x] 1.1 `npx supabase migration up` applies on the current local data; counts unchanged — abbad9b
- [x] 1.2 `npx supabase db reset` applies every migration from zero — abbad9b
- [x] 1.3 Unit and integration tests for the menu pass — abbad9b
- [x] 1.4 `npm run lint`, `npx astro check` pass — abbad9b

### Phase 2: Orders from the menu, course grouping, UI

#### Automated

- [x] 2.1 `npm test` incl. the price snapshot
- [x] 2.2 `npm run lint`, `npx astro check`, `npm run build`

#### Manual

- [ ] 2.3 Client form shows the reduced menu with prices; tablet groups by course

### Phase 3: Smoke, demo, docs

#### Automated

- [ ] 3.1 `npm run smoke` passes
- [ ] 3.2 `npm run demo` passes
