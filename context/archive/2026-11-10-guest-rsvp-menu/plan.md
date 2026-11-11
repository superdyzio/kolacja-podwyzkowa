# Guest RSVP with a dish choice until a deadline (S-25) Implementation Plan

## Overview

PRD v2 FR-039 / US-07: before the event a guest, on their personal link `/g/<key>`, confirms attendance (yes / no)
and picks ONE dish from the options the client set for the event, until a deadline; afterwards the answer is
read-only for the guest. The client enters or changes the answer for any guest (also after the deadline). The client
and the venue (panel event card and preview) see the counts: coming / not coming / no answer, and per dish.
Business rule „lokal udostępnia, klient wybiera”: the venue offers dishes through the S-16 event menu; the client
chooses which of the available dishes guests pick from.

## Current State Analysis

- Guests: `guest.is_absent` (v1) is the only „not here” flag; the draw skips absent guests and `publish_seating`
  leaves them out (`src/lib/seating/draw.ts`, migration `20261109120000_multi_tenant_events.sql`). The client flips it
  on `/o/<key>/goscie` (`PATCH /guests/<id> { isAbsent }`).
- Menu (S-16): `menu_item` per restaurant, `event.menu_mode` off | full | reduced, `event_menu_item` for reduced
  (composite FKs keep foreign items out), `getAvailableMenu(db, eventId)` (`src/lib/menu/service.ts:169`),
  `findMenuItem` by name in any letter case (`src/lib/menu/rules.ts:136`). Clients address menu items by NAME
  (`OrderMenuDto` carries no ids).
- Guest phone: ONE shared poll (`useGuestState`, `src/components/hooks/guest-state-store.ts`); token
  `guestStateVersion` (`src/lib/guest-links/state.ts:41`) = `<seating>.<live hash>.<intake>.<amount>.<place>.<max>`,
  worst case 62/64 chars; new live state goes into the hashed `live` part. `getGuestState` / `getGuestStateVersion`
  (`src/lib/guest-links/service.ts`) must build it from the same reads (`tests/integration/guest-links.test.ts:211`).
- Client routes: every `/api/o/<key>/…` file must be listed in `CLIENT_ROUTE_PATTERNS`
  (`src/lib/client-routes/match.ts`) + `CLIENT_ROUTE_MODULES` (`table.ts`); `match.test.ts` compares with the files.
  The middleware answers client mutations with 409 `venue-leads` while the venue leads; the dispatcher answers staff
  mutations with 409 `client-leads` while the client leads.
- Client sections: `CLIENT_SECTIONS` (`src/lib/client-routes/sections.ts`) drive the panel's „Praca klienta” cards
  (`ClientWorkCards.astro`, summaries on `/panel/wydarzenia/[id].astro`) and previews (`[sekcja].astro`).
- Guest writes with a gate: `save_guest_guess_with_place` locks the event row `for share` and refuses after a close —
  the pattern for the deadline.

## Desired End State

- `event.rsvp_deadline` (null = RSVP off) and `event_rsvp_option` (the client's options, menu items of the event's
  restaurant) and `guest_rsvp` (who answered, the dish, by whom, when) exist; `is_absent` stays THE attendance truth.
- Guest `/g/<key>`: while open, „Potwierdź obecność” above the seat section (Przyjdę / Nie przyjdę, then a dish radio
  list grouped by course, deadline shown in Warsaw time); after the deadline the own answer read-only at the bottom;
  nothing while RSVP is off. Never prices, ids, counts or others' answers.
- Client `/o/<key>/potwierdzenia` (shell card „Potwierdzenia i wybór dania”): set/clear the deadline, „Zamknij teraz”,
  pick options from the available menu, counts (coming / not coming / no answer, per dish, coming without a dish),
  every guest's answer editable (also after the deadline). Same island in the panel preview
  `/panel/wydarzenia/<id>/potwierdzenia`; the panel event card's „Praca klienta” card shows the counts summary.
- Smoke section 40 and `npm run demo` cover it; CLAUDE.md documents it.

Verify: `npm test` (DB tests), `npm run lint`, `npx astro check`, `npm run build`, `npm run smoke`, `npm run demo`.

### Key Discoveries:

