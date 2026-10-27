---
change_id: organizer-offline-readout
title: Organizer reads the last published seating and the guess ranking without network
status: implementing
created: 2026-10-27
updated: 2026-10-27
archived_at: null
---

## Notes

S-09 (roadmap item organizer-offline-readout, the last slice of M-1): when the venue network fails, the organizer can still read the last known published seating arrangement and the ranking of collected guesses on their own device, also after refreshing the page (US-04, FR-020, NFR-004, PRD Guardrail "Awaria sieci w lokalu nie odbiera organizatorowi wglądu w ostatni rozkład ani w ranking zebranych strzałów"). Recovery path chosen by the user (shape-notes gray_areas_resolved → offline): "Ostatni stan + hotspot" — the organizer's device shows the last state it saw, and the organizer switches to a phone hotspot to resume live operation. Read-only offline: no offline writes or sync queue (PRD Non-Goal "Pełna praca bez sieci z późniejszą synchronizacją"). Sources: context/foundation/prd.md, context/foundation/roadmap.md, context/foundation/tech-stack.md, context/foundation/overnight-brief.md (Domyślne odpowiedzi → NFR-004: last seating state and ranking kept in the organizer's browser memory, shown when there is no network).
