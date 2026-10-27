# Manual seating, publishing and the live TV plan — Plan Brief

> Full plan: `context/changes/manual-seating-on-tv/plan.md`

## What & Why

Roadmap S-03 (PRD US-01, FR-004, FR-007, FR-008, NFR-003, NFR-006). The organizer seats guests on concrete seats, swaps them, pins a guest (also themself) to a seat and publishes; the TV in the room shows guest names next to the tables on the venue plan and updates itself within 5 s of a publish. This slice introduces the "working arrangement vs published snapshot" model that the reshuffle (S-04) and guest phones (S-05) depend on.

## Starting Point

Guests, groups and absences (S-01) and the plan image, rooms and pinned tables with a seat convention (S-02) exist. There is no seat assignment, no publishing, and the TV page is an empty shell that can only fetch the plan image.

## Desired End State

`/o/<key>/rozsadzenie` lets the organizer select a person and click a seat (empty = move, taken = swap or displace), pin/unpin, see warnings (split groups, absent guests with a seat, missing seats) and publish, with a clear "TV is up to date / unpublished changes" status. `/tv/<key>` shows the plan fitted to the screen with a card of names (seat order, ≥ 2.5 vh) at every table pin and picks up a new publish within ≤ 5 s. The venue page names the guests who would lose their seat before a structure edit.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Data model | Mutable `seat_assignment` + immutable snapshots (`seating_snapshot`, `_table`, `_seat`) with copied render data and SET NULL ids | TV/phones read only published state; history for S-04 survives later deletions. |
| Atomic writes | plpgsql `seat_guest()` and `publish_seating()` under one advisory lock | supabase-js has no transactions; a swap must never be half-published. |
| Pins | Flag on the working row; pinned guests are locked for manual moves | Prevents accidental displacement of the organizer's own seat; S-04 keeps pinned rows. |
| Absent guests | May stay seated (marked), left out of the snapshot | The TV and phones only show who is actually there. |
| Publish without changes | No-op (no new snapshot) | Keeps S-04's neighbour history free of duplicates. |
| What the TV follows | Latest snapshot + current plan image only | "A draft never reaches the TV" (US-02), predictable for the organizer. |
| Polling | `GET /api/tv/<key>/seating?since=<snapshotId.planVersion>` → 204 / 200, every 2.5 s | Cheap check, no HTTP cache semantics, reusable by S-05. |
| TV layout | Contain-fit image, cards anchored at pins, deterministic push-apart, names 3 vh | Best effort at NFR-006 without scrolling; verified at the rehearsal. |
| Group split | Allowed manually, warned; "adjacent" = consecutive by side neighbours | Same helper becomes S-04's hard rule. |
| Organizer seat | No "this is me" flag | Smaller scope; the organizer is an ordinary guest. |

## Scope

**In scope:** seat/move/swap/replace, pin/unpin, unseat, publish, up-to-date status, warnings, seat-loss confirms on the venue page, TV view with names and live refresh, organizer shell card, smoke + docs.

**Out of scope:** draws, history browsing, undo (S-04); guest links and phone view (S-05); drag and drop; offline (S-09); browser E2E tests.

## Architecture / Approach

DB (tables, triggers, two functions) → pure rules in `src/lib/seating/` (warnings, fingerprints, TV DTO, version token, card columns, label layout) → service with status unions → thin organizer API returning the whole `SeatingBoardDto` and a TV polling route → SSR pages with one React island each (organizer editor; TV view with a polling hook).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema, types, pure rules | Tables, triggers, functions, DTOs, warnings/fingerprints, invariant tests | Trigger/function correctness under cascades |
| 2. Services | Seating ops, publish, board, TV reads, integration tests | Tests must touch only their own rows while publish copies everything |
| 3. API + TV endpoint + smoke | Organizer routes, `since` → 204/200, privacy checks | Unpublished changes leaking to the TV |
| 4. Organizer page | Rozsadzenie island, shell card, venue confirms | UX speed for 40 guests on a laptop/phone |
| 5. TV view + docs | Contain-fit plan, card layout, polling, CLAUDE.md | Readability of 40 names on a real TV (rehearsal) |

**Prerequisites:** S-01 and S-02 done (they are); local Supabase running; empty event table for smoke.
**Estimated effort:** one overnight session, 5 phases.

## Open Risks & Assumptions

- TV readability on the real screen with the real plan is only checked at the rehearsal (Open Question 2).
- Polling load on the hosted DB is unmeasured (fine on paper for 1 TV + 60 phones).

## Success Criteria (Summary)

- The organizer seats all guests, pins themself and publishes from one page; split groups and absent guests are flagged.
- The TV shows every published name next to its table, readable, without scrolling, and updates within 5 s of a publish — never before.
- Deleting tables/rooms or lowering seat counts unseats guests predictably and names them first.
