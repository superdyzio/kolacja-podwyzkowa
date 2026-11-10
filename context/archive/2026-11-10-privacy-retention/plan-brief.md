# Guest data retention, event export and the guest privacy notice (S-26) — Plan Brief

> Full plan: `context/changes/privacy-retention/plan.md`

## What & Why

PRD v2 FR-040 / NFR-019 / US-09: guests' data (names, diets and allergies — health data —, RSVP answers, seats,
guesses) must disappear from the platform N days after the event (the owner sets N, default 30), the venue must be able
to export an event's data first, and a guest must be able to read a privacy notice from their phone. There is no
background job on the hosting, so deletion must be reliable without one.

## Starting Point

Nothing deletes guest data except the venue's manual „Reset danych” and deleting the event. Every keyed read goes
through `resolveAccess` and every panel event read through `findEventMembership` (+ the admin's support branch).

## Desired End State

Owners set the term on the restaurant page (managers read it); an expired event is purged before anything of it is
served, idle ones by a throttled sweep on panel page views or `npm run retention`; the event card shows when the data
goes (or that it went) and offers JSON + CSV downloads; the guest page links to a draft privacy notice (PL/EN).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Term range | 1–365 days, default 30, owner only | Restaurant setting per Access Control; ≥ 1 keeps every purge outside the noon floor window. |
| Expiry rule | purge when Warsaw today > event_date + N | Data kept through the Nth day after the event; same rule in SQL and JS. |
| What goes | guests (+ cascades: diets, RSVP, guesses, seats), groups, ALL snapshots (published names), TV spotlight, waiters, order-line notes; guest access off | Every row with a person's name or health data. |
| What stays | event row, venue, questions, order lines with prices (no person, no note), drinks, AI usage counts, menu, brand | The venue's bill and room are not guest data. |
| Triggers | pre-read in `resolveAccess` + `findEventMembership` + support branch; lazy sweep on panel page GETs (10 min throttle, DB claim, ≤ 25); CLI | „Never served” without a scheduler; idle events still go. |
| Re-purge | an expired event with new guest data is eligible again | Guests added to an old event after its purge do not stay. |
| Export | JSON + guests CSV + orders CSV, owners and managers, membership-only guard | Support mode never bulk-copies health data (identical 404, no log row). |
| Privacy notice | `/g/<key>/prywatnosc`, draft-marked, restaurant = controller, „dostawca systemu” = processor | White-label: guests never see the product name; Open Question 6 stays open. |
| Scheduler | none — the user's later decision | Infra change outside the brief. |

## Scope

**In scope:** migration (setting, marker, sweep state, 5 functions), purge hooks, sweep, CLI, retention route + UI,
export route + UI, privacy page + link, purged notes on the shell and the event card, smoke 41, demo, CLAUDE.md.

**Out of scope:** any scheduler, final legal texts, `.xlsx`/ZIP, per-event overrides, notifications, staff offline
copies (S-27).

## Architecture / Approach

One SQL function `purge_event_guest_data(event, now)` re-checks eligibility (never a template or a live event), takes
the reset's locks and deletes in dependency order; a lock-free fast path makes repeated calls cheap. Three callers:
the pre-read hooks (expired → RPC before the read; the guest key then denies), the panel-page sweep and the CLI.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data, purge and its triggers | migration, rules, service, guard hooks, sweep, CLI, tests | missing a table with personal data; hot-path cost |
| 2. Settings, export, privacy notice and banners | routes, UI PL/EN, CSV/JSON builders | a key leaking into the export; support-mode logging |
| 3. Smoke, demo and documentation | smoke 41, demo, CLAUDE.md, migration checks | smoke timing vs the sweep |

**Prerequisites:** S-11 (done); local Supabase with HEAD's demo data.
**Estimated effort:** one long session, 3 phases.

## Open Risks & Assumptions

- The privacy text is a draft; the controller/processor split is an assumption for the lawyer (Open Question 6).
- Order-line notes are cleared, not the dish names: a dish name typed as a person's name would survive.
- A purge is a write inside an admin's read-only support visit (the policy acts, not the admin) — documented.

## Success Criteria (Summary)

- An event past its term shows no guest anywhere (organizer API, TV, tablet, guest link, snapshots) while templates,
  today's events and other restaurants are untouched.
- The owner changes the term; a manager cannot; the manager downloads an export without any key.
- The guest reads a draft privacy notice in PL and EN from their link.
