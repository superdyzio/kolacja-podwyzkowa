<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Pub quiz (S-28) Implementation Plan

- **Plan**: context/changes/pub-quiz/plan.md
- **Mode**: Quick (unattended run; grounding by grep, no sub-agent)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after the fixes below)
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
10/10 paths ✓ (modules rules, guest-links state, tv-spotlight service, TV seating route, client-routes table, reset summary, export service, useTvSeating, panel section page, shell messages), symbols ✓ (`CLIENT_ROUTE_MODULES`, `TRIAL_RESET_PARTS` users: `ResetPanel.tsx`, `parts.test.ts`; `ALL_GUEST_MODULES` users: state/service/tests; `getTvScreen` callers: TV page, TV route, two integration tests), brief↔plan ✓, Progress↔Phase ✓.

## Findings

### F1 — A second internal id reaches the phone

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §5 / CLAUDE.md access model
- **Detail**: The phone answers by `question.id`; CLAUDE.md says the one internal id a phone gets is `lineId`. The plan did not say so.
- **Fix**: State the exception in the plan (re-checked under the run lock, a question id only) and in CLAUDE.md's access-model bullet.
- **Decision**: FIXED

### F2 — The correct option before close

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §5, §8; Phase 3 smoke
- **Detail**: The correct option must not reach a phone (JSON or SSR HTML) or the TV while the question is open; the plan implied it (RPC field „reveal only”) without a check.
- **Fix**: Contract line in §5, an integration assertion and smoke checks (guest JSON, guest HTML, TV JSON).
- **Decision**: FIXED

### F3 — zod bound for options unclear

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3
- **Detail**: „options: string[] (≤ 4… 6 raw)” left the body bound open; the smoke expects 5 options → 400.
- **Fix**: 1–4 raw strings (≤ 200 each) in the strict body; the rule normalizes and checks 2–4 kept.
- **Decision**: FIXED

### F4 — „No guest names in the TV JSON” depends on the seating

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 smoke
- **Detail**: The TV JSON carries the published seating's names; the check only holds for the quiz part or an event without a published seating.
- **Fix**: Check the `quiz` part; the smoke event has no published seating.
- **Decision**: FIXED
