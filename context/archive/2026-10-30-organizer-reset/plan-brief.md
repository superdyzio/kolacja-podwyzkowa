# Organizer reset (Reset danych) — Plan Brief

> Full plan: `context/changes/organizer-reset/plan.md`

## What & Why

The organizer asked for „przycisk do resetu, gdzie w modalu pyta mnie o to jakie rzeczy zresetować i mogę to załatwić jednym klikiem” — typically to wipe the rehearsal before the dinner on 2026-11-08 without losing the organizer and TV links. A „Reset danych” card at the bottom of `/o/<key>` opens a modal with seven checkable parts and one red button; one click resets the chosen parts.

## Starting Point

Every piece of event data lives in child tables of the singleton `event` row (guests, groups, guesses, AI attempts, seating and published snapshots, plan/rooms/tables, questions, guest keys). Deleting the event would change the organizer and TV keys, and there is no way to clear data in bulk today.

## Desired End State

The modal shows each part with a description and a fresh count, implied parts auto-ticked and locked. „Resetuj zaznaczone” runs one atomic DB transaction, the modal shows a Polish summary, the offline-readout memory of this organizer link is cleared, and closing the modal reloads the shell. Organizer and TV links keep working; TV shows nothing published after a seating reset.

## Key Decisions Made

| Decision               | Choice                                                                                           | Why (1 sentence)                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Atomicity              | One SQL function `reset_event`; starter questions passed as `jsonb` from `starterQuestionRows()` | Whole reset in one transaction with the 90 texts single-sourced.                |
| Deleting               | `DELETE … WHERE event_id` only, never `TRUNCATE … RESTART IDENTITY`                              | Snapshot ids keep growing, so TV/phone polling tokens never repeat.             |
| Locks                  | advisory 3003 → 3008 → event row `FOR UPDATE`, then deletes                                      | Matches every existing writer's first lock; in-flight guest saves finish first. |
| Implications           | guests ⇒ guesses, AI usage, seating; venue ⇒ seating; expanded in TS and SQL                     | Never leave orphaned state (e.g. a seating with no guests).                     |
| guestLinks with guests | Still selectable; only turns guest access off, summary says so                                   | Graceful, no „0 keys replaced” noise.                                           |
| Counts                 | Fresh `GET /reset` when the modal opens; summary from counts read inside the reset transaction   | Exact numbers even if something changed meanwhile.                              |
| After success          | Summary in the modal, `clearOfflineCache`, reload on close                                       | Never shows pre-reset data offline; simple refresh.                             |
| Dialog                 | Native `<dialog>` + native checkboxes + existing `Button`                                        | No new dependency; Esc/focus handled by the browser.                            |
| Tests                  | Destructive integration cases only on a test-created event; smoke section 22                     | Real data is never touched by tests.                                            |

## Scope

**In scope:** migration (`reset_counts`, `reset_event`), `src/lib/reset/` (pure rules, texts, zod, service), `GET|POST /api/o/<key>/reset`, `ResetPanel` island + `useEventReset`, shell card, unit/integration/smoke tests, CLAUDE.md + README.

**Out of scope:** changing organizer/TV keys or the event row, undo/backup, typed confirmation, finer parts, clearing question-draw/AI-topic browser memories, changes to `npm run demo`.

## Architecture / Approach

Island → `GET /api/o/<key>/reset` → `reset_counts` (one RPC). Island → `POST { parts }` → zod → `resetEvent` (expands parts, adds starter rows) → `reset_event` (validate, expand, lock, count before, delete/update in dependency order, insert starter questions, rotate keys) → `{ parts, before, questionsAdded, guestKeysReplaced }` + Polish `summary`.

## Phases at a Glance

| Phase                            | What it delivers                                            | Key risk                                                                                              |
| -------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1. Schema and pure rules         | Migration, types, `src/lib/reset/` pure module + unit tests | SQL edge cases (qualified `gen_random_bytes`, safeupdate) — checked in a rolled-back psql transaction |
| 2. Service and integration tests | `service.ts`, `reset.test.ts`                               | Destructive cases skip while demo data exists (run in Phase 5)                                        |
| 3. API route and smoke           | `/api/o/<key>/reset`, smoke section 22                      | Smoke only runs on an empty DB (Phase 5)                                                              |
| 4. Reset modal on the shell      | `ResetPanel`, `useEventReset`, shell card                   | Dialog focus/Esc while pending; wrapping at 360 px                                                    |
| 5. Docs and final verification   | CLAUDE.md, README, full sequence, user state restored       | Must restore the real AI provider and leave preview running                                           |

**Prerequisites:** local Supabase running (db/rest/kong), demo data present until Phase 5.
**Estimated effort:** one session, 5 phases.

## Open Risks & Assumptions

- A concurrent structure edit by the organizer in another tab during a reset could hit a Postgres deadlock; Postgres aborts one transaction (the reset is atomic, so at worst it fails with 500 and nothing changes).
- Destructive tests and the smoke are proven only in the final verification on an emptied DB.

## Success Criteria (Summary)

- One click in the modal resets exactly the chosen (and implied) parts; organizer and TV links still open.
- After „all”: empty event with 90 starter questions, guest access off, TV shows nothing published.
- Tests, lint, type check, build, smoke and the HTTP end-to-end check pass.
