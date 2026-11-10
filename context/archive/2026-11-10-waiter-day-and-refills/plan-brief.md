# Waiter's day view, floor marking and refills (S-21) — Plan Brief

> Full plan: `context/changes/waiter-day-and-refills/plan.md`

## What & Why
FR-029 / US-08: on the day of the event the waiter (staff account) sees today's events of the restaurant, the plan with
guests, orders with prices and the bill, marks delivered pieces and adds refills — the tablet stays read-only.

## Starting Point
Waiters have only a note on the restaurant page; the client's order routes run for staff through the S-14 dispatcher.

## Desired End State
`/panel/restauracje/<id>` lists today's events (window until noon next day) for the waiter; `/panel/obsluga/<id>` is
the order page in floor mode backed by an allowlisted floor dispatcher.

## Key Decisions Made
| Decision | Choice | Why |
| --- | --- | --- |
| Per-event waiter (link/code) | CUT (time box) | the account waiter's day view, marking and refills first |
| Lead rule | floor routes allowed whoever leads | day-of service is the venue's work |
| Waiter's mark | `marked_by = 'organizer'` (venue side) | same as S-14 staff writes; no migration |
| Support mode | floor = identical 404, no log row | the admin never acts as a waiter |
| Window | `eventTiming === "today"` and not archived, for every role | one rule, already tested |
| Whole-line „Wydane” | dispatcher-only `PATCH { delivered }` | organizer PATCH would allow edits |

## Phases at a Glance
| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Rules, guard, API, pages | floor view working | allowlist too wide |
| 2. Smoke, demo, docs | HTTP proof incl. cross-tenant | time |

## Open Risks & Assumptions
- The per-event waiter stays open (FR-023 part) for a follow-up slice.
