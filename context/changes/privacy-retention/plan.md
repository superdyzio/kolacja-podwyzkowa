# Guest data retention, event export and the guest privacy notice (S-26) — Implementation Plan

## Overview

S-26 „Prywatność i retencja danych gości” (PRD v2 FR-040, US-09, NFR-019, NFR-021; Access Control: the retention term is a
restaurant SETTING — owner only; export is the manager's). Four outcomes:

1. The owner sets per restaurant after how many days from the event date its guests' data is deleted (default 30,
   1–365); managers (and support mode) read it.
2. The data really disappears after that term (NFR-019) — WITHOUT any scheduler (no cron, no EventBridge, no pg_cron:
   an infra change only the user approves). Three triggers share ONE DB function: before any read of an expired event
   (key links and panel guards), a throttled lazy sweep from panel page views, and a CLI `npm run retention`.
3. Owners and managers download an event's data from the panel event card (JSON + two CSVs) before the deletion —
   never a link key, token or hash; the admin's support mode may not export.
4. The guest reads a DRAFT privacy notice („do przeglądu prawnika”) from a link on `/g/<key>`, PL + EN, naming the
   restaurant as the controller and the platform as processor in neutral words (white-label: no product name).

## Current State Analysis

- `restaurant` has no settings beyond name / brand colour; `event` has `event_date` (Europe/Warsaw day), `archived_at`,
  `is_template`. Nothing ever deletes guest data except „Reset danych” (`reset_event`, panel) and deleting the event.
