# AI conversation topics per category with per-guest and per-evening limits Implementation Plan

## Overview

Roadmap S-08 (`ai-topics-with-limits`, PRD US-03, FR-016, NFR-005, NFR-010). The organizer and every guest generate a conversation topic from an AI in a chosen category (`kontrowersyjne` / `generyczne` / `refleksyjne`, or „Wszystkie” = a random one); the topic is shown only to whoever generated it. A guest may generate at most 5 topics per evening, everyone together at most 300 (the organizer counts toward the 300 but has no personal limit). A topic appears within 10 s; a failed attempt (timeout, provider error, refused/empty/off-limits output) shows a Polish message pointing at „Losuj pytanie” and does not consume the limit. The AI sits behind an `AiTopicProvider` interface: a mock (default, the only one used overnight — zero paid calls) and Claude Haiku via the Anthropic Messages API (plain `fetch`), chosen by server-only env vars.

## Current State Analysis

- Guest pattern: routes under `src/pages/api/g/[key]/` start with `guestApi(locals)` (`src/lib/guest-api.ts`), the guest is `api.access.guest.id`; strict zod bodies via `readJsonBody` (`src/lib/http.ts`). Guest page `src/pages/g/[key].astro` stacks `<section>`s; its comment reserves S-08's section below „Pytanie do rozmowy”. Islands read the shared live state with `useGuestState` (one poll per phone, `src/components/hooks/guest-state-store.ts`) — state `null` = access gone.
- S-07 left the S-08 contract: categories in `src/lib/questions/categories.ts` (`QUESTION_CATEGORIES`, labels, hints, `isQuestionCategory`), zod `QuestionCategorySchema` in `src/lib/questions/api.ts`, the picker `src/components/questions/CategoryChips.tsx` (null = „Wszystkie”, `disabled` prop), the draw UI `QuestionDrawPanel.tsx` + `useQuestionDraw.ts`, localStorage memory through `src/components/hooks/draw-memory-store.ts` (bound to `DrawMemory`), the organizer page `src/pages/o/[key]/pytania.astro` → `QuestionManager.tsx` („S-08 puts its AI topic panel right after” the draw panel), and the shell card `upcomingSections` = „Tematy AI” („Wkrótce”) in `src/pages/o/[key].astro`.
- Content bounds already exist as a word/phrase denylist, but only inside `src/lib/questions/seed.test.ts` (`DENIED_WORD_PREFIXES`, `DENIED_WORDS`, `DENIED_PHRASES`, `deniedIn`).
- Env: `astro.config.mjs` schema has only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server, secret, optional); `src/lib/db.ts` is the only reader of `astro:env/server`. `src/lib/config-status.ts` → `missingConfigs` is rendered as a banner by `Layout.astro` on EVERY page (guest and TV too). `scripts/local-env.mjs` rewrites only the `SUPABASE_*` lines of `.env` / `.dev.vars` and keeps the rest. `vitest.config.ts` loads `.env` into `process.env`.
- DB patterns: functions with `set search_path = ''`, `revoke execute … from public, anon, authenticated`, errors raised as `P0001` messages mapped by the app (`save_guest_guess`, `seat_guest`); seating serializes with `pg_advisory_xact_lock(3003)`. Every table: RLS on, `revoke all … from anon, authenticated`. `src/db/database.types.ts` is hand-written.
- Smoke `scripts/smoke.mjs`: S-07 section ends with the shell check (`countOf(shell, "Wkrótce") === 1`, also asserted at the S-05 and S-06 shell checks, lines ~1233 and ~1626), the wrong-role matrix and „turning guest access off”; keys `aniaNewKey`, `olaKey`, `organizerKey`, `tvKey`, helpers `request`, `check`, `noAccessJson`, `deniedBody`, `countOf`, `guestStateApi`.
- Claude API (from the `claude-api` skill): small fast model `claude-haiku-5-5`; raw HTTP `POST https://api.anthropic.com/v1/messages` with `x-api-key`, `anthropic-version: 2026-10-21`, `content-type: application/json`; on that version any `temperature`/`top_p`/`top_k` is a 400; Haiku 5.5 thinks by default and thinking counts toward `max_tokens` — `thinking: {type: "disabled"}` is accepted at effort ≤ high; answer = the `type === "text"` blocks (never by position); `stop_reason` `end_turn` | `max_tokens` | `refusal` | …; errors `{ type: "error", error: { type, message } }` with 400/401/403/404/413/429/500/529.
- Runtime: Cloudflare Workers ≈ 10 ms CPU per request (waiting on `fetch` is not CPU), ≤ 60 phones.

## Desired End State

- `public.ai_topic` holds one row per generation attempt (`pending` → `succeeded` | `failed`, who asked, category, timestamps — never the topic text). DB function `reserve_ai_topic` admits an attempt atomically against the per-guest (5) and per-evening (300) limits counting `succeeded` + live `pending` rows; stale pending rows (> 60 s) expire to `failed`; one live attempt per guest at a time.
- Guest `/g/<key>` (access on): a „Temat od AI” section below „Pytanie do rozmowy” — chips, „Wygeneruj temat z AI”, the topic large with its category, „Zostało X z 5”; clear Polish messages for the own limit, the exhausted evening pool and a failed attempt (which says the limit was not reduced and points at „Losuj pytanie”). The last topic and chosen chip survive a reload (localStorage). No topic in SSR HTML, nothing on the TV.
- Organizer `/o/<key>/pytania`: an AI panel (`#tematy-ai`) right after „Losuj pytanie” — the same generator without a personal limit, the evening usage („Wykorzystano X z 300 · nieudane: N”) and the active provider (atrapa / Claude + model / misconfiguration hint). The shell card „Tematy AI” links there with a summary; no „Wkrótce” card is left.
- APIs: guest `POST /api/g/<key>/ai-topics`; organizer `GET|POST /api/o/<key>/ai-topics`. The TV has no AI route.
- Env: `AI_PROVIDER` (`mock` default | `anthropic`), `ANTHROPIC_API_KEY` (secret, optional), `AI_MODEL` (optional, default `claude-haiku-5-5`) in the env schema, `.env.example` and README. With `AI_PROVIDER=anthropic` and no key every attempt fails fast (no DB row, no network) and the organizer panel says why.
- Tests never reach the Anthropic API: the adapter takes an injected `fetch`, and a Vitest setup file throws on any request to `api.anthropic.com`. The smoke runs its generate checks only when the server reports the mock provider.

