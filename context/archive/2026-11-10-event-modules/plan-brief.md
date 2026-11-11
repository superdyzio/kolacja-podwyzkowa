# Event modules (S-17) — Plan Brief

> Full plan: `context/changes/event-modules/plan.md`

## What & Why

FR-031 / US-07 / NFR-023: games and extras become per-event modules (questions, AI topics, bill-guessing game, seating
draw, „Pokaż na TV”, pub quiz). The venue marks what may be available, the client switches the available ones, paid
modules wait for the platform admin's manual unlock. An off module disappears for the client, guests and TV; data stays.

## Starting Point

All modules exist and are always on; one shared guest poll and one TV poll; S-14's lead rule and dispatcher; S-13's
append-only support log; S-15 templates as hidden events.

## Desired End State

Three module sets on `event`; effective = available ∧ enabled ∧ (¬paid ∨ unlocked). Pre-existing events keep the v1
modules on; new events have AI topics and guessing off. Off module → organizer routes 409 `module-off`, guest routes the
identical 404, UI gone, guest/TV tokens change on the next poll.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Storage | three `text[]` columns with CHECKs | explicit, validated in SQL, no JSON shape drift |
| Existing events | all five v1 modules on, AI unlocked, pub quiz off | nothing that worked yesterday changes |
| Paid set | constant `PAID_MODULES` = AI topics, pub quiz | Open Question 5 open; per-event unlock is the lever |
| Refusal | organizer/staff 409 `module-off`; guest identical 404 | organizer UI tells the reason; guests learn nothing |
| Who toggles | venue: availability (never lead-gated); client: enabled (lead rule; staff via dispatcher while venue leads) | PRD table + S-14 rule |
| Admin unlock | platform route + DB function needing a live support grant of the session; `unlock`/`lock` row in the owner's log | keeps S-13: admin writes only inside a logged visit, owner sees it |
| Draw gate | only `seating/draft`; history stays readable | the editor reads history on mount |
| Pub quiz | key + availability + paid lock only | S-28 plugs in |

## Scope

**In:** migration, domain module, gates, tokens, three routes, client/venue/admin UI, smoke 33, demo, docs.
**Out:** price list, payments, pub quiz itself, editable paid list, per-module reset.

## Phases at a Glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. Data, gates, tokens, routes | server side + tests | guest token parity, offline sync on 409 |
| 2. UI | cards, sections, island | guest sections hiding live |
| 3. Smoke, demo, docs | section 33, demo events | smoke events must stay all-on |

**Prerequisites:** S-14 (done). **Effort:** one session.

## Open Risks & Assumptions

- Deploy: migration before code (resolver reads the new columns).
- The admin needs a support visit to unlock; an admin who is a member of the restaurant has no grant → 404 (logged).