- Guest data lives in: `guest` (names, `diets`, `diet_note`, `is_absent`, `access_key`, `group_id`) and its cascades
  (`seat_assignment`, `guess`, `guest_rsvp` cascade; `ai_topic.guest_id`, `order_item.guest_id`,
  `order_piece.guest_id`, `seating_snapshot_seat.guest_id` set null), `guest_group`, `seating_snapshot_seat.guest_name`
  (names copied at publish — survive a guest delete), `tv_spotlight.text` (a drawn person's name),
  `order_item.note` (free text, may name a person or a health need), `event_waiter.display_name` (S-21b, a person's
  name; dead after the floor window anyway).
- Every keyed read goes through `resolveAccess` (`src/lib/access/resolve.ts`, one query per role); every panel event
  read through `findEventMembership` (`src/lib/auth/service.ts:378`) inside `findPanelEvent` / `findFloorEvent`, except
  the admin's support branch (`record_support_access`) in `findPanelEvent` (`src/lib/panel-api.ts`).
  `getClientAccess`, both dispatchers, the floor and the waiter floor all sit behind those.
- `support_log` is restaurant-level, append-only (trigger refuses update/delete unless the restaurant row is gone);
  no FK to events — a purge that deletes no event or restaurant row never touches it.
- Lambda behind a Function URL: no background work after the response (the instance freezes), one request per
  instance — the lazy sweep must be awaited inline and cheap.
- Pure date helpers exist: `platformToday`, `addDays`, `eventTiming`, `formatEventDate` (`src/lib/events/dates.ts`);
  floor window `isFloorOpen` (`src/lib/floor/rules.ts`).

## Desired End State

- Migration `20261111050000_privacy_retention.sql` (additive, data-preserving): `restaurant.guest_retention_days`
  (default 30, CHECK 1–365), `event.guest_data_purged_at`, singleton `retention_sweep`, DB functions
  `guest_data_expired`, `event_has_guest_data`, `purge_event_guest_data`, `expired_guest_data_events`,
  `claim_retention_sweep`.
- An event whose term passed is purged before anything of it is served (key links, panel, support mode, export);
  idle expired events are purged by the sweep (panel page views, ≤ once per 10 minutes) or `npm run retention`.
- `GET|PATCH /api/panel/restaurants/<id>/retention`, `GET /api/panel/events/<id>/export?format=json|guests-csv|orders-csv`,
  `/g/<key>/prywatnosc`; UI sections on the restaurant page, the event card and the client shell.
- Smoke section 41, the demo shows the term, a purged archived event and the export link; CLAUDE.md documents it.

### Key Discoveries:

- The noon window: `eventTiming` keeps yesterday's event „today” until 12:00 Warsaw. With `N ≥ 1` the rule
  `event_date + N < warsaw_today` purges at the earliest at 00:00 two days after the event — always outside the window.
- `seating_snapshot_seat.guest_name` survives guest deletion (`on delete set null` of `guest_id`), so snapshots must be
  deleted (DELETE, never TRUNCATE: ids feed the poll tokens; reset does the same).
- `tests/integration/access.test.ts` compares the OrganizerAccess object with `toEqual` — keep the Access shapes
  unchanged; pages read retention info with a separate small query.
- `panelEventApi` logs a support `access` row for any GET on an owner route BEFORE the route runs — a support-refusing
  route needs a membership-only guard (like `findFloorEvent`).
- White-label (event-branding): guest pages never show `PRODUCT_NAME`.

## What We're NOT Doing

- No scheduler of any kind (cron, EventBridge, pg_cron, Supabase scheduled functions) — the user's later decision.
- No anonymisation of order lines beyond clearing `note` and the guest link: dish, course, quantity, price and
  delivered pieces stay (the venue's bill).
- No retention of AI usage rows, questions, menu options, the venue, the brand or the event row — those stay.
- No final legal text, no company data, no regulamin / DPA (Open Question 6, FR-041 is S-30).
- No `.xlsx`, no ZIP bundle, no per-event retention override, no notification before deletion.
- No change to the Access type shapes; no new poll or token part.
- Offline copies on staff devices (S-27) and the organizer's own localStorage copies are outside the platform; the
  organizer's offline cache refreshes to the empty state at its next online sync (documented for S-27).

## Implementation Approach

One SQL function decides and deletes (`purge_event_guest_data(p_event_id, p_now)`): it re-checks eligibility itself
(not a template, `guest_data_expired`), so no caller can purge a live event or a template by passing a wrong id. It is
idempotent with a lock-free fast path („clean”: already purged and no guest data left). Callers:

1. **Pre-read** (the „never served” guarantee): `resolveAccess` (all four roles) and `findEventMembership` add
   `event_date, guest_data_purged_at, restaurant(guest_retention_days)` to their existing single query; when the
   pure `isGuestDataExpired` says expired, they call the RPC (any status but an error continues; a failure throws →
   500, never a pass). The guest branch then denies (the guest no longer exists). The support branch of
   `findPanelEvent` calls the RPC unconditionally (rare path). Calling it whenever expired (not only while
   `purged_at` is null) also removes guests someone added to an old event after its purge.
2. **Lazy sweep**: panel page GETs (staff area `panel`, with a session) call `sweepGuestRetention(db, now)` — an
   in-process throttle (10 min per instance), then `claim_retention_sweep` (DB, one winner per 10 min), then
   `expired_guest_data_events(now, null, 25)` and one RPC per event (one transaction each). Best effort: errors are
   logged and never fail the page.
3. **CLI** `npm run retention` (`scripts/retention.mjs`, shared helper in `scripts/lib/platform.mjs`): local DB unless
   `--remote`; `--dry-run`, `--restaurant-id <id>`, `--limit <n>`.

## Critical Implementation Details

- **Lock order**: the purge takes `pg_advisory_xact_lock(3003, event)`, then `(3008, event)`, then the event row
  `for update` — the same order as `reset_event`, so a concurrent reset or seating write never deadlocks with it. The
  fast path (`purged_at` set ∧ `not event_has_guest_data`) runs before any lock.
- **Deletion order**: `tv_spotlight`, `seat_assignment`, `seating_snapshot` (cascades tables/seats/rooms),
  `order_item.note = null`, `event_waiter`, `guest_group`, `guest` (cascades guess, guest_rsvp; set-null ai_topic,
  order_item, order_piece guest ids), then `event` set `guest_data_purged_at = coalesce(…, p_now)`,
  `guest_access_enabled = false`.
- **Clock**: every caller passes `now` (routes `new Date()`, tests fixed instants); SQL derives the Warsaw day from
  `p_now`, JS from `platformToday(now)` — same instant, same answer.
- **Hot paths**: the guest and TV polls pay nothing extra for a live event (columns in the existing query); only an
  expired event costs one RPC per request.

## Phase 1: Data, purge and its triggers

### Overview

The migration, the pure rules, the DB service, the pre-read hooks in both guards, the lazy sweep in the middleware and
the CLI — with unit and integration tests. No UI yet.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261111050000_privacy_retention.sql`

**Intent**: Add the setting, the purge marker, the sweep state and the five functions; keep every row.

**Contract**:
- `restaurant.guest_retention_days integer not null default 30` + CHECK `between 1 and 365`
  (`restaurant_guest_retention_days`); existing restaurants get 30.
- `event.guest_data_purged_at timestamptz` (null = never purged).
- `retention_sweep (id smallint primary key default 1 check (id = 1), last_run_at timestamptz)` with its one row; RLS
  on, `revoke all … from anon, authenticated`.
- `guest_data_expired(p_event_date date, p_retention_days integer, p_now timestamptz) → boolean` (stable):
  `p_event_date + p_retention_days < (p_now at time zone 'Europe/Warsaw')::date`.
- `event_has_guest_data(p_event_id integer) → boolean`: exists guest / guest_group / seating_snapshot / tv_spotlight /
  event_waiter / order_item with a note.
- `purge_event_guest_data(p_event_id integer, p_now timestamptz) → jsonb`
  `{ status: "not-found" | "kept" | "clean" | "purged", purgedAt, guests, groups, snapshots, spotlight, waiters,
  notes }` — templates and unknown ids `not-found`; not expired `kept`; fast path `clean`; else locks, deletes (order
  above), stamps.
- `expired_guest_data_events(p_now timestamptz, p_restaurant_id integer, p_limit integer) → table (event_id integer)`:
  non-template, expired (by its restaurant's days), `guest_data_purged_at is null or event_has_guest_data(id)`,
  `p_restaurant_id` null = all, oldest `event_date` first, then id, `limit p_limit`.
- `claim_retention_sweep(p_now timestamptz, p_interval_seconds integer) → boolean`: one conditional UPDATE of the
  singleton (`last_run_at is null or last_run_at <= p_now - interval`).
- Every function `set search_path = ''`, `revoke execute … from public, anon, authenticated`, grant to service_role;
  comments.

#### 2. Database types

**File**: `src/db/database.types.ts`

**Intent**: Mirror the new columns, the table and the five functions.

**Contract**: `restaurant.guest_retention_days`, `event.guest_data_purged_at`, `retention_sweep` Row/Insert/Update,
`Functions` entries with Args/Returns.

#### 3. Pure rules

**File**: `src/lib/privacy/rules.ts` (+ `index.ts` barrel, `messages.ts` started)

**Intent**: One source of the numbers and the date rule for SSR, islands and services.

**Contract**: `DEFAULT_GUEST_RETENTION_DAYS = 30`, `MIN_GUEST_RETENTION_DAYS = 1`, `MAX_GUEST_RETENTION_DAYS = 365`,
`RETENTION_EDIT_ROLES` (owner), `RETENTION_VIEW_ROLES` (owner, manager), `EXPORT_ROLES` (= `EVENT_STAFF_ROLES`),
`parseRetentionDays(value: unknown) → { ok, days } | { ok: false }` (integers only), `guestDataDeleteAfter(eventDate,
days)` (= `addDays`, the last day the data is kept), `isGuestDataExpired(eventDate, days, now)`
(`platformToday(now) > deleteAfter`), `RETENTION_SWEEP_INTERVAL_MS = 600_000`, `RETENTION_SWEEP_LIMIT = 25`,
`createSweepThrottle(intervalMs)` (`due(nowMs)` true at most once per interval).

#### 4. DB service

**File**: `src/lib/privacy/service.ts`

**Intent**: The only TS caller of the new functions.

**Contract**: `purgeEventGuestData(db, eventId, now) → PurgeResultDto` (throws on error),
`enforceGuestRetention(db, row: { eventId, eventDate, retentionDays }, now) → PurgeResultDto | null` (null = not
expired, no RPC), `purgeExpiredGuestData(db, now, { restaurantId?, limit? }) → { events: PurgeResultDto[] }`,
`sweepGuestRetention(db, now)` (throttle → claim → purge; logs errors, never throws), `getRestaurantRetention(db,
restaurantId) → RetentionSettingsDto | null`, `setRestaurantRetention(db, restaurantId, days) → "updated" |
"not-found"`, `getEventRetention(db, eventId) → EventRetentionDto | null` (`{ eventDate, retentionDays, deleteAfter,
purgedAt }`, templates null). DTOs in `src/types.ts`.

#### 5. Pre-read hooks

**Files**: `src/lib/access/resolve.ts`, `src/lib/auth/service.ts`, `src/lib/panel-api.ts`

**Intent**: Expired data is never served: purge before the read.

**Contract**: `resolveAccess(db, role, key, now = new Date())` — each branch's select adds
`event_date, guest_data_purged_at, restaurant(guest_retention_days)` (guest branch nested inside `event(…)`); expired →
`enforceGuestRetention`; guest branch → `null` after a purge. `findEventMembership(db, accountId, eventId, now = new
Date())` — same columns; after the membership is confirmed, `enforceGuestRetention`. `findPanelEvent`'s support branch
→ `purgeEventGuestData` before returning. Return shapes unchanged. `decideAccess` passes no clock (default). No SERVICE
gains a purge side effect (e.g. `getEventCard`, `listRestaurantEvents` stay pure reads — integration tests read
old events through them): only these guards, the sweep and the CLI call the purge.

#### 6. Lazy sweep

**File**: `src/middleware.ts`

**Intent**: Idle expired events disappear without a scheduler.

**Contract**: in `guardStaffArea`, `area === "panel"`, GET, `locals.staff` set → `await sweepGuestRetention(db, new
Date())` before `next()`.

#### 7. CLI

**Files**: `scripts/retention.mjs`, `scripts/lib/platform.mjs`, `package.json`

**Intent**: The user can purge (or schedule a purge later) without the app.

**Contract**: `npm run retention -- [--dry-run] [--restaurant-id <id>] [--limit <n>] [--remote]`; prints the host
first; a non-local DB needs `--remote`; shared `purgeExpiredGuestData(env, { restaurantId, limit, dryRun, now })`
(RPC `expired_guest_data_events`, then `purge_event_guest_data` per event); prints one line per event and a total.

#### 8. Tests

**Files**: `src/lib/privacy/privacy.test.ts`, `tests/integration/privacy-retention.test.ts`

**Intent**: Prove the rule at its edges and the purge's exact reach.

**Contract**: unit — `isGuestDataExpired` at N = 1 / 30 around midnight Warsaw in CET and CEST, never inside the floor
window for any N ≥ 1, `parseRetentionDays` edges, throttle. Integration (own restaurants + events, `p_now` fixed):
eligibility matrix (template with an old date, today's event, yesterday's event before noon, `event_date + N` exactly,
`+ N + 1`, archived past event, another restaurant with a different N); a full event (guests with diets, group, RSVP,
guess, seats, published snapshot, spotlight person, order line with note and guest, piece marked by a guest, AI topic
of a guest, waiter, drinks, questions) → purged: every guest table empty, snapshot seats gone, notes null, order lines
and drinks with prices kept, venue and questions kept, ai_topic rows kept with null guest, `guest_data_purged_at` set,
guest access off; second call `clean`; a guest added afterwards → listed again and purged; `support_log` rows of the
restaurant unchanged; `expired_guest_data_events` with the restaurant filter and limit; `claim_retention_sweep` once
per interval; `resolveAccess` guest key of an expired event → null, organizer key → access with guests gone;
`findEventMembership` purges.

### Success Criteria:

#### Automated Verification:

- `npx supabase migration up` applies on the populated local DB (demo data of HEAD) with row counts unchanged; `npx supabase db reset` applies from zero
- `AI_PROVIDER=mock npm test` passes (unit + DB integration)
- `npm run lint` and `npx astro check` pass
- `npm run retention -- --dry-run` lists against the local DB; without `--remote` a non-local URL is refused

#### Manual Verification:

- Reading the purge function's deletion list against `src/db/database.types.ts`: no table with a person's name or health data left out

---

## Phase 2: Settings, export, privacy notice and banners

### Overview

The owner's setting, the export, the guest's privacy page and what purged events look like — PL and EN.

### Changes Required:

#### 1. Retention route

**File**: `src/pages/api/panel/restaurants/[id]/retention.ts` (+ `src/lib/privacy/api.ts` zod)

**Intent**: Owners set, owners and managers read (support mode reads, logged; writes are the guard's 404).

**Contract**: `GET` → `RetentionSettingsDto { restaurantId, guestRetentionDays, minDays, maxDays }`
(`panelRestaurantApi(…, RETENTION_VIEW_ROLES)`); `PATCH { guestRetentionDays }` strict (`RETENTION_EDIT_ROLES`) →
200 the DTO, 400 `privacyMessages().daysRange(min, max)`; waiter, manager writing, foreign / unknown / malformed id →
the identical 404.

#### 2. Export

**Files**: `src/lib/privacy/export.ts` (pure), `src/lib/privacy/export-service.ts` (DB),
`src/pages/api/panel/events/[id]/export.ts`, `src/lib/panel-api.ts`

**Intent**: Owners and managers download the event's data; support mode never (no log row).

**Contract**: new guard `findMemberEvent(locals, id, roles)` / `panelMemberEventApi` (membership only, mirrors
`findFloorEvent` without the window; malformed, unknown, foreign, template, switched-off, waiter, admin outside a
membership → the identical 404). `getEventExport(db, restaurantId, eventId, now) → EventExportDto | null` composed
from `getGuestList`, `getRsvpBoard`, `getVenue`, `getLatestSnapshot` (seat by guest id) + `toPublishedSeating`,
`getOrderItems` + `getDrinkItems` (+ `orderTotals` / `drinkTotals`), `getGuessBoard`, an event row with the
restaurant's name and days — NO ids, keys, tokens or hashes, guests referenced by name. Pure `exportGuestsCsv(dto,
locale)` / `exportOrdersCsv(dto, locale)`: `;` separator, CRLF, UTF-8 BOM, quoting, a formula-injection guard
(leading `= + - @` tab / CR → `'`), amounts as `formatAmountInput`, the orders CSV ending with the bill total.
`GET ?format=json|guests-csv|orders-csv` (default json; anything else 400) → `Content-Disposition: attachment;
filename="wydarzenie-<id>-<date>[-goscie|-zamowienia].<json|csv>"`, `Cache-Control: no-store` (middleware), JSON
`application/json; charset=utf-8`, CSV `text/csv; charset=utf-8`. A purged event exports with empty guests and
`guestData.purgedAt`.

#### 3. Guest privacy notice

**Files**: `src/pages/g/[key]/prywatnosc.astro`, `src/pages/g/[key].astro`, `src/lib/privacy/messages.ts`

**Intent**: The guest reads what happens to their data, from their own link.

**Contract**: guarded by the `/g/` middleware (`accessFor(locals, "guest")`, else `NoAccess` 404); content from
`privacyNoticeMessages(locale)`: draft banner `data-privacy-draft` („Wersja robocza — do przeglądu prawnika” / „Draft —
for legal review”), the controller = the restaurant's (brand) name, the processor = „dostawca systemu” / „the system
provider” (no product name), what data, why, who sees it, no AI (NFR-021), the term (`N` days, the date), rights,
browser storage; back link to `/g/<key>`. Guest page footer link „Informacja o prywatności” / „Privacy notice”
(`data-privacy-link`).

#### 4. Panel and client UI

**Files**: `src/pages/panel/restauracje/[id].astro`, `src/components/privacy/RetentionSettingsForm.tsx` (+ hook),
`src/components/privacy/GuestDataNote.astro`, `src/pages/panel/wydarzenia/[id].astro`, `src/pages/o/[key].astro`

**Intent**: The setting where restaurant settings live; the term and the export where the event is.

**Contract**: restaurant page section „Prywatność danych gości” (`data-retention-section`; owners the island
`data-retention-form`, managers and support a read-only line `data-retention-read-only`; waiters nothing); event card
section „Dane gości i eksport” (`data-event-privacy`: `GuestDataNote` — „usunięte po <date>” `data-guest-retention` or
„Dane gości usunięte <date>” `data-guest-data-purged` — and for members three download links `data-event-export`;
support mode the note only); the client shell shows `GuestDataNote` under the header. `getEventRetention` joins the
pages' existing `Promise.all`.

#### 5. Tests

**Files**: `src/lib/privacy/privacy.test.ts`, `tests/integration/privacy-retention.test.ts`

**Intent**: Export content and CSV safety.

**Contract**: unit — CSV escaping (`;`, quotes, newlines, formula prefixes), BOM, headers in PL/EN, bill total row;
integration — `getEventExport` of a full event contains guests with diets, RSVP, seat, guess, orders with prices and
the bill, and NO organizer / TV / restaurant / guest key, no `access_key`/`token`/`hash` field; another restaurant's
id → null; a template → null.

### Success Criteria:

#### Automated Verification:

- `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build` pass

#### Manual Verification:

- The restaurant page (owner: form, manager: read-only) and the event card's „Dane gości i eksport” read well in PL and EN
- The downloaded guests CSV opens in a spreadsheet with Polish characters and columns intact
- The guest's privacy page on a phone (PL/EN) is readable and clearly marked as a draft

---

## Phase 3: Smoke, demo and documentation

### Overview

HTTP-level proof, the demo showing the slice, CLAUDE.md and the migration check on populated data.

### Changes Required:

#### 1. Smoke section 41

**File**: `scripts/smoke.mjs` (+ `scripts/lib/platform.mjs` seam `setEventDate`)

**Intent**: The access matrix and the purge path over HTTP.

**Contract**: owner A GET 30 → PATCH 7 → 200; manager GET 200, PATCH 404; waiter 404; owner B on A 404; unknown /
malformed id 404; 0 / 366 / 7.5 / string / extra field → 400; no session 401; foreign Origin 403. Event P of A (today,
panel) filled through its organizer link (guests with diets, group, room + table, published seating, guesses, order
line with note and guest, spotlight person, guest links on); export as manager: JSON (attachment, no-store, diets,
RSVP, seat, orders with prices, bill) and both CSVs, none containing any of P's keys or a guest key; owner B, waiter,
event key (`/api/o/<key>/export`) → 404; the admin in support mode → 404 and the owner's support log unchanged. A
template of A with its date moved 100 days back (seam), event Q of A today with a guest. P's date → 40 days ago
(panel PATCH); the first access (P's guest key) → 404, then the organizer API: no guests, no published seating, no
spotlight, order line kept with price and without note; the TV poll and the tablet: no names; the shell and the event
card show the purged note; the export has no guests. `purgeExpiredGuestData(env, { restaurantId: A })` then leaves
the template (no `guest_data_purged_at`, rooms intact), Q (guest still there) and event B (guests unchanged)
untouched. Privacy page on a guest of event A: 200, PL draft marker and A's name, `?lang=en` → EN draft marker, no
product name; unknown key → identical 404; the guest page links to it. Events of the section deleted.

#### 2. Demo

**File**: `scripts/demo.mjs`

**Intent**: Show the slice on the demo restaurant.

**Contract**: the owner sets the term (PATCH 30, prints „Retencja danych gości: 30 dni”); „Komunia Zosi (demo)”
(−60 days) is purged by its archive PATCH (through `findEventMembership`); the demo reads its export JSON and fails
unless `event.guestData.purgedAt` is set; the main event's export is fetched as the manager (200, attachment) and its link printed with
the privacy page of one guest (after guest links are known — or the organizer's `/linki` note).

#### 3. Documentation

**Files**: `CLAUDE.md`, `context/foundation/overnight-log.md`

**Intent**: Architecture, commands, deploy note, the scheduler as the user's later decision.

**Contract**: a „Guest data retention, export and the privacy notice (privacy-retention, S-26)” bullet under Data
access; `npm run retention` under Commands; smoke 41 and the demo additions in their command lines; deploy: the
migration BEFORE the code (`resolveAccess` and `findEventMembership` select the new columns).

### Success Criteria:

#### Automated Verification:

- `npm run smoke` passes against `AI_PROVIDER=mock npm run preview`
- `npm run demo` passes and prints the term, the purged event and the export link
- `npx supabase db reset` + `AI_PROVIDER=mock npm test` pass from zero
- `npm run lint`, `npx astro check`, `npm run build` pass

#### Manual Verification:

- The demo's „Komunia Zosi (demo)” card shows „Dane gości usunięte” and its client link shows the same note
- `npm run retention -- --dry-run` output is understandable for the user who may schedule it later

---

## Testing Strategy

### Unit Tests:

- The date rule in CET/CEST at both sides of midnight; never inside the floor window; the range parser; the throttle.
- CSV builders: escaping, injection guard, BOM, locale headers, totals.

### Integration Tests:

- Eligibility matrix, the purge's reach (deleted vs kept, table by table), idempotence, re-purge after new guests,
  `support_log` untouched, restaurant filter and limit, the sweep claim, both pre-read hooks, the export content.

### Manual Testing Steps:

1. Owner sets 7 days on the restaurant page; manager sees it read-only.
2. Event card → download the three files; open the CSVs in a spreadsheet.
3. Demo „Komunia Zosi (demo)” card and client link show the purged note.
4. A guest's phone → „Informacja o prywatności” (PL/EN).

## Performance Considerations

Live events: zero extra queries (columns in existing selects). Expired events: one RPC per request (fast path without
locks). Sweep: ≤ one claim RPC per instance per 10 minutes, ≤ 25 purges per claim, on panel page views only (never on
guest or TV polls). `expired_guest_data_events` scans non-template events with `event_has_guest_data` for purged
ones — fine at thousands of events; an index on `event (event_date)` is the lever if it grows.

## Migration Notes

Additive: two columns with defaults/nullable, one table with its row, five functions. `resolveAccess` and
`findEventMembership` select the new columns, so the migration must reach the database BEFORE the code (else every
key link and panel event page is a 500). Old code keeps working on the migrated DB. First run on a database with old
events: the first panel page view (or `npm run retention`) purges up to 25 expired events per 10 minutes.

## References

- Roadmap: `context/foundation/roadmap.md` § S-26; PRD v2 FR-040, US-09, NFR-019, NFR-021, Access Control.
- Reset pattern: `supabase/migrations/20261109120000_multi_tenant_events.sql` `reset_event` (locks, delete order).
- Guard patterns: `src/lib/panel-api.ts` (`findFloorEvent`), `src/pages/api/panel/restaurants/[id]/branding.ts`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data, purge and its triggers

#### Automated

- [x] 1.1 `npx supabase migration up` applies on the populated local DB (demo data of HEAD) with row counts unchanged; `npx supabase db reset` applies from zero — ea90138
- [x] 1.2 `AI_PROVIDER=mock npm test` passes (unit + DB integration) — ea90138
- [x] 1.3 `npm run lint` and `npx astro check` pass — ea90138
- [x] 1.4 `npm run retention -- --dry-run` lists against the local DB; without `--remote` a non-local URL is refused — ea90138

#### Manual

- [ ] 1.5 Reading the purge function's deletion list against `src/db/database.types.ts`: no table with a person's name or health data left out

### Phase 2: Settings, export, privacy notice and banners

#### Automated

- [x] 2.1 `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build` pass

#### Manual

- [ ] 2.2 The restaurant page (owner: form, manager: read-only) and the event card's „Dane gości i eksport” read well in PL and EN
- [ ] 2.3 The downloaded guests CSV opens in a spreadsheet with Polish characters and columns intact
- [ ] 2.4 The guest's privacy page on a phone (PL/EN) is readable and clearly marked as a draft

### Phase 3: Smoke, demo and documentation

#### Automated

- [ ] 3.1 `npm run smoke` passes against `AI_PROVIDER=mock npm run preview`
- [ ] 3.2 `npm run demo` passes and prints the term, the purged event and the export link
- [ ] 3.3 `npx supabase db reset` + `AI_PROVIDER=mock npm test` pass from zero
- [ ] 3.4 `npm run lint`, `npx astro check`, `npm run build` pass

#### Manual

- [ ] 3.5 The demo's „Komunia Zosi (demo)” card shows „Dane gości usunięte” and its client link shows the same note
- [ ] 3.6 `npm run retention -- --dry-run` output is understandable for the user who may schedule it later
