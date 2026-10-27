# Question base with categories, starter questions and a private random draw Implementation Plan

## Overview

Roadmap S-07 (`question-base-and-draw`, PRD US-03, FR-014, FR-015). The organizer keeps a base of conversation questions, each with one category — `kontrowersyjne`, `generyczne` or `refleksyjne` — and can add, edit, delete and bulk-paste them (one per line). A starter base of ~30 Polish questions per category is written by the assistant, inserted when the event is created and re-loadable with „Wczytaj bazę startową”. The organizer and every guest draw a random question from a chosen category or from all; the drawn question is shown only to whoever drew it (answer of one request, nothing stored, no TV, no sync). Guests never see the list.

## Current State Analysis

- Event creation: `createEvent(db)` (`src/lib/event.ts:24-40`) inserts the singleton row and returns `created` / `already-exists`; `POST /api/event` (`src/pages/api/event.ts`) answers 303 to `/o/<key>` — the ONLY moment the organizer link is handed out. Tests create events through `acquireTestEvent` → `createEvent` (`tests/integration/helpers.ts`), and `access.test.ts` races two `createEvent` calls.
- Organizer pattern: `organizerApi(locals)` + `jsonResponse`/`jsonError`/`readJsonBody` (`astro/zod` `strictObject`)/`parseId` (`src/lib/http.ts`); every mutation answers with the whole list (`src/pages/api/o/[key]/guests.ts`); island + hook replacing state with each answer (`useGuestList.ts`, `api-failure.ts`).
- Guest pattern: routes under `src/pages/api/g/[key]/` start with `guestApi(locals)` (`src/lib/guest-api.ts`); guest page `src/pages/g/[key].astro` stacks `<section>`s (seat, guess) and its comment reserves S-07/S-08 sections below; islands read the shared live state with `useGuestState` (`src/components/hooks/useGuestState.ts`, one poll per phone) — state `null` = access gone.
- Text rules to reuse: `normalizeDisplayName` (NFC, drop `\p{Cf}`, collapse whitespace, trim) and the paste list-marker regex (private `LIST_MARKER`) in `src/lib/guests/names.ts`; `pluralPl` in `src/lib/guests/summary.ts`.
- Organizer shell `src/pages/o/[key].astro` keeps one upcoming card „Pytania i tematy AI” („Wkrótce”); the smoke asserts `countOf(shell, "Wkrótce") === 1` (`scripts/smoke.mjs`, S-06 shell check).
- PostgREST: `on_conflict` takes column names only; `max_rows = 1000` (`supabase/config.toml:18`). Verified live during planning on the local DB: a STORED generated column `text_key = lower(text)` with `unique (event_id, text_key)` + supabase-js `upsert(rows, { onConflict: "event_id,text_key", ignoreDuplicates: true }).select()` inserts only new rows and returns exactly those (case variants of Polish text included; DB is `en_US.UTF-8`, `lower('ŻÓŁĆ')` = `żółć`); a plain insert of a duplicate gives `23505`.
- Runtime: Cloudflare Workers ≈ 10 ms CPU per request; ≤ 60 phones.

## Desired End State

- `public.question` holds the event's questions (category, normalized text of 5–300 code points, unique per event case-insensitively across ALL categories). A new event gets the starter base (~90 rows) automatically.
- `/o/<key>/pytania` (organizer): „Losuj pytanie” panel at the top (category chips + big button, the drawn question large), „Dodaj pytania” (category select + textarea, one question per line, summary of what was added/skipped), „Baza startowa” card (missing count + „Wczytaj bazę startową”), and the list filtered by category chips with counts, inline edit (text + category) and delete with confirm. Shell card „Pytania do rozmowy” with a summary; the remaining „Wkrótce” card is „Tematy AI” (S-08).
- `/g/<key>` (guest access on): a „Pytanie do rozmowy” section below „Twój strzał” — chips (Wszystkie / Kontrowersyjne / Generyczne / Refleksyjne), big „Losuj pytanie”, the question in large type with its category, „Losuj kolejne”. The last question, the chosen category and the recently drawn ids survive a reload (localStorage, try/catch). No question is ever in the SSR HTML.
- APIs: organizer `GET|POST /api/o/<key>/questions`, `PATCH|DELETE /api/o/<key>/questions/<id>`, `POST /api/o/<key>/questions/starter`, `POST /api/o/<key>/questions/draw`; guest `POST /api/g/<key>/questions/draw`. Guests and the TV cannot list, add, edit or delete.
- `context/foundation/question-seed.md` is a human-readable copy of the starter base, grouped by category, kept identical to `src/lib/questions/seed.ts` by a unit test.

