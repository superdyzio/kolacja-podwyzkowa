# Pub quiz (S-28) Implementation Plan

## Overview

FR-049: the client prepares a pub quiz (e.g. about the person celebrated) and runs it on the TV; guests answer on their phones; there is a score and a result. The pub quiz is the paid S-17 module `pubQuiz` (locked until the platform admin unlocks it). Questions have 2–4 options and one correct option, typed by the client (no AI — NFR-021 trivially true, zero cost). The client runs it step by step from `/o/<key>/quiz`: intro → question N (phones answer, changeable until closed) → close & reveal → … → results. The TV shows the quiz over the seating; at the end it shows the top places — the PRD's allowed exception to „ranking only at the organizer” (PRD v2 „Poza zakresem”, decided here).

## Current State Analysis

- The module key `pubQuiz` exists (`src/lib/modules/rules.ts`): offer, client switch, `PAID_MODULES`, the admin's unlock inside a support visit (`set_event_module_unlock`, logged). Nothing else: no routes, no data, no UI. CLAUDE.md's S-17 bullet „Pub quiz (S-28)” lists the hooks to add.
- Guest phone: ONE shared poll (`/api/g/<key>/state`, `getGuestState` / `getGuestStateVersion` with the same reads in `Promise.all`), token `<snapshot>.<plan>.<hash>.<intake>.<amount>.<place>.<maxPlace>` — worst case 62/64 chars; live state goes into the hashed part (`guestStateVersion`, `src/lib/guest-links/state.ts:47`). S-25 added its RPC `guest_rsvp_state` to both paths and its key to the hash only while RSVP is on.
- TV: ONE poll (`/api/tv/<key>/seating`, `getTvScreen` / `getTvScreenVersion(db, eventId, spotlightOn)`, `src/lib/tv-spotlight/service.ts`), token `tvScreenVersion(seatingVersion, spotlightId)` = `<snapshot>.<plan>.<spotlight>`; both call sites (`src/pages/tv/[key].astro`, `src/pages/api/tv/[key]/seating.ts`) pass `access.event.modules.tvSpotlight`. The spotlight layer is `z-20`, the offline badge `z-30`, the room caption and the brand badge `z-10`.
- Module gate at the edge: `moduleForApiPath(role, subPath)` (middleware: organizer 409 `module-off` before the lead rule, guest identical 404; the panel dispatcher the same 409). `GuestModules` = questions, aiTopics, guessing; `guestModulesKey` 3 chars; `GuestModuleGate` hides a section from the shared poll.
- Client routes: `CLIENT_ROUTE_PATTERNS` (`src/lib/client-routes/match.ts`) + `CLIENT_ROUTE_MODULES` (`table.ts`), `match.test.ts` diffs them against `src/pages/api/o/[key]/**`; `CLIENT_SECTIONS` (`sections.ts`) drives the panel previews (`/panel/wydarzenia/<id>/<sekcja>`), `ClientWorkCards` and the event page's summaries.
- Intake-lock pattern: `save_guest_guess` / `save_guest_rsvp` lock a row `for share`; the closing writer locks `for update`, so a save never lands after a committed close.
- Reset: `RESET_PARTS` (8), `TRIAL_RESET_PARTS` = guesses, seating („the quiz slice adds `quiz` here”, `parts.ts:25`); DB `reset_counts` / `reset_event` latest version in `20261109120000_multi_tenant_events.sql`; `ResetCountsSchema` is STRICT (zod).
- Retention (S-26): `purge_event_guest_data` deletes guests → every table with a cascading FK to `guest (event_id, id)` goes with them. Export (`src/lib/privacy/export-service.ts`) builds `EventExportDto` without ids.
- Smoke: 42 sections; section 38 asserts the exact field set of `GuestStateDto` (`… rsvp seat status version`). Events A/B are created with every module on incl. pubQuiz unlocked (`scripts/lib/platform.mjs createEvent(…, { allModules: true })` → `modules_unlocked: PAID_MODULES`); the demo's main event too, so an admin unlock there would be „unchanged” (no log row).

## Desired End State