- `getGuestGuess` + `getPublishedVersion` + `getGuestOrders` run in parallel on BOTH guest paths
  (`src/lib/guest-links/service.ts:236-272`); one more RPC in the same `Promise.all` keeps one round trip.
- `guest_order_lines(p_guest_id)` (migration `20261107120000_order_piece_delivery.sql:86`) is the jsonb-RPC pattern.
- PG 17 locally (`supabase/config.toml:36`): `on delete set null (menu_item_id)` (column list, PG 15+) keeps
  `restaurant_id` of a composite FK when a catalog item is deleted.
- `localDateTime` / `PLATFORM_TIME_ZONE` (`src/lib/events/dates.ts`), `formatEventDate` (weekday format),
  `formatSupportTime` (`src/lib/support/format.ts`) — hand-rolled formats so SSR and browsers agree.
- Smoke 38 pins the guest state's key set (`scripts/smoke.mjs` ~9190: `"drawing guess modules name orders planVersion
  seat status version"`) — adding `rsvp` changes it.

## What We're NOT Doing

- RSVP is NOT an S-17 module (no new `MODULE_KEYS` entry, no CHECK/default change on the three module columns): it is
  core preparation (FR-039, must-have); the venue's offer is the event menu, the client's switch is the deadline.
- No free-text dish options: options come only from the event's available menu. Menu off / empty → attendance only.
- One dish per guest (not one per course).
- No tablet (`/r/`) RSVP counts and no „przenieś wybory do zamówień” action (follow-up candidates; the venue sees the
  counts in the panel).
- No RSVP part in the full reset or the client's „Reset prób” (the `guests` part deletes answers with the guests;
  options and the deadline are event settings).
- No e-mails / reminders (NFR-020).
- No change to the TV, the guest token's parts or the seating draw.

## Implementation Approach