Verify: `npm test` (unit + integration on the local DB), `npm run lint`, `npx astro check`, `npm run build` green; `npm run smoke` passes against `npm run preview` on a DB without an event (server stopped and `delete from public.event` afterwards).

### Key Discoveries:

- `src/lib/event.ts:33-39` — seeding must hang on the `created` branch only; a failure there must not turn the 303 into a 500 (the organizer key would be lost).
- `src/lib/guests/names.ts:33-38` — normalization and the list-marker regex to reuse (export `LIST_MARKER` instead of copying it).
- `src/pages/g/[key].astro:13-18` — the reserved spot: S-07 and S-08 add `<section>`s below with islands from `src/components/guest/` receiving `apiBase`, reading `useGuestState` (never a second poll).
- `scripts/smoke.mjs` S-06 block ends with page checks before the final „turning guest access off” check; the S-07 checks go between them while guest access is on, using `aniaNewKey`, `olaKey`, `organizerKey`, `tvKey`, `noAccessJson`, `deniedBody`, `countOf`.

## What We're NOT Doing

- Showing a drawn question on the TV or to anyone else, syncing draws between devices, storing draw history on the server (the drawn question exists only in the response and the drawer's own browser).
- Guests adding/suggesting questions or seeing the list (shape-notes: adding only by the organizer).
- Moderating organizer questions (PRD Non-Goal); the content-bounds check applies to the starter seed only (a unit test).
- AI topics, limits and their UI (S-08) — only the shared categories module, the reusable chips and the documented placement.
- Re-adding deleted starter questions automatically (only on „Wczytaj bazę startową”), seeding existing events in a migration, bulk delete, reordering, question history.
- Browser/E2E tests (no Playwright overnight), Supabase Realtime.

## Implementation Approach

Schema, categories, text rules and the starter seed first (all pure, unit-tested, with the md copy and its parity test), then services over `DbClient` (list, paste, edit, delete, idempotent starter load, draw with a pure pick rule) and the best-effort seeding in `createEvent`, then thin routes and the HTTP access matrix, then the guest section on the shared poll, and last the organizer page, the shell card and docs.

## Critical Implementation Details

- **Seeding never costs the organizer link.** `createEvent` seeds only after its own insert succeeded (`created` branch), inside try/catch that logs (`console.error`) and still returns `created`. „Wczytaj bazę startową” is the recovery path. Of two racing creations only the winner seeds.
- **One uniqueness key.** `unique (event_id, text_key)` with `text_key text generated always as (lower(text)) stored` covers the text across categories, so a starter question the organizer moved to another category is never re-added. Every insert (paste and starter load) is one `upsert(…, { onConflict: "event_id,text_key", ignoreDuplicates: true }).select("id, category, text")`; what was added is counted from the RETURNED rows, never from the pre-check.
- **Draw pick rule (pure, `pickQuestion`).** `recent` is ordered oldest → newest. Candidates = questions of the category (or all). Fresh = candidates not in `recent` → uniform random among them. If every candidate was drawn recently, pick at random among the OLDER half of them by their position in `recent` (`ceil(n/2)`, at least 1), so the newest is never repeated immediately unless the category has one question. No candidates → `null`. Randomness is injected (server default: `crypto.getRandomValues`).
- **No secret in browser storage.** The draw panel stores `{ category, recent, last }` under a fixed per-role key (`kolacja-podwyzkowa:pytania:gosc` / `:organizator`), never under a key containing `apiBase`. Storage starts loading only after mount (no hydration mismatch); every access is wrapped in try/catch; `recent` capped at 100 in storage and in the zod body.
- **Seed module has no imports** so `node --experimental-strip-types` can import it to generate `question-seed.md` (Node 22.14). Questions avoid markdown-special characters (`*`, `_`, `<`, backticks) and use gender-neutral Polish where possible (present tense, „Twoim zdaniem”).

## Phase 1: Schema, categories, text rules and the starter base

### Overview

The table, DB/DTO types, the shared categories module (S-08 contract), question text and paste rules, the starter seed with its human-readable copy, and tests proving constraints, content bounds and parity.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261027060000_questions.sql`

**Intent**: Store the event's conversation questions with a category, normalized text and case-insensitive uniqueness that an upsert can target.

**Contract**:

- `create table public.question (id bigint generated always as identity primary key, event_id smallint not null default 1 references public.event (id) on delete cascade, category text not null, text text not null, text_key text generated always as (lower(text)) stored, created_at timestamptz not null default now(), constraint question_category_known check (category in ('kontrowersyjne', 'generyczne', 'refleksyjne')), constraint question_text_format check (char_length(text) between 5 and 300 and text !~ '^[[:space:]]' and text !~ '[[:space:]]$' and text !~ '[[:space:]]{2}' and text !~ '[\t\n\r]'), constraint question_text_unique unique (event_id, text_key))`; index on `(event_id, category)`.
- RLS on, `revoke all … from anon, authenticated`. Header comment: categories shared with S-08, guests/TV never read the table (only a drawn row through the server), starter base inserted by the app (`src/lib/questions/seed.ts`).

#### 2. DB types and DTOs

**File**: `src/db/database.types.ts`, `src/types.ts`

**Intent**: Mirror the schema; define the organizer and draw shapes.

**Contract**:

- `question` table Row (`id, event_id, category: string, text, text_key, created_at`), Insert (`text_key?: never`, `id?: never`), Update, Relationships `question_event_id_fkey` → `event`.
- `src/types.ts`: `QuestionCategory = "kontrowersyjne" | "generyczne" | "refleksyjne"`; `QuestionRow`; `QuestionDto { id; category: QuestionCategory; text }`; `QuestionListDto { questions: QuestionDto[] /* category order, then id */; starterMissing: number }`; `QuestionSkipReason = "duplicate" | "repeated" | "too-short" | "too-long"`; `QuestionSkipDto { line: number; text: string; reason }`; `QuestionPasteResultDto extends QuestionListDto { added: number; skipped: QuestionSkipDto[] }`; `StarterLoadResultDto extends QuestionListDto { added: number }`; `QuestionDrawDto { question: QuestionDto | null }`.

#### 3. Categories module (S-08 contract)

**File**: `src/lib/questions/categories.ts` (+ test)

**Intent**: One place for the stored values and Polish labels, reused by S-08 (AI topics share categories).

**Contract**: `QUESTION_CATEGORIES: readonly QuestionCategory[]` = `["kontrowersyjne", "generyczne", "refleksyjne"]` (display order); `QUESTION_CATEGORY_LABELS` → „Kontrowersyjne”, „Generyczne”, „Refleksyjne”; `QUESTION_CATEGORY_HINTS` (one short line each: „Odważne, dzielą stół na pół.”, „Lekkie, dla każdego.”, „Głębsze, o sobie.”); `isQuestionCategory(value)`; `ALL_CATEGORIES_LABEL = "Wszystkie"`.

#### 4. Text and paste rules

**File**: `src/lib/questions/text.ts` (+ `text.test.ts`), `src/lib/guests/names.ts` (export `LIST_MARKER`)

**Intent**: Normalize and validate question text; parse a paste into questions and skipped lines; describe outcomes in Polish.

**Contract**:

- `MIN_QUESTION_LENGTH = 5`, `MAX_QUESTION_LENGTH = 300` (code points), `MAX_QUESTIONS = 500` (paste limit for the whole base), `MAX_PASTE_CHARS = 100_000`.
- `normalizeQuestionText(raw)` = the display-name normalization; `questionKey(text)` = normalized + `toLocaleLowerCase("pl")`; `validateQuestionText(text)` → `"too-short" | "too-long" | null` (empty counts as too short).
- `parseQuestionPaste(text)` → `{ items: { line; text }[]; skipped: QuestionSkipDto[] }`: split lines, normalize, strip one list marker, skip blank lines silently, too short/long → skipped, a repeat of an earlier line (by key) → `repeated`.
- `describeQuestionProblem(reason)` (single edit: „Pytanie musi mieć co najmniej 5 znaków.” / „Pytanie może mieć najwyżej 300 znaków.”), `describeSkip(skip)` („Linia 3: „…” — już jest w bazie.” / „— powtarza się we wklejce.” / „— za krótkie (min. 5 znaków).” / „— za długie (maks. 300 znaków).”, 50-char preview), `describePasteResult(added, skipped)` („Dodano 12 pytań.” / „Dodano 1 pytanie. Pominięto 2 linie.” / „Nic nie dodano — pominięto 3 linie.”, `pluralPl`).
- Tests: normalization (NBSP, tabs, zero-width, NFC), markers („1. ”, „- ”, „• ”, „12) ”), bounds 4/5/300/301 code points with emoji, blank lines skipped with correct line numbers, repeat detection case-insensitive (Polish letters), plurals.

#### 5. Starter seed and its human-readable copy

**File**: `src/lib/questions/seed.ts` (+ `seed.test.ts`), `context/foundation/question-seed.md`

**Intent**: ~30 good Polish conversation starters per category for a group of friends at the annual raise dinner (work, money as hypotheticals, ambitions, life choices, light philosophy, fun hypotheticals); `kontrowersyjne` spicy and opinion-splitting, `generyczne` easy and fun, `refleksyjne` deeper and personal. Bounds: no party politics (government, taxes, immigration, EU, elections), no religion (also afterlife, fate, karma, astrology), no health (also alcohol, diet/weight, sleep, burnout, therapy, aging/death), no personal jabs (no „kto przy tym stole”, no asking anyone present for their salary).

**Contract**:

- `seed.ts` has NO imports: `export const STARTER_QUESTIONS = { kontrowersyjne: [...], generyczne: [...], refleksyjne: [...] } as const` (30 each, every question ending with „?”, no `*`, `_`, `<`, backticks) + `starterQuestionRows()` → `{ category, text }[]` in category then list order.
- `question-seed.md`: title, a note (source module, the parity test, how to change: edit `seed.ts` and the md together; Open Question 4), then `## Kontrowersyjne (30)` / `## Generyczne (30)` / `## Refleksyjne (30)` with numbered lists. Generated once from the module with `node --experimental-strip-types` (scratch script, not committed).
- `seed.test.ts`: keys equal `QUESTION_CATEGORIES`; 25–35 per category; every question equals its normalization and passes `validateQuestionText`; no duplicates by `questionKey` across all categories; no markdown-special characters; a denylist of word stems/phrases for the content bounds (matched on whole lowercase words / phrases, e.g. `polity…`, `rząd…`, `podat…`, `wybory`, `religi…`, `bóg|boga|bogu`, `karma`, `horoskop`, `zdrow…`, `chor…`, `alkohol`, `diet…`, `śmier…`, `emeryt…`, „przy tym stole”, „ile zarabiasz”) finds nothing; parity: parsing the md loosely (`## <label>` headings, items `^\s*\d+[.)]\s+`) gives exactly the module's lists.

#### 6. Schema integration tests

**File**: `tests/integration/question-schema.test.ts`

**Intent**: Prove the constraints and that browser roles get nothing.

**Contract**: tagged rows only, deleted in `afterEach`. Unknown category and text of 4 / 301 code points, leading space, double space → `23514`; same text in another category with different case → `23505`; `text_key` is the lowercase text; `upsert … ignoreDuplicates` returns only the new row; anon REST cannot select or insert `question`.

### Success Criteria:

#### Automated Verification:

- Migration applies on the local DB: `npx supabase migration up`
- Unit and integration tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

#### Manual Verification:

- The user reviews the starter base in `context/foundation/question-seed.md` (Open Question 4): tone, bounds, no repeats; edits go to `src/lib/questions/seed.ts` and the md together (the test checks they match).

---

## Phase 2: Question services, the draw and seeding at event creation

### Overview

All question reads/writes over `DbClient`, the pure pick rule, the idempotent starter load and the best-effort seed in `createEvent`.

### Changes Required:

#### 1. Pick rule

**File**: `src/lib/questions/draw.ts` (+ `draw.test.ts`)

**Intent**: Choose a question avoiding the drawer's recent ones, deterministic under an injected random.

**Contract**: `pickQuestion<T extends { id: number }>(candidates: readonly T[], recent: readonly number[], random: () => number): T | null` (rule in Critical Implementation Details); `MAX_RECENT = 100`; `pushRecent(recent, id)` → new list with `id` moved to the end, capped at `MAX_RECENT` (oldest dropped). Tests: empty → null; fresh-only pool; all recent → never the newest (n ≥ 2), older half only; n = 1 → that one; ids in `recent` that are not candidates are ignored; random 0 and 0.999… pick the ends; `pushRecent` dedupe/cap.

#### 2. Services

**File**: `src/lib/questions/service.ts`, `src/lib/questions/summary.ts` (+ test), `src/lib/questions/index.ts`

**Intent**: Status unions for expected outcomes, throws on DB errors (Polish messages), like the guest services.

**Contract**:

- `getQuestionList(db)` → `QuestionListDto` (one select `id, category, text`; sorted by `QUESTION_CATEGORIES` order then id; `starterMissing` = starter keys absent from the list keys).
- `addQuestions(db, category, texts: readonly string[], limit = MAX_QUESTIONS)` (texts already parsed/valid; invalid = `TypeError`) → `{ status: "added"; added: QuestionDto[]; duplicates: string[] } | { status: "too-many"; limit; existing }`: reads existing keys, splits duplicates, `existing + new > limit` → too-many (nothing added), upsert-ignore the rest; texts not returned by the upsert are duplicates too (race). `limit` is a parameter only so the integration test can hit the boundary without 500 rows.
- `updateQuestion(db, id, { text?, category? })` → `updated | not-found | duplicate | invalid(reason)` (`23505` → duplicate).
- `deleteQuestion(db, id)` → `deleted | not-found`.
- `loadStarterQuestions(db)` → `{ added: number }` (one upsert-ignore of `starterQuestionRows()`; never limited by `MAX_QUESTIONS`).
- `drawQuestion(db, { category: QuestionCategory | null; recent: readonly number[] }, random = secureRandom)` → `QuestionDto | null` (one select of the category or all, then `pickQuestion`).
- `formatQuestionSummary(list)` → „90 pytań · kontrowersyjne 30 · generyczne 30 · refleksyjne 30” / „Baza pytań jest pusta” (`pluralPl`).
- Messages: `QUESTION_NOT_FOUND_MESSAGE` „Nie znaleziono pytania.”, `QUESTION_DUPLICATE_MESSAGE` „To pytanie już jest w bazie.”, `EMPTY_CATEGORY_MESSAGE` „W tej kategorii nie ma jeszcze pytań.”, `EMPTY_BASE_MESSAGE` „Baza pytań jest pusta.”.

#### 3. Seeding at event creation

**File**: `src/lib/event.ts`

**Intent**: A new event starts with the starter base without risking the one-time redirect.

**Contract**: after a successful insert, `try { await loadStarterQuestions(db) } catch (error) { console.error("Nie udało się wczytać bazy startowej pytań", error) }`, then return `created` as today; `already-exists` path untouched.

#### 4. Integration tests

**File**: `tests/integration/questions.test.ts`, `tests/integration/access.test.ts`, `tests/integration/helpers.ts`

**Intent**: Services against the local DB without touching a real base.

**Contract**: tagged texts only (helper `deleteTestQuestions(db, ids)`), deleted in `afterEach`. Always: paste-add into a category (added rows with that category), duplicates vs the base and case variants reported, too-many with `limit` = current count + 1 and two new texts (nothing added) while exactly one new text at that limit is added, update text/category, duplicate on update, invalid text, not-found update/delete, list order (category then id); draw: category filter; exclusion — `recent` = every id of the category except the own new one → the own one; fallback — own id first (oldest) in a `recent` covering the whole category and `random = () => 0` → the own one. Only when `event.createdByTest` (else `ctx.skip()`): the new event has exactly the starter rows and `starterMissing === 0`; `loadStarterQuestions` → added 0; delete one starter row → `starterMissing === 1`, load → added 1; delete a whole category → draw returns null, load restores it. `access.test.ts` race branch: questions count equals the starter count (only the winner seeded).

### Success Criteria:

#### Automated Verification:

- Unit and integration tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 3: Question API routes and the HTTP access smoke

### Overview

Thin organizer and guest routes over the services, and the question access matrix at HTTP level.

### Changes Required:

#### 1. Organizer routes

**File**: `src/pages/api/o/[key]/questions.ts`, `src/pages/api/o/[key]/questions/[id].ts`, `src/pages/api/o/[key]/questions/starter.ts`, `src/pages/api/o/[key]/questions/draw.ts`

**Intent**: List, paste, edit, delete, starter load and the organizer's own draw.

**Contract**: all start with `organizerApi(locals)`.

- `GET /questions` → `QuestionListDto`.
- `POST /questions` `z.strictObject({ category: z.enum(QUESTION_CATEGORIES), text: z.string().max(MAX_PASTE_CHARS) })` → `parseQuestionPaste`; no items and no skipped → 400 „Wpisz co najmniej jedno pytanie.”; `too-many` → 400 „Baza może mieć najwyżej 500 pytań (jest już N). Nic nie zostało dodane.”; else `QuestionPasteResultDto` (duplicates mapped back to their lines, `skipped` in line order) with 201 when `added > 0`, 200 otherwise.
- `PATCH /questions/<id>` `z.strictObject({ text: z.string().max(2_000).optional(), category: z.enum(...).optional() })` with at least one key → 400 problem message / 409 duplicate / 404 not found (also malformed id); `DELETE /questions/<id>` → 404 unknown; both answer the whole list.
- `POST /questions/starter` (no body) → `StarterLoadResultDto`.
- `POST /questions/draw` `z.strictObject({ category: z.enum(...).nullable(), recent: z.array(z.number().int().positive()).max(MAX_RECENT).optional() })` → `QuestionDrawDto`.

#### 2. Guest route

**File**: `src/pages/api/g/[key]/questions/draw.ts`

**Intent**: The guest's only question endpoint — one drawn question, never the list.

**Contract**: `guestApi(locals)`; same strict body as the organizer draw (any extra key such as `guestId` → 400); 200 `QuestionDrawDto`. No per-guest storage (the guest id is not needed; the route still identifies the caller only by the key).

#### 3. HTTP smoke

**File**: `scripts/smoke.mjs`

**Intent**: Prove CRUD, the starter base, the draw and the access matrix over HTTP.

**Contract**: a new S-07 section after the S-06 page checks and before the final „turning guest access off” check (guest access on):

- organizer `GET /questions` → 200 no-store, ≥ 80 questions, each category ≥ 25, `starterMissing === 0`, items have exactly `id, category, text`;
- `POST /questions/starter` → `added: 0`; delete one starter question → `starterMissing: 1`; starter again → `added: 1`, `starterMissing: 0`;
- paste into `generyczne`: two new tagged lines (one with extra spaces and a „1. ” marker), a case variant of an existing starter question, a repeat of the first line, a 4-char line, a 301-char line, blank lines → 201, `added: 2`, `skipped` reasons `duplicate`, `repeated`, `too-short`, `too-long` with the right line numbers, new rows normalized and in `generyczne`; pasting only blanks → 400; unknown category or extra key → 400;
- `PATCH` text + category → 200 and reflected; `PATCH` to an existing text (other case) → 409; `PATCH { text: "abc" }` → 400; `PATCH {}` → 400; unknown/malformed id → 404; `DELETE` → 200 then 404;
- organizer draw `{ category: "generyczne" }` → question in that category with exactly `id, category, text`; `{ category: null }` → a question; `{ category: "polityczne" }` → 400; `recent` of 101 ids → 400;
- empty category: delete every `refleksyjne` question via the API → draw `refleksyjne` → `{ question: null }`; starter load restores them (`added` = the deleted starter count);
- guest draw (`/api/g/<ania>/questions/draw`): per category and `null` → one question of the right category, exactly the three keys; `{ category: "kontrowersyjne", guestId: … }` → 400; `GET /api/g/<ania>/questions` → 404 without any question text;
- wrong roles → JSON 404: guest and TV keys on `GET|POST /api/o/<k>/questions`, `PATCH|DELETE /api/o/<k>/questions/<id>`, `POST /api/o/<k>/questions/starter`, `POST /api/o/<k>/questions/draw`; organizer and TV keys on `POST /api/g/<k>/questions/draw`;
- at the end (after access is switched off): guest draw → JSON 404.

### Success Criteria:

#### Automated Verification:

- Lint and type check pass: `npm run lint`, `npx astro check`
- Tests pass: `npm test`
- Production build succeeds: `npm run build`
- HTTP smoke passes on a DB without an event: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

---

## Phase 4: Guest question section on the phone

### Overview

A reusable draw panel (category chips + big button + the question), its storage-backed hook, and the guest section on the shared poll.

### Changes Required:

#### 1. Draw memory (pure)

**File**: `src/lib/questions/draw-memory.ts` (+ test)

**Intent**: Read/write what the panel remembers without trusting storage contents.

**Contract**: `DrawMemory { category: QuestionCategory | null; recent: number[]; last: QuestionDto | null }`; `parseDrawMemory(raw: string | null)` → valid memory or the empty default (bad JSON, wrong shapes, unknown category, non-positive ids, > 100 ids → trimmed/ignored); `serializeDrawMemory`. Storage keys `GUEST_DRAW_STORAGE_KEY = "kolacja-podwyzkowa:pytania:gosc"`, `ORGANIZER_DRAW_STORAGE_KEY = "kolacja-podwyzkowa:pytania:organizator"`.

#### 2. Shared components and hook

**File**: `src/components/questions/CategoryChips.tsx`, `src/components/questions/QuestionDrawPanel.tsx`, `src/components/hooks/useQuestionDraw.ts`

**Intent**: One draw UI for guest and organizer; the chips reusable by the organizer filter and by S-08.

**Contract**:

- `CategoryChips { value: QuestionCategory | null; onChange; counts?: { all: number } & Record<QuestionCategory, number>; label: string }` — a group of toggle buttons (`aria-pressed`, ≥ 44 px high, wraps on 360 px), „Wszystkie” first.
- `useQuestionDraw(drawUrl, storageKey)` → `{ category, setCategory, question, message, pending, draw }`: loads memory in an effect after mount (try/catch), saves on every change (try/catch); `draw()` POSTs `{ category, recent }`; 200 with a question → shown + `pushRecent`; 200 `null` → `EMPTY_CATEGORY_MESSAGE` (or `EMPTY_BASE_MESSAGE` for „Wszystkie”); 404 → calls `onNoAccess`; network error → „Brak połączenia — spróbuj ponownie.” and the previous question stays.
- `QuestionDrawPanel { drawUrl; storageKey; onNoAccess? }`: chips, big „Losuj pytanie” / „Losuj kolejne” (≥ 56 px), the question in large type with its category label, `aria-live="polite"`, the message.

#### 3. Guest island and section

**File**: `src/components/guest/GuestQuestionDraw.tsx`, `src/pages/g/[key].astro`

**Intent**: The guest draws a question visible only on their phone.

**Contract**: `GuestQuestionDraw { apiBase; initial }` — `useGuestState` (the shared store, no new poll); state null → renders nothing; otherwise `QuestionDrawPanel` with `${apiBase}/questions/draw`, `GUEST_DRAW_STORAGE_KEY`, `onNoAccess = refresh`. Page: `<section aria-labelledby="question-heading">` with `<h2 id="question-heading">Pytanie do rozmowy</h2>`, a one-line hint („Wylosowane pytanie widzisz tylko Ty.”) and the island, below the guess section; structure comment updated (S-08's AI topic section goes below this one).

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Page-level guardrail.

**Contract**: `/g/<ania>` 200 contains „Pytanie do rozmowy” and `GuestQuestionDraw`, and none of the base's question texts (taken from the organizer list).

### Success Criteria:

#### Automated Verification:

- Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- Build succeeds: `npm run build`
- HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

#### Manual Verification:

- On a real phone (~360 px, iOS Safari / Android Chrome) with guest access on: below „Twój strzał” the „Pytanie do rozmowy” section; tap a category chip and „Losuj pytanie” → a question of that category appears large within ~1 s; „Losuj kolejne” several times → no immediate repeats; „Wszystkie” draws from every category; reload the page → the last question and chosen chip are still there; another phone does not see it; the TV never shows it; switching guest access off hides the section with the rest of the page; still one `/state` request every ~2.5 s.

---

## Phase 5: Organizer questions page, shell card and docs

### Overview

The organizer's base management and own draw on one page, the shell card, and the S-07 contracts in CLAUDE.md.

### Changes Required:

#### 1. Page, island and hook

**File**: `src/pages/o/[key]/pytania.astro`, `src/components/questions/QuestionManager.tsx` (+ `QuestionAddForm.tsx`, `QuestionRow.tsx`, `StarterCard.tsx` in `src/components/questions/`), `src/components/hooks/useQuestionList.ts`

**Intent**: FR-014 management and the organizer's FR-015 draw, phone-first.

**Contract**:

- SSR: organizer re-check, `getQuestionList(db)`, back link to the panel, header text (who sees what: „Gość widzi tylko pytanie, które sam wylosuje. Listę widzisz tylko Ty.”).
- Hook: `send({ method, path, body })` replaces the list with each answer (pattern `useGuestList`; 404 → refetch); returns the parsed answer so the add form can show the paste summary.
- Order: (1) „Losuj pytanie” — `QuestionDrawPanel` with `${apiBase}/questions/draw` and `ORGANIZER_DRAW_STORAGE_KEY` (S-08 adds its AI panel right after it); (2) „Dodaj pytania” — category select (required, no default guess: first category preselected), textarea „jedno pytanie w linii”, „Dodaj”, then the `describePasteResult` summary with `describeSkip` lines; lines skipped as too short/long stay in the textarea for fixing, the rest is cleared; (3) „Baza startowa” — „Brakuje N pytań z bazy startowej.” + „Wczytaj bazę startową” (disabled with „Baza startowa jest kompletna.” when 0), result „Dodano N pytań.”; (4) „Pytania (N)” — `CategoryChips` filter with counts, rows with the text, category badge, „Edytuj” (inline textarea + category select + „Zapisz”/„Anuluj”, client `validateQuestionText`) and „Usuń” (`window.confirm` with a 60-char preview); empty states („Baza jest pusta — wczytaj bazę startową albo wklej pytania.” / „Brak pytań w tej kategorii.”).

#### 2. Shell card

**File**: `src/pages/o/[key].astro`

**Intent**: A real card for questions; the upcoming card narrows to AI topics.

**Contract**: card „Pytania do rozmowy” → `/o/<key>/pytania`, description „Baza pytań w trzech kategoriach, wklejanie wielu naraz i losowanie pytania.”, summary `formatQuestionSummary(await getQuestionList(db))` in the same `Promise.all`; `upcomingSections` = „Tematy AI” („Temat do rozmowy od AI w wybranej kategorii, z limitem na gościa.”), so one „Wkrótce” remains.

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Page checks and the shell card.

**Contract**: `/o/<org>/pytania` 200, no-store, contains a starter question, „Wczytaj bazę startową”, „Losuj pytanie” and `QuestionManager`; TV key and guest key → identical denied body without question texts; shell links `/o/<org>/pytania` with the summary and `countOf(shell, "Wkrótce") === 1`.

#### 4. Docs

**File**: `CLAUDE.md`

**Intent**: Record the S-07 contracts for S-08/S-09.

**Contract**: a „Question base and draw (S-07)” data-access entry: table and uniqueness (`text_key`, upsert-ignore), categories module and stored values, text/paste rules, seed module + md parity test, seeding in `createEvent` (best effort) and the starter action, services, APIs, pick rule and client memory (fixed storage keys, no secrets), guest section placement and where S-08 puts its AI-topic UI (guest: a `<section>` below „Pytanie do rozmowy” with `GuestTopicView` reusing `CategoryChips`; organizer: a panel right after the draw panel on `/o/<key>/pytania`, and the „Tematy AI” shell card replaced). Guest page structure comment updated.

### Success Criteria:

#### Automated Verification:

- Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- Build succeeds: `npm run build`
- HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

#### Manual Verification:

- On a phone (~360 px) and a laptop as the organizer: panel → „Pytania do rozmowy” (`/o/<klucz>/pytania`); draw a question per category and from all; paste 5 questions (one a repeat, one too short) → the summary says what was added and skipped, the too-short line stays in the field; edit a question's text and category; delete one (confirm); delete a starter question, „Wczytaj bazę startową” brings it back; filter chips show the right counts; no horizontal scrolling; the shell card shows the summary.

---

## Testing Strategy

### Unit Tests:

- Text: normalization, markers, code-point bounds, blank-line numbering, case-insensitive Polish repeats, Polish messages and plurals.
- Seed: counts, validity, no duplicates across categories, no markdown-special characters, content-bounds denylist, parity with `question-seed.md`.
- Draw: pick rule (fresh pool, all-recent fallback never repeats the newest, single question, stray recent ids, random ends), `pushRecent`; draw memory parsing of hostile storage.
- Summary strings.

### Integration Tests:

- Schema: category/text checks, uniqueness across categories, generated key, upsert-ignore returns only new rows, anon refusals.
- Services: paste with duplicates, edit/delete/not-found, list order, draw filter, exclusion and fallback against real rows; on a test-created event only: seeding count, idempotent starter load, re-adding a deleted starter question, empty category → null; the `createEvent` race seeds once.

### Manual Testing Steps:

1. Review `context/foundation/question-seed.md` (Open Question 4).
2. Two phones as guests: each draws its own questions; nothing appears on the other phone or the TV.
3. The organizer pastes, edits, deletes and reloads the starter base; guests' next draws reflect the base.

## Performance Considerations

- Draw: middleware lookup + one select of ≤ ~590 short rows (≤ 500 pasted + ≤ 90 starter, under PostgREST `max_rows = 1000`) and an O(n) pick — well within 1 s (NFR-001) and the Worker CPU budget; no polling added.
- Paste/starter load: one read of existing texts + one upsert; the list answer is one more select.

## Migration Notes

- New table only; existing events get no questions from the migration — the organizer uses „Wczytaj bazę startową” (a new event is seeded on creation). Rollback: drop the table.

## References

- PRD: `context/foundation/prd.md` (US-03, FR-014, FR-015, Non-Goals: moderation)
- Shape decisions: `context/foundation/shape-notes.md` (`question flow`, `question base`, `AI topics` content bounds)
- Guest contract: `context/archive/2026-10-27-guest-links-and-seat-view/plan.md`, `context/archive/2026-10-27-guesses-and-ranking/plan.md` (shared poll store)
- Patterns: `src/pages/api/o/[key]/guests.ts`, `src/components/hooks/useGuestList.ts`, `src/components/guest/GuestGuessView.tsx`, `src/lib/guests/names.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, categories, text rules and the starter base

#### Automated

- [x] 1.1 Migration applies on the local DB: `npx supabase migration up` — 23eec38
- [x] 1.2 Unit and integration tests pass: `npm test` — 23eec38
- [x] 1.3 Lint passes: `npm run lint` — 23eec38
- [x] 1.4 Type check passes: `npx astro check` — 23eec38

#### Manual

- [ ] 1.5 The user reviews the starter base in `context/foundation/question-seed.md` (Open Question 4)

### Phase 2: Question services, the draw and seeding at event creation

#### Automated

- [x] 2.1 Unit and integration tests pass: `npm test`
- [x] 2.2 Lint passes: `npm run lint`
- [x] 2.3 Type check passes: `npx astro check`

### Phase 3: Question API routes and the HTTP access smoke

#### Automated

- [ ] 3.1 Lint and type check pass: `npm run lint`, `npx astro check`
- [ ] 3.2 Tests pass: `npm test`
- [ ] 3.3 Production build succeeds: `npm run build`
- [ ] 3.4 HTTP smoke passes on a DB without an event: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

### Phase 4: Guest question section on the phone

#### Automated

- [ ] 4.1 Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- [ ] 4.2 Build succeeds: `npm run build`
- [ ] 4.3 HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

#### Manual

- [ ] 4.4 On a real phone: draw per category and from all, no immediate repeats, reload keeps the last question, private to the phone, access off hides it, one `/state` poll

### Phase 5: Organizer questions page, shell card and docs

#### Automated

- [ ] 5.1 Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- [ ] 5.2 Build succeeds: `npm run build`
- [ ] 5.3 HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

#### Manual

- [ ] 5.4 On a phone and a laptop as the organizer: draw, paste with summary, edit, delete, starter reload, filter counts, shell card summary
