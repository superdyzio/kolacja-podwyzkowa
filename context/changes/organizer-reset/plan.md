# Organizer reset (Reset danych) Implementation Plan

## Overview

The organizer gets a „Reset danych” card at the bottom of the shell `/o/<key>`. „Resetuj…” opens a modal listing seven reset parts as checkboxes (label, one-line Polish description, live count of what goes away), „Zaznacz wszystko”, and one red „Resetuj zaznaczone”. One click resets the chosen parts in ONE database transaction; the modal then shows a Polish summary and the shell reloads when it closes. The organizer and TV keys and the event row never change. User request 2026-10-30: „przycisk do resetu, gdzie w modalu pyta mnie o to jakie rzeczy zresetować i mogę to załatwić jednym klikiem” (typical use: wipe the rehearsal before the dinner).

## Current State Analysis

- One singleton event (`public.event`, id 1) owns everything; every child table cascades from it, but deleting the event would change the organizer and TV keys, so a reset must delete the children only.
- Data per part (migrations in `supabase/migrations/`):
  - guesses: `public.guess` + `event.correct_amount_grosze` / `event.guess_intake_open` (`20261027050000_guesses.sql`); guest writes go through `save_guest_guess`, which locks the event row `FOR SHARE`.
  - AI usage: `public.ai_topic` attempt rows (`20261027070000_ai_topics.sql`); `reserve_ai_topic` serializes under `pg_advisory_xact_lock(3008)`; `guest_id` is `on delete set null`, so deleting guests alone does NOT reset the evening's usage. `finish()` in `src/lib/ai-topics/service.ts:79` updates by id — a deleted row is a harmless no-op.
  - seating: `seat_assignment` + `seating_snapshot` (children `seating_snapshot_table`/`_seat` cascade) (`20261027014210_create_seating.sql`); writers `seat_guest`, `publish_seating`, `replace_seating` take `pg_advisory_xact_lock(3003)`. Snapshot ids are identities: the TV token `"<snapshot id>.<plan version>"` and the guest-state token compare by equality, so ids must never be reused.
  - guests: `guest` + `guest_group`; trigger `guest_dissolve_undersized_group` deletes groups dropping below 2; `guess`, `seat_assignment` cascade from `guest`; snapshot seats and AI attempts keep a null `guest_id`.
  - venue: `venue_plan` (singleton), `venue_room` → `venue_table` (cascade) → `seat_assignment` (cascade); snapshot tables keep a null `table_id`.
  - questions: `question` with `unique (event_id, text_key)`; the 90 starter rows come from `starterQuestionRows()` in `src/lib/questions/seed.ts` (mirrored in `context/foundation/question-seed.md`, guarded by `seed.test.ts`).
  - guest links: `guest.access_key` (column default `translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')`) and `event.guest_access_enabled` (`20261027040000_guest_links.sql`).
- Organizer API pattern: `organizerApi(locals)` (`src/lib/organizer-api.ts`), `readJsonBody` + zod strict objects (`src/lib/http.ts`), status unions from services, `DbClient` services with no `astro:*` imports.
- Organizer offline memory (S-09): `clearOfflineCache(apiBase)` in `src/components/hooks/offline-cache-store.ts` forgets this link's two `kolacja-podwyzkowa:odczyt:*` entries; `OfflineSync` on the shell re-saves the fresh state on mount.
- Dialog patterns: `RankingReadout.tsx` / `OfflineReadoutDialog.tsx` are full-screen `div role="dialog"`; no Radix dialog is installed. `Button` has a `destructive` variant (and `whitespace-nowrap`).
- `npm run demo` refuses only when the event has guests, rooms, tables or a plan — after a full reset it works again.

## Desired End State

