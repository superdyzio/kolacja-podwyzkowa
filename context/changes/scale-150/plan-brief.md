# Scale to 150 guests (S-19) — Plan Brief

> Full plan: `context/changes/scale-150/plan.md`

## What & Why

FR-033 raises an event's limits from v1's 100 guests / 20 seats / 40 tables to 150 guests, tables up to 30 seats and
about 60 tables; NFR-011/NFR-015 keep the draw ≤ 3 s and a publish on the TV and 200 phones ≤ 5 s, also with several
parties at once.

## Starting Point

The limits sit in app constants (`MAX_GUESTS`, `MAX_SEATS`, `MAX_TABLES`), three DB CHECKs (table and snapshot seat
counts, predicted place), the venue-AI prompt/caps and tests written for the old numbers. The draw was only tested at
the 40-guest demo size.

## Desired End State

Every layer accepts 150 / 30 / 60 and refuses one more; existing data survives; the draw is proven correct and fast at
full size; smoke section 35 and `npm run load:local` exercise publish → TV + 200 phones at full size and print the
numbers; CLAUDE.md documents the limits and the hosting estimate.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Rooms | `MAX_ROOMS` stays 10 | 60 tables fit in 10 rooms; the PRD names no room number |
| Order lines | `MAX_ORDER_ITEMS` 400 → 600 | keeps 4 lines per guest as in v1 |
| Other caps | drinks 200, questions 500, AI pool 1000, expected guests 1000 unchanged | not driven by the guest count (AI pool is a cost cap) |
| Draw budget | `DEFAULT_DRAW_BUDGET_MS` stays 1200 | measured full-size draws take milliseconds; the cap leaves time for requests on slow phones |
| Phone zoom | add an 8× step | dense 60-table venues still reach readable names |
| Draft rows | `.max(MAX_GUESTS)` | ties the endpoint to the guest limit |
| Load proof | local script + documented Little's-law estimate | real hosting measurement is the user's (Open Question 4) |
| Big demo | `npm run load:local -- --keep` instead of a bigger default demo | the default demo stays fast |

## Scope

**In scope:** constants, migration relaxing 3 CHECKs, venue-AI texts/caps, tests at full size, smoke section 35, load
script, CLAUDE.md/README.

**Out of scope:** polling redesign, TV room rotation (S-20), a hosted load test.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Limits | 150/30/60 everywhere + full-size draw tests | a hard-coded old number missed |
| 2. Smoke, load, docs | HTTP proof at full size + numbers | local timings do not transfer 1:1 to Lambda |

**Prerequisites:** F-02 (done). **Estimated effort:** one session.

## Open Risks & Assumptions

- Local timings run on one Node process; Lambda runs one request per instance — the estimate converts them.
- 200 phones polling every 2.5 s for 3 h ≈ 0.86 M requests: close to Lambda's monthly free tier per event.

## Success Criteria (Summary)

- A 150-guest event with 30-seat tables and 60 tables works end to end (smoke 35).
- The draw at full size is correct and well under 3 s; publish reaches every simulated phone within 5 s locally.
