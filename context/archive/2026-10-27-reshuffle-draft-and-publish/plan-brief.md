# Reshuffle draft, review, publish and restore — Plan Brief

> Full plan: `context/changes/reshuffle-draft-and-publish/plan.md`

## What & Why

Roadmap S-04, the north star (PRD US-02, FR-009, FR-010, NFR-007). The organizer draws a draft of a new seating that keeps inseparable groups together on consecutive seats, leaves pinned guests in place, skips absent guests and repeats as few neighbour pairs from earlier published arrangements as possible; reviews it, redraws or fixes it, publishes it, or goes back to the previous arrangement. This is the rule a spreadsheet cannot do and the main reason the app exists.

## Starting Point

S-03 built the working arrangement (`seat_assignment` with pins), immutable published snapshots, manual seating tools, publishing (no-op when unchanged) and the TV that shows only the latest snapshot. There is no draw, no neighbour history, no restore and no hard group rule.

## Desired End State

The seating page has a "Losowanie" panel: draw / redraw a draft (computed in the browser in ≤ 1.2 s), live stats of repeated neighbour pairs with names, discard to what the TV shows, back to the previous published arrangement. The draft is the working arrangement, so the TV and phones see it only after "Opublikuj na TV". Infeasible inputs explain the cause in Polish and change nothing.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Where the search runs | Pure TS solver in the organizer's browser; server re-checks hard rules and writes atomically | Cloudflare allows ~10 ms CPU per request; validation is O(n). |
| Consecutive seats | `areConsecutiveSeats`: arc on a round table (wrap), one-side run on a rectangular table, opposite never joins | One definition shared with the S-03 warning. |
| Pinned group member | Other present members form one block with the pinned seat(s); otherwise infeasible with a message | Keeps the pin and the group rule both hard. |
| Absent pinned guest | Row kept, seat empty on the TV, no pairs through it | Pins are locks (S-03). |
| History | Union of pairs over all snapshots, from each snapshot's own geometry; same-group pairs ignored | PRD "neighbours from previous arrangements". |
| Objective | Minimise repeated pairs; stop at 0 or 1.2 s; random tie-break, new seed per draw | NFR-007 with margin; redraw differs. |
| Back to previous | Restore into the working arrangement; publish with the existing button | One publish path; draft ≠ published. |
| Overwrite guard | Confirm only when unpublished manual changes would be lost | No nagging on redraws. |
| Write path | `replace_seating(jsonb)` under the seating lock, failures → 409 by error code | supabase-js has no transactions. |
| Tests | Clock-free seeded solver tests cross-checked by an independent validator and repeat counter; acceptance + property + perf; integration skip on foreign data | Delta/displacement bugs only show up in independent checks. |

## Scope

**In scope:** neighbour history and repeat stats, draft validation, restore mapping, solver, `replace_seating`, history/draft/restore routes, board `previous`, draw panel, shell card, smoke, CLAUDE.md.

**Out of scope:** server-side or Web Worker search, stored multi-drafts, direct publish on restore, browsing older snapshots, history reset, secondary objectives, guest phones (S-05), offline (S-09), E2E.

## Architecture / Approach

Browser: fetch board + history → `drawSeating` (feasible random placement of groups by backtracking, singles shuffled, annealing local search on an incremental cost) → POST seats. Server: `validateDraft` against the current DB state → `replace_seating` (delete non-pinned, insert) → board. Restore: `restoreSeats(snapshot, current)` → `replace_seating`. Stats: `repeatedNeighbours(board, history)` computed live in the island.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Pure history/validation/restore | `neighbours.ts`, `draft.ts` with tests | Pair geometry off by one (rectangular opposite/odd seat) |
| 2. Solver | `draw.ts` + acceptance, property, perf tests | Incremental delta / group displacement bugs; false infeasible |
| 3. DB + services | `replace_seating`, history (paginated), save/restore, board `previous` | Tests touching foreign data (skip guard) |
| 4. API + smoke | 3 organizer routes, HTTP proof the draft never hits the TV | Stale draft handling (409) |
| 5. UI + docs | Draw panel, stats, confirms, shell card, CLAUDE.md | Main-thread pause; phone layout |

**Prerequisites:** S-03 done; local Supabase running; empty event table for smoke.
**Estimated effort:** one overnight session, 5 phases.

## Open Risks & Assumptions

- Every changing publish (prep, rehearsal) joins the history; 0 repeats may become impossible — the solver minimises and names the pairs; no reset in this slice.
- Nearly full venues with big groups may not reach 0 after many draws; 1–2 reshuffles are covered by the acceptance test.

## Success Criteria (Summary)

- On the demo evening, a manual seating plus two draw+publish rounds gives 0 repeated neighbour pairs, groups together, pins kept, absent unseated — on every tested seed.
- A draft for 60 guests with ≥ 5 previous arrangements is ready in < 3 s; infeasible inputs are named and change nothing.
- The TV never shows an unpublished draft; the organizer can return to the previous arrangement and publish it.
