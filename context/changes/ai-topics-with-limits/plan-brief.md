# AI conversation topics with limits — Plan Brief

> Full plan: `context/changes/ai-topics-with-limits/plan.md`

## What & Why

Roadmap S-08 (US-03, FR-016, NFR-005, NFR-010): the organizer and every guest can ask an AI for a conversation topic in a chosen category, seen only by whoever asked. Cost and abuse are bounded: 5 topics per guest per evening, 300 for everyone together, the organizer without a personal limit; a failed attempt never eats the limit, and the guest is pointed at the question draw instead.

## Starting Point

S-07 left the categories module, the reusable `CategoryChips`, the draw panel pattern with localStorage memory, the reserved spots (guest section below „Pytanie do rozmowy”, organizer panel after „Losuj pytanie”) and a „Tematy AI — Wkrótce” shell card. Nothing talks to an AI yet; the env schema has only the Supabase vars.

## Desired End State

Guests see „Temat od AI” with chips, „Wygeneruj temat z AI”, the topic and „Zostało X z 5”, and clear Polish messages at the limit or on failure. The organizer's questions page has the same generator plus „Wykorzystano X z 300 · nieudane: N” and which provider is active. The app runs on a mock by default; switching to Claude Haiku is env vars only.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Limit enforcement | Attempt rows `pending → succeeded/failed` + DB function `reserve_ai_topic` under advisory lock 3008, counting succeeded + live pending | Atomic under concurrent taps; failed attempts simply stop counting. |
| Stale attempts | Pending rows older than 60 s expire to failed | A Worker cut off mid-call must not eat a guest's slot forever. |
| One at a time | A guest with a live pending attempt gets „Poprzedni temat jeszcze się generuje” (409) | Double taps never look like a used-up limit. |
| What is stored | Only attempts (who, category, status, time) — never the topic text | „Visible only to whoever generated it”; the browser keeps its last topic in localStorage. |
| „Wszystkie” chip | Allowed; the server picks a random category | Reuses `CategoryChips` unchanged and mirrors the question draw. |
| Quota delivery | SSR prop + every generate answer (errors too); not in the 2.5 s poll | No extra queries per poll on 60 phones. |
| Provider | `AiTopicProvider`: mock (default) + Anthropic adapter on plain `fetch`, `claude-haiku-5-5`, `anthropic-version: 2026-10-21`, thinking disabled, effort low, 9 s abort | No new dependency; deterministic latency inside 10 s. |
| Configuration | `AI_PROVIDER` (string parsed in code), `ANTHROPIC_API_KEY`, `AI_MODEL` — server secrets; misconfiguration fails fast with an organizer-only hint, never a site-wide banner | A typo can't 500 the guest page; guests never see config details. |
| Content safety net | Prompt with the bounds + the seed's denylist (promoted to `bounds.ts`) on the output → off-limits = failed, not counted | The user's content bounds hold even if the model drifts. |
| Zero paid calls | Injected `fetch` in tests, Vitest guard refusing `api.anthropic.com`, smoke generates only when the server reports the mock, failure seam = mock-only header `x-ai-mock: fail` | A key added later to `.env` can never make tests or the smoke spend money. |

## Scope

**In scope:** table + two DB functions, limits/messages, prompt, sanitizing, shared content bounds, mock catalog, mock + Anthropic providers, config/factory/env reader, service, guest and organizer routes, guest section, organizer panel, shell card, smoke, CLAUDE.md/README/.env.example.

**Out of scope:** stored topic texts or history, quota in the live poll, language detection, retries/streaming/caching, the Anthropic SDK, configurable limits or resets, any real API call, browser E2E.

## Architecture / Approach

Route (`guestApi`/`organizerApi`) → `generateTopic(db, provider, …)`: provider ready? → `reserve_ai_topic` (pending row) → `provider.generate` under an `AbortController` (9 s) → `sanitizeTopic` + `deniedIn` → mark `succeeded` then return the topic, or mark `failed` and return the Polish failure. `src/lib/ai.ts` is the only `astro:env` reader for AI and builds the provider through the pure `parseAiConfig` / `createAiProvider`. The UI is one `AiTopicPanel` + `useAiTopic` (localStorage via a generalized `createLocalStore`) used by `GuestTopicView` and `OrganizerAiTopics`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema, reservation, pure domain | `ai_topic`, `reserve_ai_topic`, `ai_topic_usage`, limits, prompt, sanitizing, bounds, mock catalog | Concurrency proof (parallel RPCs admit exactly the limit) |
| 2. Providers, config, service | Mock, Anthropic adapter (stubbed fetch), factory, env reader, service, network guard | Mapping every API failure correctly; never a real call |
| 3. Routes + smoke | Guest/organizer APIs, HTTP limit/failure/role matrix on the mock | Smoke must refuse to generate on a real provider |
| 4. Guest section | Generic local store, topic memory, shared panel, `GuestTopicView` | Hydration and storage edge cases |
| 5. Organizer panel, shell, docs | Panel with usage/provider, shell card, README/CLAUDE.md/.env.example | Removing the last „Wkrótce” touches three smoke checks |

**Prerequisites:** S-07 done; local Supabase running.
**Estimated effort:** one overnight session across 5 phases.

## Open Risks & Assumptions

- The real Claude path is verified only against stubbed `fetch`; the first real call is the user's manual trial (key + spend limit, PRD Open Question 5).
- The seed denylist on AI output may reject some harmless topics (e.g. „sen”); a rejection costs the guest nothing but a retry.
- `AI_MODEL` overrides must support `output_config.effort` and disabled thinking (Haiku 4.5 does not support effort).

## Success Criteria (Summary)

- A guest gets 5 private Polish topics, a clear message on the 6th, and failed attempts do not count; 300 per evening in total.
- The organizer sees usage and the active provider and generates without a personal limit.
- Tests, lint, type check, build and the HTTP smoke pass with zero paid calls.