Verify: `npm test` (unit + integration on the local DB), `npm run lint`, `npx astro check`, `npm run build` green; `npm run smoke` passes against `npm run preview` on a DB without an event (then stop the server and `delete from public.event`).

### Key Discoveries:

- `src/lib/questions/seed.test.ts:13-100` — the content-bounds denylist to promote into a shared pure module (runtime check of AI output + the seed test).
- `src/components/hooks/draw-memory-store.ts` — the localStorage store to generalize (`createLocalStore(parse, serialize)`) so the topic memory reuses it.
- `src/layouts/Layout.astro:23-27` — `missingConfigs` banners show on guest/TV pages: AI configuration must NOT go into `config-status.ts`.
- `scripts/smoke.mjs` ~1233, ~1626, ~1931 — three `countOf(…, "Wkrótce") === 1` assertions become `=== 0`.
- `scripts/local-env.mjs:52-61` — `upsertEnvFile` keeps unrelated lines, so AI vars the user adds survive `npm run env:local`.

## What We're NOT Doing

- Storing topic texts on the server, topic history, sharing topics with other people or the TV, syncing between devices.
- Adding the quota to the live state poll (`GuestStateDto` / version token) — the count comes from SSR and every generate answer.
- Language detection of the output, streaming, retries inside one attempt, prompt caching, server-side refusal fallbacks (Haiku has none), per-guest topic de-duplication.
- Configurable limits in the UI, resetting the counters, deleting attempts.
- The Anthropic SDK (`@anthropic-ai/sdk`) — plain `fetch` is enough for one request shape (no new dependency).
- Any real call to the Anthropic API (dev, tests, smoke, overnight) — the user adds the key and spend limit (PRD Open Question 5).
- Browser/E2E tests (no Playwright overnight).

## Implementation Approach

Schema, the reservation function and the pure domain first (limits and messages, prompt, sanitizing, shared content bounds, mock catalog), proven by unit tests and an integration test that fires parallel reservations. Then providers (mock, Anthropic adapter on an injected `fetch`, a pure config parser + factory, one `astro:env` reader) and the service that reserves → calls the provider under a 9 s abort → marks the row. Then thin routes and the HTTP matrix (mock-only failure seam via a header). Then the guest section on the shared poll and a generalized localStorage store, and last the organizer panel, shell card and docs.

## Critical Implementation Details

- **Order of a generation.** Provider not ready (unknown `AI_PROVIDER`, `anthropic` without key) → fail before touching the DB. Otherwise `reserve_ai_topic` (pending row) → provider call with an `AbortController` aborting at `AI_PROVIDER_TIMEOUT_MS` = 9000 → sanitize + content check → mark the row `succeeded` and only THEN return the topic; any failure → mark `failed` (best effort; if that update throws, the row expires) and answer the failure. If the `succeeded` update throws, answer 500 without the topic — the pending row expires and nothing is consumed.
- **Stale pending rows.** A Worker can be cut off mid-call (client disconnect, eviction, deploy). Pending rows older than 60 s never count: `reserve_ai_topic` first updates them to `failed`; read-side counts treat them as failed too. 60 s is far above the 9 s abort plus DB time.
- **Workers `fetch` binding.** In Cloudflare Workers calling a stored `fetch` as a method (`deps.fetch(…)` where `deps.fetch = globalThis.fetch`) throws „Illegal invocation”; the adapter's default must be a wrapper `(input, init) => fetch(input, init)`.
- **Zero paid calls.** The adapter never reads `process.env`; tests inject `fetch` stubs; `tests/setup/no-ai-network.ts` (Vitest `setupFiles`) wraps `globalThis.fetch` to throw for host `api.anthropic.com`; the smoke reads the provider from the organizer status and runs generate checks only for `mock`. The literal API-key prefix of Anthropic keys is never written anywhere (fixtures use `test-key-not-real`).
- **`AI_PROVIDER` parsing.** Read as an optional string (not `envField.enum`, whose invalid value would throw on read and 500 the guest page) and parsed by a pure function; an unknown value is a misconfigured provider with an organizer hint.

## Phase 1: Schema, reservation function and the pure topic domain

### Overview