- `/o/<key>` ends with a „Reset danych” section; „Resetuj…” opens a native modal dialog with the seven parts, each showing a fresh count („40 gości · 3 grupy”, „nic do usunięcia”), implied parts ticked and locked with „wymagane przez: …”, „Zaznacz wszystko”/„Odznacz wszystko”, „Anuluj” and a red „Resetuj zaznaczone” (disabled with nothing selected). One click resets; the dialog shows „Zresetowano” with one line per part; closing it reloads the shell, whose cards show the new state.
- `GET /api/o/<key>/reset` → `ResetPreviewDto`; `POST /api/o/<key>/reset { parts }` → `ResetResultDto` (with Polish `summary` lines). TV and guest keys get the identical JSON 404.
- After „all parts”: no guests, groups, guesses, AI attempts, seats, snapshots, plan, rooms or tables; exactly the 90 starter questions; guest access OFF; intake open; correct amount null; organizer and TV links still open (200); the TV shows nothing published; the next publish gets a snapshot id higher than any before.
- Verify: unit tests, integration tests (destructive ones on a test-created event), `npm run smoke` (new section 22), and the end-to-end HTTP check on demo data in the final verification.

### Key Discoveries:

- Lock order of existing writers: seating functions start with advisory 3003, `reserve_ai_topic` with 3008, `save_guest_guess` with the event row `FOR SHARE` (`20261027050000_guesses.sql:57`). Taking 3003 → 3008 → event row `FOR UPDATE` cannot deadlock with any of them.
- `search_path = ''` in functions: the key default must be written fully qualified (`extensions.gen_random_bytes(18)`).
- Supabase may refuse `DELETE` without `WHERE` (safeupdate) — every delete filters on `event_id`.
- `starterQuestionRows()` already returns `{ category, text }[]` normalized — it can be passed as `jsonb` to the function.
- Integration tests may delete only rows they created (`tests/integration/helpers.ts` `acquireTestEvent`/`createdByTest`); the question suite gates its starter tests on `event.createdByTest` (`tests/integration/questions.test.ts:174`) — same gate for the destructive reset tests.

## What We're NOT Doing

- Changing the organizer or TV keys, the event name, or deleting the event row.
- Undo, backup/export before a reset, a second confirmation or typing a confirmation word (the modal is the confirmation).
- Finer parts (e.g. only pins, only the unpublished draft, only one room).
- Clearing other browser memories: the organizer's question-draw and AI-topic localStorage (`ORGANIZER_DRAW_STORAGE_KEY`, `ORGANIZER_TOPIC_STORAGE_KEY`) and guests' phones keep their last text — harmless; the service-worker copy of `/odczyt` holds no data.
- Changing `npm run demo` or `npm run links`.
- New dependencies (no Radix dialog/checkbox).

## Implementation Approach

One DB migration with two functions: `reset_counts(p_event_id)` (read-only counts as `jsonb`, used by the modal and inside the reset) and `reset_event(p_event_id, p_parts, p_starter_questions)` (validates and expands the parts, takes the locks, records the counts before, deletes/updates in dependency order, re-inserts the starter questions from the `jsonb` argument, returns `{ parts, before, questionsAdded, guestKeysReplaced }`). A pure module `src/lib/reset/` owns part ids, Polish labels/descriptions, implications, the selection logic and all texts; the service validates the RPC answers and adds the summary; the route is a thin organizer-only wrapper; the island is a native `<dialog>`.

### Invariants (load-bearing)

1. Only `DELETE … WHERE event_id = …` — never `TRUNCATE … RESTART IDENTITY`: snapshot ids keep growing, so polling tokens never return to an old value.
2. The 90 starter questions arrive as the `p_starter_questions jsonb` argument built from `starterQuestionRows()` and are inserted only when `questions` is in the expanded set: one transaction, one source of truth.
3. Lock order inside `reset_event`: `pg_advisory_xact_lock(3003)` → `pg_advisory_xact_lock(3008)` → `select … from public.event where id = p_event_id for update` — all before touching `guess` (in-flight guest saves finish first; later ones wait and land after the reset).
4. Implications are expanded twice: in TS (`expandResetParts`) and again in SQL; SQL raises on an empty list or an unknown id before doing anything.
5. „Removed” counts are read inside the reset transaction after the locks (`reset_counts` call), never taken from the modal's earlier GET.

