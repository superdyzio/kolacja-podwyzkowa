<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Product page and draft legal documents (S-30)

- **Plan**: context/changes/landing-legal/plan.md
- **Mode**: Quick (unattended run, no sub-agent)
- **Date**: 2026-11-10
- **Verdict**: SOUND (after 3 low-impact fixes)
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding
Grounding: 8/8 paths ✓ (index, logowanie, haslo/[token], panel/index, kelner/index, i18n/locale, README, scenariusz), symbols ✓ (`LOCALE_COOKIE_MAX_AGE` in middleware, `SESSION_COOKIE`, `WAITER_COOKIE`, `PAID_MODULES`, `modulesMessages().names`), brief↔plan ✓; the app reads no client IP or user agent anywhere in `src/` (the policy's „no IP stored by the app” holds); docs already pass Prettier.

## Findings

### F1 — README describes `/` and the plan made its update conditional

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — README
- **Detail**: README line 23 says „strona `/` tylko mówi, że dostęp jest przez link”, which this slice makes false; the plan said „if it describes `/`”.
- **Fix**: Make the README edit definite (that sentence rewritten).
- **Decision**: FIXED

### F2 — `defineMessages` inference over sections with optional `items`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Pure legal module
- **Detail**: `defineMessages<T>(pl, en: NoInfer<T>)` infers T from the PL literal; an array of sections where only some carry `items` infers a union type the EN object may fail to match in confusing ways.
- **Fix**: Type the document dictionaries explicitly (`defineMessages<LegalDocument>(pl, en)`).
- **Decision**: FIXED

### F3 — Phase 1 test command names a folder without tests

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Success Criteria 1.1
- **Detail**: `src/lib/i18n` has no test files; the filter is harmless but misleading.
- **Fix**: `AI_PROVIDER=mock npx vitest run src/lib/legal`.
- **Decision**: FIXED