The attempt table, the atomic reservation and usage functions, DB types and DTOs, limit constants and Polish messages, the prompt, output sanitizing, the shared content-bounds module, and the mock topic catalog — with unit and integration tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261027070000_ai_topics.sql`

**Intent**: Record generation attempts and admit them atomically against the per-guest and per-evening limits.

**Contract**:

- `create table public.ai_topic (id bigint generated always as identity primary key, event_id smallint not null default 1 references public.event (id) on delete cascade, requester text not null, guest_id bigint references public.guest (id) on delete set null, category text not null, status text not null default 'pending', created_at timestamptz not null default now(), finished_at timestamptz)`; checks: `requester in ('guest', 'organizer')`, `requester = 'guest' or guest_id is null`, `category in ('kontrowersyjne', 'generyczne', 'refleksyjne')`, `status in ('pending', 'succeeded', 'failed')`. Indexes `(event_id, status)`, `(guest_id, status)`. A deleted guest's attempts stay counted in the evening total (`set null`). No topic text column.
- `reserve_ai_topic(p_event_id smallint, p_guest_id bigint, p_category text, p_guest_limit integer, p_event_limit integer) returns bigint` (`p_guest_id` null = organizer): `pg_advisory_xact_lock(3008)`; event missing → `EVENT_NOT_FOUND`; guest given but not in that event → `GUEST_NOT_FOUND`; expire `pending` rows older than 60 s to `failed` (`finished_at = now()`); for a guest: a live pending row → `GUEST_BUSY`, `succeeded + pending ≥ p_guest_limit` → `GUEST_LIMIT`; event `succeeded + pending ≥ p_event_limit` → `EVENT_LIMIT`; insert the pending row, return its id. Errors `P0001` with these messages.
- `ai_topic_usage(p_event_id smallint, p_guest_id bigint default null) returns table (event_used integer, event_failed integer, guest_used integer, guest_busy boolean)` — read-only, `stable`; used = `succeeded` + `pending` younger than 60 s; failed = `failed` + older pending; guest columns 0/false when `p_guest_id` is null.
- RLS on, `revoke all on table … from anon, authenticated`; both functions `set search_path = ''`, `revoke execute … from public, anon, authenticated`, `grant execute … to service_role`. Header comment: limits come from the app (`src/lib/ai-topics/limits.ts`), only attempts are stored (never the text), lock id 3008.

#### 2. DB types and DTOs

**File**: `src/db/database.types.ts`, `src/types.ts`

**Intent**: Mirror the schema; define the AI answers.

**Contract**:

- `ai_topic` Row/Insert/Update/Relationships (`ai_topic_event_id_fkey`, `ai_topic_guest_id_fkey`); Functions `reserve_ai_topic` (Args as above, `p_guest_id: number | null`, Returns `number`) and `ai_topic_usage` (Returns `{ event_used; event_failed; guest_used; guest_busy }[]`).
- `src/types.ts`: `AiTopicDto { category: QuestionCategory; text: string }`; `GuestAiQuotaDto { limit: number; used: number; remaining: number; eventExhausted: boolean }`; `AiTopicUsageDto { used: number; limit: number; failed: number; guestLimit: number }`; `AiProviderKind = "mock" | "anthropic"`; `AiProviderStatusDto { kind: AiProviderKind | null; model: string | null; ready: boolean; problem: string | null }`; `AiTopicBoardDto { usage: AiTopicUsageDto; provider: AiProviderStatusDto }`; answers `GuestAiTopicAnswerDto { topic: AiTopicDto; quota: GuestAiQuotaDto }`, `OrganizerAiTopicAnswerDto { topic: AiTopicDto; usage: AiTopicUsageDto }`; error bodies carry `{ error, quota }` (guest) / `{ error, hint?, usage }` (organizer).

#### 3. Limits and messages

**File**: `src/lib/ai-topics/limits.ts` (+ test)

**Intent**: One place for the numbers and the Polish texts both sides show.

**Contract**: `MAX_GUEST_TOPICS = 5`, `MAX_EVENT_TOPICS = 300`, `AI_PROVIDER_TIMEOUT_MS = 9000`, `AI_CLIENT_TIMEOUT_MS = 13000`, `STALE_PENDING_SECONDS = 60` (documents the SQL constant); `toGuestQuota(usageRow)` / `toUsage(usageRow)`; messages: `GUEST_LIMIT_MESSAGE` („Wykorzystano już wszystkie tematy AI na ten wieczór (5 z 5). Losuj pytania z bazy powyżej.”), `EVENT_LIMIT_MESSAGE` („Tematy AI na ten wieczór się skończyły (300 z 300). Losuj pytania z bazy powyżej.”), `BUSY_MESSAGE` („Poprzedni temat jeszcze się generuje — chwilę.”), `FAILED_MESSAGE` („Nie udało się wygenerować tematu — ta próba nie zmniejszyła limitu. Spróbuj ponownie albo użyj „Losuj pytanie” powyżej.”), `formatRemaining(quota)` („Zostało 3 z 5”), `formatUsage(usage)` („Wykorzystano 12 z 300 · nieudane: 2”), `formatAiTopicSummary(usage, provider)` (shell card: „Tematy AI: 12 z 300 · atrapa AI” / „· Claude (claude-haiku-5-5)” / „· brak klucza API”).

#### 4. Shared content bounds

**File**: `src/lib/questions/bounds.ts` (+ `bounds.test.ts`), `src/lib/questions/seed.test.ts`

**Intent**: The seed's denylist becomes a pure module used by the seed test and as the runtime safety net on AI output.

**Contract**: move `DENIED_WORD_PREFIXES`, `DENIED_WORDS`, `DENIED_PHRASES` and `deniedIn(text): string[]` unchanged; `seed.test.ts` imports `deniedIn` (its assertions unchanged); `bounds.test.ts` takes over the „catches what it should and spares lookalikes” cases.

#### 5. Prompt and sanitizing

**File**: `src/lib/ai-topics/prompt.ts`, `src/lib/ai-topics/sanitize.ts` (+ tests)

**Intent**: A Polish prompt that keeps the category and the content bounds; turn raw model text into one clean topic or nothing.

**Contract**:

- `TOPIC_THEMES` (~20 neutral Polish inspirations: praca i kariera, pieniądze hipotetycznie, podróże, jedzenie, technologia, wspomnienia z dzieciństwa, filmy i seriale, muzyka, sport i hobby, mieszkanie i miasto, przyjaźń, nawyki, przyszłość za 10 lat, nauka i ciekawostki, zwierzęta, pierwsza praca, wymarzony dzień, …; none touching politics, religion or health); `pickCategory(random)`, `pickTheme(random)`.
- `AI_TOPIC_SYSTEM_PROMPT` (Polish): host of the annual „kolacja podwyżkowa” for a group of friends; write ONE conversation topic as a question, 1–2 sentences, at most ~200 characters, in Polish; stick to the category; bold but no party politics, religion, health (incl. alcohol, diet, death), no personal jabs, no references to specific people at the table, never ask anyone about their own salary; answer with the question only — no quotes, preface, labels or formatting. `buildTopicPrompt({ category, theme })` → the user message: the category label + its description (kontrowersyjne = odważny, dzieli stół na pół; generyczne = lekki, zabawny, dla każdego; refleksyjne = głębszy, skłania do refleksji) + „Inspiracja: <theme>”. No guest names or other guest data ever go into the prompt.
- `MIN_TOPIC_LENGTH = 5`, `MAX_TOPIC_LENGTH = 300` (code points); `sanitizeTopic(raw: string): string | null`: drop code fences, markdown emphasis/heading/list markers and a leading label („Temat:”, „Pytanie:”, „Temat do rozmowy:”), join lines, strip wrapping quotes („ ” " ' « » “ ”), normalize like question text (`normalizeQuestionText`); longer than the cap → cut at the last sentence end within it, else at the last space + „…”; shorter than the minimum → null.
- Tests: quotes/markdown/labels/multi-line answers, Polish letters and emoji kept, cap at sentence end and at a word, empty/whitespace → null, the prompt mentions every bound and the category description, no `{` placeholders left.

#### 6. Mock topic catalog

**File**: `src/lib/ai-topics/mock-topics.ts` (+ test)

**Intent**: Plausible Polish topics per category for the mock provider.

**Contract**: `MOCK_TOPICS: Readonly<Record<QuestionCategory, readonly string[]>>` (~12 each, questions ending with „?”, gender-neutral where possible). Test: every entry passes `sanitizeTopic` unchanged and `deniedIn` finds nothing; no duplicates (by `questionKey`) and none equal to a starter question.

#### 7. Integration tests

**File**: `tests/integration/ai-topic-schema.test.ts`

**Intent**: Prove the constraints, the atomic admission and that browser roles get nothing.

**Contract**: rows created by the test only (ids collected, deleted in `afterEach`), test guests created with `testTag()` names and deleted afterwards; limits passed relative to the current usage (`event_used + k`) so real rows never break the test. Cases: check violations (unknown category/status/requester, organizer row with a guest id) → `23514`; guest limit — k reserved+succeeded, the next → `GUEST_LIMIT`; failed rows do not count; a live pending → `GUEST_BUSY`; a pending row inserted with `created_at = now() - 2 minutes` expires to `failed` and neither counts nor blocks; event limit for organizer and guests → `EVENT_LIMIT`; unknown guest → `GUEST_NOT_FOUND`; concurrency — 8 parallel organizer reservations with `p_event_limit = used + 3` → exactly 3 ids, 8 parallel reservations of 8 different guests with the same limit → exactly 3, 8 parallel reservations of ONE guest → exactly 1 (`GUEST_BUSY` for the rest); `ai_topic_usage` counts match; anon REST cannot select/insert `ai_topic` nor call either function.

### Success Criteria:

#### Automated Verification:

- Migration applies on the local DB: `npx supabase migration up`
- Unit and integration tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 2: Providers, configuration and the generation service

### Overview

The provider interface with the mock and the Anthropic adapter, the pure config parser and factory, the single env reader, the service that runs one generation, and the test-wide network guard.

### Changes Required:

#### 1. Provider interface and failures

**File**: `src/lib/ai-topics/provider.ts` (+ test)

**Intent**: One contract for every provider, with failure kinds the service and the organizer hint understand.

**Contract**: `AiTopicRequest { category: QuestionCategory; theme: string }`; `AiTopicProvider { readonly kind: AiProviderKind; readonly model: string | null; generate(request, options: { signal: AbortSignal; simulateFailure?: boolean }): Promise<string> }` (raw text; rejects with `AiProviderError`); `AiFailureKind = "not-configured" | "timeout" | "network" | "auth" | "bad-request" | "rate-limit" | "overloaded" | "unavailable" | "refusal" | "truncated" | "empty" | "off-limits"`; `class AiProviderError extends Error { kind; status?: number }`; `describeFailureForOrganizer(kind, status?)` → Polish hint (e.g. „Przekroczono czas 9 s.”, „Klucz API odrzucony (HTTP 401) — sprawdź ANTHROPIC_API_KEY.”, „Model niedostępny lub złe parametry (HTTP 404) — sprawdź AI_MODEL.”, „Limit zapytań u dostawcy (HTTP 429).”, „Dostawca przeciążony (HTTP 529).”, „AI odmówiło odpowiedzi.”, „Temat wykraczał poza granice treści — odrzucony.”, „Brak ANTHROPIC_API_KEY — dodaj klucz albo ustaw AI_PROVIDER=mock.”). Hints never contain the key.

#### 2. Mock provider

**File**: `src/lib/ai-topics/mock-provider.ts` (+ test)

**Intent**: The default provider: a random catalog topic after a short delay, abortable, with a failure switch for tests and the smoke.

**Contract**: `createMockProvider({ delayMs?: () => number /* default 400–1200 ms */, random?: () => number, fail?: boolean })` → `kind: "mock"`, `model: null`; waits the delay (rejects `timeout` as soon as the signal aborts), then `fail` or `options.simulateFailure` → `AiProviderError("unavailable")`, else a random `MOCK_TOPICS[category]` entry. `mockFailureRequested(provider, headers)` → true only when `provider.kind === "mock"` and header `x-ai-mock: fail` is present (the smoke's seam; ignored for any real provider). Tests use `delayMs: () => 0` and fake timers for the abort.

#### 3. Anthropic adapter

**File**: `src/lib/ai-topics/anthropic-provider.ts` (+ test)

**Intent**: Claude Haiku over the Messages API with plain `fetch`, mapped to the failure kinds.

**Contract**: `createAnthropicProvider({ apiKey, model, fetch?: (input: string, init: RequestInit) => Promise<Response> })` → `kind: "anthropic"`, `model`. Request: `POST https://api.anthropic.com/v1/messages`, headers `content-type: application/json`, `x-api-key: <apiKey>`, `anthropic-version: 2026-10-21`; body `{ model, max_tokens: 400, thinking: { type: "disabled" }, output_config: { effort: "low" }, system: AI_TOPIC_SYSTEM_PROMPT, messages: [{ role: "user", content: buildTopicPrompt(request) }] }` — never `temperature`/`top_p`/`top_k`; `signal` passed through; `simulateFailure` ignored. Response: text = the `type === "text"` blocks joined; `stop_reason` `refusal` → `refusal`, `max_tokens` → `truncated`, other than `end_turn`/`stop_sequence` → `unavailable`, no text → `empty`. HTTP: 401/403 → `auth`, 400/404/413 → `bad-request`, 429 → `rate-limit`, 529 → `overloaded`, other ≥ 500 → `unavailable` (status kept); aborted → `timeout`; other fetch rejection → `network`; unparsable body → `unavailable`. Tests (stubbed `fetch` only): exact URL, method, headers, body keys (no sampling params, model override honoured), thinking block before text, every status mapping, abort after the deadline (fake timers) → `timeout`, refusal/max_tokens/empty, `simulateFailure` still calls `fetch` (not honoured).

#### 4. Configuration, factory and env reader

**File**: `src/lib/ai-topics/config.ts` (+ test), `src/lib/ai.ts`, `astro.config.mjs`

**Intent**: Choose the provider from server-only env vars in one place, testable without `astro:*`.

**Contract**:

- `astro.config.mjs` env schema: `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `AI_MODEL` — all `envField.string({ context: "server", access: "secret", optional: true })`, with comments (mock default; the key is a secret that never reaches the browser; model default).
- `DEFAULT_AI_MODEL = "claude-haiku-5-5"`; `parseAiConfig({ provider?, apiKey?, model? })` → `{ kind: "mock" } | { kind: "anthropic"; apiKey: string | null; model: string } | { kind: "invalid"; value: string }` (trimmed, case-insensitive, empty = default); `aiProviderStatus(config)` → `AiProviderStatusDto` (`problem`: „Brak ANTHROPIC_API_KEY …” / „Nieznana wartość AI_PROVIDER: „…” — dozwolone: mock, anthropic.”); `createAiProvider(config, deps?)` → mock / Anthropic / an unavailable provider whose `generate` rejects `not-configured` without network.
- `src/lib/ai.ts` (the only `astro:env` reader for AI, like `db.ts`): `getAiConfig()`, `getAiProvider()`, `getAiProviderStatus()`. Nothing is added to `config-status.ts`.

#### 5. Generation service

**File**: `src/lib/ai-topics/service.ts`, `src/lib/ai-topics/index.ts`

**Intent**: One generation end to end over `DbClient` and a provider, with status unions; usage and quota reads.

**Contract**:

- `generateTopic(db, provider, { guestId: number | null; category: QuestionCategory | null }, options?: { random?; timeoutMs?; simulateFailure?; guestLimit?; eventLimit? })` → `{ status: "generated"; topic: AiTopicDto } | { status: "guest-limit" } | { status: "event-limit" } | { status: "busy" } | { status: "not-found" } | { status: "failed"; kind: AiFailureKind; httpStatus?: number }`. Flow and failure semantics as in Critical Implementation Details; category null → `pickCategory`; theme → `pickTheme`; output → `sanitizeTopic` (null → `empty`) → `deniedIn` (hit → `off-limits`). Limits default to `MAX_GUEST_TOPICS` / `MAX_EVENT_TOPICS` (parameters only so tests can hit the boundary). Function errors map by message (`GUEST_LIMIT`, `EVENT_LIMIT`, `GUEST_BUSY`, `GUEST_NOT_FOUND`); other DB errors throw.
- `getAiTopicUsage(db)` → `AiTopicUsageDto`; `getGuestAiQuota(db, guestId)` → `GuestAiQuotaDto` (one `ai_topic_usage` call each).

#### 6. Network guard for tests

**File**: `tests/setup/no-ai-network.ts`, `vitest.config.ts` (+ `src/lib/ai-topics/no-ai-network.test.ts`)

**Intent**: Make a paid call impossible from the test suite even if a key sits in `.env`.

**Contract**: `setupFiles` entry that wraps `globalThis.fetch`: a request whose URL host is `api.anthropic.com` rejects with an error naming the guard; everything else passes through (Supabase on 127.0.0.1). A test proves the rejection.

#### 7. Integration tests

**File**: `tests/integration/ai-topics.test.ts`

**Intent**: The service against the local DB with the mock and failing/slow fakes.

**Contract**: tagged test guests, rows deleted afterwards. Mock success → `generated`, a `succeeded` row, quota `used + 1`; mock failure (`fail: true`) and `simulateFailure` → `failed`, a `failed` row, quota unchanged; a fake provider returning off-limits text / empty text → `off-limits` / `empty`, not counted; a provider that never resolves with `timeoutMs: 50` → `timeout`, not counted; not-configured provider → `failed` and NO row; guest at limit (small `guestLimit`) → `guest-limit`; organizer beyond the guest limit → still `generated`; event limit (`used + 1`) → `event-limit`; deleted guest → `not-found`; `getAiTopicUsage` and `getGuestAiQuota` reflect all of it.

### Success Criteria:

#### Automated Verification:

- Env schema regenerated: `npx astro sync`
- Unit and integration tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 3: AI topic API routes and the HTTP smoke

### Overview

Thin guest and organizer routes over the service, and the S-08 access and limit matrix at HTTP level on the mock.

### Changes Required:

#### 1. Request body

**File**: `src/lib/ai-topics/api.ts` (+ test)

**Intent**: The shared strict body.

**Contract**: `GenerateTopicBody = z.strictObject({ category: QuestionCategorySchema.nullable() })` (any extra key, e.g. `guestId`, → 400).

#### 2. Guest route

**File**: `src/pages/api/g/[key]/ai-topics.ts`

**Intent**: The guest generates a topic for themself; the answer always carries the fresh quota.

**Contract**: `POST` only; `guestApi(locals)`; `generateTopic(api.db, getAiProvider(), { guestId: api.access.guest.id, category }, { simulateFailure: mockFailureRequested(provider, request.headers) })`; then `getGuestAiQuota`. 200 `{ topic, quota }`; 429 `{ error: GUEST_LIMIT_MESSAGE | EVENT_LIMIT_MESSAGE, quota }`; 409 `{ error: BUSY_MESSAGE, quota }`; 503 `{ error: FAILED_MESSAGE, quota }` (no hint, no provider details); `not-found` → 404 `Brak dostępu`.

#### 3. Organizer route

**File**: `src/pages/api/o/[key]/ai-topics.ts`

**Intent**: Usage + provider status, and the organizer's own generation without a personal limit.

**Contract**: `organizerApi(locals)`. `GET` → `AiTopicBoardDto`. `POST` body as above, `guestId: null` → 200 `{ topic, usage }`; 429 `{ error: EVENT_LIMIT_MESSAGE, usage }`; 503 `{ error: FAILED_MESSAGE, hint: describeFailureForOrganizer(kind, httpStatus), usage }`.

#### 4. HTTP smoke

**File**: `scripts/smoke.mjs`

**Intent**: Prove the limits, the failure rule and the access matrix over HTTP without any paid call.

**Contract**: a new section „20. AI topics (S-08)” after the S-07 wrong-role checks and before „turning guest access off” (guest access on):

- organizer `GET /api/o/<org>/ai-topics` → 200, no-store, `usage { used: 0, limit: 300, failed: 0, guestLimit: 5 }`, `provider.kind`; if `provider.kind !== "mock"` → one FAIL („smoke needs AI_PROVIDER=mock”) and every generate check below is skipped (no paid calls);
- guest (Ania) `POST /api/g/<ania>/ai-topics` per category and `null` → 200, `topic` with exactly `category`, `text` (non-empty, the asked category), `quota.remaining` going 4, 3 …; extra key (`guestId`) → 400; unknown category → 400; `GET` → 404/405 without topic data;
- a failed attempt: `x-ai-mock: fail` → 503 with „nie zmniejszyła limitu” and „Losuj pytanie” in `error`, `quota` unchanged, no `hint`;
- Ania's remaining attempts until `remaining: 0`, then the 6th → 429 with „5 z 5”, and a failing attempt at the limit is also 429 (limit before provider);
- Ola still has 5 → one topic → `remaining: 4`;
- organizer `POST` 6 times → all 200 (`usage.used` grows past 5); organizer `x-ai-mock: fail` → 503 with a `hint`;
- organizer `GET` → `used` = Ania 5 + Ola 1 + organizer 6, `failed` = 2;
- wrong roles → JSON 404: TV and guest keys on `GET|POST /api/o/<k>/ai-topics`; organizer and TV keys on `POST /api/g/<k>/ai-topics`; `POST /api/tv/<tv>/ai-topics` → 404; the TV page contains none of the generated texts;
- after access is switched off: guest generate → JSON 404.

Also change the three `countOf(…, "Wkrótce") === 1` shell assertions (S-05, S-06, S-07 sections) to `=== 0` only in Phase 5, when the card changes (Phase 3 leaves them).

### Success Criteria:

#### Automated Verification:

- Lint and type check pass: `npm run lint`, `npx astro check`
- Tests pass: `npm test`
- Production build succeeds: `npm run build`
- HTTP smoke passes on a DB without an event: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

---

## Phase 4: Guest AI topic section on the phone

### Overview

A generalized localStorage store, the topic memory, one generator UI shared with the organizer, and the guest section on the shared poll.

### Changes Required:

#### 1. Generic local store

**File**: `src/components/hooks/local-store.ts` (+ test), `src/components/hooks/draw-memory-store.ts`

**Intent**: Reuse S-07's storage store for any parsed value.

**Contract**: `createLocalStore<T>(parse: (raw: string | null) => T, serialize: (value: T) => string)` → `{ read(key), write(key, value), subscribe(key, listener) }` with the current semantics (cached snapshot per raw text, in-page fallback when storage throws, `storage` events); `draw-memory-store.ts` keeps its exports (`readDrawMemory`, `writeDrawMemory`, `subscribeDrawMemory`) on top of it; its tests stay green unchanged.

#### 2. Topic memory (pure)

**File**: `src/lib/ai-topics/topic-memory.ts` (+ test)

**Intent**: What a browser remembers about its own AI topics, and parsing of the answers.

**Contract**: `TopicMemory { category: QuestionCategory | null; last: AiTopicDto | null }`; `EMPTY_TOPIC_MEMORY`; `parseTopicMemory(raw)` (hostile storage → valid parts or empty), `serializeTopicMemory`; keys `GUEST_TOPIC_STORAGE_KEY = "kolacja-podwyzkowa:tematy-ai:gosc"`, `ORGANIZER_TOPIC_STORAGE_KEY = "kolacja-podwyzkowa:tematy-ai:organizator"`; `parseGuestQuota(data)`, `parseUsage(data)`, `parseTopic(data)` for answers and error bodies (null when the shape is wrong).

#### 3. Shared hook and panel

**File**: `src/components/hooks/useAiTopic.ts`, `src/components/questions/AiTopicPanel.tsx`

**Intent**: One generator UI for guest and organizer.

**Contract**:

- `useAiTopic(generateUrl, storageKey, { onAnswer?(data: unknown), onNoAccess? })` → `{ category, setCategory, topic, message, pending, ready, generate }`: memory through `createLocalStore` + `useSyncExternalStore` (server render = empty memory); `generate()` POSTs `{ category }` with an `AbortController` at `AI_CLIENT_TIMEOUT_MS`; 200 → topic stored as `last`; non-2xx → `toFailure(data).message` (the server's Polish text); every answer body (success or error) goes to `onAnswer` so the parent can take the quota/usage; 404 → `onNoAccess`; network error or client timeout → `FAILED_MESSAGE` (the previous topic stays).
- `AiTopicPanel { generateUrl; storageKey; onAnswer?; onNoAccess?; blockedMessage?: string | null; status?: ReactNode }`: `CategoryChips` (label „Kategoria tematu”), the category hint, a big button „Wygeneruj temat z AI” / „Wygeneruj kolejny” / „Generuję…” (≥ 56 px, disabled while pending or when `blockedMessage` is set), `status` (e.g. the remaining count) under it, the topic in large type with its category label in a figure, `aria-live="polite"`, the message.

#### 4. Guest island and section

**File**: `src/components/guest/GuestTopicView.tsx`, `src/pages/g/[key].astro`

**Intent**: The guest's AI topic, visible only on their phone, with the remaining count.

**Contract**: `GuestTopicView { apiBase; initial: GuestStateDto; initialQuota: GuestAiQuotaDto }` — `useGuestState` (no new poll), state null → renders nothing; quota state from `initialQuota`, replaced by `parseGuestQuota` of every answer; hint „Temat widzisz tylko Ty. Nieudana próba nie zmniejsza limitu.”; `status` = `formatRemaining(quota)`; `blockedMessage` = `GUEST_LIMIT_MESSAGE` when `remaining === 0`, `EVENT_LIMIT_MESSAGE` when `eventExhausted`. Page: SSR adds `initialQuota: await getGuestAiQuota(db, access.guest.id)`; `<section aria-labelledby="topic-heading">` with `<h2 id="topic-heading">Temat od AI</h2>` below the question section; the structure comment updated.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Page-level guardrail.

**Contract**: before Ania generates anything, `/g/<ola>` contains „Temat od AI”, `GuestTopicView` and „Zostało 5 z 5”; after the S-08 API checks `/g/<ania>` contains „Zostało 0 z 5” and none of the generated topic texts; the TV page contains none of them.

### Success Criteria:

#### Automated Verification:

- Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- Build succeeds: `npm run build`
- HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)

#### Manual Verification:

- On a real phone (~360 px, iOS Safari / Android Chrome) with guest access on: below „Pytanie do rozmowy” the „Temat od AI” section; pick a chip and „Wygeneruj temat z AI” → a Polish topic of that category appears large within a few seconds, „Zostało 4 z 5”; after 5 topics the button is disabled with the limit message; reload keeps the last topic and chip; another phone does not see it, the TV never shows it; access off hides the section; still one `/state` request every ~2.5 s.

---

## Phase 5: Organizer AI panel, shell card and docs

### Overview

The organizer's generator with the evening usage and the provider status on the questions page, the real shell card, and the S-08 contracts and env docs.

### Changes Required:

#### 1. Organizer panel

**File**: `src/components/questions/OrganizerAiTopics.tsx`, `src/components/questions/QuestionManager.tsx`, `src/pages/o/[key]/pytania.astro`

**Intent**: The organizer generates topics without a personal limit and sees usage and the active provider.

**Contract**: SSR adds `aiBoard: AiTopicBoardDto` (`getAiTopicUsage(db)` + `getAiProviderStatus()`) → `QuestionManager` prop `aiInitial` → `<section id="tematy-ai" aria-labelledby="ai-heading">` „Temat od AI” right after „Losuj pytanie”: `AiTopicPanel` with `${apiBase}/ai-topics` and `ORGANIZER_TOPIC_STORAGE_KEY`; `status` = `formatUsage(usage)` (usage replaced by `parseUsage` of every answer); the provider line („Dostawca: atrapa AI — przykładowe tematy, bez połączenia z AI.” / „Dostawca: Claude (<model>).” / the `problem` in the destructive colour); a failed answer's `hint` under the message; `blockedMessage` = `EVENT_LIMIT_MESSAGE` when `used >= limit`; a note „Goście: najwyżej 5 tematów na osobę, wszyscy razem 300 na wieczór. Nieudane próby się nie liczą.”.

#### 2. Shell card

**File**: `src/pages/o/[key].astro`

**Intent**: Replace the last „Wkrótce” card with a real one.

**Contract**: card „Tematy AI” → `/o/<key>/pytania#tematy-ai`, description „Temat do rozmowy od AI w wybranej kategorii; gość ma 5 na wieczór, wszyscy razem 300.”, summary `formatAiTopicSummary(usage, getAiProviderStatus())` (`getAiTopicUsage` in the same `Promise.all`); `upcomingSections` and its markup removed.

#### 3. Docs and env

**File**: `CLAUDE.md`, `README.md`, `.env.example`

**Intent**: Record the S-08 contracts and how to switch to the real provider.

**Contract**:

- `CLAUDE.md`: an „AI topics (S-08)” data-access entry (table and attempt states, `reserve_ai_topic` / `ai_topic_usage`, lock 3008, stale 60 s, limits from `limits.ts`, generation order, provider interface/mock/adapter/factory, `src/lib/ai.ts` as the only AI env reader, never in `config-status.ts`, the mock failure header, the test network guard, APIs and UI placement); env section lists the three AI vars; guest page structure line mentions S-08.
- `README.md`: „Tematy AI” section — mock by default; to use Claude: set a spend limit in the Anthropic console, put `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=<klucz>` (optional `AI_MODEL`, default `claude-haiku-5-5`, must support `output_config.effort`) in `.env` / `.dev.vars` (kept by `npm run env:local`; rebuild after changing `.dev.vars`) or as Wrangler secrets (`npx wrangler secret put ANTHROPIC_API_KEY`); limits; `npm run smoke` needs the mock.
- `.env.example`: `AI_PROVIDER=mock`, commented `# ANTHROPIC_API_KEY=###` and `# AI_MODEL=claude-haiku-5-5` with one-line comments.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Page checks and the shell card.

**Contract**: `/o/<org>/pytania` 200 contains „Temat od AI”, „Wygeneruj temat z AI”, „Wykorzystano”, „atrapa AI” and `tematy-ai`; TV and guest keys → the identical denied body; the shell links `/o/<org>/pytania#tematy-ai` with „Tematy AI: <used> z 300”; the three „Wkrótce” assertions become `=== 0`.

### Success Criteria:

#### Automated Verification:

- Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- Build succeeds: `npm run build`
- HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)
- No API key material in the repo: `grep -rI "sk-""ant" . --exclude-dir=node_modules` finds nothing (the pattern is split so this line does not match itself)

