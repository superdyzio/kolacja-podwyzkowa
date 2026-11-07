---
change_id: draw-neighbour
title: The seating draw never leaves anyone without a neighbour
status: implemented
created: 2026-11-07
updated: 2026-11-07
archived_at: null
---

## Notes

User request (2026-11-07): „przy losowaniu pilnujemy żeby każdy zawsze miał minimum jednego sąsiada”.

- Rule (hard, the draw's own): every present seated guest — pinned ones included — has at least one neighbour seat
  held by a present guest. "Neighbour" is the app's existing `neighbours()` (side or opposite, the same as for repeated
  pairs): someone with empty chairs on both sides still has a neighbour when a person sits opposite. An absent pinned
  guest's seat is no company. Switching to side-only is a one-line change of the adjacency the lonely check uses (but a
  2-seat rectangular table could then never be used).
- Solver: cost = repeats + (edge count + 1) per lonely guest, incremental over the changed seats and their
  neighbours; after the search the best arrangement is re-measured and refused as `lonely` (names + what to change)
  if anyone is still alone. Not added to `validateDraft` (no new 409 path; manual edits and restores may still leave
  someone alone; the editor shows no warning for it — offered as a follow-up).
- Found while checking against the real venue (read-only, ids only): rectangular tables 14/10/8/12, 16 couples, 7
  singles; the group placement backtracking gave up in ~0.05 % of draws and reported "groups-do-not-fit". It now
  restarts with a fresh random order (up to 7 × 10 000 nodes) when it only gave up. Regression test with seed 2226.
- Checked: unit tests (every drawn result in the suite, incl. 150 random venues, is checked for lonely guests by
  independent code), the real venue: 100/100 draws at 1200 ms and 300 ms budgets, 20 × 6 chained redraws, 20 000 draws
  without a refusal, all ≤ 2 ms typical.
