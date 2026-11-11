# Platform admin's support access with an access log for the owner — Plan Brief

> Full plan: `context/changes/admin-support-log/plan.md`

## What & Why

The platform administrator must be able to look into any restaurant's data when the restaurant needs help (PRD v2 FR-021: „wejść w dane każdej restauracji (wsparcie)”), and the restaurant's owner must see every such entry in a log (FR-021, US-05 AC, US-10 AC, NFR-012). It is the only exception to data isolation, so reaching a restaurant's data as admin must be impossible without a log row.

## Starting Point

The central panel guards (`src/lib/panel-api.ts`) open a restaurant or an event only to its members; the admin gets the identical 404 of an unknown id and sees counters and owners on `/panel/platforma` only (S-10 deferred the bypass to this slice). The restaurant page shows events and the team; the event card shows the client / TV / tablet links.

## Desired End State

On the platform page the admin clicks „Wejdź jako wsparcie” on any restaurant (also a disabled one), types a reason and lands on its panel in a read-only support mode for 60 minutes: a banner with the reason and the end time, the events, the team, the log, event cards without links, nothing that writes. „Zakończ wsparcie”, logout or the time limit end it. The owner sees „Dziennik wejść administratora”: who, when, why, every page or API read and the exit. Managers and waiters do not. Without support mode nothing changes: the identical 404.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Scope of support mode | read-only (GET/HEAD) through the existing panel pages and routes | PRD asks for „pełny wgląd” (view); no flow needs the admin to write, and writes would make the log a liability |
| Link keys | never shown in support mode | the client link writes the event with no log and outlives the time box |
| Entry and end | explicit action with a required reason, 60 minutes, bound to the login session; ends on „Zakończ”, expiry, logout / session end, loss of the admin flag | explicit, time-boxed and attributable |
| Where it is enforced | inside `findPanelRestaurant` / `findPanelEvent`, after the membership lookup | one place for every current and future panel view (S-14 inherits it) |
| Check + log | one DB function finds the live grant, writes the `access` row and only then returns the restaurant; DB errors throw (500) | no window where data is returned without a row |
| Log | append-only table (`enter`, `access` per request with method, path, event snapshot, `exit`); triggers refuse update, delete, truncate (cascade from a deleted restaurant allowed) | „cannot be edited or deleted by staff” enforced by the database, not just by missing routes |
| Log readers | owners (section + API); support mode sees what the owner sees | PRD names the owner; managers and waiters get the identical 404 |
| Disabled restaurant | admin may enter, logged like any entry | the admin is the one who helps a switched-off restaurant |
| Admin who is a member | membership decides, no support row | they act as restaurant staff |

## Scope

**In scope:** migration (`support_grant`, `support_log`, three functions, append-only triggers), `src/lib/support/`, middleware `locals.staffRequest`, guard support path, enter/exit platform route, owner's log route, read-only restaurant and event pages, platform card controls, owner's log section, smoke section 29, demo support visit, CLAUDE.md and README.

**Out of scope:** writes in support mode, keys in support mode, managers seeing the log, notifications, log export / pagination / retention, IP logging, legal text (Open question 6).

## Architecture / Approach

`support_grant (session, account, restaurant, reason, expires_at)` is operational and dies with the login session or on exit; `support_log` is the permanent record with snapshots and no FK to grant, session, account or event. `begin_support_access`, `record_support_access`, `end_support_access` do every write in one transaction each. The middleware gives the guards the request's method and path; the guards call `record_support_access` only for an admin without membership, on a read, on a route that admits owners. Pages branch on `panel.support`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema, rules and service | tables, functions, triggers, `src/lib/support/`, unit + integration tests | trigger blocking legitimate cascades |
| 2. Guards, routes, pages and islands | support path in the guards, enter/exit/log routes, read-only pages, platform card, owner's log | a write island or a key slipping into a support page |
| 3. Smoke section 29 and demo | HTTP proof of the matrix; demo owner's log non-empty | smoke state shared with sections 25–28 |
| 4. Documentation | CLAUDE.md, README | — |

**Prerequisites:** S-11 (done), S-10/F-03 guards; local Supabase.
**Estimated effort:** ~1 session, 4 phases.

## Open Risks & Assumptions

- „Pełny wgląd” read as full view; if the user wants support writes later, the guard's read-only condition is the one switch (and every write must then log too).
- No guest data is visible in the panel before S-14; support mode then covers S-14's views automatically, so S-14 must keep keys and secrets out of support answers.
- The log grows one row per support request; no retention until S-26.

## Success Criteria (Summary)

- Without support mode the admin's answers on every restaurant and event route are byte-identical to an unknown id's; with it, every read produces a log row the owner sees, and every write is the identical 404.
- The owner of the demo restaurant sees a non-empty log after `npm run demo`; managers and waiters never see it.