#### Manual Verification:

- With the real provider (the user's step): add an API key and a spend limit at the provider, set `AI_PROVIDER=anthropic` (+ `ANTHROPIC_API_KEY`) in `.dev.vars`, rebuild, generate one topic on `/o/<klucz>/pytania` → a Polish topic of the chosen category within 10 s, the panel shows „Dostawca: Claude (claude-haiku-5-5)”; with a wrong key the panel shows the auth hint and the usage does not grow.
- On a phone and a laptop as the organizer: the AI panel sits right after „Losuj pytanie”, generates beyond 5 topics, usage and provider line are right, no horizontal scrolling; the shell card shows the summary and opens the panel.

---

## Testing Strategy

### Unit Tests:

- Limits and messages (quota/usage mapping, plurals-free formats), sanitizing (quotes, markdown, labels, lines, caps, empties), prompt contents, shared content bounds, mock catalog validity.
- Providers: mock (delay, abort, failure switch, header seam only for the mock), Anthropic adapter on stubbed `fetch` (request shape, no sampling params, model override, block parsing, every status and stop reason, deadline), config parsing and status texts, factory, organizer hints.
- Client: topic memory parsing of hostile storage and answers; the generic local store (draw memory tests unchanged).
- Network guard: a request to `api.anthropic.com` is refused inside the suite.

### Integration Tests:

- Schema: checks, anon refusals, guest/event limits, failed rows not counted, busy, stale expiry, parallel reservations admit exactly the limit.
- Service: success/failure/timeout/off-limits/empty/not-configured with counts; organizer without a personal limit; event limit; deleted guest.

### Manual Testing Steps:

1. Phones as guests: generate per category, limit message after 5, reload keeps the last topic, other phones/TV never see it.
2. Organizer panel: generate beyond 5, usage and provider lines, shell card.
3. Real provider (after the user adds a key and spend limit): one topic as a trial, wrong key shows the hint.

## Performance Considerations

- One attempt: middleware lookup + `reserve_ai_topic` (advisory lock, two indexed counts, one insert) + provider (≤ 9 s, wall clock only — no Worker CPU while waiting) + one update + one `ai_topic_usage`. Well inside 10 s and the CPU budget; nothing added to the 2.5 s poll.
- The advisory lock serializes only reservations (milliseconds); seating (3003) and guesses are unaffected.

## Migration Notes

- New table and two functions only; existing events start at 0 / 300. Rollback: drop the functions and the table.
- Switching to Claude needs no migration: env vars only (rebuild locally after editing `.dev.vars`; Wrangler secrets in production).

## References

- PRD: `context/foundation/prd.md` (US-03, FR-016, NFR-005, NFR-010, Open Question 5)
- Shape decisions: `context/foundation/shape-notes.md` (`AI topics` content bounds, `## Forward: tech-stack`)
- Contracts: `context/archive/2026-10-27-question-base-and-draw/plan.md` (categories, chips, placement), `context/archive/2026-10-27-guest-links-and-seat-view/plan.md` (guest API, shared poll)
- Patterns: `src/pages/api/g/[key]/questions/draw.ts`, `src/components/questions/QuestionDrawPanel.tsx`, `src/components/hooks/useQuestionDraw.ts`, `supabase/migrations/20261027050000_guesses.sql`
- Claude API: `claude-api` skill (model `claude-haiku-5-5`, `anthropic-version: 2026-10-21`, Haiku 5.5 thinking/sampling rules)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, reservation function and the pure topic domain

#### Automated

- [x] 1.1 Migration applies on the local DB: `npx supabase migration up` — 48134c1
- [x] 1.2 Unit and integration tests pass: `npm test` — 48134c1
- [x] 1.3 Lint passes: `npm run lint` — 48134c1
- [x] 1.4 Type check passes: `npx astro check` — 48134c1

### Phase 2: Providers, configuration and the generation service

#### Automated

- [x] 2.1 Env schema regenerated: `npx astro sync` — 2c8664b
- [x] 2.2 Unit and integration tests pass: `npm test` — 2c8664b
- [x] 2.3 Lint passes: `npm run lint` — 2c8664b
- [x] 2.4 Type check passes: `npx astro check` — 2c8664b

### Phase 3: AI topic API routes and the HTTP smoke

#### Automated

- [x] 3.1 Lint and type check pass: `npm run lint`, `npx astro check` — 4d6dd18
- [x] 3.2 Tests pass: `npm test` — 4d6dd18
- [x] 3.3 Production build succeeds: `npm run build` — 4d6dd18
- [x] 3.4 HTTP smoke passes on a DB without an event: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`) — 4d6dd18

### Phase 4: Guest AI topic section on the phone

#### Automated

- [x] 4.1 Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test` — 4af401b
- [x] 4.2 Build succeeds: `npm run build` — 4af401b
- [x] 4.3 HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`) — 4af401b

#### Manual

- [ ] 4.4 On a real phone: generate per category, remaining count, limit message after 5, reload keeps the last topic, private to the phone, access off hides it, one `/state` poll

### Phase 5: Organizer AI panel, shell card and docs

#### Automated

- [x] 5.1 Lint, type check and tests pass: `npm run lint`, `npx astro check`, `npm test`
- [x] 5.2 Build succeeds: `npm run build`
- [x] 5.3 HTTP smoke passes: `npm run preview` + `npm run smoke` (then stop the server and `delete from public.event`)
- [x] 5.4 No API key material in the repo: `grep -rI "sk-""ant" . --exclude-dir=node_modules` finds nothing (the pattern is split so this line does not match itself)

#### Manual

- [ ] 5.5 Real provider trial (user): key + spend limit, `AI_PROVIDER=anthropic`, one topic within 10 s, wrong key shows the hint
- [ ] 5.6 Organizer panel on a phone and a laptop: placement, beyond 5 topics, usage and provider lines, shell card
