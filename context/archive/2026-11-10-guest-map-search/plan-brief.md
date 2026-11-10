# Guest search on the venue map (S-22) — Plan Brief

> Full plan: `context/changes/guest-map-search/plan.md`

## What & Why

FR-048 / US-08: on the day of the event, anyone looking at the full venue map with a keyboard — a guest on their phone,
the client, the floor staff, the per-event waiter, the kitchen tablet — types part of a name and the map lights that
guest's seat. The TV has no search. Nothing new may reach guests or the tablet.

## Starting Point

One drawing component (`VenueDrawing`) with two highlight mechanisms (own seat; serving marks), one plan component on
every order page (`ServingPlan`, published snapshot) and the guest's whole-venue map behind a toggle. A tested name
matcher already exists in the offline readout (`findGuestSeats`).

## Desired End State

A server-rendered „Znajdź gościa na planie” field (`data-map-search`) on the guest phone and on every `ServingPlan`
with a published seating; matches listed (≤ 8) and lit violet on the map, one picked hit lit alone; the phone opens
and scrolls its map to the hit. Escape clears, Enter picks, results announced, PL + EN. TV untouched; API shapes
unchanged (smoke-checked).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Source of names | the published snapshot everywhere | it is what every surface already draws; no new data for guests or the tablet |
| Matcher | lift `findGuestSeats` into `src/lib/map-search/`, add word order + prefix ranking | one tested source for map, offline readout and S-27 |
| Highlight | `DrawingMark.tone: "search"` (violet) on the existing marks | one mechanism; never confused with the red own seat or serving marks |
| Several hits | list ≤ 8, all lit; one hit or the picked one lit alone | the user picks; a single hit needs no click |
| Guest field placement | outside the toggled map, picking opens and scrolls it | server-rendered (smoke-visible) and useful without opening the map |
| Surfaces | phone + `ServingPlan` (tablet, client orders, panel preview, floor, waiter floor) | the full maps that exist; `/rozsadzenie` has no map, the editor preview is a tool |
| Inert previews | leave `ReadOnlyFrame` as is | S-14's rule for every control; the day-of staff pages are not framed |
| Escape | the component's own `onKeyDown` with stopPropagation | keeps the serving selection's window listener from clearing too |

## Scope

**In scope:** shared matcher + tests, texts PL/EN, `tone` on marks, `useMapSearch` + `MapSearch`, `ServingPlan`, guest
phone, smoke section 38, CLAUDE.md.

**Out of scope:** TV, `/rozsadzenie`, editor preview, working-arrangement search, any API / DTO / token / migration
change, browser tests.

## Architecture / Approach

`searchSeats(tables, query)` (pure) → `useMapSearch(tables)` (query, pick, marks, found tables) → `MapSearch` (field,
live summary, hit buttons) → `VenueDrawing marks` (serving marks, then search marks).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared matcher, found marks and the plan's search | module, texts, tone, hook, component, `ServingPlan` | mark colours readable in light and dark |
| 2. Guest phone, smoke, documentation | phone search with scroll, smoke 38, CLAUDE.md | scroll target before the map's first measure |

**Prerequisites:** S-21 / S-21b done (floor pages exist).
**Estimated effort:** one session, 2 phases.

## Open Risks & Assumptions

- Pages in `inert` previews show a field that cannot be used (accepted, documented).
- A guest searching their own name sees the violet hit instead of their red chair (accepted).

## Success Criteria (Summary)

- Typing part of a name on any full map (not the TV) lights that guest's seat; the phone scrolls to it.
- Guest and tablet APIs answer exactly as before (smoke key sets).
- Tests, lint, check, build, smoke and demo green.