## Phase 1: Schema and pure rules

### Overview

The migration with both functions, their types, the shared DTOs and the pure `src/lib/reset/` module with unit tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261030120000_reset_event.sql`

**Intent**: Add the read-only counts function and the atomic reset function, closed to browser roles.

**Contract**:
- `public.reset_counts(p_event_id smallint) returns jsonb` (plpgsql, `stable`, `set search_path = ''`): raises `EVENT_NOT_FOUND`; returns `{ guesses, correctAmountSet, intakeOpen, aiAttempts, aiUsed, seats, pinned, snapshots, guests, groups, plan, rooms, tables, questions, guestAccessEnabled }` (integers / booleans; `aiUsed` = `event_used` of `public.ai_topic_usage(p_event_id)`).
- `public.reset_event(p_event_id smallint, p_parts text[], p_starter_questions jsonb) returns jsonb` (plpgsql, `set search_path = ''`):
  - raises `NO_PARTS` (null/empty), `UNKNOWN_PART` (any id outside `guesses, aiUsage, seating, guests, venue, questions, guestLinks`), `EVENT_NOT_FOUND`, `NO_STARTER_QUESTIONS` (questions chosen, argument null/empty array);
  - expands `guests` → + `guesses, aiUsage, seating`; `venue` → + `seating`;
  - locks per invariant 3, then `before := public.reset_counts(p_event_id)`;
  - in this order, each only when its part is in the expanded set: guesses (`update event set correct_amount_grosze = null, guess_intake_open = true`, delete `guess`), aiUsage (delete `ai_topic`), seating (delete `seat_assignment`, delete `seating_snapshot`), guests (delete `guest_group`, delete `guest`), venue (delete `venue_plan`, `venue_table`, `venue_room`), questions (delete `question`, insert from `jsonb_to_recordset(p_starter_questions) as x(category text, text text)` `on conflict (event_id, text_key) do nothing`, count inserted rows), guestLinks (update every guest's `access_key` with the column-default expression, count rows; `update event set guest_access_enabled = false`);
  - returns `{ "parts": [expanded ids in canonical order], "before": <reset_counts>, "questionsAdded": n, "guestKeysReplaced": n }`.
- Both: `revoke execute … from public, anon, authenticated`, `grant execute … to service_role`; header comment in the style of earlier migrations.

#### 2. Types

**File**: `src/db/database.types.ts`, `src/types.ts`

**Intent**: Type the two RPCs and the DTOs shared by route and island.

**Contract**: `Functions.reset_counts { Args: { p_event_id: number }; Returns: Json }`, `Functions.reset_event { Args: { p_event_id: number; p_parts: string[]; p_starter_questions: Json }; Returns: Json }`. In `src/types.ts`: `ResetPart` union, `ResetCountsDto` (fields above), `ResetPreviewDto { counts: ResetCountsDto; starterQuestions: number }`, `ResetResultDto { parts: ResetPart[]; before: ResetCountsDto; questionsAdded: number; guestKeysReplaced: number; summary: string[] }`.

#### 3. Pure module

**File**: `src/lib/reset/parts.ts`, `src/lib/reset/summary.ts`, `src/lib/reset/api.ts`, tests next to them

**Intent**: Everything the route and the island share without DB access: ids, Polish labels and descriptions, implications, selection, count lines, result summary, request/answer schemas.

**Contract**:
- `parts.ts`: `RESET_PARTS` (canonical order: guesses, aiUsage, seating, guests, venue, questions, guestLinks), `isResetPart`, `RESET_PART_LABELS` („Strzały”, „Licznik tematów AI”, „Rozsadzenie i historia”, „Goście i grupy”, „Plan, sale i stoliki”, „Pytania”, „Linki gości”), `RESET_PART_DESCRIPTIONS` (one line each; guestLinks says printed cards stop working, questions says the starter base is restored), `RESET_IMPLIES`, `expandResetParts(parts) → ResetPart[]` (closure, canonical order, deduped), `requiredBy(part, explicit) → ResetPart[]`, `toggleResetPart(explicit, part)` (no-op for a part locked by another explicit choice), `selectAllResetParts()`.
- `summary.ts`: `describeResetCount(part, counts, starterQuestions) → string` („nic do usunięcia” when empty), `GUEST_LINKS_WITH_GUESTS_NOTE` (shown on guestLinks while guests is selected), `describeResetResult({ parts, before, questionsAdded, guestKeysReplaced }) → string[]` (one line per expanded part; guestLinks with 0 keys says only „dostęp gości wyłączony”), using `pluralPl` from `@/lib/guests/summary`.
- `api.ts` (zod from `astro/zod`): `ResetRequestBody = z.strictObject({ parts: z.array(enum).min(1).max(7) })`, `ResetCountsSchema`, `ResetEventAnswerSchema` (validate RPC JSON in the service).

### Success Criteria:

#### Automated Verification:

- Migration applies to the local DB: `npx supabase migration up`
- Functions behave on the demo data inside a rolled-back transaction (psql `begin; select public.reset_event(...); <counts>; rollback;`) and browser roles lack EXECUTE (`has_function_privilege`)
- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 2: Service and integration tests

### Overview

The DB service and integration tests against the local Supabase.

### Changes Required:

#### 1. Service

**File**: `src/lib/reset/service.ts`, `src/lib/reset/index.ts`

**Intent**: `DbClient` wrappers that validate the RPC answers and build the result DTO.

**Contract**: `getResetPreview(db) → ResetPreviewDto` (`reset_counts` + `starterQuestionRows().length`); `resetEvent(db, parts) → { status: "reset"; result: ResetResultDto } | { status: "not-found" }` (expands in TS, passes `starterQuestionRows()` only when `questions` is expanded, else `[]`; maps `EVENT_NOT_FOUND`; any other error throws; adds `summary` via `describeResetResult`). `index.ts` re-exports the pure modules and the service (server code only; islands import the pure files directly).

#### 2. Integration tests

**File**: `tests/integration/reset.test.ts`

**Intent**: Prove each part's effect and the invariants against the real DB without touching real data.

**Contract**: `describe.skipIf(!hasLocalDb)`. Always: preview shape matches direct counts (read-only); `NO_PARTS` / `UNKNOWN_PART` raise and change nothing; anonymous REST cannot call either function (pattern of `ai-topic-schema.test.ts`). Only when `event.createdByTest` (else `ctx.skip()`), each case building its own data with the existing helpers: guesses + aiUsage subset touches nothing else and resets intake/correct amount; `["guests"]` also clears guesses, AI attempts and seating; `["venue"]` clears plan/rooms/tables and seating; `["guestLinks"]` changes every key and turns access off; `["questions"]` leaves exactly `starterQuestionRows()`; the full reset leaves the event empty with 90 questions, unchanged organizer/TV keys, and the next publish gets an id higher than the old maximum; `before` counts match what existed.

### Success Criteria:

#### Automated Verification:

- Tests pass: `npm test` (destructive cases skip while demo data exists; they run in the final verification on an emptied DB)
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 3: API route and smoke

### Overview

The organizer-only route and the HTTP smoke section.

### Changes Required:

#### 1. Route

**File**: `src/pages/api/o/[key]/reset.ts`

**Intent**: Thin wrapper over the service.

**Contract**: `prerender = false`; `GET` → 200 `ResetPreviewDto`; `POST` → `readJsonBody(request, ResetRequestBody)` (400 „Nieprawidłowe dane.”) → `resetEvent` → 200 `ResetResultDto` / 404 „Brak dostępu”. Both start with `organizerApi(locals)`.

#### 2. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Section 22 before `finish()`: the access matrix and an end-to-end reset over HTTP.

**Contract**: TV key and guest key → identical JSON 404 on GET and POST `/api/o/<key>/reset`; organizer GET 200 with counts > 0; POST `{}`, `{ parts: [] }`, `{ parts: ["nope"] }`, an extra key, malformed JSON → 400; POST `["guesses", "aiUsage"]` → 200, guesses board empty with intake open and no correct amount, AI usage 0, guests still listed; POST `["guestLinks"]` → old guest key → 404, access off; POST every part → guests, venue, TV tables empty, published seating null, questions = 90 with `starterMissing` 0, organizer shell and TV page 200, preview counts zero except questions; every 200 carries `summary` lines.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- Smoke passes on an empty DB: `npm run smoke` (run once, in the Phase 5 final verification)

---

## Phase 4: Reset modal on the organizer shell

### Overview

The island, its hook, and the card at the bottom of the shell.

### Changes Required:

#### 1. Hook

**File**: `src/components/hooks/useEventReset.ts`

**Intent**: Load the preview, send the reset, keep the result.

**Contract**: `useEventReset(apiBase) → { preview, loading, pending, failure, result, load, reset, clearResult }`; `reset(parts)` POSTs the explicit selection; on 200 calls `clearOfflineCache(apiBase)` and stores the result; failures via `api-failure.ts` (network → `NETWORK_FAILURE`).

#### 2. Island

**File**: `src/components/reset/ResetPanel.tsx`

**Intent**: „Resetuj…” button + native `<dialog>` (`showModal`) with the part list, the shortcut, „Anuluj” and „Resetuj zaznaczone” (`variant="destructive"`).

**Contract**: props `{ apiBase }`; opening loads the preview (loading text, failure with „Spróbuj ponownie”); rows are `<label>` + native checkbox + label/description/count (text wraps at 360 px — no `whitespace-nowrap` on them); implied rows checked + disabled with „wymagane przez: …”; guestLinks shows `GUEST_LINKS_WITH_GUESTS_NOTE` while guests is selected; while the POST is in flight Esc (`cancel` → `preventDefault`) and the buttons are blocked; after success the list is replaced by „Zresetowano” + summary lines + „Zamknij”; closing after a success clears the offline cache again and reloads the page; closing otherwise returns focus to „Resetuj…”. Imports only pure modules (`@/lib/reset/parts`, `@/lib/reset/summary`).

#### 3. Shell card

**File**: `src/pages/o/[key].astro`

**Intent**: A `<section aria-labelledby="reset-heading">` after „Przygotowanie i wieczór”: heading „Reset danych”, one sentence (e.g. „Usuwa wybrane dane, np. po próbie generalnej. Link organizatora i adres TV zostają.”) and `<ResetPanel client:load apiBase={view.apiBase} />`.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: The shell carries `component-export="ResetPanel"` and „Reset danych”; the TV page carries neither.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`

