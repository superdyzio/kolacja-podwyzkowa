# Venue templates of a restaurant (S-15) Implementation Plan

## Overview

Owners and managers keep a restaurant's room layouts as **venue templates** (plan image, rooms, tables, the drawing:
outlines, rotation, chair pitch), made from scratch or from an existing event, edit them with the existing venue
editor, create new events from them with the room ready, and push a template into an existing event with a separate
„Zaktualizuj z szablonu” that first names who loses a seat (FR-030, US-06, US-09; roadmap S-15).

## Current State Analysis

- The venue lives in `venue_plan` (singleton per event, holds `chair_pitch`), `venue_room`, `venue_table`, all keyed by
  `event_id` with composite FKs; the editor (`VenueEditor`, `useVenue`) talks to `/api/o/<key>/{venue,plan,plan/image,
  rooms,tables,venue/layout,venue/layout-proposal}` and reads `${apiBase}/seating` for occupancy
  (`src/components/venue/VenueEditor.tsx:122`).
- S-14 built a panel dispatcher (`src/pages/api/panel/events/[id]/klient/[...path].ts`) that runs the organizer route
  modules for an event the panel guard opened (`CLIENT_ROUTE_MODULES`, `getClientAccess`). Reusing it for templates
  gives the whole editor (plan upload, rooms, tables, drawing, AI layout read) for free.
- `src/lib/events/service.ts` already notes „Templates (S-15) will be event rows too: listRestaurantEvents is the ONE
  list query and must leave them out”; `m2-product-notes.md` point 5 suggests the same model.
- Event rows get `organizer_key`, `tv_key`, `restaurant_key` from NOT NULL defaults, so a template row has keys: the
  readers below must refuse them.

## Desired End State

- `event.is_template` marks a template row; a template never opens through any link key, never shows in event lists,
  tabs, counters (`platform_restaurant_list().event_count`), `npm run links`, the event routes or the reset.
- `/panel/restauracje/<id>` has a „Szablony sal” section (owners, managers; support mode read-only list) with
  „Nowy szablon” (from scratch); „Nowe wydarzenie” can pick a template; `/panel/szablony/<id>` edits the name and the
  venue (the existing editor) and deletes the template; the event card offers „Zapisz salę jako szablon” and
  „Zaktualizuj z szablonu” (preview naming who loses a seat → confirm → apply).
- Copies (event → template, template → new event) and the update run in ONE DB transaction each; template and event
  share no rows afterwards.
- Verified by unit tests, `tests/integration/venue-templates.test.ts`, smoke section 31 and the demo.

### Key Discoveries:

- Panel guards: `src/lib/panel-api.ts` (`findPanelRestaurant`, `findPanelEvent` → `findEventMembership`
  `src/lib/auth/service.ts:383`, support path `record_support_access` in
  `supabase/migrations/20261110160000_admin_support_log.sql:168`).
- `platform_restaurant_list()` counts `event` rows (`20261109160000_platform_restaurants.sql:112`).
- Unique indexes `venue_room (event_id, lower(name))`, `venue_table (event_id, lower(name))` — matching by
  `lower(name)` can never collide.
- `unseat_beyond_seat_count` trigger trims seats when `seat_count` drops; deleting a table cascades
  `seat_assignment` and nulls `order_item.table_id`.
- `occupantsRemovedBy` / `describeRemovedOccupants` (`src/lib/seating/published.ts:204,228`) name who loses a seat.

## What We're NOT Doing

