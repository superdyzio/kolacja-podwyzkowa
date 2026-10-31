# Question base with categories, starter questions and a private random draw — Plan Brief

> Full plan: `context/changes/question-base-and-draw/plan.md`

## What & Why

Roadmap S-07 (US-03, FR-014, FR-015): conversation questions for the dinner. The organizer keeps a base of questions in three categories (kontrowersyjne / generyczne / refleksyjne), can paste many at once, and starts from a ready Polish starter base (~30 per category). The organizer and every guest draw a random question on their own device; only the drawer sees it.

## Starting Point

Guests open `/g/<key>` (seat + guess sections on one shared poll); organizer pages follow the `organizerApi` + island/hook pattern; the event is created once by `createEvent`. Nothing about questions exists yet; the shell shows „Pytania i tematy AI” as „Wkrótce”.

## Desired End State

`/o/<key>/pytania` lets the organizer draw, paste, edit, delete and reload the starter base; a new event already has the ~90 starter questions. Guests get a „Pytanie do rozmowy” section with category chips and a big „Losuj pytanie” button; the question shows only on that phone, survives a reload, and avoids immediate repeats. `context/foundation/question-seed.md` holds the starter base for the user's review.

## Key Decisions Made

| Decision          | Choice                                                                                                                               | Why (1 sentence)                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Stored categories | text `kontrowersyjne` / `generyczne` / `refleksyjne` with a check, shared module `src/lib/questions/categories.ts`                   | Matches the PRD wording and gives S-08 one import for the same categories.               |
| Uniqueness        | case-insensitive text across all categories via generated `text_key = lower(text)` + `unique (event_id, text_key)`                   | Lets one PostgREST upsert-ignore make paste and starter load idempotent (verified live). |
| Text rules        | display-name normalization, list markers stripped, 5–300 code points                                                                 | Reuses S-01 rules; long enough for real questions, short enough for a phone.             |
| Bulk paste        | one per line, one category per paste, partial add with a Polish summary (duplicates, repeats, too short/long skipped by line)        | A skipped duplicate question harms nobody, unlike a lost guest.                          |
| Starter base      | inserted on event creation (best effort, never breaks the redirect) + idempotent „Wczytaj bazę startową”                             | New events are ready; deleted starter questions return only on request.                  |
| Draw              | server picks with crypto randomness; client sends ≤ 100 recent ids; all-recent fallback picks from the older half                    | No immediate repeats per person without server-side history.                             |
| Privacy           | drawn question only in the response and the drawer's localStorage (fixed per-role key, no secret in the key)                         | FR-015 "visible only to whoever drew it"; no TV, no sync.                                |
| Guest UI          | own `<section>` below „Twój strzał”, reuses `useGuestState` (hidden without access), no new poll                                     | Follows the reserved S-05/S-06 slot.                                                     |
| S-08 placement    | AI-topic guest section below the question section; AI panel right after the draw panel on `/o/<key>/pytania`; shared `CategoryChips` | Topics share categories and sit next to the draw.                                        |
| Seed review       | `seed.ts` (no imports) + generated `question-seed.md`, parity and content-bounds unit tests                                          | User reviews readable text; tests keep both identical and within bounds.                 |

## Scope

**In scope:** `question` table, categories/text/paste rules, starter seed + md copy, services (list, paste, edit, delete, starter load, draw), seeding in `createEvent`, organizer + guest APIs, guest section, organizer page, shell card, smoke, CLAUDE.md.

**Out of scope:** AI topics (S-08), showing draws on TV or syncing them, server-side draw history, guests suggesting questions, moderation, migration-time seeding of existing events, browser tests.

## Architecture / Approach

Pure modules (`categories`, `text`, `seed`, `draw`, `draw-memory`, `summary`) under `src/lib/questions/`, DB `service.ts` over `DbClient`, thin routes under `/api/o/<key>/questions…` and `/api/g/<key>/questions/draw`, one shared `QuestionDrawPanel` (+ `CategoryChips`, `useQuestionDraw`) used by the guest island and the organizer page.

## Phases at a Glance

| Phase                                           | What it delivers                                          | Key risk                                 |
| ----------------------------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| 1. Schema, categories, text rules, starter base | table, types, pure rules, 90 questions + md + tests       | content quality and bounds (user review) |
| 2. Services, draw, seeding                      | DB services, pick rule, best-effort seed in `createEvent` | seeding must never break event creation  |
| 3. APIs + smoke                                 | organizer CRUD/starter/draw, guest draw, access matrix    | guests/TV reaching the list              |
| 4. Guest section                                | draw panel, chips, storage memory, guest island           | hydration and storage failures on phones |
| 5. Organizer page, shell card, docs             | `/o/<key>/pytania`, card, CLAUDE.md                       | phone layout of a 90-row list            |

**Prerequisites:** S-05 (guest access) and S-06 (shared poll store) done; local Supabase running.
**Estimated effort:** one overnight session, 5 phases.

## Open Risks & Assumptions

- The starter base is the assistant's content; the user reviews it before 2026-11-05 (Open Question 4).
- Existing events (none locally now) get the base only via „Wczytaj bazę startową”.
- No browser run overnight: the draw panel's client behaviour is covered by pure tests and the manual rows.

## Success Criteria (Summary)

- The organizer manages the base from a phone and a new event starts with ~90 reviewed questions.
- A guest draws a question in the chosen category in under a second, sees no immediate repeats, and nobody else sees it.
- Guests and the TV can never list or change questions (smoke).
