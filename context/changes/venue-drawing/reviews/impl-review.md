<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Drawn venue plan (TV and phones), drawing editor and AI proposal from a photo

- **Plan**: context/changes/venue-drawing/plan.md
- **Scope**: All phases (1–4 of 4)
- **Date**: 2026-11-02
- **Verdict**: REJECTED at review time (one critical regression); all 8 findings fixed the same day, see Decisions
- **Findings**: 1 critical, 3 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | FAIL    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

Automated criteria re-run on HEAD: lint 0, astro check 0/0, `npm test` 853 passed + 24 skipped (destructive cases on a reused event), `package.json` unchanged. Smoke (fresh DB, mock) and `package:lambda` passed earlier on the same code. One real Sonnet 5.5 call returned 200 in 6.6 s (≈ 0.012 USD) and moved a displaced table back. Manual rows 2.4–2.7, 3.3–3.6, 4.5, 4.6 are pending (none rubber-stamped).

## Findings

### F1 — „Dodaj stolik” from the editor always answers 400

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/o/[key]/tables.ts:20
- **Detail**: Phase 3 added `rotation` to `TableFormValues`, and `saveTable` posts the whole values object to `POST /tables` (`VenueEditor.tsx:174`). `AddTableBody` is still a `z.strictObject` without `rotation`, so every new table from the form gets „Nieprawidłowe dane.”. Reproduced against the local preview: HTTP 400. The smoke and the integration tests never POST a table with `rotation`, so nothing caught it.
- **Fix**: Add `rotation: z.number().int().min(-36_000).max(36_000).optional()` to `AddTableBody` (same bounds as the PATCH route, the service already accepts it) and add a smoke check that POSTs a table with `rotation` like the form does.
- **Decision**: FIXED — `rotation` accepted by `AddTableBody`; smoke posts a table with `rotation: 375` and expects 15; checked in Chrome („Dodaj stolik” adds the table).

### F2 — Overlapping editor saves can show stale geometry, and „Zapisz” can move a table back

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useVenue.ts:45
- **Detail**: `run` replaces the whole venue with every answer and has no request ordering. The pitch slider (400 ms debounce) and the key nudges (500 ms) are not blocked by `pending`, so two saves can be in flight; on Lambda they land on different instances and may answer out of order. The canvas drops a table's draft as soon as its own save answers, so an older answer arriving last makes the table jump back. Separately, the edit form sends `x`, `y`, `rotation` from `activeTable` (venue state, not the canvas draft), so pressing „Zapisz” within 500 ms of a nudge writes the old position over the new one.
- **Fix A ⭐ Recommended**: Count requests in `run` and apply an answer only if no newer request started since (still clear `pending` correctly); the form sends `x`/`y`/`rotation` only when the user changed them in the form.
  - Strength: Small, local change in two places; matches the „reads started before a save are ignored” rule already used by `useGuessBoard` and the guest-state store.
  - Tradeoff: An ignored older answer means the venue shown is the newer request's answer, which is the right one; a newer request that FAILS leaves the older answer unapplied, so a refetch on failure is needed.
  - Confidence: MED — the pattern exists in the repo; the canvas draft clearing needs a second look with it.
  - Blind spot: Not reproduced in a browser; the window is a few hundred ms.
- **Fix B**: Serialize all venue saves through one queue in `useVenue`.
  - Strength: No out-of-order answers at all.
  - Tradeoff: Drags feel slower when a slider save is queued ahead; bigger change to a hook every venue page uses.
  - Confidence: MED — straightforward but touches more behaviour.
  - Blind spot: Interaction with the 404/409 refetch path.
- **Decision**: FIXED via Fix B (not A): tracing A showed that ignoring an older answer can leave a write missing (each answer is the whole venue, read before a parallel write commits), so `useVenue` now runs saves one after another; the form sends `x`/`y`/`rotation` on edit only when its fields were changed. Checked in Chrome: 5 nudges + `]` then „Zapisz” at once kept x 0.2938 and rotation 15.

