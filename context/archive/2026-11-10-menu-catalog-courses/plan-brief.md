# Menu catalog with courses (S-16) — Plan Brief

> Full plan: `context/changes/menu-catalog-courses/plan.md`

## What & Why

Owners and managers keep the restaurant's catalog of dishes and drinks with a price and a course; per event the venue chooses no menu, the full catalog or a reduced one; the client orders from that menu, sees prices and never changes them; the kitchen list is grouped by course (FR-037, FR-027, US-07).

## Starting Point

Order lines are free text; since S-14 a line takes the newest price of its name in the event (else 0) and staff re-price names in „Cennik wydarzenia”. Prep lists are one flat Polish-ordered list.

## Desired End State

A catalog page in the panel, a „Menu wydarzenia” switch on the event card, a menu select in the client's order form, and prep lists on the order page and the tablet grouped by course. Existing events and their lines behave exactly as before.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Price rule | event first: newest line of the name in the event, else the menu item's price, else 0 | one source of truth per event; a catalog change never touches ordered lines |
| Re-pricing | only „Cennik wydarzenia” (existing); no „apply catalog prices” action | cut for the time box |
| Menu active | `menu_mode <> off` and ≥ 1 available item | new events default `full` but stay usable without a catalog |
| Existing events | `menu_mode = off` (free text) | v1/demo/events before S-16 unchanged |
| Free text with an active menu | refused (400) for client and staff alike | the dispatcher runs the same handler |
| Drinks | `drink_item` unchanged and not gated; catalog drinks seed its price and suggestions | the bill list stays the client's own |
| Course on lines | snapshot `order_item.course` + `menu_item_id` (set null on catalog delete) | kitchen grouping survives catalog edits |

## Scope

**In scope:** migration, `src/lib/menu`, catalog + event menu panel API and UI, order gate + price seed, course grouping on organizer and tablet, smoke 32, demo, docs.

**Out of scope:** apply-catalog-prices action, course on guest/TV, menu on templates, diets, RSVP menu.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data, catalog, event menu | migration, service, panel API, tests | composite FKs, data preservation |
| 2. Orders and UI | gate, price seed, grouping, islands | existing prep/test fixtures |
| 3. Smoke, demo, docs | proof and showcase | time box |

**Prerequisites:** S-14, S-15 done. **Estimated effort:** one session, 3 phases.

## Open Risks & Assumptions

- An event that priced a name at 0 before switching its menu on keeps 0 for new lines of that name until „Cennik wydarzenia”.
- A course change in the catalog does not move lines already ordered.

## Success Criteria (Summary)

- The venue prices; the client picks from the menu; the bill of ordered lines never moves without the venue.
- The kitchen sees courses; old events work as before.
