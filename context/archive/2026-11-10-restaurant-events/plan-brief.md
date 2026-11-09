# Restaurant events and the client's links (S-11) — Plan Brief

> Full plan: `context/changes/restaurant-events/plan.md`

## What & Why

The restaurant runs its own events in its panel: create an event (name, date, expected guests), land on its card and copy the client's organizer link, the TV link and the staff tablet link; browse upcoming, past and archived events; replace a link after a confirmation naming who is cut off; archive/restore; the owner deletes permanently. This is the M-2 north star (PRD v2 FR-024, FR-025, US-06 „< 3 minutes to a copied client link”, US-09, US-10).

## Starting Point

F-02 made events belong to restaurants (keys from column defaults, children cascade on delete) but left date and status for this slice; nothing in the app creates events (scripts insert them). F-03/S-10 gave the staff panel, the central guards (`panelRestaurantApi`, `panelEventApi`, one 404 for everything foreign), and an empty restaurant page.

## Desired End State

`/panel/restauracje/<id>` has „Nowe wydarzenie” and tabs „Nadchodzące / Minione / Archiwum”; `/panel/wydarzenia/<id>` is the event card with the three links (copy, open, replace with a who-is-cut-off confirm), edit, archive/restore and owner-only delete. Old keys die at once; deletes cascade within the event only; another restaurant's staff get the identical denial.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Data model | `event_date` (NOT NULL, Warsaw-today default, backfilled from `created_at`), `expected_guests` (nullable 1–1000), `archived_at` | Additive; existing insert paths (tests, smoke, CLI) keep working unchanged. |
| Status | Archive = a timestamp, not a status enum; no `kind` column | S-15 adds `kind` for templates and filters the one list query. |
| "Today" | One pure function, `Europe/Warsaw`, event dated yesterday counts as today until 12:00 | Server runs in UTC; FR-029's rule is ready for S-21 and the list doesn't drop a running party at midnight. |
| Roles | `owner, manager` for everything; `owner` only for delete; waiters and outsiders get the identical 404 | PRD v2 access table; S-12's managers inherit exactly these rights. |
| Archive | Moves the event between lists only; links keep working | Retention is S-26; restore must be lossless. |
| Delete | One `delete … where id and restaurant_id`, cascades | Every child FK already cascades (proven by the test helpers). |
| Rotation | New `generateAccessKey()` in one column, per kind route `/links/<kind>` | Same pattern as `rotateRestaurantKey`; middleware resolves keys per request. |
| Card API | `GET /api/panel/events/<id>` now returns link paths | Owners/managers hold the links (PRD); smoke-25's "no keys" assertion updated deliberately. |
| Expected guests | Optional in the form | Keeps the create flow short; the card shows „—” when unknown. |
| UI | Server-rendered lists + two islands (create form, card) over JSON | Same pattern as the platform panel; copy needs JS anyway. |
| Client's own link handling | Unchanged (S-14 decides) | No regression of v1 on the organizer pages. |

## Scope

**In scope:** migration + types; `src/lib/events/` (rules, dates, messages, zod, service); `findPanelEvent`; 3 route files; restaurant page lists + create island; event card page + island; unit + integration tests; smoke section 27 (+ section-25 assertion); demo with upcoming/past/archived events; CLAUDE.md, README.

**Out of scope:** templates (S-15), team invitations (S-12), waiter day view (S-21), admin support view (S-13), client/restaurant split (S-14), retention/export (S-26), TV/tablet UX on a dead key, times of day, pagination.

## Architecture / Approach

Page → `findPanelEvent`/`findPanelRestaurant` (membership + role) → `src/lib/events/service.ts` (every query filtered by the guarded restaurant id) → Postgres. Islands POST/PATCH/DELETE JSON to `/api/panel/...` (Origin-checked by the middleware) and replace the card with each answer.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema, rules, services | Columns, pure rules/dates/messages, service, unit + integration tests | Time-zone logic; cascade surprises on delete |
| 2. Guard, routes, pages, islands | The panel flow end to end | Denial uniformity across pages and routes |
| 3. Smoke and demo | Section 27 (cross-tenant, Origin, rotation, delete) and demo lists | Smoke ordering vs section 25/26 counters |
| 4. Docs | CLAUDE.md, README | — |

**Prerequisites:** S-10 done; local Supabase running.
**Estimated effort:** one overnight slice, 4 phases.

## Open Risks & Assumptions

- Europe/Warsaw is assumed for every restaurant until a per-restaurant setting exists.
- Archived events stay reachable by their links until retention (S-26) or deletion.
- Expected guests capped at 1000 (informational; the guest list limit is separate, S-19).

## Success Criteria (Summary)

- An owner goes from „Nowe wydarzenie” to a copied, working client link in well under 3 minutes.
- Replaced and deleted links open nothing; other restaurants' staff can't tell an event exists.
- `npm test`, lint, check, build, smoke (twice) and demo all green.
