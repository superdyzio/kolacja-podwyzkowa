# Per-event waiter („kelner na imprezę”, S-21b) — Plan Brief

> Full plan: `context/changes/event-waiter-access/plan.md`

## What & Why

Seasonal waiters should not need an account and a password for one party (PRD v2 FR-023, FR-029, US-08). An owner or
a manager adds a waiter „na imprezę” on the event card (a name) and hands over a one-time link or a short code; the
waiter then works only that one event's floor, until noon of the day after, and a revoke cuts them off at once.

## Starting Point

S-21 built the floor for staff accounts (`/panel/obsluga/<id>`, an allowlist dispatcher over the client's order routes,
the noon window) and wrote this design into CLAUDE.md as a CUT item. Staff sessions, the DB login throttle and the
one-time-link pattern (`/haslo/<token>`) exist since F-03.

## Desired End State

„Kelnerzy na imprezę” on the event card issues a link `/kelner/<token>` and a code `<id>-XXXX-XXXX` once. The waiter
opens the link (or types the code on `/kelner`) during the event's window and lands on `/kelner/sala/<eventId>` — the
same floor as S-21 — with a cookie `kp-waiter` that opens nothing else. Revoke, expiry, logout, archive, a switched-off
restaurant all close it; the panel and other events never open to it.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Storage | one table `event_waiter`, hashes only, session hash on the row | one-time = one session; revoke = delete row kills it |
| Expiry | `((event_date + 1) + 12:00) at time zone 'Europe/Warsaw'` in SQL | DST-correct, equals the floor window's end |
| When to add | today and upcoming, not archived; ≤ 30 per event | managers prepare the night before |
| When to redeem | only inside the floor window; link + code consumed together by one UPDATE | nothing burnt early; one winner under races |
| Link | GET shows a button, the POST consumes | messenger link previews must not use it up |
| Code | `<waiter id>-XXXX-XXXX`, 31-char unambiguous alphabet (~39.6 bits), DB throttle per waiter id (10 / 15 min) | short to type, infeasible to guess online |
| Isolation | own cookie, own middleware area, own guard; no support branch | the panel and the waiter area never read each other's cookie |
| Reuse | S-21's dispatcher body extracted to `runFloorRoute` | one allowlist for both doors |
| Lost cookie / logout | revoke + add again (no „new link”) | keeps the slice to the design |

## Scope

**In scope:** migration, service, panel API + event card island, `/kelner` entry, link page, redeem / logout, waiter
floor page + API, middleware areas, tests, smoke section 37, demo, CLAUDE.md.

**Out of scope:** „new link” for a waiter, support-mode view on the event page, staff marker on pieces, offline readout
(S-27), per-IP throttling, extending access when the event date moves.

## Architecture / Approach

Panel (owner/manager) → `POST /api/panel/events/<id>/waiters` → `add_event_waiter` (lock, checks, expiry) → link +
code shown once. Waiter → `/kelner/<token>` or `/kelner` → `POST /api/kelner/wejscie` (throttle for codes, window check,
conditional UPDATE) → cookie `kp-waiter` → middleware `guardWaiterArea` → `locals.waiter` → waiter guard → shared
`runFloorRoute` (S-21 allowlist) / `OrderManager floor`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data, service, panel management | table, function, service, panel API, card island, tests | expiry instant across DST |
| 2. The waiter's door | middleware areas, redeem, waiter floor | cookie crossing between areas |
| 3. Smoke, demo, docs | section 37, demo waiter, CLAUDE.md, migration checks | smoke length / determinism |

**Prerequisites:** S-21 done (it is). **Estimated effort:** one session, three phases.

## Open Risks & Assumptions

- A leaked DB row's 8-character code hash is brute-forceable offline; bounded by ≤ 36 h validity (accepted).
- Moving the event's date never extends access (the live window is also required); managers add a new waiter.

## Success Criteria (Summary)

- A waiter without an account works exactly one event's floor via a link or a code, during its window only.
- Every other door (panel, other events, links) stays shut to that cookie, and revoking works at the next request.
