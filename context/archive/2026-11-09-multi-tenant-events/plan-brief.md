# Restaurants and many events (F-02) — Plan Brief

> Full plan: `context/changes/multi-tenant-events/plan.md`

## What & Why

The app runs exactly one dinner per deployment (`event_singleton check (id = 1)`, `EVENT_ID = 1`, `default 1` on every `event_id`). PRD v2 turns it into a platform: many restaurants, each with many events, and no link or person may ever see another event's data (NFR-012, US-10). F-02 is the foundation every later M-2 slice builds on.

## Starting Point

Link keys already resolve to an event id, keys are globally unique and unique indexes are per event — but services mostly query without any event filter, DB functions act on "everything" under global advisory locks, cross-row FKs do not check the event, and `/` creates the one event for whoever comes first.

## Desired End State

Event 1 lives on in „Restauracja domyślna” with every row and link unchanged. Any number of events exist side by side; every service, DB function and FK is event-scoped, so a foreign id behaves exactly like an unknown id. `/` only says "link only". Events are created by `createEvent` (server, used by tests now and the panel later) or `npm run event:create`; smoke and demo create their own restaurant + events and the smoke proves cross-event denials.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Bootstrap until the panel (roadmap Unknown) | Dependency-free `scripts/lib/platform.mjs` over PostgREST with the service-role key (local-only for smoke/demo) + `npm run event:create` CLI | No HTTP creation route to secure or forget, same access the demo script already uses |
| Key generation | DB column defaults for `organizer_key`/`tv_key` (as `restaurant_key`) | Creation becomes one plain insert from TS and from scripts |
| Starter questions for script-created events | Smoke/demo: existing `POST …/questions/starter`; CLI: `seed.ts` via `--experimental-strip-types` | One source of the 90 texts, no TS runtime dependency |
| Scoping in code | Every DB service function takes `eventId` as its 2nd parameter; callers pass `access.event.id` | Mechanical, compiler-enumerated for inserts/RPCs, matches existing patterns |
| Scoping in DB | `p_event_id` on every changed function (old signatures dropped), per-event locks `(3003, id)`/`(3008, id)`, composite `(event_id, x)` FKs | Defence in depth: a service bug cannot link or touch another event's rows |
| `guess.guest_id` FK | Stays single-column | The `guest → guess` one-to-one PostgREST embed depends on it |
| `event.id` | `integer generated always as identity`, sequence past existing ids | Two-argument advisory locks take `int4`; ids never reused |
| Tests | Each integration file creates and deletes its own restaurant + events | No test touches real/local events; isolation is natural |
| Default restaurant | „Restauracja domyślna”, created only when events exist | PRD v2 Constraints; a fresh DB stays empty |

## Scope

**In scope:** migration, DB types, `createRestaurant`/`createEvent`, scoping of all services/routes/pages, home page without creation (`/api/event` deleted), test rework + `isolation.test.ts`, `event:create` + `links` CLIs, smoke/demo bootstrap + cross-event smoke, CLAUDE.md/README.

**Out of scope:** accounts and panel (F-03, S-10, S-11), event date/status/archive, restaurant flags, limits for 150 guests (S-19), branding (S-18), any UI change beyond `/`.

## Architecture / Approach

Link key → `resolveAccess` → `access.event.id` → every service `(db, eventId, …)` → filtered queries and `p_event_id` RPCs → DB functions check event membership; composite FKs make cross-event references impossible. Scripts create restaurants/events directly in the (local) DB.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Event-scoped schema and server code | Migration (tested on pre-migration demo data), types, all services/routes/pages, `/`, tests on own events | Huge mechanical diff; a missed unscoped select |
| 2. Isolation proof, event CLI and links | `isolation.test.ts`, `platform.mjs`, `event:create`, `links` | Coverage gaps in the isolation matrix |
| 3. Smoke and demo on their own events | Smoke bootstrap + cross-event section, demo bootstrap, from-scratch reset | Smoke sections assuming global state |
| 4. Docs | CLAUDE.md, README | Stale singleton wording |

**Prerequisites:** local Supabase running, `.env` → 127.0.0.1; pre-migration data already captured (planning step).
**Estimated effort:** one long session; Phase 1 is ~70% of it.

## Open Risks & Assumptions

- PostgREST embeds or RPC resolution could change with the new FKs/signatures — covered by existing integration tests; fallback is a single-column FK or an embed hint.
- Node 22 in CI needs `--experimental-strip-types` for the CLI only (smoke/demo don't import TS).
- Deploy: the migration must reach the (new) platform DB before the code; never the old dinner project.

## Success Criteria (Summary)

- Event 1 and its links survive the migration unchanged; new events are fully independent.
- A key or API of event A never reads or writes event B (integration + smoke).
- Full test suite, lint, type check, build, smoke and demo green.