Single source of truth for attendance: `guest.is_absent`. A guest's or client's „no” sets `is_absent = true`, „yes”
sets it false, the client's „no answer” deletes the answer row and sets it false. Derived everywhere (pure
`attendanceOf`): absent → not coming; present ∧ answered → coming; present ∧ not answered → no answer. A trigger on
`guest.is_absent` changes made OUTSIDE the RSVP function (the guest list's absence toggle) stamps an existing answer
`answered_by = 'organizer'`, so „who decided” stays true. Writes go through one DB function under the event row
lock (deadline checked atomically for guests). The guest's phone reads its RSVP through one jsonb RPC on both poll
paths and folds it into the token's hashed part.

## Critical Implementation Details

- **Token**: `rsvpKey(rsvp)` is appended to the `live` hash input ONLY when `rsvp !== null`, so events without RSVP
  keep today's tokens. `open` is computed in SQL with `now()` inside the RPC, so the 204 path flips at the deadline
  without any client clock. The 204/200 equality test must cover an event with RSVP on.
- **State sequencing in `save_guest_rsvp`**: update `guest.is_absent` FIRST, then upsert/delete the answer row — the
  trigger fires on the guest update and would otherwise overwrite `answered_by = 'guest'`.
- **Deadline input**: the client sends Warsaw local `YYYY-MM-DDTHH:MM` (`<input type="datetime-local">`); the
  server converts it to an instant (pure, DST-correct via `Intl` offset lookup, tested for CET and CEST) and stores
  `timestamptz`. „Zamknij teraz” sends `{ close: true }` and the server stores its own `now`.

## Phase 1: Data, rules, service, routes and the guest token

### Overview

Migration, types, the pure RSVP domain, the service, the client and guest routes, the guest state integration, and
unit + integration tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261111040000_guest_rsvp.sql`

**Intent**: Additive schema for RSVP; existing data untouched (every event starts with RSVP off).

**Contract**:
- `alter table event add column rsvp_deadline timestamptz` (null = off). Comment.
- `event_rsvp_option (event_id integer, restaurant_id integer, menu_item_id integer, primary key (event_id,
  menu_item_id))`, FKs `(event_id, restaurant_id) → event(id, restaurant_id) on delete cascade` and
  `(restaurant_id, menu_item_id) → menu_item(restaurant_id, id) on delete cascade` (like `event_menu_item`); index on
  `(restaurant_id, menu_item_id)`; RLS on, `revoke all … from anon, authenticated`.
- `guest_rsvp (guest_id bigint primary key, event_id integer not null, restaurant_id integer not null, menu_item_id
  integer null, answered_by text not null check in ('guest','organizer'), answered_at timestamptz not null default
  now())`, FKs `(event_id, guest_id) → guest(event_id, id) on delete cascade`, `(event_id, restaurant_id) →
  event(id, restaurant_id) on delete cascade`, `(restaurant_id, menu_item_id) → menu_item(restaurant_id, id) on
  delete set null (menu_item_id)`; index `(event_id)`; RLS + revoke.
- Trigger `guest_rsvp_absence_by_organizer` (after update of `is_absent` on `guest`, `when (old.is_absent is
  distinct from new.is_absent)`): `update guest_rsvp set answered_by = 'organizer', answered_at = now() where
  guest_id = new.id`. Function with `set search_path = ''`, execute revoked.
- `guest_rsvp_state(p_event_id integer, p_guest_id bigint) returns jsonb` (stable SQL): null when the event (non
  template) / guest of that event does not exist or `rsvp_deadline` is null; else `{ deadline, open: now() <
  deadline, absent, answered, answeredBy, dish (menu item name or null), options: [{ name, course }] }` where options =
  `event_rsvp_option` items currently AVAILABLE (menu_mode full → any option; reduced → also in `event_menu_item`;
  off → none), unordered (JS sorts).
- `save_guest_rsvp(p_event_id integer, p_guest_id bigint, p_attending boolean, p_dish text, p_by text) returns void`:
  `p_by` in ('guest','organizer') else `INVALID_ANSWER`; event row (non template) `for share` (`EVENT_NOT_FOUND`);
  guest of that event (`GUEST_NOT_FOUND`); for `guest`: `p_attending` not null and `rsvp_deadline is not null and
  now() < rsvp_deadline` else `RSVP_CLOSED`; a non-null `p_dish` (only with `p_attending = true`) must match an
  available option by `lower(name) = lower(p_dish)` else `DISH_NOT_OFFERED`; then update `guest.is_absent` (`not
  p_attending`, or false for null), then `p_attending is null` → delete the answer row, else upsert (`menu_item_id` =
  resolved id when attending, else null; `answered_by = p_by`, `answered_at = now()`).
- `set_event_rsvp_options(p_event_id integer, p_item_ids integer[]) returns void`: event (non template) `for update`
  (`EVENT_NOT_FOUND`); every id an item of the event's restaurant (`ITEM_NOT_FOUND`); replace the rows.
- Every function: `set search_path = ''`, `revoke execute … from public, anon, authenticated`, comments.

#### 2. Types

**File**: `src/db/database.types.ts`, `src/types.ts`

**Intent**: Hand-written DB types for the new column, tables and functions; DTOs.

**Contract** (`src/types.ts`):
- `RsvpOptionDto { name: string; course: MenuCourse }`.
- `GuestRsvpDto { open: boolean; deadline: string (ISO); attending: boolean | null; dish: string | null;
  byOrganizer: boolean; options: RsvpOptionDto[] }`; `GuestStateDto.rsvp: GuestRsvpDto | null`.
- `RsvpGuestDto { id; displayName; attending: boolean | null; dish: string | null; byOrganizer: boolean;
  answeredAt: string | null }`.
- `RsvpCountsDto { total; coming; notComing; noAnswer; noDish; dishes: { name; course; count; offered: boolean }[] }`.
- `RsvpBoardDto { deadline: string | null; open: boolean; eventDate: string; guestLinksOn: boolean; options:
  (RsvpOptionDto & { available: boolean })[]; menu: RsvpOptionDto[]; counts: RsvpCountsDto; guests: RsvpGuestDto[] }`.

#### 3. Pure rules, dates and messages

**File**: `src/lib/rsvp/rules.ts`, `src/lib/rsvp/messages.ts`, `src/lib/rsvp/api.ts`, `src/lib/rsvp/index.ts`,
`src/lib/events/dates.ts`

**Intent**: Everything testable without a DB.

**Contract**:
- `dates.ts`: `localInputToInstant(local: string, timeZone = PLATFORM_TIME_ZONE): string | null` (ISO; null for a
  malformed or impossible date-time, years 2000–2100) and `instantToLocalInput(iso): string`
  (`YYYY-MM-DDTHH:MM` in Warsaw).
- `rules.ts`: `MAX_RSVP_OPTIONS = 12`; `RSVP_CODES = { closed: "rsvp-closed", notOffered: "dish-not-offered" }`;
  `attendanceOf({ absent, answered })`; `byOrganizerOf({ absent, answered, answeredBy })` (an absent guest without an
  answer = the organizer's mark); `toGuestRsvp(raw: unknown): GuestRsvpDto | null` (validates the RPC JSON, normalises
  the ISO deadline, sorts options with `compareMenuItems`); `rsvpKey(rsvp)` (stable string of open, deadline,
  attending, dish, byOrganizer, options); `rsvpCounts(guests)`; `rsvpBoard(input, now)`;
  `formatDeadline(iso, locale)` („pt., 11.12.2026, 18:00” / „Fri, 11 Dec 2026, 18:00”, via `formatEventDate` + Warsaw
  clock); `formatRsvpSummary(board, locale)` (shell / panel card: off, or „do … · przyjdzie N · nie przyjdzie N · bez
  odpowiedzi N” + up to 4 dishes „Schab ×5”); `parseOptionNames(names)` (normalised, duplicates refused).
- `messages.ts`: `rsvpMessages(locale)` PL/EN — guest texts, client page texts, problems (`closed`, `notOffered`,
  `deadlineInvalid`, `tooManyOptions(max)`, `duplicateOption(name)`, `notOnMenu(name)`, `closeAndDeadline`).
- `api.ts` (zod, strict): `RsvpSettingsBody { deadline?: string | null; close?: true; options?: string[] (≤ 12, each
  ≤ 80) }` (≥ 1 field); `RsvpAnswerBody { attending: boolean | null; dish: string | null }` (client);
  `GuestRsvpBody { attending: boolean; dish: string | null }` (guest).

#### 4. Service

**File**: `src/lib/rsvp/service.ts`

**Intent**: DB access, every function `(db, eventId, …)`, status unions, errors thrown.

**Contract**:
- `getGuestRsvp(db, eventId, guestId): Promise<GuestRsvpDto | null>` (the RPC + `toGuestRsvp`).
- `submitGuestRsvp(db, eventId, guestId, attending, dish)` → `saved | closed | not-offered | not-found`.
- `saveRsvpByOrganizer(db, eventId, guestId, attending | null, dish)` → `saved | not-offered | not-found`.
- `getRsvpBoard(db, eventId, now)` → `RsvpBoardDto | null` (event row filtered `is_template = false`, options with
  items, guests, answers with items, `getAvailableMenu` in parallel; then pure `rsvpBoard`; guests in Polish order
  then id, like the guest list).
- `updateRsvpSettings(db, eventId, { deadline?, close?, options? }, now)` → `updated | not-on-menu { name } |
  not-found` (options resolved by name against `getAvailableMenu` with `findMenuItem` — an empty list clears them,
  any name while the menu is inactive is `not-on-menu` —, then `set_event_rsvp_options`; deadline `update event set
  rsvp_deadline … where id and not is_template`).
- A guest's dish is only kept with „yes”: the service passes `attending === true ? dish : null`. Organizer writes work
  whether RSVP is on or off (the board still lists answers while it is off; only guests are gated).

#### 5. Guest state

**File**: `src/lib/guest-links/state.ts`, `src/lib/guest-links/service.ts`

**Intent**: The RSVP joins the shared poll without a new token part.

**Contract**: `guestStateVersion(seating, name, guess, orders, modules, rsvp: GuestRsvpDto | null = null)` appends
`\u0000${rsvpKey(rsvp)}` to the hashed input only when `rsvp` is non-null; `GuestStateInput.rsvp?`; `toGuestState`
returns `rsvp` (null default); `getGuestState` / `getGuestStateVersion` read `getGuestRsvp` in the same
`Promise.all`.

#### 6. Routes

**Files**: `src/pages/api/o/[key]/rsvp.ts`, `src/pages/api/o/[key]/rsvp/guests/[id].ts`,
`src/pages/api/g/[key]/rsvp.ts`, `src/lib/client-routes/match.ts`, `src/lib/client-routes/table.ts`

**Intent**: Client settings and proxy answers (lead rule for free via the patterns), the guest's own answer.

**Contract**:
- `GET /api/o/<key>/rsvp` → `RsvpBoardDto`; `PATCH` `RsvpSettingsBody` → board; 400 invalid deadline / both close and
  deadline / too many / duplicate / not on the menu (naming the dish).
- `PUT /api/o/<key>/rsvp/guests/<id>` `RsvpAnswerBody` → board; malformed / unknown / other event's guest → the
  identical 404 `noAccessMessages().title`; 400 `{ code: "dish-not-offered" }`.
- `PUT /api/g/<key>/rsvp` `GuestRsvpBody` → 200 `GuestStateDto`; 409 `{ code: "rsvp-closed" }` (off or past the
  deadline); 400 `{ code: "dish-not-offered" }`; 404 not found. The guest is `api.access.guest.id`.
- Patterns `rsvp`, `rsvp/guests/:id` in `CLIENT_ROUTE_PATTERNS` and `CLIENT_ROUTE_MODULES`.

#### 7. Tests

**Files**: `src/lib/rsvp/rsvp.test.ts`, `src/lib/events/dates.test.ts` (or the existing dates test),
`src/lib/guest-links/state.test.ts` (if present), `tests/integration/guest-rsvp.test.ts`

**Intent**: Prove the rules, the DB functions and the token.

**Contract**:
- Unit: local ↔ instant in CET (Dec) and CEST (Jul), malformed/out-of-range → null; `attendanceOf` table; counts
  (absent without answer = not coming, coming without dish = noDish, a dish no longer offered keeps counting with
  `offered: false`); `toGuestRsvp` rejects odd JSON and sorts options; `rsvpKey` changes with each field; the token
  unchanged when `rsvp` is null; `formatDeadline` PL/EN; summary text.
- Integration (own restaurant + event + a second event for isolation): RSVP off → `getGuestRsvp` null and the guest
  save `closed`; options from a reduced menu only (an item not on the event's menu → `not-on-menu`, another
  restaurant's item → refused); guest yes + dish → coming, `is_absent` false; guest no → `is_absent` true, dish
  cleared; a dish not offered → `not-offered`; deadline in the past → guest `closed`, organizer still `saved`;
  organizer null → answer gone, `is_absent` false; the guest-list absence toggle stamps `byOrganizer`; deleting a
  guest deletes the answer; deleting a catalog item keeps the answer with dish null; the other event's guest id →
  `not-found`; `getGuestStateVersion` equals `getGuestState().version` with RSVP on, and changes when the deadline
  passes (deadline set to the past) and when the guest answers.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration up` applies on the demo-populated local DB and `npx supabase db reset` from zero
- `AI_PROVIDER=mock npm test` passes (unit + DB integration incl. `guest-rsvp.test.ts`, `match.test.ts`,
  `guest-links.test.ts`)
- `npm run lint` and `npx astro check` pass

#### Manual Verification:

- None for this phase (no UI yet)

---

## Phase 2: Guest, client and panel UI

### Overview

The guest's section, the client's page and shell card, the panel preview and the event card's summary.

### Changes Required:

#### 1. Guest phone

**Files**: `src/components/guest/GuestRsvpView.tsx`, `src/pages/g/[key].astro`, `src/lib/guest-links/messages.ts`
(or `rsvpMessages`)

**Intent**: The guest answers on the phone through the shared state.

**Contract**: `GuestRsvpView { apiBase, initial, locale, placement: "open" | "closed" }` reading `useGuestState`;
renders nothing unless `state.rsvp` exists and its `open` matches the placement. Mounted twice: `placement="open"`
above the seat section, `placement="closed"` at the end of `<main>`. Open: heading, deadline text, two toggle buttons
(`aria-pressed`) Przyjdę / Nie przyjdę, then (attending, options non-empty) a radio group by course („Wybierz
danie”), each choice saved at once (`PUT /rsvp`, `push(state)`); `byOrganizer` note; 409 → closed message +
`refresh()`; 400 `dish-not-offered` → message + `refresh()`. Closed: „Odpowiedzi są zamknięte” + own answer or „Brak
odpowiedzi”. Root `data-guest-rsvp={placement}`. Texts PL/EN.

#### 2. Client page and shell card

**Files**: `src/pages/o/[key]/potwierdzenia.astro`, `src/components/rsvp/RsvpManager.tsx`,
`src/components/rsvp/` (sub-components as needed), `src/components/hooks/useRsvpBoard.ts`, `src/pages/o/[key].astro`,
`src/lib/shell/messages.ts`

**Intent**: The client runs the RSVP.

**Contract**:
- Page: like `zamowienia.astro` (second check, `LeadBanner`, `OfflineSync`, `ReadOnlyFrame` while the venue leads),
  SSR `getRsvpBoard(db, id, new Date())`.
- `RsvpManager { apiBase, initial, locale }` (`data-rsvp-manager`): „Termin” card (state text; `datetime-local`
  prefilled with the deadline or `<eventDate − 1 day>T20:00`; „Zbieraj odpowiedzi do tego terminu”; „Zamknij teraz”
  and „Wyłącz potwierdzenia” with `window.confirm`; a warning when guest links are off, linking `linki`); „Dania do
  wyboru” (checkboxes over `board.menu` by course + unavailable chosen options marked; „Zapisz dania”; a note when the
  menu is inactive — attendance only); „Zliczenia” (`data-rsvp-counts`, `data-rsvp-count="coming|notComing|noAnswer"`,
  per dish `data-rsvp-dish`); „Odpowiedzi gości” (per guest `data-rsvp-guest`: attendance select Przyjdzie / Nie
  przyjdzie / Brak odpowiedzi + dish select, saved on change; „wpisane przez organizatora” / time).
- `useRsvpBoard(apiBase, initial)`: one action at a time, answers replace the board, re-read every 15 s while visible
  and idle (reads started before a change ignored), failures shown.
- Shell: card „Potwierdzenia i wybór dania” → `/o/<key>/potwierdzenia` with `formatRsvpSummary`.

#### 3. Panel

**Files**: `src/lib/client-routes/sections.ts`, `src/pages/panel/wydarzenia/[id]/[sekcja].astro`,
`src/components/lead/ClientWorkCards.astro`, `src/pages/panel/wydarzenia/[id].astro`

**Intent**: Staff preview (edit while the venue leads), the venue's counts on the event card.

**Contract**: `CLIENT_SECTIONS` gains `potwierdzenia` (not a key section); the preview renders `RsvpManager` with
`panelClientApiBase(id)` (static in support mode); the card summary is `formatRsvpSummary(getRsvpBoard(...))` read in
the page's one `Promise.all`.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, `npm run build` pass
- `AI_PROVIDER=mock npm test` passes (sections list tests, if any, updated)

#### Manual Verification:

- Guest phone: Przyjdę → dish list → choice saved; after „Zamknij teraz” the section moves to the bottom read-only
- Client page and panel preview: deadline, options, counts and per-guest edits behave; read-only frame while the
  venue leads on the client link

---

## Phase 3: Smoke, demo, documentation

### Overview

HTTP coverage, demo data, CLAUDE.md.

### Changes Required:

#### 1. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Section 40 for the HTTP behaviour; section 38's guest key set gains `rsvp`.

**Contract**: section 40 — a new event of A (panel, date +10 days) with three guests, guest links on, full menu (A's
catalog from section 32): RSVP off → guest `rsvp` null and guest PUT 409; options (a name not on the menu / 13
options / duplicates / extra field → 400); deadline (malformed → 400; future → open); the guest's `rsvp` key set
exactly `attending byOrganizer deadline dish open options`, options `course name`, no `price`/`id` anywhere in the
guest JSON and no other guest's name; 204 with the same token, a new token after an answer; guest yes + dish, guest
no (client list shows `isAbsent`), dish not offered → 400 `dish-not-offered`; counts on the client board, the
dispatcher GET, the preview page (`data-rsvp-manager`) and the event card summary; the guest page has
`data-guest-rsvp` (PL/EN); close → guest 409 `rsvp-closed`, the read-only placement, the client proxy still 200;
TV seating key set unchanged; lead rule (client 409 `venue-leads`, staff via `…/klient/rsvp/guests/<id>` 200, then
409 `client-leads`); cross-event: A's key with event B's guest id → the identical 404 of an unknown id, owner B / a
waiter of A on A's dispatcher `…/klient/rsvp` → 404, malformed id → 404; deleting a guest removes their answer from
the counts; the event deleted.

#### 2. Demo

**File**: `scripts/demo.mjs`

**Intent**: Show RSVP on the main event.

**Contract**: after the order step: options = the main courses of the reduced menu (≤ 4), deadline = tomorrow 12:00
Warsaw; guest access switched on, three guests answer yes + a dish through their own links, then switched off again
(the demo's „dostęp gości wyłączony” stays true); the client enters yes + dish for ten more guests and „nie przyjdzie”
for the absent guest (no new absence → the published seating stays up to date); the demo fails unless the board's
counts match; prints a line („potwierdzenia: …”) and the page link.

#### 3. Documentation

**File**: `CLAUDE.md`

**Intent**: Document the RSVP model (attendance = `is_absent`), routes, token, UI, smoke 40, demo, deploy order.

### Success Criteria:

#### Automated Verification:

- `npm run smoke` passes against `AI_PROVIDER=mock npm run preview`
- `npm run demo` passes
- `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build` pass

#### Manual Verification:

- The demo's main event: `/o/<key>/potwierdzenia` shows the counts; the panel card shows the summary

---

## Testing Strategy

### Unit Tests:

- Date-time conversion across DST, deadline formatting, attendance derivation, counts, RSVP JSON validation, token key.

### Integration Tests:

- `tests/integration/guest-rsvp.test.ts` as listed in Phase 1; `guest-links.test.ts` stays green.

### Manual Testing Steps:

1. Open a demo guest link (switch guest access on), answer, change the dish, watch the client page update.
2. „Zamknij teraz” on the client page; the phone shows the answer read-only within one poll.
3. „Lokal prowadzi” on: the client page is read-only, the panel preview edits.

## Performance Considerations

One extra RPC per guest poll, in the same parallel round trip (both paths); a stable SQL function on indexed keys.
Events without RSVP return null early.

## Migration Notes

Additive (a nullable column, two tables, functions, a trigger). Deploy: the guest poll calls `guest_rsvp_state`, so
the migration must reach the database BEFORE the code (else every guest phone is a 500); old code keeps working on
the migrated database.

## References

- Roadmap `### S-25`, PRD v2 FR-039, Business Logic „lokal udostępnia, klient wybiera”
- Pattern: `save_guest_guess_with_place` (`20261109120000_multi_tenant_events.sql:456`), `event_menu_item`
  (`20261110220000_menu_catalog.sql`), guest token (`src/lib/guest-links/state.ts:41`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data, rules, service, routes and the guest token

#### Automated

- [x] 1.1 `npx supabase migration up` applies on the demo-populated local DB and `npx supabase db reset` from zero — 0b0e645
- [x] 1.2 `AI_PROVIDER=mock npm test` passes (unit + DB integration incl. `guest-rsvp.test.ts`, `match.test.ts`, `guest-links.test.ts`) — 0b0e645
- [x] 1.3 `npm run lint` and `npx astro check` pass — 0b0e645

### Phase 2: Guest, client and panel UI

#### Automated

- [x] 2.1 `npm run lint`, `npx astro check`, `npm run build` pass — 8cd7f66
- [x] 2.2 `AI_PROVIDER=mock npm test` passes (sections list tests, if any, updated) — 8cd7f66

#### Manual

- [ ] 2.3 Guest phone: Przyjdę → dish list → choice saved; after „Zamknij teraz” the section moves to the bottom read-only
- [ ] 2.4 Client page and panel preview: deadline, options, counts and per-guest edits behave; read-only frame while the venue leads on the client link

### Phase 3: Smoke, demo, documentation

#### Automated

- [x] 3.1 `npm run smoke` passes against `AI_PROVIDER=mock npm run preview` — 9373537
- [x] 3.2 `npm run demo` passes — 9373537
- [x] 3.3 `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build` pass — 9373537

#### Manual

- [ ] 3.4 The demo's main event: `/o/<key>/potwierdzenia` shows the counts; the panel card shows the summary
