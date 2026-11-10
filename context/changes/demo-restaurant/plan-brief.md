# Demo restaurant (S-29) — Plan Brief

> Full plan: `context/changes/demo-restaurant/plan.md`

## What & Why

FR-042: the platform administrator prepares a demo restaurant (owner, team, venue template, menu, a sample corporate party with fictional guests, seating and orders) so PRD v2's flow 1–7 can be shown live to the restaurant. Today `npm run demo` builds a NEW throwaway restaurant on every run, partly straight in the database; the demo needs one stable restaurant prepared through the app, the restaurant's real plan and menu swappable in, and a written scenario.

## Starting Point

`scripts/demo.mjs` (1290 lines) fills the local app through the HTTP API of a running server and checks every M-2 feature (diets, RSVP, floor, readouts, prints, support log, quiz, branding, retention), but creates the restaurant, the main event and its modules over PostgREST, builds the venue through the client's API and names its accounts per restaurant. Nothing else (smoke, tests, CI) runs it.

## Desired End State

`npm run demo` prepares ONE „Restauracja demo” with fixed logins (owner, manager, waiter, admin) through the platform admin's and the staff's API in PRD flow order; each run refreshes its events from the venue template („Impreza firmowa Acme (demo)” today with 80 guests, plus four more events), keeps the template and menu unless told to rebuild them, and prints the logins and links grouped by flow step 1–7. `docs/scenariusz-pokazu.md` walks the live demo step by step and marks where the real plan and menu go.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Per-run vs stable | `npm run demo` becomes the stable demo restaurant (found by owner `wlasciciel@demo.stolik`) | Nothing relies on per-run restaurants; fixed logins and no pile-up are what a demo and the morning checks need. |
| How it is prepared | Through the app's API as the platform admin (flow 1) and the staff; DB only for the first admin | Matches FR-042 („administrator prepares”) and the PRD rule „no DB changes except the first admin”. |
| Refresh | Events (and other templates) deleted and recreated every run; template and menu kept unless `--plan` / `--venue` / `--menu` / `--reset` | Re-runs converge, and a real plan arranged or a menu typed in the app survives. |
| Real plan and menu | Default data in `scripts/demo-data/` (`sala.json`, `menu.csv`), options to point at other files, or edit in the app | Easy swap without code changes (PRD Open Question 2). |
| Generic choreography | Seating, table lines, refill and RSVP options derived from the venue and menu read back | The real venue and menu have other table and dish names. |
| Paid modules | Unlocked by the admin inside the logged support visit on every refresh | Shows the unlock in the owner's log; no database shortcut. |
| Sample party | „Impreza firmowa Acme (demo)”, today, 80 guests (30 pasted, 50 from a CSV with diets), 3 rooms / 14 tables / 98 seats | PRD flow 4 example size; shows room rotation, import and the day-of views. |
| Hosted platform | No remote mode; the scenario describes preparing it by hand in the app | Fixed demo passwords must never exist on a public platform. |
| Demo date | No `--date`; the party is today (floor until noon next day) | Open Question 3 stays open; run it the evening before or the morning of the show. |

## Scope

**In scope:** pure module + default data files + unit tests; `scripts/demo.mjs` rewrite (stable restaurant, team, refresh, template-first, events from the template, generic seating and orders, unlocks, output by flow step); `docs/scenariusz-pokazu.md`; README and CLAUDE.md.

**Out of scope:** migrations, routes or app code; a hosted mode; an in-app „prepare demo” button; deleting old per-run demo restaurants; a `--date` option; custom guest lists.

## Architecture / Approach

`scripts/lib/demo-data.mjs` (pure: options, venue JSON and menu CSV parsing and validation, PNGs, `seatGuests`, `pickMenuItem`) under `tests/scripts/demo-data.test.ts`; `scripts/demo.mjs` drives the server's HTTP API as admin → owner → manager → client → waiter → admin (support) in PRD flow order and fails loudly on any unexpected answer.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Demo data module and files | Options, data files, parsers, PNGs, seating, dish choice + tests | Seating rule must satisfy the server's `validateDraft` for any venue |
| 2. Stable demo restaurant | Rewritten choreography, converging re-runs | Many sequential steps; account drift on re-runs |
| 3. Demo script and docs | `docs/scenariusz-pokazu.md`, README, CLAUDE.md, full verification | The scenario must match what the app does |

**Prerequisites:** S-15, S-16, S-21 done (they are); local Supabase and a running preview with `AI_PROVIDER=mock`.
**Estimated effort:** one session, 3 phases.

## Open Risks & Assumptions

- The restaurant's real plan and menu (Open Question 2) and the demo date (Open Question 3) are the user's; the defaults are sample data.
- A real venue with fewer seats than 79 present guests makes the demo stop with a clear message (the user adds tables or passes a bigger venue).
- Old local databases keep the per-run demo restaurants of earlier versions (cosmetic; `npx supabase db reset` cleans).

## Success Criteria (Summary)

- `npm run demo` succeeds twice in a row on the local database and leaves one demo restaurant with five fresh events, a kept template and menu, and four working logins.
- The demo script lets the user walk flow 1–7 live in the app, with the real plan and menu swappable.
- Tests, lint, types, build and smoke stay green.
