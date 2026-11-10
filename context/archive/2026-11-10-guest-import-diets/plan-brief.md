# Guest import and diets at the seat (S-23) — Plan Brief

> Full plan: `context/changes/guest-import-diets/plan.md`

## What & Why

The client (or the venue while „Lokal prowadzi” is on) imports guests from a CSV file or a spreadsheet paste (name,
diet, notes) with a preview before saving, and marks a diet or allergy per guest. The kitchen tablet and the waiters
see diets at each guest's seat and in counts (PRD v2 FR-035, FR-036, US-07). Diets are health data: they never reach
other guests, the TV or AI (NFR-021).

## Starting Point

Guests are added by name only (single form or a one-per-line paste, all-or-nothing). The tablet and every order board
already read the guest list and the latest published snapshot, but no guest has a diet, and the placement lists only
seats that have order lines.

## Desired End State

`/o/<key>/goscie` imports a file or paste with a per-line preview and edits diets per guest. The tablet, the client's
order page, the panel preview and both floors show „Diety i alergie” (counts + table → seat → name → diet) and diet
badges at each served seat; the seating editor marks diets. Guest and TV answers stay byte-for-byte free of diets.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Data model | `guest.diets text[]` (8 known tags, CHECKed) + `guest.diet_note` (≤ 120) | Cascades, the `guests` reset part and S-26 retention come for free. |
| Tags | vegetarian, vegan, gluten-free, lactose-free, nut-allergy, seafood-allergy, halal, no-pork | Small fixed set the kitchen acts on; anything else goes in the note. |
| Import preview | Same route with `preview: true` (server, same parser) | One source of truth, fresh list, testable in the smoke. |
| Unknown diet word | Blocking per-line problem naming accepted words | No silent rewriting of health data; generous PL/EN aliases. |
| Duplicates / on the list | Blocking per-line problems (no merge) | Same rule as the paste; the preview names the lines. |
| File encoding | Browser decodes UTF-8 (BOM stripped), falls back to Windows-1250 | Polish Excel's „CSV” is cp1250; no dependency. |
| Counts | Present guests only; seats from the latest snapshot, diets live | The kitchen cooks for who is here, served where they sit. |
| Guest sees own diet | No | Guest DTOs and the poll token stay unchanged. |
| Snapshots | Never carry diets | TV, phones, tablemates and the offline cache read snapshots only. |
| Waiters | Read only (no `guests` route on the floor) | Diets are the client's (or the leading venue's) data. |

## Scope

**In scope:** migration, pure diet rules + board builder (reused by S-24), import parser, import route, diet PATCH,
diets on the order board and tablet, UI on the guest list / order boards / tablet / seating editor / map-search hit,
smoke section 39, demo, CLAUDE.md.

**Out of scope:** `.xlsx`, column mapping UI, merge/skip of existing guests, diets on the drawing, the TV or the guest
phone, waiter diet editing, per-dish diet counts (S-25).

## Architecture / Approach

Columns on `guest` → `getGuestList` (organizer `GuestDto`) → `dietBoard(latest snapshot, guests)` inside
`toOrderBoard` and `toRestaurantView` (inside the fingerprinted content). One new organizer route
`guests/import` registered in `CLIENT_ROUTE_PATTERNS` so the panel dispatcher and the lead rule apply automatically.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data, rules, routes | Migration, parser, service, routes, read models, unit + integration tests | Parser edge cases (quotes, separators, header) |
| 2. UI | Import panel, diet editor, diet section and badges on every surface | Many surfaces touched (tablet, boards, floors, seating) |
| 3. Smoke, demo, docs | Section 39 + 38 key set, demo import, CLAUDE.md | Smoke's exact key-set checks |

**Prerequisites:** S-14 (dispatcher, lead rule), S-21/S-21b (floors) — done.
**Estimated effort:** ~1 session, 3 phases.

## Open Risks & Assumptions

- Windows-1250 fallback relies on the browser's `TextDecoder` (WHATWG encodings; all evergreen browsers).
- Unknown diet words blocking may annoy a client with a free-form spreadsheet; the aliases are generous.

## Success Criteria (Summary)

- A client imports 40 guests with diets from a `;` CSV after one preview, all or nothing.
- The tablet and a waiter see who needs what at which seat, and how many of each diet.
- No guest phone, TV answer or AI prompt ever contains a diet.