### F3 — Older CLAUDE.md lines contradict the new venue-drawing section

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: CLAUDE.md:71
- **Detail**: The S-02 service list (no `updateRoom`, `setChairPitch`, `applyVenueLayout`), the S-02 API line (`/venue` GET only, `/rooms/<id>` PATCH `{ name }` only, no `/tables` rotation), the pin contract (still `<img>` wrappers), the TV polling contract (`tables` without `rotation`, no `chairPitch`/`rooms`) and S-05 `GuestStateDto` (no `drawing`) were not updated. Future agents read these as the contract.
- **Fix**: Update those five lines to the current DTOs and routes (or point them at the venue-drawing bullet).
- **Decision**: FIXED — S-02 service and API lines, the pin contract, the TV polling contract and `GuestStateDto` updated.

### F4 — Guest drawing is read for every guest, with three queries instead of one

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/guest-links/service.ts:170
- **Detail**: `getGuestState` runs `guestDrawing` (snapshot pitch, snapshot tables, snapshot rooms) in parallel with `guestSeat` for every guest, and `toGuestState` throws it away for unseated guests (`state.ts:58`). The plan allowed one extra query on the 200 path; the comment at `state.ts:41` says „read only for a seated guest”. With ~40 phones this runs on every publish and on every guest guess PUT. Not a guardrail problem (no names), only load on Supabase Free.
- **Fix**: Read the drawing only after `guestSeat` returns a seat (and fold the pitch into the tables query via an embed if simple).
- **Decision**: FIXED — the drawing is read after the seat, only when the guest is seated.

### F5 — Cost of a FAILED AI read is not shown, and the read is not in the organizer's AI cost line

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/hooks/useLayoutProposal.ts:100
- **Detail**: The 503 body carries `costNanoUsd` (a refusal or cut-off is billed), but the hook keeps only `message`/`hint`. The plan says the cost is shown after each call. By design the read is not recorded, so „Koszt AI od ostatniego resetu licznika” leaves it out; the UI does not say so.
- **Fix**: Show `describeCost` under the failure alert when present, and add „(nie wlicza się do licznika tematów AI)” to the cost line.
- **Decision**: FIXED — the failure alert shows the billed cost; the cost line says it is not counted in the AI topics cost.

### F6 — Proposal endpoint checks the provider before the image type

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/o/[key]/venue/layout-proposal.ts:38
- **Detail**: With Claude configured but not ready (no key), a non-image upload gets 503 instead of 415; `plan.ts` sniffs first. No paid call is possible either way.
- **Fix**: Sniff the body before the readiness check.
- **Decision**: FIXED — the route sniffs the image before the provider readiness check.

### F7 — Timeout message says 30 s, the client aborts at 32 s

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/hooks/useLayoutProposal.ts:16
- **Detail**: „AI nie odpowiedziało w 30 s.” fires after `VENUE_VISION_CLIENT_TIMEOUT_MS` = 32 s. Harmless; the button already promises „do 30 s”.
- **Fix**: Leave the text (it matches the promise) or say „w ciągu pół minuty”.
- **Decision**: FIXED — „AI nie odpowiedziało w ciągu pół minuty.”

### F8 — Plan deviations are documented in CLAUDE.md but plan.md was never amended

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/venue-drawing/plan.md
- **Detail**: Benign drift and extras with no addendum: `apply_venue_layout(p_layout, p_max_tables)` with `TOO_MANY_TABLES`/`NO_PLAN`; `double precision` instead of `real` (safer for fingerprints); `fitStage` not added (SVG `viewBox` fits); `labelAnchor` became `labelBox` (side names start/end at the chair); font fitting checks all pairs, staggers and caps the spread; TV crops to content; the phone shows the own table cropped with „Pokaż na planie sali” for the whole venue; preview names from the working arrangement; `thinking: between_tools`; 409 without a plan; outline fields in `RoomOutlinePanel`, mode called „Kontur”.
- **Fix**: Append a short „Deviations” section to plan.md listing these.
- **Decision**: FIXED — „Deviations” section added to plan.md.
