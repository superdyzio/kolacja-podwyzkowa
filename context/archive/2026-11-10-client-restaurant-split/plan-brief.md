# Client / venue split and „Lokal prowadzi” — Plan Brief

> Full plan: `context/changes/client-restaurant-split/plan.md`

## What & Why

Staff preview the client's work on an event in the panel, and a per-event switch „Lokal prowadzi” decides who edits: the client (default, staff preview) or the staff (client preview). The client keeps orders, drinks and the bill but no longer sets prices; it can reset its trials (seating, guesses) while the full reset and AI costs move to the panel (PRD v2 FR-026..FR-028, US-07).

## Starting Point

Everything the client does goes through `/o/<key>` and 47 organizer routes; the panel (S-11..S-13) has event cards with links but no view of guests, seating or orders. The client still sees the full reset, the AI cost, the tablet link rotation and types prices.

## Desired End State

`/panel/wydarzenia/<id>` has the switch, „Praca klienta” cards, AI costs and the full reset; `/panel/wydarzenia/<id>/<section>` shows the client's island for that section, editable only while the venue leads. While the venue leads, the client's writes get a 409 with a clear message and its pages are read-only with a banner. The client's forms show prices read-only; staff set them in „Cennik wydarzenia”.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Switch storage | `event.venue_leads boolean default false` | One column, additive; every existing event stays client-led. |
| Who toggles | owners and managers (`EVENT_STAFF_ROLES`) via `PATCH /api/panel/events/<id>` | PRD table; waiters and support get the identical 404. |
| Refusal status | 409 + `code` (`venue-leads` / `client-leads`), PL/EN message | The request is valid and authorized; the event's current state forbids it. |
| Where the client is refused | the middleware, every non-GET under `/api/o/<key>/` | One check covers all 47 routes and future ones; no allow-list. |
| How staff edit | `/api/panel/events/<id>/klient/<sub>` runs the organizer handler | Reuses validated handlers; a route-table test keeps it complete. |
| Read-only UI | `inert` wrapper + banner; support mode = static SSR | One mode for all islands; no polling log rows in support. |
| Prices (roadmap Unknown) | client never sends prices; new line = newest price of that name in the event, else 0; staff set per-name prices in the panel, whoever leads | Honours „klient widzi ceny, ale ich nie zmienia” now; v1 data and S-16 catalog unaffected. |
| Trial reset | parts `seating` + `guesses` (quiz hook) via `/api/o/<key>/trial-reset` | `reset_event` already does it in one transaction. |
| Full reset, AI costs | panel routes only; client `reset`, `ai-topics` GET → identical 404 | PRD: „pełny reset i koszty AI tylko w panelu lokalu”. |
| Tablet `/r/` link | removed from the client (field, card, rotate route → identical 404) | FR-025 gives link management to the manager; TV link stays with the client. |

## Scope

**In scope:** switch + enforcement, dispatcher, seven preview pages, event-page sections, client banner/read-only, trial reset, client denials, prices, smoke 30, demo, docs.

**Out of scope:** menu catalog (S-16), modules (S-17), staff printing/offline readout, live switching of open pages, unpriced-line state, guest/TV/tablet view changes.

## Architecture / Approach

Middleware (client writes) and the dispatcher (staff writes) both read `event.venue_leads`; the dispatcher builds an `OrganizerAccess` for the guarded event and calls the organizer handler. Panel pages render the same islands with `apiBase=/api/panel/events/<id>/klient`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data, lead rule, dispatcher | column, client 409, switch route, panel API | handler reuse via page imports |
| 2. Panel pages, switch UI, frames | previews, banners, read-only | islands' internal offline sync |
| 3. Reset/AI/tablet split, trial reset | client denials, panel routes | existing smoke sections using removed routes |
| 4. Prices | price list route + island, bodies without price | smoke totals depend on prices |
| 5. Smoke 30, demo, docs | proof and showcase | time |

**Prerequisites:** S-11 (event card), S-13 (support rule).
**Estimated effort:** one night session, 5 phases.

## Open Risks & Assumptions

- A page open when the switch flips stays interactive until reload; its next write gets the 409 message.
- Staff hold the client link (S-11) and could edit through it; the switch governs the panel and the link, not who holds the link.
- New dishes cost 0 zł until staff set a price; the form says so.

## Success Criteria (Summary)

- Staff see every section of the client's work; only the leading side can change anything.
- The client resets its trials without losing guests, venue or orders and never sees the full reset, AI costs or the tablet link.
- Prices are set only by the venue.
