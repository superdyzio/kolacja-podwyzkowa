# Guest RSVP with a dish choice until a deadline (S-25) — Plan Brief

> Full plan: `context/changes/guest-rsvp-menu/plan.md`

## What & Why

PRD v2 FR-039 / US-07: a guest confirms attendance and picks one dish on their personal link before the event, until a
deadline; the client can answer for any guest at any time; client and venue see the counts. Follows „lokal
udostępnia, klient wybiera”: dishes come from the venue's event menu, the client picks which ones guests choose from.

## Starting Point

Guests have one attendance flag (`guest.is_absent`, skipped by the draw and the publish). The S-16 menu gives each
event its available dishes (by name). The guest phone has one shared poll with a 64-char token (62 used worst case).

## Desired End State

The guest sees „Potwierdź obecność” on the phone while open (yes / no, then a dish by course) and their answer
read-only after the deadline. The client runs it on `/o/<key>/potwierdzenia` (deadline, options, counts, every
guest's answer); the venue sees the same page as a panel preview and a counts summary on the event card.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Module? | Not an S-17 module | Core preparation feature (must-have); the venue's offer is already the event menu, the client's switch is the deadline. |
| On/off + deadline | One column `event.rsvp_deadline` (null = off; open while `now() < deadline`) | One source for „on” and „until when”; after the deadline the answer stays visible read-only. |
| Attendance truth | `guest.is_absent` only; answers table stores answered / dish / who | No two sources that can disagree: a „no” marks absent, the client's absence toggle shows up in the counts at once. |
| Counts | absent → not coming; present ∧ answered → coming; present ∧ not answered → no answer | Derived from the single truth; sums to the guest count. |
| Options | Menu items available in the event (by name), ≤ 12; no free text | „Lokal udostępnia, klient wybiera”; prices and ids never reach the guest. |
| One dish | One choice per guest | FR-039 says „danie”; per-course choice is a later option. |
| Guest poll | One jsonb RPC on both paths, folded into the hashed part | No new token part, no second poll (headroom unchanged). |
| Kitchen / orders | No tablet counts, no „przenieś do zamówień” | Optional; the venue sees counts in the panel — follow-up candidates. |
| Reset | No new part; `guests` cascades answers | Options and deadline are settings, „Reset prób” untouched. |

## Scope

**In scope:** migration (column, 2 tables, 3 functions, trigger), rules + service + routes (client, guest),
guest phone section, client page + shell card, panel preview + card summary, smoke 40, demo, CLAUDE.md.

**Out of scope:** module key, free-text options, per-course choice, tablet counts, transfer to orders, reminders.

## Architecture / Approach

`save_guest_rsvp` (event row lock, deadline check for guests, dish resolved among available options, `is_absent`
first, then the answer row) is the only writer of answers; `set_event_rsvp_options` replaces the options;
`guest_rsvp_state` feeds the guest poll (open computed in SQL). Pure `src/lib/rsvp/` builds the board, the counts,
the guest DTO and the token key.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data, rules, routes, token | DB + service + API + tests | Token 204/200 equality; trigger ordering |
| 2. UI | Guest section, client page, panel preview and summary | Two placements of the guest island sharing one store |
| 3. Smoke, demo, docs | Section 40, demo RSVP, CLAUDE.md | Smoke 38's pinned guest key set |

**Prerequisites:** S-16 done (menu). **Estimated effort:** one session, 3 phases.

## Open Risks & Assumptions

- A guest may flip their own absence back before the deadline (by answering „yes”); the client overrides any time.
- A catalog item deleted after an answer leaves the guest „coming without a dish”.

## Success Criteria (Summary)

- A guest answers before the deadline, is refused after it, the client still edits; counts agree everywhere.
- The guest's JSON never carries other guests' answers, counts, prices or ids; the TV is unchanged.
