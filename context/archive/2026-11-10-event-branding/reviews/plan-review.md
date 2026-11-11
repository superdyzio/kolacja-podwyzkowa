<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Restaurant and event branding (S-18, FR-032)

- **Plan**: context/changes/event-branding/plan.md
- **Mode**: Quick (overnight time box)
- **Date**: 2026-11-10
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding
Grounding: 6/6 paths ✓, 4/4 symbols ✓ (`panelClientApiBase`, `findPanelRestaurant`, `readBodyBytes`, `sniffImageType`), brief↔plan ✓

## Findings

### F1 — The guest logo routes follow the guest-access switch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Routes; Phase 3 — smoke
- **Detail**: `/api/g/<key>/…` is guarded by the middleware together with `event.guest_access_enabled`; while the switch is off the guest's logo route answers the identical no-access 404 (correct — the page itself is closed too). The smoke must turn guest access on before reading the guest logo route, otherwise the check fails for the wrong reason.
- **Fix**: In smoke 34 read the guest logo route with a guest of an event whose guest access is on (event A has it on after section 9) and keep `logoMissing` vs no-access bodies distinct.
- **Decision**: FIXED (noted in the plan's smoke bullet)

### F2 — One more DB round trip on the guest page load

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Pages
- **Detail**: `getEventBranding` runs on every page load of `/g/`, `/tv/`, `/r/`, `/o/` (two small queries, metadata only — never the blob); the 2.5 s polls are untouched, so NFR-003 / S-19 timings are unaffected.
- **Fix**: Accept; run it in parallel with the page's other reads.
- **Decision**: ACCEPTED
