---
change_id: reshuffle-draft-and-publish
title: Reshuffle draft without repeated neighbours, review, publish and restore previous
status: planned
created: 2026-10-27
updated: 2026-10-27
archived_at: null
---

## Notes

Roadmap S-04 (reshuffle-draft-and-publish, north star): organizer draws a DRAFT of a new seating (inseparable groups together on consecutive seats at one table, pinned guests keep their seats, absent guests skipped, as few repeated neighbour pairs from all previously published snapshots as possible), reviews it with stats (repeated pairs, warnings), redraws or fixes it manually, publishes it to TV/phones, or restores the previous published arrangement. Infeasible inputs give a Polish message naming the cause and change nothing. PRD refs: US-02, FR-009, FR-010, NFR-007 (draft for 60 guests ≤ 3 s). Solver runs in the organizer's browser (pure TS, seeded RNG, time budget); server re-validates hard rules and writes the working arrangement atomically. Sources: context/foundation/prd.md, context/foundation/roadmap.md, context/foundation/tech-stack.md, context/foundation/overnight-brief.md.