#### Manual Verification:

- On a phone (~360 px) and a laptop: „Resetuj…” opens the modal, counts appear, ticking „Goście i grupy” ticks and locks the three implied rows, „Zaznacz wszystko” works, Esc and „Anuluj” close it, „Resetuj zaznaczone” resets in one click, the summary is readable, closing reloads the shell with the new numbers; no horizontal scroll.

---

## Phase 5: Docs and final verification

### Overview

Document the feature and run the full verification sequence once, then restore the user's local state.

### Changes Required:

#### 1. Docs

**File**: `CLAUDE.md`, `README.md`

**Intent**: A short „Reset (organizer)” bullet in the CLAUDE.md Data access list (functions, locks, parts, implications, route, island, invariants) and a „Reset danych” section in the README.

#### 2. Final verification (no code)

**Intent**: AI provider to mock in `.dev.vars` and `.env` (only the `AI_PROVIDER` line, BSD `sed -i ''`), empty the DB (REST `DELETE /rest/v1/event?id=gte.0`), full suite/lint/check/build, preview + smoke, the end-to-end reset on `npm run demo` data, then restore: empty DB, `npm run demo`, AI provider back to anthropic, rebuild, preview left running, provider status read without any POST.

### Success Criteria:

#### Automated Verification:

- Full test suite passes with the destructive reset tests running: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- Smoke passes against the preview on an empty DB: `npm run smoke`
- End-to-end reset on demo data over HTTP (subset, then all parts) gives the expected boards and links still open

