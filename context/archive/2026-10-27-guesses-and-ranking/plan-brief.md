# Guesses of the raise amount, intake control and the ranking read from the last place — Plan Brief

> Full plan: `context/changes/guesses-and-ranking/plan.md`

## What & Why

Roadmap S-06 (US-04, FR-017..FR-020, NFR-001). The evening ends with everyone's guess of the final raise amount and the organizer announcing the results from the last place. Guests type their guess on the phone and can change it until the organizer closes intake; the organizer fills in for those who can't, closes intake, types the correct amount and reads the ranking aloud — in under a minute, without any guest or the TV ever seeing other guesses or the ranking.

## Starting Point

S-05 gives every guest a personal link `/g/<key>` with a live seat card (one poll every 2.5 s, opaque version token, `guestApi` identifying the guest only by the key). The guest page has room for more sections; the organizer shell shows "Strzały i ranking" as "Wkrótce". No money handling exists.

## Desired End State

Phones show a "Twój strzał" section (enter/change in any Polish format, "zamknięte" after close, own guess only). `/o/<key>/strzaly` lets the organizer enter/correct/delete any guess, see who is missing, close/reopen intake, set the correct amount, see the ranking (1, 2, 2, 4 with "remis") and open a full-screen "Czytaj od końca" mode that steps from the last place to the first with a huge "Dalej".

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Storage | `guess` table (guest_id PK, integer grosze 0…1e9, entered_by) + `event.guess_intake_open` (default on) + `event.correct_amount_grosze` | Exact money, one guess per guest, cascades with the guest, never read by any guest/TV query. |
| Input formats | Hand-written parser: "1500", "1 500", "1499,99", "1499.99", "zł"/"PLN", NBSP; reject ambiguous "1.500"; max 10 000 000 zł | Integer math only; no silent misreads of thousands separators. |
| Display | Hand-rolled "1 499,99 zł" (NBSP, always 2 decimals) | `Intl` pl-PL does not group 4-digit numbers and differs between runtimes (hydration risk). |
| Closed intake | Guest write → 409 via DB function `save_guest_guess` (event row `for share`); organizer proxy still allowed | Atomic against a concurrent close; the organizer can fix late entries. |
| Live guest state | `GuestStateDto.guess = { intakeOpen, amountGrosze }`, token extended; one shared poll store for both guest islands | S-05 contract: no second poll; proxy edits and closes reach the phone ≤ 2.5 s. |
| Ranking | Pure `rankGuesses`: |guess − correct| in grosze, competition places, tie flag, in-tie order by Polish name then id; absent guests with a guess ranked; guests without a guess listed separately | PRD rule; deterministic; self-contained DTO for S-09 caching. |
| Correct amount vs intake | Independent; ranking appears once the correct amount is set; warning while intake is open | No hidden auto-close; organizer stays in control. |
| Readout | Full-screen, one step per place from the last, ties together, huge "Dalej", keyboard, frozen copy | The < 1 minute primary success criterion, usable on a phone. |
| Organizer refresh | Board polled every 5 s while visible; every mutation answers with the whole board | "Who hasn't guessed" stays current; close returns the final list at once. |
| Tests | Unit (parse/format, ranking, readout, board, token), integration (schema, function, services, restored flags), HTTP smoke guardrail matrix | Guardrail and tie rules are proven automatically. |

## Scope

**In scope:** migration + types; pure money/ranking/readout/board modules; services; organizer API (`/guesses`, `/guesses/<id>`) and guest `PUT /guess`; extended guest state/token; shared guest poll store; guest section; `/o/<key>/strzaly` with readout mode; shell card; smoke; CLAUDE.md.

**Out of scope:** anything about others' guesses/ranking for guests or the TV; guest deleting their guess; auto-close; organizer "to ja" flag; offline (S-09); history of changes; E2E browser tests.

## Architecture / Approach

Guest: `/g/<key>` islands (seat + guess) share one module-level store polling `/api/g/<key>/state` (204/200); `PUT /api/g/<key>/guess` → `save_guest_guess` RPC → full `GuestStateDto` pushed into the store. Organizer: `/o/<key>/strzaly` island + `useGuessBoard` over `/api/o/<key>/guesses*`, every answer the whole `GuessBoardDto` (ranking computed server-side by the pure `rankGuesses`); readout steps from `placesFromLast`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema, types, pure domain | Table/columns/function, DTOs, parse/format, ranking, readout, board + unit and schema tests | Typed embeds with hand-written types |
| 2. Services + guest state | Board, proxy, intake, correct amount, guest submit, extended token + integration tests | Shared event flags in tests (restore) |
| 3. API + smoke | Organizer/guest routes, HTTP guardrail matrix | Smoke ordering with the S-05 section |
| 4. Guest section | Shared poll store, guess island, page section | Refactoring the S-05 poller without regressions |
| 5. Organizer page + docs | `/strzaly`, readout mode, shell card, CLAUDE.md | Phone UX only verifiable manually |

**Prerequisites:** S-05 done; local Supabase running; DB without an event for the smoke.
**Estimated effort:** ~5 phases in one overnight session.

## Open Risks & Assumptions

- Phone behaviour (decimal keyboard, readout legibility, < 1 minute flow) is confirmed only manually (rows 4.4, 5.4).
- An organizer who added themselves as a guest shows up in "Brakuje"; the page explains they don't guess.

## Success Criteria (Summary)

- Guests save and change their guess in ≤ 1 s and can't after the close; they never see anyone else's guess or the ranking.
- The organizer reads the first result from the last place within a minute of closing intake; ties share a place and are marked.