- A client of an event whose pub quiz is unlocked, offered and switched on opens „Pub quiz” on its shell (`/o/<key>/quiz`), types up to 50 questions (text, 2–4 options, the correct one), and runs the quiz: „Pokaż zapowiedź na TV” → „Zadaj pytanie” → (phones answer, the page shows „Odpowiedzi: 12 z 40”) → „Zamknij i pokaż odpowiedź” → next … → „Pokaż wyniki” → „Zakończ quiz”. The full ranking stays on the client's page.
- The TV shows the quiz over the seating while a run exists: the intro, the question with its options and the number of answers, after closing the correct option and how many chose each option, at the results the top three places (ties together, at most 10 names, „+N”) with points. Never a guest's individual answer.
- A guest's phone (section above the seat while a run exists) shows the intro, the question with option buttons (own answer marked, changeable until closed), after closing right/wrong with the correct option and the own points, at the results the own place and points. Never other guests' answers or names.
- Off / locked / not offered: organizer quiz routes 409 `module-off`, the guest route the identical 404 of a wrong key, the TV and phones show nothing of the quiz; the data stays.
- Venue leads → the client's quiz writes 409 `venue-leads`; the staff run it through the panel preview `/panel/wydarzenia/<id>/quiz` (dispatcher). „Reset prób” and the full reset have the part „Pub quiz” (answers, scores, the run; questions stay and become editable again).
- Verified by unit tests (rules, ranking, keys), integration tests (DB functions, lock/close race semantics, 204/200 token equality with the quiz, TV version equality, isolation, reset, retention purge), smoke section 43 (+ section 38's field set), the demo (admin unlock inside its support visit, a round with demo guests, results on the TV).

### Key Discoveries:

- `guestStateVersion(…, modules, rsvp)` hashes `name ∖0 orders ∖0 modulesKey [∖0 rsvpKey]` (`src/lib/guest-links/state.ts:47-62`) — the quiz key joins the same hash, only when non-null.
- `getTvScreen(db, eventId, spotlightOn)` / `getTvScreenVersion` (`src/lib/tv-spotlight/service.ts:150-170`) — the SSR page and the poll must pass the same flags, else every poll is a 200.
- `useTvSeating`'s `isTvScreen` and `guest-state-store`'s `isGuestState` validate answers (`src/components/hooks/useTvSeating.ts:24`, `guest-state-store.ts:41`) — tolerate a missing `quiz` (older code during a deploy).
- `ResetCountsSchema` and `ResetEventAnswerSchema` are `z.strictObject` (`src/lib/reset/api.ts:21`) — new count keys must be added there (and old code fails on them: deploy note).
- Composite FKs `(event_id, guest_id) → guest (event_id, id) on delete cascade` are the pattern for guest-owned rows (`guest_rsvp`, `20261111040000_guest_rsvp.sql:47`).
- Advisory lock ids in use: 3003 (seating/venue), 3008 (AI), 3010 (login). The quiz takes `(3013, event)`.
- `createEvent(env, restaurantId, name, { allModules })` in `scripts/lib/platform.mjs:95` sets `modules_unlocked: PAID_MODULES`.

## What We're NOT Doing

- No AI generation of questions or answers (NFR-021, cost); no free-text answers; no images.
- No timer / countdown and no speed bonus: the client closes each question by hand; 1 point per correct answer.
- No reordering of questions: the list is in creation order and the client may ask ANY not-yet-asked question („Zadaj teraz”); „Następne pytanie” asks the first unasked one. To change the order: delete and add again.
- No re-asking of an asked question (it stays closed with its answers); the reset part „Pub quiz” makes every question askable again.
- No editing of a question once asked (its answers would change meaning); deleting it is allowed when it is not the one on the TV (its answers go with it, the confirm says so).
- No quiz on the tablet (`/r/`), on the staff floor, in the staff offline readout, in templates or in the guest's offline readout.
- No per-guest answers on the TV, no other guests' answers or scores on a phone; aggregate per-option counts only after a question closed.
- No separate reset part for the quiz QUESTIONS (they are the client's preparation; the client deletes them one by one).
- No change to the guest token's parts (hashed part only) and no second poll for phones or the TV.

## Implementation Approach

Follow the RSVP (S-25) pattern for the phone and the spotlight (tv-spotlight) pattern for the TV:

- Data in three tables + one run row; every state change goes through DB functions under one per-event lock, the guest's answer through a writer that locks the run row `for share` (the close locks it `for update`).
- One RPC per poll path: `quiz_guest_state` (phone, both 204 and 200 paths, only while `pubQuiz` is active), `quiz_tv_version` / `quiz_tv_state` (TV; the state function computes its `version` with the version function, so SSR and the poll agree).
- Standings are MATERIALIZED at „Pokaż wyniki” into `quiz_score` (place, points) under the run lock, so the phones' poll never ranks; the client's board ranks live (one RPC, `quiz_board`).
- The run's `revision` comes from a global sequence (never reused, like snapshot and spotlight ids): the TV token's new 4th part `<revision>-<answer count>` exists only while a run exists AND the module is active (all other TVs keep today's 3-part token).
- Gates at the edge only (`moduleForApiPath`), lead rule by listing the routes as client routes, the panel through the existing dispatcher and a new client section `quiz`.

## Critical Implementation Details

- **One denial for a bad answer target.** `save_quiz_answer` raises ONE code `QUIZ_CLOSED` for every question id that is not this event's currently OPEN question (unknown, another event's, not yet asked, closed, no run) → 409 `{ error, code: "quiz-closed" }` with the same body; only an option outside the open question's range is 400. The smoke compares A's late answer with event B's key naming A's question id.
- **Same reads, same token.** `getGuestState` and `getGuestStateVersion` both call `quiz_guest_state` (only while `pubQuiz` is on) in their `Promise.all`; `getTvScreen` takes its version from `quiz_tv_state.version`, which the function computes by calling `quiz_tv_version`. Integration tests compare both pairs in every phase.
- **Deploy order.** The guest and TV polls call the new RPCs only for events with the module active, but `reset_counts` gains keys and the old code's strict `ResetCountsSchema` refuses them: between `db push` and the code deploy the old code's reset preview/answer fails (the reset itself still commits). Deploy the code right after the migration; the CLAUDE.md deploy note says so.

## Phase 1: Data, rules, services and routes

### Overview

Migration, types, pure rules and texts, DB services, the client / guest / TV routes, module gate, client routes, reset part, export, tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261111060000_pub_quiz.sql`

**Intent**: Additive tables, functions and replaced reset functions for the quiz; nothing existing changes shape except `reset_counts`'s JSON (two new keys).

**Contract**:
- `quiz_question (id bigint identity pk, event_id int → event cascade, text 1–200 code points, options text[] (2–4, no nulls, each 1–80 — CHECK via a helper or `array_length` + per-element check function), correct_option smallint 0..cardinality−1, asked_at timestamptz null, closed_at timestamptz null, created_at; unique (event_id, id))`, index `(event_id, id)`.
- `quiz_run (event_id int pk → event cascade, phase text check in ('intro','question','reveal','results'), question_id bigint null, revision bigint not null default nextval('quiz_run_revision_seq'), updated_at)`, FK `(event_id, question_id) → quiz_question (event_id, id) on delete set null (question_id)`; sequence `quiz_run_revision_seq` (no reuse).
- `quiz_answer (question_id, guest_id) pk, event_id, option smallint 0..3, answered_at`; FKs `(event_id, question_id) → quiz_question cascade`, `(event_id, guest_id) → guest (event_id, id) cascade`; indexes `(event_id)`, `(guest_id)`.
- `quiz_score (event_id, guest_id) pk, points int ≥ 0, place int ≥ 1`; FKs → event cascade, `(event_id, guest_id) → guest cascade`.
- RLS on + `revoke all … from anon, authenticated` on all four; the sequence revoked too.
- `quiz_run_action(p_event_id int, p_action text, p_question_id bigint)` → void. Lock `pg_advisory_xact_lock(3013, p_event_id)`, the event (`not is_template`, else `EVENT_NOT_FOUND`), the run row `for update`. Actions: `start` (not while a question is open → `QUESTION_OPEN`; upsert phase intro, question null), `ask` (question of THIS event else `QUESTION_NOT_FOUND`; `asked_at` set already → `QUESTION_ASKED`; not while open → `QUESTION_OPEN`; sets `asked_at`, phase question), `close` (needs an open question → `NO_OPEN_QUESTION`; sets `closed_at`, phase reveal, question kept), `results` (not while open → `QUESTION_OPEN`; deletes and recomputes the event's `quiz_score` — players = guests with ≥ 1 answer to a CLOSED question, points = correct answers to closed questions, `place = rank() over (order by points desc)`; phase results, question null), `end` (deletes the run row; scores stay until the next results or reset). Every change sets `revision = nextval(…)` and `updated_at`. Unknown action → `INVALID_ACTION`.
- `save_quiz_answer(p_event_id, p_guest_id, p_question_id, p_option)` → void: run row `for share`; not (phase = question and question_id = p_question_id) → `QUIZ_CLOSED`; guest not of the event → `GUEST_NOT_FOUND`; option outside the question's options → `OPTION_OUT_OF_RANGE`; upsert `quiz_answer`.
- `quiz_guest_state(p_event_id, p_guest_id)` → jsonb or null (no run, a template, a guest of another event): `{ phase, total, closed, question: { id, number, text, options, correct (reveal only, else null) } | null, answer, points, result: { place, players } | null (results phase, own score row) }`; `number` = position by id among the event's questions; `points` = own correct answers over closed questions.
- `quiz_tv_version(p_event_id)` → text `<revision>-<answers of the event>` or null.
- `quiz_tv_state(p_event_id)` → jsonb or null: `{ version (= quiz_tv_version), phase, total, closed, question: { number, text, options, answered, correct (reveal), counts (reveal: per option) } | null, results: { players, top: [{ place, name, points }] (every score row with place ≤ 3, live guest names) } | null }` — no ids.
- `quiz_board(p_event_id)` → jsonb: `{ run: { phase, questionId } | null, questions: [{ id, text, options, correct, askedAt, closedAt, answers, counts[] }], standings: [{ guestId, name, points, answered }] (live: guests with ≥ 1 answer to a closed question), guestCount }`.
- `reset_counts` / `reset_event`: `create or replace` copies of the `20261109120000` version (same signatures) + part `quiz` appended LAST to `c_order` (canonical order: guesses, aiUsage, seating, guests, venue, orders, questions, guestLinks, quiz — the existing order stays; its deletes run before the guests' so nothing depends on cascades), `guests` implies `quiz`; the part deletes `quiz_answer`, `quiz_score`, `quiz_run` and sets `asked_at = null, closed_at = null` on the event's questions; counts gain `quizAnswers` (answers) and `quizAsked` (asked questions).
- Every function `set search_path = ''`, `revoke execute … from public, anon, authenticated`, comments.

#### 2. Types

**File**: `src/types.ts`, `src/db/database.types.ts`

**Intent**: DTOs and the hand-written DB types.

**Contract**: `QuizPhase`, `QuizQuestionDto { id, number, text, options, correct, askedAt, closedAt, answers, counts }`, `QuizStandingDto { place, tied, guestId, name, points, answered }`, `QuizBoardDto { run: { phase, questionId } | null, questions, standings, players, guestCount, maxQuestions }`, `GuestQuizDto` (as the RPC, typed), `TvQuizDto { phase, total, closed, question | null, results: { players, entries: [{ place, name, points }], more } | null }`; `GuestStateDto.quiz: GuestQuizDto | null`; `TvScreenDto.quiz: TvQuizDto | null`; `ResetPart` + `"quiz"`; `ResetCountsDto` + `quizAnswers`, `quizAsked`; `EventExportDto.quiz { questions: [{ text, options, correct, asked, closed }], standings: [{ place, name, points }] }`. DB types: the four tables and seven functions.

#### 3. Pure rules and texts

**File**: `src/lib/quiz/rules.ts`, `src/lib/quiz/messages.ts`, `src/lib/quiz/api.ts`, `src/lib/quiz/index.ts`, `src/lib/quiz/quiz.test.ts`

**Intent**: Limits, input parsing, ranking, token keys, TV results cut, summary, texts PL/EN, zod bodies.

**Contract**:
- `MAX_QUIZ_QUESTIONS` 50, `MIN_QUIZ_OPTIONS` 2, `MAX_QUIZ_OPTIONS` 4, `MAX_QUIZ_TEXT` 200, `MAX_QUIZ_OPTION` 80, `TV_RESULTS_PLACES` 3, `TV_RESULTS_LIMIT` 10, `QUIZ_PHASES`, `QUIZ_ACTIONS`, `QUIZ_CODES` (`quiz-closed`, `quiz-question-locked`, `quiz-question-on-tv`, `quiz-question-open`, `quiz-question-asked`, `quiz-no-open-question`, `quiz-full`).
- `parseQuizQuestion({ text, options, correct }, locale)` → `{ ok, value } | { ok: false, message }`: text normalized like questions (1–200), options normalized like names, blank ones dropped from the END only, 2–4 left, each ≤ 80, distinct in any letter case, `correct` an index of a kept option; `parseQuizQuestionPatch` (≥ 1 field; options and correct validated together against the merged question).
- `rankQuiz(standings)` → competition places (1, 2, 2, 4), `tied`, inside a place Polish name order then guest id.
- `tvQuizResults(rows)` → `{ players, entries (≤ TV_RESULTS_LIMIT, place ≤ 3, Polish name order inside a place), more }`.
- `quizKey(quiz)` (guest token hash input), `tvScreenVersion(seating, spotlight, quiz?)` extended (in `src/lib/tv-spotlight/rules.ts`: appends `.<quiz>` only when given).
- `optionLetter(index)` (A–D), `nextQuestion(board)` (first unasked by id), `formatQuizSummary(board, locale)` („5 pytań · gotowy do startu” / „· trwa: pytanie 2 z 5” / „· wyniki”).
- `quizMessages(locale)`: client page, phone, TV, errors, confirms, aria labels — PL and EN.
- zod: `QuizQuestionBody` (strict `{ text: string ≤ 400, options: string[] 1–4 items each ≤ 200 raw (a 5th option → 400), correct: int ≥ 0 }`; the rule then normalizes and checks 2–4 kept options, lengths and duplicates), `QuizQuestionPatchBody`, `QuizRunBody` (strict discriminated union on `action`), `GuestQuizAnswerBody` (strict `{ questionId: int, option: int }`).

#### 4. Services

**File**: `src/lib/quiz/service.ts`

**Intent**: DB access for the board, questions, run actions, the answer, the phone and the TV; event as the second parameter, every query filtered by it.

**Contract**: `getQuizBoard(db, eventId)` → `QuizBoardDto` (from `quiz_board`, ranked with `rankQuiz`); `addQuizQuestion(db, eventId, input)` → `added | full`; `updateQuizQuestion(db, eventId, id, patch)` → `updated | not-found | locked`; `deleteQuizQuestion(db, eventId, id)` → `deleted | not-found | on-tv`; `runQuizAction(db, eventId, action)` → `done | not-found | question-not-found | question-open | question-asked | no-open-question`; `answerQuiz(db, eventId, guestId, questionId, option)` → `saved | closed | out-of-range | not-found`; `getGuestQuiz(db, eventId, guestId)` → `GuestQuizDto | null`; `getTvQuiz(db, eventId)` → `TvQuizDto & { version } | null`; `getTvQuizVersion(db, eventId)` → `string | null`. Answers of the RPCs validated with zod (drift fails loudly).

#### 5. Phone and TV integration

**File**: `src/lib/modules/rules.ts`, `src/lib/guest-links/state.ts`, `src/lib/guest-links/service.ts`, `src/lib/tv-spotlight/service.ts`, `src/lib/tv-spotlight/rules.ts`, `src/pages/api/tv/[key]/seating.ts`, `src/pages/tv/[key].astro`, `src/components/hooks/useTvSeating.ts`

**Intent**: The quiz rides the existing polls.

**Contract**: the phone's `question.id` is the ONE new internal id on a phone (like `lineId`: the handle for answering, re-checked by `save_quiz_answer` under the run lock); the correct option is null in the phone's and the TV's DTO until the question is closed (also in the guest page's SSR HTML). `GuestModules.pubQuiz` (`ALL_GUEST_MODULES`, `guestModulesOf`), `guestModulesKey` appends `p` only when on (other events keep their tokens); `moduleForApiPath`: organizer `quiz*` and guest `quiz` → `pubQuiz`. `guestStateVersion(…, rsvp, quiz)` adds `∖0 quizKey(quiz)` to the hash only when non-null; `toGuestState` returns `quiz` in all three branches; both guest service paths call `getGuestQuiz` only when `modules.pubQuiz` (else null). `getTvScreen(db, eventId, spotlightOn = true, quizOn = false)` / `getTvScreenVersion(…, quizOn = false)`: the quiz part and `quiz` field only when on and a run exists; both TV call sites pass `access.event.modules.pubQuiz`; `isTvScreen` accepts a missing `quiz`.

#### 6. Routes

**File**: `src/pages/api/o/[key]/quiz.ts`, `src/pages/api/o/[key]/quiz/questions.ts`, `src/pages/api/o/[key]/quiz/questions/[id].ts`, `src/pages/api/o/[key]/quiz/run.ts`, `src/pages/api/g/[key]/quiz.ts`, `src/lib/client-routes/match.ts`, `src/lib/client-routes/table.ts`

**Intent**: Client and guest APIs; the panel dispatcher runs the client ones.

**Contract**: organizer (`organizerApi`): `GET /quiz` → `QuizBoardDto`; `POST /quiz/questions` → 201 board (400 rule message, 409 `quiz-full`); `PATCH /quiz/questions/<id>` → board (400, 404 unknown/foreign/malformed, 409 `quiz-question-locked`); `DELETE /quiz/questions/<id>` → board (404, 409 `quiz-question-on-tv`); `POST /quiz/run { action, questionId? }` → board (404 unknown question, 409 the codes). Guest (`guestApi`): `PUT /quiz { questionId, option }` → 200 `GuestStateDto`, 409 `quiz-closed`, 400 out of range. Patterns `quiz`, `quiz/questions`, `quiz/questions/:id`, `quiz/run` in both client-route lists.

#### 7. Reset and export

**File**: `src/lib/reset/parts.ts`, `src/lib/reset/api.ts`, `src/lib/reset/summary.ts`, `src/lib/reset/messages.ts`, `src/lib/privacy/export-service.ts`

**Intent**: The part `quiz` (in `RESET_PARTS` last, in `TRIAL_RESET_PARTS`, implied by `guests`), counts and summaries PL/EN; the export gains `quiz` (questions and standings by name, no ids).

**Contract**: `RESET_IMPLIES.guests` + `quiz`; `ResetCountsSchema` + `quizAnswers`, `quizAsked`; `describeResetCount` / `describeResetResult` texts for the part.

#### 8. Tests

**File**: `src/lib/quiz/quiz.test.ts`, `src/lib/modules/modules.test.ts`, `src/lib/reset/*.test.ts`, `src/lib/client-routes/match.test.ts`, `tests/integration/pub-quiz.test.ts`, existing tests touched by the new fields

**Intent**: Rules and DB behaviour.

**Contract**: unit — parsing (bounds, trailing blanks, duplicates in any case, correct index), `rankQuiz` ties (5,5,4 → 1,1,3; all equal), `tvQuizResults` cut (12 tied at 1 → 10 + more 2; places 1,2,2,4 → three entries), `quizKey` changes on every phone-visible change, `moduleForApiPath` quiz paths, `guestModulesKey` unchanged without the quiz, TV version with/without the 4th part, reset parts/implications. Integration (`pub-quiz.test.ts`, own restaurant + two events, module columns set to active): full run (start/ask/answer/change/close/results/end), a late answer after close → `closed`, event B's guest naming A's open question → `closed`, an unasked or closed question → `closed`, out of range, edit locked after ask, delete on TV refused, ask of a closed question → `question-asked`, results ranking with a tie and materialized places, `getGuestStateVersion` = `getGuestState().version` in every phase (module on) and unchanged by the quiz when the module is off, `getTvScreenVersion` = `getTvScreen().version` in every phase, the TV JSON carries no guest names before results and no ids, `correct` is null on the phone and the TV while the question is open, reset part `quiz` keeps questions and makes them editable, `purge_event_guest_data` removes answers and scores, the export carries the quiz without ids.

### Success Criteria:

#### Automated Verification:

- Migration applies from zero: `npx supabase db reset`
- Migration applies on the populated database (demo data of the previous commit): `npx supabase migration up`
- Unit and integration tests pass: `AI_PROVIDER=mock npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

#### Manual Verification:

- The migration's function list and grants read right (`\df public.quiz*`, no execute for anon/authenticated)

**Implementation Note**: unattended run — manual rows stay for the user's morning check; continue after the automated ones pass.

---

## Phase 2: Client, panel, phone and TV UI

### Overview

The client's quiz page and shell card, the panel preview section and its card, the guest's quiz section, the TV quiz layer.

### Changes Required:

#### 1. Client page and island

**File**: `src/pages/o/[key]/quiz.astro`, `src/components/quiz/QuizManager.tsx`, `src/components/quiz/QuizQuestionForm.tsx`, `src/components/quiz/QuizRunPanel.tsx`, `src/components/quiz/QuizStandings.tsx`, `src/components/hooks/useQuizBoard.ts`

**Intent**: Prepare and run the quiz.

**Contract**: page = `strzaly.astro`'s pattern (organizer guard, `LeadBanner`, `ReadOnlyFrame` while the venue leads, `ModuleOff module="pubQuiz"` when off, `OfflineSync`); island `data-quiz-manager`, run card `data-quiz-run="<phase>|idle"` (buttons by phase; „Zakończ quiz” and deletes with `window.confirm`), the answered count while open, after close the correct option and per-option counts, questions list `data-quiz-question="<id>"` with status (`data-quiz-status` draft | on-tv | closed), add/edit form (text, four option inputs, the correct radio, client-side `parseQuizQuestion`), standings table `data-quiz-standings`. Hook: one action at a time, every answer replaces the board, re-read every 4 s while visible and idle (reads started before a change are ignored).

#### 2. Shell card and panel

**File**: `src/pages/o/[key].astro`, `src/lib/shell/messages.ts`, `src/lib/client-routes/sections.ts`, `src/pages/panel/wydarzenia/[id]/[sekcja].astro`, `src/components/lead/ClientWorkCards.astro`, `src/pages/panel/wydarzenia/[id].astro`

**Intent**: Entry points.

**Contract**: shell card „Pub quiz” (`data-quiz-card`, only while `modules.pubQuiz`) with `formatQuizSummary`; `CLIENT_SECTIONS` + `quiz`; the preview page renders `QuizManager` (static in support mode, `ModuleOff` when off); `ClientWorkCards` card; event page summary.

#### 3. Guest section

**File**: `src/components/guest/GuestQuizView.tsx`, `src/components/guest/GuestModuleGate.tsx`, `src/pages/g/[key].astro`

**Intent**: Answer on the phone.

**Contract**: inside `GuestModuleGate module="pubQuiz"` ABOVE the seat section; renders nothing while `state.quiz` is null; `data-guest-quiz="<phase>"`; option buttons with `aria-pressed`, every tap saved at once through `PUT /quiz` (answer → `push`), 409 → refresh + the message; reveal: right / wrong / not answered + points; results: place of players + points (or „not played”). Reads only the shared poll.

#### 4. TV layer

**File**: `src/components/tv/TvQuiz.tsx`, `src/components/tv/TvSeatingView.tsx`

**Intent**: The quiz on the TV.

**Contract**: rendered when `tv.quiz` is non-null on its own layer `z-[25]` (over the spotlight `z-20`, under the offline badge `z-30`), opaque; `data-tv-quiz="<phase>"`; intro (title, number of questions, „open your link”), question („Pytanie 3 / 10”, text sized like the spotlight, options A–D in a 2×2 grid, „Odpowiedzi: N”), reveal (the correct option highlighted with ✓ and text, never colour alone; counts per option), results (places with medals for 1–3, names, points, „+N”, players).

### Success Criteria:

#### Automated Verification:

- Unit and integration tests pass: `AI_PROVIDER=mock npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build passes: `npm run build`

#### Manual Verification:

- The client page in PL and EN: prepare, run a whole quiz, the ranking
- A phone answers, changes the answer, sees right/wrong and its place; nothing of others
- The TV: intro, question, reveal with counts, results; the spotlight covered while the quiz runs; readable on a 16:9 screen

---

## Phase 3: Smoke, demo and documentation

### Overview

HTTP coverage, the demo round, CLAUDE.md.

### Changes Required:

#### 1. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Section 43 and section 38's field set.

**Contract**: section 38's `GuestStateDto` field set gains `quiz`. Section 43 (a new event of A through the panel — defaults: pubQuiz offered, off, locked): quiz API 409 `module-off`, the guest route = the identical 404 of an unknown key, the client's switch → 409 `module-locked`; the admin enters support for A, unlocks the pub quiz for the event (200), exits; the client switches it on; the page `/o/<key>/quiz` 200 (`data-quiz-manager`) PL/EN; validation 400s (1 option, 5 options, duplicates, correct out of range, extra field); 3 questions prepared; TV poll 3-part token and `quiz: null`; start → TV token 4 parts, `quiz.phase` intro on TV and phones; ask → two guests answer, one changes; the TV JSON's `quiz` part has the question and `answered: 2`, no guest names, `correct`/`counts` null (the event has no published seating, so no names anywhere in the TV JSON); a guest's JSON has only its own answer, `correct` null, no other guest's name, and the guest page's HTML carries no correct option; edit of the asked question 409, its delete 409; close → a late answer 409 `quiz-closed`; TV shows correct + counts; event B's guest key naming A's question = the identical 409 body; A's organizer key on B's question id = the identical 404 of an unknown id; second question; results → TV places/names/points, phones place/players; lead rule (venue leads → client 409 `venue-leads`, staff through `…/klient/quiz/run` 200; client leads → staff 409 `client-leads`); module off → 409 / 404 / TV without quiz; „Reset prób” `quiz` → answers gone, questions editable; panel preview `/panel/wydarzenia/<id>/quiz` 200; the event deleted.

#### 2. Demo

**File**: `scripts/demo.mjs`, `scripts/lib/platform.mjs`

**Intent**: Show the module with the admin's unlock.

**Contract**: `createEvent(…, { allModules: true, unlocked })` option; the main event is created with every module on but only AI topics unlocked; inside the existing support visit the admin also unlocks the pub quiz for the main event (log assertion `exit,unlock,unlock,access,access,enter`); then the client prepares 3 questions, starts, asks two of them, 4 demo guests answer through their links (one wrong), closes each, shows the results (left on the TV); the demo fails unless the TV poll shows the results and a phone its place; prints „Pub quiz” (`/o/<key>/quiz`, the TV, one guest link, how to end it).

#### 3. Documentation

**File**: `CLAUDE.md`

**Intent**: Replace the S-17 „Pub quiz (S-28)” bullet with the real description; add the quiz to the reset, TV, guest-token and smoke/demo descriptions.

**Contract**: a new Data-access bullet „Pub quiz (pub-quiz, S-28; …)” (data, functions, rules, routes, phone, TV, the results exception, reset, retention, tests, deploy note).

### Success Criteria:

#### Automated Verification:

- Smoke passes against the production preview: `npm run smoke` (with `AI_PROVIDER=mock npm run preview`)
- Demo fills the local app: `npm run demo`
- Full suite, lint, type check, build: `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build`

#### Manual Verification:

- The demo's quiz on a real TV and a phone (results readable, the phone's place)
- CLAUDE.md's quiz bullet reads as a correct summary

---

## Testing Strategy

### Unit Tests:

- `src/lib/quiz/quiz.test.ts`: parsing, ranking ties, TV cut, keys, summary texts PL/EN.
- Module, reset and client-route tests extended for the new key, part and patterns.

### Integration Tests:

- `tests/integration/pub-quiz.test.ts` as listed in Phase 1 §8; `isolation`-style cross-event checks inside it.

### Manual Testing Steps:

1. `npm run demo`, open the printed client quiz page, the TV and a guest link side by side.
2. Run another question from the client page; answer on the phone; close; check the TV counts and the phone's verdict.
3. Switch the module off on the client shell; the TV and the phone drop the quiz on their next poll.

## Performance Considerations

- Phone poll while the module is on: one more RPC (`quiz_guest_state`: run row, the shown question, the own answer, own points over ≤ 50 closed questions, the own score row) in the existing `Promise.all`; nothing ranks per poll. Events without the module: no extra query.
- Answer bursts (150 guests in seconds): one PK upsert under a shared row lock each, then the usual `getGuestState`.
- TV: one tiny version RPC (`count(*)` over the event's answers, ≤ 7 500 rows, index on `event_id`) per 2.5 s.
- The client board re-reads every 4 s with one aggregate RPC.

## Migration Notes

- Additive: four new tables, a sequence, seven functions; `reset_counts` / `reset_event` replaced with the same signatures (part `quiz` added). Existing data untouched.
- Deploy: migration BEFORE the code; the old code's strict reset schema refuses the new count keys, so deploy the code right after (the reset itself is unaffected).

## References

- Pattern for the phone: `context/archive/2026-11-10-guest-rsvp-menu/plan.md`, `supabase/migrations/20261111040000_guest_rsvp.sql`
- Module gate: `src/lib/modules/rules.ts:96`, `src/middleware.ts:166`
- TV poll: `src/lib/tv-spotlight/service.ts:150`, `src/pages/api/tv/[key]/seating.ts`
- Reset: `supabase/migrations/20261109120000_multi_tenant_events.sql` (`reset_counts`, `reset_event`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data, rules, services and routes

#### Automated

- [x] 1.1 Migration applies from zero: `npx supabase db reset`
- [x] 1.2 Migration applies on the populated database (demo data of the previous commit): `npx supabase migration up`
- [x] 1.3 Unit and integration tests pass: `AI_PROVIDER=mock npm test`
- [x] 1.4 Lint passes: `npm run lint`
- [x] 1.5 Type check passes: `npx astro check`

#### Manual

- [x] 1.6 The migration's function list and grants read right (`\df public.quiz*`, no execute for anon/authenticated)

### Phase 2: Client, panel, phone and TV UI

#### Automated

- [ ] 2.1 Unit and integration tests pass: `AI_PROVIDER=mock npm test`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Type check passes: `npx astro check`
- [ ] 2.4 Production build passes: `npm run build`

#### Manual

- [ ] 2.5 The client page in PL and EN: prepare, run a whole quiz, the ranking
- [ ] 2.6 A phone answers, changes the answer, sees right/wrong and its place; nothing of others
- [ ] 2.7 The TV: intro, question, reveal with counts, results; the spotlight covered while the quiz runs; readable on a 16:9 screen

### Phase 3: Smoke, demo and documentation

#### Automated

- [ ] 3.1 Smoke passes against the production preview: `npm run smoke` (with `AI_PROVIDER=mock npm run preview`)
- [ ] 3.2 Demo fills the local app: `npm run demo`
- [ ] 3.3 Full suite, lint, type check, build: `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build`

#### Manual

- [ ] 3.4 The demo's quiz on a real TV and a phone (results readable, the phone's place)
- [ ] 3.5 CLAUDE.md's quiz bullet reads as a correct summary