## Testing Strategy

### Unit Tests:

- `expandResetParts` (closure, order, duplicates), `requiredBy`, `toggleResetPart` (locked rows, untick parent releases implied ones), `selectAllResetParts`.
- Count lines (zero → „nic do usunięcia”, Polish plurals 1/2/5/12/22), result lines (guestLinks with 0 keys, questions removed/added).
- `ResetRequestBody` (strict, empty, unknown id, too many); `ResetEventAnswerSchema` rejects malformed RPC JSON.

### Integration Tests:

- Listed in Phase 2 (destructive cases only on a test-created event).

### Manual Testing Steps:

1. Phase 4 manual row (phone + laptop walkthrough).

## Performance Considerations

One RPC per GET and per POST; the reset deletes at most a few thousand rows and inserts 90 — well within the Worker budget (the work happens in Postgres).

## Migration Notes

Additive migration (two functions). Editing it after `migration up` requires re-applying the function bodies (`create or replace` via psql) — the final verification only deletes rows.

## References

- Change: `context/changes/organizer-reset/change.md`
- Lock patterns: `supabase/migrations/20261027014210_create_seating.sql`, `20261027070000_ai_topics.sql`, `20261027050000_guesses.sql`
- Starter base: `src/lib/questions/seed.ts`, `src/lib/questions/service.ts` (`loadStarterQuestions`)
- Offline memory: `src/components/hooks/offline-cache-store.ts` (`clearOfflineCache`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema and pure rules

#### Automated

- [x] 1.1 Migration applies to the local DB: `npx supabase migration up` — 589aa57
- [x] 1.2 Functions behave on the demo data inside a rolled-back transaction and browser roles lack EXECUTE — 589aa57
- [x] 1.3 Unit tests pass: `npm test` — 589aa57
- [x] 1.4 Lint passes: `npm run lint` — 589aa57
- [x] 1.5 Type check passes: `npx astro check` — 589aa57

### Phase 2: Service and integration tests

#### Automated

- [x] 2.1 Tests pass: `npm test`
- [x] 2.2 Lint passes: `npm run lint`
- [x] 2.3 Type check passes: `npx astro check`

### Phase 3: API route and smoke

#### Automated

- [ ] 3.1 Lint passes: `npm run lint`
- [ ] 3.2 Type check passes: `npx astro check`
- [ ] 3.3 Build succeeds: `npm run build`
- [ ] 3.4 Smoke passes on an empty DB: `npm run smoke` (in the Phase 5 final verification)

### Phase 4: Reset modal on the organizer shell

#### Automated

- [ ] 4.1 Unit tests pass: `npm test`
- [ ] 4.2 Lint passes: `npm run lint`
- [ ] 4.3 Type check passes: `npx astro check`
- [ ] 4.4 Build succeeds: `npm run build`

#### Manual

- [ ] 4.5 Phone and laptop walkthrough of the modal (counts, implied rows, shortcut, Esc, one-click reset, summary, reload, no horizontal scroll)

### Phase 5: Docs and final verification

#### Automated

- [ ] 5.1 Full test suite passes with the destructive reset tests running: `npm test`
- [ ] 5.2 Lint passes: `npm run lint`
- [ ] 5.3 Type check passes: `npx astro check`
- [ ] 5.4 Build succeeds: `npm run build`
- [ ] 5.5 Smoke passes against the preview on an empty DB: `npm run smoke`
- [ ] 5.6 End-to-end reset on demo data over HTTP (subset, then all parts)
