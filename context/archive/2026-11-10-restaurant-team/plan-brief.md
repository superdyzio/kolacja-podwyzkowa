# Restaurant team (S-12 restaurant-team) — Plan Brief

> Full plan: `context/changes/restaurant-team/plan.md`

## What & Why

The restaurant runs its own team: the owner invites managers and waiters, a manager invites waiters, each with a one-time expiring link handed over by a human (no e-mail, NFR-020). Within their scope they change roles, remove people and generate a one-time link to set a new password, so a lost password never locks the restaurant out (FR-023, US-05). A manager never manages managers or owners; the restaurant never loses its last owner.

## Starting Point

F-03 gave accounts, memberships (`owner | manager | waiter`), sessions per account and hashed one-time links; S-10 the owner invitation pattern and `StaffLinkCard`; S-11 the manager's event rights (`EVENT_STAFF_ROLES`). The restaurant page shows owners and managers a read-only team list with „coming soon”; every panel guard re-reads the membership per request.

## Desired End State

On `/panel/restauracje/<id>` owners and managers see „Zespół”: invite (e-mail, name, role limited to their scope) → a link card; per member only the allowed actions (role select for owners, „Usuń z zespołu”, „Nowy link”). Five panel routes under `/api/panel/restaurants/<id>/team…` answer with the whole team; everything outside the person's scope is the identical 404. A removed person's next request to that restaurant is refused; their other restaurants stay. Smoke section 28 and the demo (manager + waiter logins) prove it.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Role matrix | owner acts on everyone (also owners, self) and gives any role; invites managers/waiters; manager acts on and invites waiters only | PRD access table; owners must reach owners or the last-owner rule has no caller |
| Where the rules are enforced | DB functions under a `restaurant` row lock, mirrored by a pure TS table for the UI; integration parity test | closes the "two owners demote each other" race; every action checked server-side (roadmap Risk) |
| Out-of-scope action | identical 404 of an unknown id (also a role one may not give) | one denial everywhere (NFR-012 pattern of the guards) |
| Last owner | 409 with a message on demote/remove | the restaurant must never be ownerless |
| Removal | delete the membership only, never sessions; links of an account left with no membership die | access ends at once via the per-request guard; other restaurants untouched |
| Links for multi-restaurant staff | refused (409 `elsewhere`) for an account in another restaurant or a platform admin; invite of an existing account issues no link | a link sets the account's password — whoever generates it could take over the person's rights elsewhere |
| Waiter landing | the existing restaurant page with the note | waiter day view is S-21 |
| Per-event waiter | not built; S-21 adds its own table | FR-023 part assigned to S-21 by the roadmap |
| UI placement | island in the „Zespół” section of the restaurant page; `getRestaurantOverview` replaced by `getTeam` | one page for the restaurant; no dead code |

## Scope

**In scope:** four DB functions, `src/lib/team/` (rules, texts, zod, service), five routes, the team island, unit + integration tests, smoke section 28, demo manager + waiter, CLAUDE.md, README.

**Out of scope:** per-event waiter and waiter day view (S-21), restaurant settings / restaurant delete, name or e-mail edits, team audit log, admin links for non-owners (S-13).

## Architecture / Approach

Route → `panelRestaurantApi(…, TEAM_ROLES)` → zod + `parseOwnerInput` → service → DB function (lock restaurant row, read actor + target roles, matrix, last-owner count, write) → `teamFor` re-reads the person's own membership → `{ team }` (null when they no longer manage it). Island state = the last answer.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema, rules, services | DB functions, pure module, service, tests | matrix drift between SQL and TS (parity test) |
| 2. Routes, page, island | team API and „Zespół” UI | identical 404 for every out-of-scope case |
| 3. Smoke and demo | section 28, demo manager + waiter | smoke must only change accounts it created |
| 4. Documentation | CLAUDE.md, README | — |

**Prerequisites:** S-10 (done), S-11 (done), local Supabase.
**Estimated effort:** one overnight slice, 4 phases.

## Open Risks & Assumptions

- Staff who belong to two restaurants cannot get a reset link from either restaurant; until S-13 only the platform admin's owner link exists (owners only).
- The account e-mail is global: inviting an e-mail reveals whether it already has an account (as in S-10), and the `elsewhere` refusal of „Nowy link” reveals that a member also works in another restaurant (which one and any data stay hidden; the team list carries no such flag).

## Success Criteria (Summary)

- An owner invites a manager who sets a password from the link and manages events; the manager invites a waiter but cannot touch managers or owners.
- Removing a person cuts that restaurant off on their next request, their other restaurants keep working; the last owner cannot be demoted or removed.
- `npm test`, lint, check, build, smoke (twice), demo all green.
