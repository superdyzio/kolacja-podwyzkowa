<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Staff accounts and sessions (F-03 staff-accounts)

- **Plan**: context/changes/staff-accounts/plan.md
- **Mode**: Deep (claims verified inline against the code; unattended run, no sub-agent)
- **Date**: 2026-11-09
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 1 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL → PASS after F1, F2 |
| Plan Completeness | WARNING → PASS after F3 |

## Grounding
8/8 paths ✓ (`src/middleware.ts`, `src/env.d.ts`, `src/pages/index.astro`, `src/lib/shell/messages.ts`, `astro.config.mjs`, `scripts/lib/platform.mjs`, `scripts/demo.mjs`, `src/db/database.types.ts`), symbols ✓ (`readBodyBytes`, `noAccessMessages`, `viaProxy`, `organizerApi`, `PRIVATE_HEADERS`), brief↔plan ✓.

## Findings

### F1 — HTML forms under `Referrer-Policy: no-referrer` post `Origin: null`

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Middleware ("private headers plus `X-Frame-Options: DENY`") + Pages (plain forms)
- **Detail**: The Fetch spec ("append a request Origin header") serializes the origin as `null` for a non-CORS (navigation) POST when the request's referrer policy is `no-referrer`. A form on `/logowanie`, `/haslo/<token>` or `/panel` served with the existing `PRIVATE_HEADERS` (`Referrer-Policy: no-referrer`) therefore posts `Origin: null`. Astro's own check (`node_modules/astro/dist/core/app/origin-check.js:15-19`) refuses every form-type POST whose `Origin` differs from `url.origin` with 403, and the plan's middleware check would refuse it too: login, set-password, password change and logout would all fail in a real browser while the smoke (which sends an explicit `Origin`) stays green. The existing organizer pages are unaffected only because they POST with `fetch()` (mode `cors`, where the policy does not null the origin).
- **Fix A ⭐ Recommended**: Serve the auth areas (`/panel/**`, `/api/panel/**`, `/logowanie`, `/haslo/**`, `/api/auth/**`) with `Referrer-Policy: same-origin` instead of `no-referrer` (other private headers unchanged), with a comment why; smoke asserts the header on the three pages; unit-test the header set.
  - Strength: Keeps plain forms (no client JS); `same-origin` never sends a referrer (so never the `/haslo/<token>` path) to another site.
  - Tradeoff: The token path reaches our own server as a Referer on the set-password POST (server-side only, same as the path itself).
  - Confidence: HIGH — spec text and Astro source both checked.
  - Blind spot: Real-browser confirmation is the manual check 2.6.
- **Fix B**: Replace the forms with React islands posting via `fetch()`.
  - Strength: Origin always sent regardless of policy; matches the organizer pages.
  - Tradeoff: Four islands + hooks, JSON answers instead of 303s; more code for a minimal enabler.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A

### F2 — Two foreign keys from `staff_token` to `staff_account` make the PostgREST embed ambiguous

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Migration (`staff_token.account_id`, `created_by`) / service `getTokenInfo`
- **Detail**: `getTokenInfo` reads the token with its account's e-mail; with two FKs to `staff_account` an unhinted embed fails with PGRST201 at runtime.
- **Fix**: State in the plan that embeds from `staff_token` use the FK hint (`staff_account!staff_token_account_id_fkey`) or read the account in a second query.
- **Decision**: FIXED

### F3 — Small completeness gaps

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 messages, Phase 1 tests, Progress section
- **Detail**: (a) the login route answers `?blad=baza` but `authMessages` lists no `baza` code; (b) integration tests must delete the `login_attempt` rows of their own e-mail keys (they are not cascaded from any account); (c) Progress titles 2.5, 2.6, 3.6, 4.2 are shortened versions of the phase bullets.
- **Fix**: Add `baza` to the codes, add the cleanup rule to the tests contract, make the Progress titles match the bullets.
- **Decision**: FIXED
