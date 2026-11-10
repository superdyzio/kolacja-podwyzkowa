# Venue templates of a restaurant (S-15) — Plan Brief

> Full plan: `context/changes/venue-templates/plan.md`

## What & Why

Owners and managers save a restaurant's room layout once as a venue template (plan, rooms, tables, drawing), create
events from it with the room ready, and push later layout changes into a chosen event with „Zaktualizuj z szablonu”
(FR-030, US-06, US-09).

## Starting Point

Every event has its own venue (`venue_plan`, `venue_room`, `venue_table`) edited by `VenueEditor` through the
organizer routes; S-14's panel dispatcher already runs those routes for staff.

## Desired End State

Templates are hidden event rows (`event.is_template`) edited with the existing editor through a template dispatcher;
copies and updates are single DB transactions; no key, list, counter or event route ever sees a template.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Storage | `event` row with `is_template = true` | the whole editor and its routes work unchanged |
| Exclusion | filter in every key/list/count/event-guard reader + DB check on guest access | the risk line of the roadmap |
| Editor | second dispatcher with a venue-only allowlist (+ GET seating) | no second editor, no new `/api/o/` routes |
| Copies / update | DB functions, one transaction each | requirement; blobs never leave Postgres |
| Update matching | rooms and tables by `lower(name)`, matched tables keep their id | seats, pins, order lines survive where the table survives |
| Lead rule | update allowed regardless of „Lokal prowadzi” | FR-030 gives it to the manager; venue is the restaurant's; confirm names losses |
| S-26 | retention/export must filter `is_template = false` | templates have an `event_date` |

## Scope

**In scope:** migration, readers, template service + guard + routes, template page, restaurant page section,
template choice in „Nowe wydarzenie”, event card actions, smoke 31, demo, CLAUDE.md.

**Out of scope:** template versions, event ↔ template link, sharing between restaurants, retention.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Data, exclusion, service | migration, filters, service, guards, tests | a missed reader exposing a template |
| 2. Routes, pages, islands | panel API + UI | time box |
| 3. Smoke, demo, docs | HTTP proof incl. cross-tenant | smoke counters shifted by templates |

## Open Risks & Assumptions

- A future reader of `event` that lists or counts must add the filter (documented in CLAUDE.md).

## Success Criteria (Summary)

- A manager creates an event from a template and the client opens it with the room drawn.
- „Zaktualizuj z szablonu” names who loses a seat before changing anything.
- No link key, list or counter shows a template (smoke + integration tests).
