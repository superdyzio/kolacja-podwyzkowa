# Pub quiz (S-28) — Plan Brief

> Full plan: `context/changes/pub-quiz/plan.md`

## What & Why

FR-049: the client prepares a pub quiz (e.g. about the person celebrated) and runs it on the TV, guests answer on their phones, and there is a score and a result. It is the paid S-17 module `pubQuiz` — the platform admin unlocks it per event.

## Starting Point

The module key, offer, client switch and paid lock exist (S-17) with nothing behind them. The phone has ONE shared poll with a token at 62/64 chars (new state goes into its hashed part, S-25's RSVP did so); the TV has ONE poll (seating + spotlight).

## Desired End State

From `/o/<key>/quiz` the client types up to 50 questions (2–4 options, one correct) and runs: intro → question → close & reveal → … → results → end. The TV shows each step over the seating; at the results the top three places. Phones answer (changeable until closed), see right/wrong and their own points, then their own place. Off/locked: 409 `module-off` / identical 404, nothing on TV or phones.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Content | 2–4 options, one correct, ≤ 50 questions, typed by the client; no AI, no free text, no timer | Auto-scored, typeable, NFR-021 trivially true, zero cost. |
| Scoring | 1 point per correct answer on closed questions; competition places (1, 2, 2, 4) | Same as the guess ranking; no speed race. |
| Flow | client-driven actions start / ask(any unasked) / close / results / end; asked = locked for editing | Simple manual pacing; no ordering UI. |
| Late answers | DB writer locks the run row `for share`, close `for update`; any non-open question id → one 409 `quiz-closed` | Same pattern as the guess intake; identical denial across events. |
| TV results exception | top 3 places (ties together, ≤ 10 names, „+N”) with points; per-option counts only after close; never who answered what | PRD v2 allows the quiz as the exception; aggregate-only mid-question. |
| Phone | own answer, right/wrong, own points, own place at results — never others | Guest privacy rule of v1. |
| Phone live state | `GuestStateDto.quiz` in the token's HASHED part, only while a run exists; one RPC in both poll paths, only while the module is on | No new token part (headroom stays 2 chars), no second poll. |
| Standings for phones/TV | materialized into `quiz_score` at „Pokaż wyniki” | 150 phones polling never rank. |
| TV token | 4th part `<revision>-<answers>` only while a run exists and the module is on; revision from a global sequence | Other TVs keep their token; tokens never repeat. |
| TV layering | quiz layer `z-[25]` over the spotlight (`z-20`), under the offline badge (`z-30`) | The quiz wins while it runs; the spotlight row stays. |
| Reset | part `quiz` (answers, scores, run; questions stay editable), in „Reset prób”, implied by `guests` | Rehearse the quiz and start again; questions are preparation. |
| Retention / export | answers and scores cascade with the guest (purge); the JSON export gains the quiz (no ids) | S-26 rules. |
| Panel | new client section `quiz` (preview, dispatcher, „Praca klienta” card) | Venue-led events run it from the panel. |
| Demo | main event created with only AI topics unlocked; the admin unlocks the quiz inside the existing support visit; 4 demo guests play a round; results left on the TV | Shows the paid unlock and the whole flow. |

## Scope

**In scope:** migration (4 tables, sequence, 7 functions, reset functions replaced), rules/texts/zod, services, client + guest routes, module gate, client routes, reset part, export, client page + shell card, panel section, phone section, TV layer, unit + integration tests, smoke 43 (+38), demo, CLAUDE.md.

**Out of scope:** AI questions, free text, images, timers/speed points, reordering, re-asking, the quiz on the tablet/floor/offline readouts, a reset part for quiz questions.

## Architecture / Approach

Data: `quiz_question`, `quiz_run` (singleton per event), `quiz_answer` (guest-owned), `quiz_score` (materialized). DB functions do every state change under `(3013, event)` + the run row lock. Phone and TV ride their existing polls (`quiz_guest_state`, `quiz_tv_version` / `quiz_tv_state`); the client's board is one aggregate RPC (`quiz_board`). Gates at the edge (`moduleForApiPath`), lead rule via the client-route list.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data, rules, services, routes | migration, API, gates, reset, export, tests | 204/200 token equality; strict reset schema |
| 2. UI | client page, shell, panel section, phone, TV | TV readability, phone flow |
| 3. Smoke, demo, docs | section 43, demo round, CLAUDE.md | demo support-log assertion |

**Prerequisites:** S-17 done (it is); local Supabase; demo data of the previous commit in the DB (done before the migration).
**Estimated effort:** one long session, 3 phases.

## Open Risks & Assumptions

- Between `db push` and the code deploy the old code's reset preview fails its strict schema (new count keys) — deploy the code right after the migration.
- The TV results show guest names — the PRD's allowed exception; the client decides when to show them („Pokaż wyniki”).
- A question deleted after it was asked changes scores (confirm warns).

## Success Criteria (Summary)

- A client runs a whole quiz from the shell; the TV and phones follow within one poll; late answers are refused.
- Nothing of other guests reaches a phone; nothing per-guest reaches the TV before the results.
- Suite, lint, check, build, smoke and demo green.