- No second venue editor and no new `/api/o/` routes (`match.test.ts` stays as is).
- No link between an event and the template it came from (no „outdated” marker); the update picks any template.
- No template versioning, sharing between restaurants or template thumbnails.
- No lead-rule 409 on „Zaktualizuj z szablonu” (decision below) and none inside the template editor (templates are
  the venue's).
- No retention/export (S-26) — only the hook: they must filter `is_template = false`.

## Implementation Approach

Template = an `event` row with `is_template = true` (no guests, no questions, keys never shown). Every reader of
`event` that resolves a key, lists, counts or opens an event by id filters `is_template = false`; a separate template
guard opens only rows with `is_template = true` and then delegates to `findPanelRestaurant` (so roles, disabled
restaurants and the admin's logged support mode behave identically). The template editor is a second dispatcher over
an allowlist of venue route patterns. Copies and the update are DB functions (`set search_path = ''`, revoked).

**Decisions** (logged in `overnight-log.md`):
1. Matching rule of the update: rooms and tables by `lower(name)` (the unique key). A matched table keeps its row id
   (its seats, pins and order lines stay; seats above a lower seat count go), an event table missing from the template
   is deleted (its seats go, order lines lose the table), a template table missing from the event is added; rooms
   alike. The plan image and chair pitch are replaced 1:1 (a template without a plan removes the event's plan).
2. „Zaktualizuj z szablonu” is allowed for owners and managers regardless of „Lokal prowadzi”: FR-030 gives the action
   to the manager by name, the room layout is the venue's physical fact (PRD's „staff only preview” list names guests,
   groups, seating, orders — not the venue), and the confirm names everyone who loses a seat. TV and phones change
   only after the next „Opublikuj” (snapshots are immutable).
3. Template name: the event name rule (`parseEventName`, 1–120 code points).
4. Templates use the venue limits of events (`MAX_ROOMS`, `MAX_TABLES`) — they are edited by the same routes.

### Reader checklist (event table)

| Reader | Treatment |
|---|---|
| `src/lib/access/resolve.ts` organizer / tv / restaurant branches | filter `is_template = false` |
| `src/lib/access/resolve.ts` guest branch | embed `is_template`, deny when true (+ DB check: a template never has `guest_access_enabled`) |
| `src/lib/auth/service.ts` `findEventMembership` | filter (closes every `/api/panel/events/<id>/…` route, the event pages, reset, links, delete, dispatcher) |
| `src/lib/client-routes/access.ts` `getClientAccess` | parameter `template` (event dispatcher false, template dispatcher true) |
| `src/lib/events/service.ts` `listRestaurantEvents` | filter (the ONE list query) |
| `src/lib/events/service.ts` `getEventCard`, `updateEvent`, `rotateEventKey`, `deleteEvent` | filter (defence in depth) |
| DB `platform_restaurant_list()` `event_count` | `create or replace` with `not e.is_template` |
| DB `record_support_access` event lookup | `create or replace` with `not e.is_template` |
| `scripts/lib/platform.mjs` `listEvents` (`npm run links`) | `is_template=eq.false` |
| `src/lib/guest-links/service.ts`, `src/lib/guesses/service.ts`, `src/lib/orders/service.ts:322`, `reset_counts` / `reset_event`, every per-event service | fine by construction: reached only through a key or an event guard that already refuses templates |
| `src/lib/event.ts:50` (`createEvent` insert) | fine: inserts `is_template` default false; never used for templates |
| smoke / demo counters | smoke checks `eventCount` and the lists after creating templates |
| S-26 retention / export | hook: must filter `is_template = false` (migration comment + CLAUDE.md) |

## Phase 1: Data, exclusion and template service

### Overview

Migration, types, every reader filtered, the template service and guards, unit + integration tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261110200000_venue_templates.sql`

**Intent**: mark templates, keep them out of counters and the support path, and copy / apply venues in one
transaction each.

**Contract**:
- `alter table public.event add column is_template boolean not null default false`, check
  `event_template_no_guest_access (not is_template or not guest_access_enabled)`, index
  `event_restaurant_template_idx (restaurant_id) where is_template`; comment with the S-26 hook.
- `create or replace function public.platform_restaurant_list()` (same shape) counting `not e.is_template`.
- `create or replace function public.record_support_access(...)` (same signature) with the event lookup
  `and not e.is_template`.
- Internal `copy_event_venue(p_from integer, p_to integer)` (plan incl. `chair_pitch`, rooms with outlines, tables
  with rotation mapped to the new room ids; target must be empty).
- `create_venue_template(p_restaurant_id integer, p_name text, p_source_event_id integer)` → new template id; source
  (any event row of the SAME restaurant) else `SOURCE_NOT_FOUND`; `RESTAURANT_NOT_FOUND`.
- `create_event_from_template(p_restaurant_id, p_template_id, p_name, p_date date, p_expected_guests integer)` → new
  event id; `TEMPLATE_NOT_FOUND`.
- `apply_venue_template(p_event_id integer, p_template_id integer)` → jsonb `{ seatsBefore, seatsAfter, tablesAdded,
  tablesRemoved, tablesKept, roomsAdded, roomsRemoved }`; locks `(3003, event)`; event must be a non-template, the
  template a template of the same restaurant (else `EVENT_NOT_FOUND` / `TEMPLATE_NOT_FOUND`); order: upsert rooms by
  `lower(name)` → delete unmatched event tables → update matched tables in place → insert new tables → delete
  unmatched rooms → replace `venue_plan` 1:1.
- All new functions `set search_path = ''`, `revoke execute … from public, anon, authenticated`.

#### 2. Types and readers

**Files**: `src/db/database.types.ts`, `src/lib/access/resolve.ts`, `src/lib/auth/service.ts`,
`src/lib/client-routes/access.ts`, `src/lib/events/service.ts`, `scripts/lib/platform.mjs`

**Intent**: the reader checklist above. **Contract**: `getClientAccess(db, restaurantId, eventId, template = false)`.

#### 3. Template module

**Files**: `src/lib/templates/{rules.ts,preview.ts,messages.ts,api.ts,service.ts,index.ts}`, `src/types.ts`

**Intent**: pure rules (name via `parseEventName`, `TEMPLATE_ROUTE_PATTERNS` = venue, venue/layout,
venue/layout-proposal, plan, plan/image, rooms, rooms/:id, tables, tables/:id, seating (GET only)), pure preview, PL/EN
texts, zod bodies and the DB service.

**Contract**:
- `VenueTemplateSummaryDto { id, name, roomCount, tableCount, seatCount, hasPlan }`, `TemplateListAnswerDto
  { templates }`, `TemplateUpdatePreviewDto { templateName, lost: SeatOccupantDto-like { guestName, table, seat }[],
  tablesAdded: string[], tablesRemoved: string[], tablesResized: string[], roomsRemoved: string[], planReplaced }`.
- `templateUpdatePreview(eventVenue, occupancy, templateVenue)` (pure, same name rule as the DB).
- Service: `listVenueTemplates(db, restaurantId)`, `getVenueTemplate(db, restaurantId, id)`,
  `createVenueTemplate(db, restaurantId, name, sourceEventId | null)` → `created | source-not-found`,
  `renameVenueTemplate`, `deleteVenueTemplate` → `… | not-found`, `createEventFromTemplate` (then the starter
  questions, best effort like `createEvent`; templates never get questions),
  `previewTemplateUpdate(db, restaurantId, eventId, templateId)` → preview | null, `applyVenueTemplate` →
  `applied { result } | not-found`.

#### 4. Guards

**File**: `src/lib/panel-api.ts`

**Intent**: `findPanelTemplate(locals, idParam, roles)` reads `event` by id with `is_template = true` and delegates to
`findPanelRestaurant(locals, String(restaurant_id), roles)`; `panelTemplateApi` = the route form (identical 404).

#### 5. Tests

**Files**: `src/lib/templates/templates.test.ts`, `tests/integration/venue-templates.test.ts`,
`tests/integration/helpers.ts` (template cleanup if needed)

**Intent**: preview rule (kept, removed, shrunk, case-insensitive names); integration (cleanup deletes every event
row of the test restaurant, templates included, before `releaseTestEvent` — `event.restaurant_id` has no cascade): template from event copies
plan/rooms/tables/geometry with no shared rows, event from template, apply (kept seat, lost seat at removed and shrunk
tables, pins kept, order line keeps a matched table, preview names exactly who is unseated), template excluded from
`listRestaurantEvents`, `platform_restaurant_list`, `resolveAccess` (every role), `findEventMembership`,
`record_support_access`, cross-restaurant source / template refused.

### Success Criteria:

#### Automated Verification:

- Migration applies on the current local data and from zero: `npx supabase migration up`, `npx supabase db reset`
- `AI_PROVIDER=mock npm test` passes (new unit + integration tests)
- `npm run lint` and `npx astro check` pass

---

## Phase 2: Routes, pages and islands

### Overview

Panel API for templates, the template dispatcher, the template page with the existing editor, the restaurant page
section, template choice in „Nowe wydarzenie”, and the event card's „Zapisz salę jako szablon” / „Zaktualizuj z
szablonu”.

### Changes Required:

#### 1. Routes

**Files**: `src/pages/api/panel/restaurants/[id]/templates.ts`, `src/pages/api/panel/templates/[id].ts`,
`src/pages/api/panel/templates/[id]/sala/[...path].ts`, `src/pages/api/panel/events/[id]/from-template/[templateId].ts`,
`src/pages/api/panel/restaurants/[id]/events.ts`, `src/lib/events/api.ts`

**Contract**:
- `GET|POST /api/panel/restaurants/<id>/templates` (EVENT_STAFF_ROLES; `POST { name, sourceEventId? }` strict → 201
  `{ template, templates }`; 400 name message; a source of another restaurant / unknown / malformed → 404).
- `GET|PATCH|DELETE /api/panel/templates/<id>` (`PATCH { name }` → `{ template }`; DELETE → `{ deleted: true,
  restaurantId }`).
- `/api/panel/templates/<id>/sala/<sub-path>`: runs the organizer route of an allowed pattern with the template's
  organizer access (`getClientAccess(…, true)`); `seating` GET only; anything else → 404; support reads only (guard).
- `GET|POST /api/panel/events/<id>/from-template/<templateId>` → `{ preview }` / `{ result, preview }`; event or
  template of another restaurant, swapped ids → 404.
- `POST /api/panel/restaurants/<id>/events` accepts `templateId?: number`; unknown template → 404.

#### 2. Pages and islands

**Files**: `src/pages/panel/szablony/[id].astro`, `src/pages/panel/restauracje/[id].astro`,
`src/pages/panel/wydarzenia/[id].astro`, `src/components/templates/{TemplatesSection.tsx,TemplateHeader.tsx,
EventTemplateActions.tsx}`, `src/components/events/NewEventForm.tsx`

**Intent**: restaurant page section (list + „Nowy szablon”; support: list only); template page (one guard call; name
form, delete with confirm, `VenueEditor` with `apiBase=/api/panel/templates/<id>/sala`; support: static render without
hydration, inside `ReadOnlyFrame`, so no polling log rows);
template select in „Nowe wydarzenie”; event card actions (save as template → link to it; update from template:
select → preview → `window.confirm` naming who loses a seat and the table changes → apply → „published after
Opublikuj” note). Not in support mode. Every text PL/EN in `templateMessages`.

**Cut order if time runs out**: the event card's preview shows a text summary only (no diff list).

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, `npm run build` pass
- `AI_PROVIDER=mock npm test` passes

---

## Phase 3: Smoke, demo and documentation

### Changes Required:

#### 1. Smoke section 31

**File**: `scripts/smoke.mjs`

**Intent**: owner A creates a template from scratch, uploads a plan, adds a room and tables through the template
dispatcher, lists it; creates a template from event A; creates an event from a template (its venue equals the
template's, its id differs); the template is in no event list or tab and `eventCount` is unchanged; the template's keys
(read from the DB) open nothing under `/o/`, `/tv/`, `/r/` and their APIs (identical 404 body); a template id through
event routes and an event id through template routes → 404; B's owner, a waiter, a manager-of-B, unknown/malformed
ids → 404; no session 401; foreign Origin 403; the update preview names the guest seated at a removed table and the
apply unseats exactly them; rename and delete.

#### 2. Demo, CLAUDE.md, README

**Files**: `scripts/demo.mjs`, `CLAUDE.md`, `README.md` (only if a command changes)

**Intent**: the demo saves the main event's room as „Sala główna (szablon demo)” and creates „Rocznica firmy (demo)”
from it (prints the template's panel link); CLAUDE.md gets the venue-templates section (model, reader checklist,
routes, S-26 hook, deploy order: migration before code).

### Success Criteria:

#### Automated Verification:

- `npm run smoke` against `AI_PROVIDER=mock npm run preview` passes
- `npm run demo` passes and prints the template
- `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build` pass

#### Manual Verification:

- In a browser: create a template, draw it, create an event from it, update an event from a changed template (confirm
  text names who loses a seat), PL/EN

## Testing Strategy

- Unit: preview rule, name rule, `TEMPLATE_ROUTE_PATTERNS ⊂ CLIENT_ROUTE_PATTERNS`.
- Integration: copies, apply semantics, exclusion from every reader above.
- Smoke: HTTP access matrix and cross-tenant checks for every new route.

## Migration Notes

Additive (a column with a default, a check, an index, replaced functions with unchanged signatures, new functions).
The guards and the lists read `is_template`, so the migration must reach the database BEFORE the code (else every key
lookup and panel page is a 500).

## References

- `context/archive/2026-11-10-client-restaurant-split/` (dispatcher), `context/archive/2026-11-10-restaurant-events/`
- `src/lib/seating/published.ts:204` (`occupantsRemovedBy`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data, exclusion and template service

#### Automated

- [ ] 1.1 Migration applies on the current local data and from zero
- [ ] 1.2 `AI_PROVIDER=mock npm test` passes (new unit + integration tests)
- [ ] 1.3 `npm run lint` and `npx astro check` pass

### Phase 2: Routes, pages and islands

#### Automated

- [ ] 2.1 `npm run lint`, `npx astro check`, `npm run build` pass
- [ ] 2.2 `AI_PROVIDER=mock npm test` passes

### Phase 3: Smoke, demo and documentation

#### Automated

- [ ] 3.1 `npm run smoke` against `AI_PROVIDER=mock npm run preview` passes
- [ ] 3.2 `npm run demo` passes and prints the template
- [ ] 3.3 `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build` pass

#### Manual

- [ ] 3.4 In a browser: create a template, draw it, create an event from it, update an event from a changed template, PL/EN
