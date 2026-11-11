# TV room rotation and pinning (S-20) — Plan Brief

> Full plan: `context/changes/tv-room-rotation/plan.md`

## What & Why

The TV at the entrance must stay readable for 150 guests (NFR-018: names ≥ 2.5% of the screen height). When the whole venue would make names too small, the TV goes room by room by itself; a TV can be pinned to one room (FR-034, US-08).

## Starting Point

The TV draws the whole published snapshot with `VenueDrawing`, polls every 2.5 s with an opaque token and shows the spotlight over it. Tables carry no room in the TV DTO.

## Desired End State

A sparse venue looks as today. A dense one rotates (12 s per room, caption with the room name, „2 / 4” and dots, fade only without reduced motion). `/tv/<key>?sala=<room>` pins a TV to one room; an unknown room falls back silently. Organizer shell and the panel event card list per-room TV links with „Kopiuj”.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Readability threshold | smallest fitted name font (estimated widths, whole-venue view, screen minus 1.5vh padding) ≥ 2.5% of screen height; real window size, 1920×1080 on the server | NFR-006 target, computed from the existing layout code |
| Pin shape | `?sala=<room name>` (case-insensitive), no new secret | rooms are not secrets; several TVs = several links |
| Where rotation lives | client only | poll, token and 204 path unchanged |
| Room view | the room's tables + its outline passed to `VenueDrawing` | outline ∪ tables' box, tables' box without an outline |
| DTO | `TvTableDto.room` (snapshot room name) | grouping needs it; no ids or private data |

## Scope

**In scope:** pure rules + tests, TV island, page param, per-room links (shell, event card), smoke, demo, CLAUDE.md.
**Out of scope:** server-side room filtering, migrations, configurable dwell, browser tests.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. TV modes | readability rule, rotation, pin on the TV | hydration mismatch (screen size) — server snapshot 1920×1080 |
| 2. Links + checks | per-room links, smoke, demo, docs | time box |

## Open Risks & Assumptions

- Estimated text widths may differ slightly from measured ones; the threshold has no hysteresis.

## Success Criteria (Summary)

- A dense venue rotates, a sparse one does not; a pinned TV shows its room; nothing extra leaks.
